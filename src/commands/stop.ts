import type { CommandHandler } from '../types/index.js';
import { PlayerService, QueueService } from '../container.js';

export const stopCommand: CommandHandler = {
  name: 'stop',
  aliases: [],
  description: 'Stop playback and clear the queue (Moderator only)',
  usage: '!stop',
  moderatorOnly: true,
  async execute() {
    QueueService.clear();
    await PlayerService.stop();
    QueueService.skipCurrent();
    return '⏹️ Playback stopped and queue cleared.';
  },
};
