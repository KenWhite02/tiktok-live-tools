import type { CommandHandler } from '../types/index.js';
import { PlayerService } from '../container.js';

export const pauseCommand: CommandHandler = {
  name: 'pause',
  aliases: [],
  description: 'Pause the current playback (Moderator only)',
  usage: '!pause',
  moderatorOnly: true,
  async execute() {
    await PlayerService.pause();
    return '⏸️ Playback paused. Use !resume to continue.';
  },
};
