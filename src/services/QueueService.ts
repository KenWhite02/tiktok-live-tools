import { EventEmitter } from 'node:events';
import type { AppConfig, Song, QueueItem } from '../types/index.js';
import { createQueueItem } from '../models/QueueItem.js';
import { getLogger } from '../utils/logger.js';

/**
 * FIFO queue service that manages the song playback queue.
 * Automatically progresses to the next song when one finishes.
 */
export class QueueService extends EventEmitter {
  private queue: QueueItem[] = [];
  private currentItem: QueueItem | null = null;

  constructor(_config: AppConfig) {
    super();
  }

  /** Add a song to the end of the queue */
  enqueue(song: Song, userId: string, nickname: string): QueueItem {
    const item = createQueueItem(song, userId, nickname);
    this.queue.push(item);

    getLogger().info(
      {
        title: song.title,
        position: this.queue.length,
        requestedBy: nickname,
      },
      'Song queued',
    );

    this.emit('queue-updated', this.getQueueSnapshot());

    return item;
  }

  /** Get the next item without removing it */
  peek(): QueueItem | null {
    return this.queue[0] ?? null;
  }

  /** Remove and return the next item */
  dequeue(): QueueItem | null {
    const item = this.queue.shift() ?? null;
    if (item) {
      item.status = 'playing';
      this.currentItem = item;
      this.emit('queue-updated', this.getQueueSnapshot());
    }
    return item;
  }

  /** Mark current item as finished. The caller dequeues the next item when it starts playing. */
  completeCurrent(): void {
    if (this.currentItem) {
      this.currentItem.status = 'finished';
      this.currentItem = null;
    }
  }

  /** Skip the current song (moderator only). The caller dequeues the next item when it starts playing. */
  skipCurrent(): void {
    if (this.currentItem) {
      this.currentItem.status = 'skipped';
      this.currentItem = null;
    }
    getLogger().info('Current song skipped');
  }

  /** Get the currently playing item */
  getCurrent(): QueueItem | null {
    return this.currentItem;
  }

  /** Get all queued items */
  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  /** Get queue length */
  get length(): number {
    return this.queue.length;
  }

  /** Check if queue is empty */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Remove all upcoming songs. The current song keeps playing (and stays
   * tracked), otherwise the next request would cut it off.
   */
  clear(): void {
    this.queue = [];
    getLogger().info('Queue cleared');
    this.emit('queue-updated', this.getQueueSnapshot());
  }

  /** Remove a specific item by index */
  remove(index: number): boolean {
    if (index >= 0 && index < this.queue.length) {
      const removed = this.queue.splice(index, 1)[0];
      removed.status = 'skipped';
      this.emit('queue-updated', this.getQueueSnapshot());
      return true;
    }
    return false;
  }

  /** Get position of a specific song in queue */
  getPosition(songId: string): number {
    return this.queue.findIndex((item) => item.song.id === songId);
  }

  /** Move item to a new position */
  move(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex >= 0 &&
      fromIndex < this.queue.length &&
      toIndex >= 0 &&
      toIndex < this.queue.length
    ) {
      const [item] = this.queue.splice(fromIndex, 1);
      this.queue.splice(toIndex, 0, item);
      this.emit('queue-updated', this.getQueueSnapshot());
      return true;
    }
    return false;
  }

  /** Format queue for display */
  formatQueue(): string {
    if (this.isEmpty() && !this.currentItem) {
      return '📋 Queue is empty. Use !play <song> to add music!';
    }

    const lines: string[] = ['📋 **Music Queue**:'];

    // Show current song
    if (this.currentItem) {
      const mins = Math.floor(this.currentItem.song.duration / 60);
      const secs = Math.floor(this.currentItem.song.duration % 60);
      lines.push(
        `▶️ **Now Playing**: ${this.currentItem.song.title} (${mins}:${secs.toString().padStart(2, '0')}) — requested by ${this.currentItem.requestedByNickname}`,
      );
    }

    // Show queued songs (max 10 to avoid spam)
    const displayQueue = this.queue.slice(0, 10);
    for (let i = 0; i < displayQueue.length; i++) {
      const item = displayQueue[i];
      const mins = Math.floor(item.song.duration / 60);
      const secs = Math.floor(item.song.duration % 60);
      lines.push(
        `  ${i + 1}. ${item.song.title} (${mins}:${secs.toString().padStart(2, '0')}) — @${item.requestedByNickname}`,
      );
    }

    if (this.queue.length > 10) {
      lines.push(`  ... and ${this.queue.length - 10} more`);
    }

    if (this.isEmpty()) {
      lines.push('  Nothing up next. Use !play <song> to add music!');
    }

    return lines.join('\n');
  }

  /** Get a safe snapshot of the queue */
  private getQueueSnapshot() {
    return {
      current: this.currentItem,
      queue: this.queue,
      length: this.queue.length,
    };
  }
}
