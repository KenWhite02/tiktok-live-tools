import type { Song, QueueItem } from '../types/index.js';

let itemCounter = 0;

export function createQueueItem(
  song: Song,
  requestedBy: string,
  requestedByNickname: string,
): QueueItem {
  itemCounter++;
  return {
    song,
    requestedBy,
    requestedByNickname,
    requestedAt: new Date(),
    status: 'pending',
  };
}
