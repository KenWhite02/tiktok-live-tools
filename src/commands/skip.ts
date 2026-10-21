import type { CommandHandler } from '../types/index.js';
import { PlayerService, QueueService } from '../container.js';

export const skipCommand: CommandHandler = {
  name: 'skip',
  aliases: ['s', 'next'],
  description: 'Skip the currently playing song (Moderator only)',
  usage: '!skip',
  moderatorOnly: true,
  async execute() {

    const current = QueueService.getCurrent();
    if (!current) {
      return '❌ No song is currently playing.';
    }

    // Stopping mpv fires end-file, which starts the next song
    await PlayerService.stop();
    QueueService.skipCurrent();

    const next = QueueService.peek();

    if (next) {
      return `⏭️ Skipped! Now playing: **${next.song.title}**`;
    }

    return '⏭️ Song skipped. Queue is now empty.';
  },
};
