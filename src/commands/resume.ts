import type { CommandHandler } from '../types/index.js';
import { PlayerService } from '../container.js';

export const resumeCommand: CommandHandler = {
  name: 'resume',
  aliases: ['unpause'],
  description: 'Resume playback (Moderator only)',
  usage: '!resume',
  moderatorOnly: true,
  async execute() {
    await PlayerService.resume();
    return '▶️ Playback resumed!';
  },
};
