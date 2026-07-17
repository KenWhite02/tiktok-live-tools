import type { CommandHandler } from '../types/index.js';
import { getAllCommands } from './index.js';

export const helpCommand: CommandHandler = {
  name: 'help',
  aliases: ['h', 'commands'],
  description: 'Show available commands',
  usage: '!help',
  moderatorOnly: false,
  async execute(ctx) {
    const commands = getAllCommands();
    const lines: string[] = [
      '🎵 **TikTok Live Music Request Bot**',
      '',
      '**Commands:**',
    ];

    for (const cmd of commands) {
      if (cmd.moderatorOnly && !ctx.isModerator) continue;

      const prefix = cmd.moderatorOnly ? '🔒 (Mod) ' : '';
      const aliases = cmd.aliases.length > 0 ? ` [${cmd.aliases.map((a) => '!' + a).join(', ')}]` : '';
      lines.push(`  ${prefix}**!${cmd.name}**${aliases} — ${cmd.description}`);
    }

    lines.push('');
    lines.push(
      '💡 **Tip**: Request a song with !play <song name>. Example: !play Alan Walker Faded',
    );

    return lines.join('\n');
  },
};
