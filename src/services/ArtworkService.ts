import type { Song } from '../types/index.js';
import { displayTitle } from '../models/Song.js';
import { getLogger } from '../utils/logger.js';

const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const LOOKUP_TIMEOUT_MS = 5000;
/** iTunes serves any size by rewriting the dimensions in the URL */
const ARTWORK_SIZE = '300x300bb';

interface ITunesResult {
  trackName?: string;
  artworkUrl100?: string;
}

/** Lowercased, with bracketed parts like "(feat. X)" removed */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}

/** 16:9 thumbnail without letterbox bars; it exists for every video */
function youtubeThumbnail(song: Song): string {
  return `https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`;
}

/**
 * Finds album art for the overlay: the album cover from iTunes,
 * or the YouTube thumbnail when iTunes has no matching track.
 * Each song is looked up once, in the background.
 */
export class ArtworkService {
  private readonly cache = new Map<string, string>();
  private readonly pending = new Set<string>();

  /** Artwork URL for a song, or undefined while it's still being looked up */
  get(song: Song): string | undefined {
    const cached = this.cache.get(song.id);
    if (cached || this.pending.has(song.id)) return cached;

    this.pending.add(song.id);
    this.lookup(song)
      .then((url) => this.cache.set(song.id, url ?? youtubeThumbnail(song)))
      .catch((error) => {
        getLogger().debug({ error, title: song.title }, 'Album art lookup failed — using the YouTube thumbnail');
        this.cache.set(song.id, youtubeThumbnail(song));
      })
      .finally(() => this.pending.delete(song.id));
    return undefined;
  }

  private async lookup(song: Song): Promise<string | null> {
    const title = displayTitle(song.title);
    const params = new URLSearchParams({ term: title, media: 'music', entity: 'song', limit: '5' });
    const res = await fetch(`${ITUNES_SEARCH}?${params}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`iTunes search returned ${res.status}`);

    const { results = [] } = (await res.json()) as { results?: ITunesResult[] };
    // Only trust a result whose track name is in the video title, so we don't show another album's cover
    const haystack = normalize(title);
    const match = results.find((r) => {
      const track = r.trackName && normalize(r.trackName);
      return track && r.artworkUrl100 && haystack.includes(track);
    });

    getLogger().debug({ title, track: match?.trackName ?? null }, 'Album art lookup');
    return match?.artworkUrl100?.replace('100x100bb', ARTWORK_SIZE) ?? null;
  }
}
