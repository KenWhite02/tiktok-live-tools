import type { CommandHandler } from '../types/index.js';
import { QueueService } from '../container.js';

export const clearCommand: CommandHandler = {
  name: 'clear',
  aliases: ['clearqueue', 'empty'],
  description: 'Clear all songs from the queue (Moderator only)',
  usage: '!clear',
  moderatorOnly: true,
  async execute() {
    QueueService.clear();
    return '🗑️ Queue cleared.';
  },
};
