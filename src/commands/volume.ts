import type { CommandHandler } from '../types/index.js';
import { PlayerService } from '../container.js';

export const volumeCommand: CommandHandler = {
  name: 'volume',
  aliases: ['vol', 'v'],
  description: 'Set the player volume (0-100). Moderator only.',
  usage: '!volume <0-100>',
  moderatorOnly: true,
  async execute(ctx) {

    if (ctx.args.length === 0) {
      const status = await PlayerService.getStatus();
      return `🔊 Current volume: ${status.volume}%`;
    }

    const volume = parseInt(ctx.args[0], 10);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      return '❌ Volume must be a number between 0 and 100.';
    }

    await PlayerService.setVolume(volume);
    return `🔊 Volume set to ${volume}%`;
  },
};
