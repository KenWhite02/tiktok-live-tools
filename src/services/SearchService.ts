import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppConfig, Song } from '../types/index.js';
import { createSong } from '../models/Song.js';
import { getLogger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

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

  constructor(config: AppConfig) {
    this.ytDlpPath = config.ytDlpPath;
    this.maxDuration = config.maxDuration;
    getLogger().info({ maxDuration: this.maxDuration }, 'SearchService initialized');
  }

  /**
   * Search for a song by query string.
   * Returns the best matching result.
   */
  async search(query: string): Promise<Song | null> {
    const logger = getLogger();
    logger.info({ query }, 'Searching for song');

    try {
      const searchQuery = `ytsearch:${query}`;
      const { stdout } = await execFileAsync(this.ytDlpPath, [
        searchQuery,
        '--dump-json',
        '--default-search',
        'ytsearch',
        '--no-playlist',
        '--flat-playlist',
        '--limit',
        '1',
      ]);

      const lines = stdout.trim().split('\n').filter(Boolean);
      if (lines.length === 0) {
        logger.warn({ query }, 'No search results found');
        return null;
      }

      const info: YtDlpVideoInfo = JSON.parse(lines[0]);
      return this.validateAndCreateSong(info);
    } catch (error) {
      logger.error({ error, query }, 'Search failed');
      return null;
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
      const { stdout } = await execFileAsync(this.ytDlpPath, [
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
      const { stdout } = await execFileAsync(this.ytDlpPath, [
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

    logger.info({ title: song.title, duration: song.duration }, 'Song validated successfully');
    return song;
  }
}
