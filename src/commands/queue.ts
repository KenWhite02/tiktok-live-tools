import type { CommandHandler } from '../types/index.js';
import { QueueService } from '../container.js';

export const queueCommand: CommandHandler = {
  name: 'queue',
  aliases: ['q', 'list'],
  description: 'Show the current music queue',
  usage: '!queue',
  moderatorOnly: false,
  async execute() {
    return QueueService.formatQueue();
  },
};
