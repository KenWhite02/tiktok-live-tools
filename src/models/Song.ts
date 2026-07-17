import type { Song } from '../types/index.js';

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
