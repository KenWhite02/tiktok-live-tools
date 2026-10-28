import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppConfig, Song } from '../types/index.js';
import { createSong } from '../models/Song.js';
import { getLogger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/** yt-dlp stderr when the configured cookie source can't be read at all */
const COOKIE_LOAD_ERROR =
  /cookies database|failed to load cookies|(unknown|unsupported) browser|unsupported keyring/i;

interface YtDlpVideoInfo {
  id: string;
  title: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  webpage_url?: string;
  live_status?: string;
  availability?: string;
  age_limit?: number;
  url?: string;
}

/**
 * Search service using yt-dlp.
 * Handles searching YouTube, validating results, and getting stream URLs.
 */
export class SearchService {
  private readonly ytDlpPath: string;
  private readonly maxDuration: number;
  /**
   * Auth args prepended to every yt-dlp call, so YouTube's bot check passes.
   * Cleared if the cookie source turns out to be unreadable.
   */
  private authArgs: string[];

  constructor(config: AppConfig) {
    this.ytDlpPath = config.ytDlpPath;
    this.maxDuration = config.maxDuration;
    this.authArgs = config.ytDlpCookiesFile
      ? ['--cookies', config.ytDlpCookiesFile]
      : config.ytDlpCookiesFromBrowser
        ? ['--cookies-from-browser', config.ytDlpCookiesFromBrowser]
        : [];
    getLogger().info({ maxDuration: this.maxDuration }, 'SearchService initialized');
  }

  /**
   * Search for a song by query string.
   * Prefers lyric videos, since official music videos often have long
   * intros or skits where the song isn't playing.
   */
  async search(query: string): Promise<Song | null> {
    const logger = getLogger();
    logger.info({ query }, 'Searching for song');

    const lyricQuery = /lyric/i.test(query) ? query : `${query} lyrics`;
    const results = await this.searchResults(lyricQuery);
    const valid = results
      .map((info) => this.validateAndCreateSong(info))
      .filter((song): song is Song => song !== null);

    const lyricSong = valid.find((song) => /lyric/i.test(song.title));
    const picked = lyricSong ?? valid[0];
    if (picked) {
      logger.info(
        { title: picked.title, passed: valid.length, results: results.length, lyricMatch: !!lyricSong },
        'Picked search result',
      );
      return picked;
    }

    // No usable lyric results — fall back to the plain query
    if (lyricQuery !== query) {
      for (const info of await this.searchResults(query)) {
        const song = this.validateAndCreateSong(info);
        if (song) {
          logger.info({ title: song.title, fallback: true }, 'Picked search result');
          return song;
        }
      }
    }

    logger.warn({ query }, 'No valid search results found');
    return null;
  }

  /** Run a YouTube search and return the top results' metadata */
  private async searchResults(query: string, count = 5): Promise<YtDlpVideoInfo[]> {
    try {
      const stdout = await this.runYtDlp([
        `ytsearch${count}:${query}`,
        '--dump-json',
        '--no-playlist',
        '--flat-playlist',
      ]);

      return stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as YtDlpVideoInfo);
    } catch (error) {
      getLogger().error({ error, query }, 'Search failed');
      return [];
    }
  }

  /**
   * Get the audio stream URL for a song.
   * Returns the direct audio URL that mpv can play.
   */
  async getAudioUrl(song: Song): Promise<string | null> {
    const logger = getLogger();
    logger.info({ songId: song.id, title: song.title }, 'Getting audio URL');

    try {
      // Try to get best audio stream URL
      const stdout = await this.runYtDlp([
        song.webpageUrl || song.url,
        '-f',
        'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
        '--get-url',
        '--no-playlist',
      ]);

      const url = stdout.trim();
      if (!url) {
        logger.warn({ songId: song.id }, 'No audio URL returned');
        return null;
      }

      return url;
    } catch (error) {
      logger.error({ error, songId: song.id }, 'Failed to get audio URL');
      return null;
    }
  }

  /**
   * Get detailed metadata for a video URL.
   */
  async getMetadata(url: string): Promise<Song | null> {
    try {
      const stdout = await this.runYtDlp([
        url,
        '--dump-json',
        '--no-playlist',
      ]);

      const info: YtDlpVideoInfo = JSON.parse(stdout.trim());
      return this.validateAndCreateSong(info);
    } catch (error) {
      getLogger().error({ error, url }, 'Failed to get metadata');
      return null;
    }
  }

  /**
   * Run yt-dlp with the auth args. If the cookie source can't be loaded
   * (e.g. the browser isn't installed), drop it and retry without cookies
   * rather than failing every request.
   */
  private async runYtDlp(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.ytDlpPath, [...this.authArgs, ...args]);
      return stdout;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? '';
      if (this.authArgs.length === 0 || !COOKIE_LOAD_ERROR.test(stderr)) throw error;

      getLogger().warn(
        { authArgs: this.authArgs, stderr: stderr.trim() },
        'Could not load YouTube cookies — continuing without them. Fix YTDLP_COOKIES_FROM_BROWSER / YTDLP_COOKIES_FILE in .env',
      );
      this.authArgs = [];
      const { stdout } = await execFileAsync(this.ytDlpPath, args);
      return stdout;
    }
  }

  /**
   * Validate a video and create a Song object.
   * Returns null if the video doesn't meet criteria.
   */
  private validateAndCreateSong(info: YtDlpVideoInfo): Song | null {
    const logger = getLogger();

    // Check for required fields
    if (!info.id || !info.title) {
      logger.warn({ info }, 'Invalid video info: missing id or title');
      return null;
    }

    // Reject live streams
    if (info.live_status && info.live_status !== 'not_live') {
      logger.warn({ title: info.title, liveStatus: info.live_status }, 'Rejected live stream');
      return null;
    }

    // Reject unavailable/private videos
    if (info.availability && info.availability !== 'public' && info.availability !== 'needs_auth') {
      logger.warn({ title: info.title, availability: info.availability }, 'Rejected unavailable video');
      return null;
    }

    // Reject age-restricted
    if (info.age_limit && info.age_limit > 0) {
      logger.warn({ title: info.title, ageLimit: info.age_limit }, 'Rejected age-restricted video');
      return null;
    }

    // Reject too-long videos
    const duration = info.duration ?? 0;
    if (duration > this.maxDuration) {
      logger.warn(
        { title: info.title, duration, maxDuration: this.maxDuration },
        'Rejected video exceeding max duration',
      );
      return null;
    }

    // Reject very short videos (likely not music)
    if (duration < 10) {
      logger.warn({ title: info.title, duration }, 'Rejected video too short');
      return null;
    }

    const song = createSong({
      id: info.id,
      title: info.title,
      url: `https://www.youtube.com/watch?v=${info.id}`,
      duration,
      thumbnail: info.thumbnail,
      uploader: info.uploader,
      webpageUrl: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
    });

    logger.debug({ title: song.title, duration: song.duration }, 'Search result passed validation');
    return song;
  }
}
