import type { CommandHandler, CommandContext } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { playCommand } from './play.js';
import { queueCommand } from './queue.js';
import { npCommand } from './np.js';
import { skipCommand } from './skip.js';
import { pauseCommand } from './pause.js';
import { resumeCommand } from './resume.js';
import { stopCommand } from './stop.js';
import { volumeCommand } from './volume.js';
import { clearCommand } from './clear.js';
import { helpCommand } from './help.js';

/** All registered commands */
const commands = new Map<string, CommandHandler>();
const aliasMap = new Map<string, string>();

/** Register all commands */
export function registerCommands(handlers: CommandHandler[]): void {
  for (const handler of handlers) {
    commands.set(handler.name, handler);
    for (const alias of handler.aliases) {
      aliasMap.set(alias, handler.name);
    }
  }
  getLogger().info({ count: handlers.length }, 'Commands registered');
}

/** Get a command by name or alias */
export function getCommand(name: string): CommandHandler | undefined {
  const normalized = name.toLowerCase().replace(/^!/, '');
  const commandName = aliasMap.get(normalized) ?? normalized;
  return commands.get(commandName);
}

/** Get all registered commands */
export function getAllCommands(): CommandHandler[] {
  return Array.from(commands.values());
}

/** Try to execute a command from a chat message */
export async function executeCommand(
  message: string,
  ctx: Omit<CommandContext, 'args' | 'message'>,
): Promise<string | void> {
  const trimmed = message.trim();

  if (!trimmed.startsWith('!')) {
    return;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const command = getCommand(commandName);
  if (!command) {
    return;
  }

  if (command.hostOnly && !ctx.isHost) {
    return '❌ This command is for the host only.';
  }

  // Check moderator-only commands
  if (command.moderatorOnly && !ctx.isModerator) {
    return '❌ This command is for moderators only.';
  }

  const commandCtx: CommandContext = {
    ...ctx,
    args,
    message: trimmed,
  };

  getLogger().info(
    {
      command: command.name,
      user: ctx.uniqueId,
      args: args.join(' '),
    },
    'Command executed',
  );

  try {
    return await command.execute(commandCtx);
  } catch (error) {
    getLogger().error({ error, command: command.name }, 'Command execution failed');
    return '❌ An error occurred while executing the command.';
  }
}

/** Build command handler instances */
export function buildCommands(): CommandHandler[] {
  return [
    playCommand,
    queueCommand,
    npCommand,
    skipCommand,
    pauseCommand,
    resumeCommand,
    stopCommand,
    volumeCommand,
    clearCommand,
    helpCommand,
  ];
}
