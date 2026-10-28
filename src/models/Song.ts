import type { Song } from '../types/index.js';

/** "Lyrics" and its variants as they appear in YouTube titles */
const LYRICS_TAG = /\b(?:with\s+)?(?:official\s+)?lyrics?(?:\s+video)?(?:\s+in\s+(?:the\s+)?description)?\b/gi;
/** Separators left dangling inside brackets or at either end once the tag is gone */
const SEPARATOR = String.raw`[\s,|:\-–—]`;
const AFTER_OPEN_BRACKET = new RegExp(String.raw`([([])${SEPARATOR}+`, 'g');
const BEFORE_CLOSE_BRACKET = new RegExp(String.raw`${SEPARATOR}+([)\]])`, 'g');
const EDGE_SEPARATORS = new RegExp(String.raw`^${SEPARATOR}+|[\s,|:\-–—([]+$`, 'g');

/**
 * Title to show viewers: the YouTube title without the "(Lyrics)" tags the
 * lyric-video search brings in. Everything else stays as uploaded.
 */
export function displayTitle(title: string): string {
  const cleaned = title
    .replace(LYRICS_TAG, '')
    .replace(AFTER_OPEN_BRACKET, '$1')
    .replace(BEFORE_CLOSE_BRACKET, '$1')
    .replace(/\(\)|\[\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_SEPARATORS, '');
  return cleaned || title;
}

export function createSong(data: {
  id: string;
  title: string;
  url: string;
  duration: number;
  thumbnail?: string;
  uploader?: string;
  webpageUrl?: string;
}): Song {
  return {
    id: data.id,
    title: data.title,
    url: data.url,
    duration: data.duration,
    thumbnail: data.thumbnail,
    uploader: data.uploader,
    webpageUrl: data.webpageUrl,
  };
}
