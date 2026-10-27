import type { CommandContext, CommandHandler } from '../types/index.js';
import { CooldownService, QueueService, SearchService } from '../container.js';

/** Why this user can't request right now, or null if they can */
function blockedReply(ctx: CommandContext): string | null {
  // Moderators skip the cooldown; only the host skips the per-user limit
  if (!ctx.isModerator && CooldownService.isOnCooldown(ctx.userId)) {
    return `⏳ Cooldown: ${CooldownService.getRemainingCooldown(ctx.userId)}s remaining`;
  }
  if (!ctx.isHost && QueueService.isUserAtLimit(ctx.userId)) {
    return `⏳ You already have ${QueueService.maxPerUser} songs in the queue. You can request again once your next one starts playing.`;
  }
  return null;
}

export const playCommand: CommandHandler = {
  name: 'play',
  aliases: ['p', 'music', 'song'],
  description: 'Request a song to play. Usage: !play <song name>',
  usage: '!play <song name or YouTube URL>',
  moderatorOnly: false,
  async execute(ctx) {

    if (ctx.args.length === 0) {
      return '❌ Usage: !play <song name or YouTube URL>\nExample: !play Alan Walker Faded';
    }

    const blocked = blockedReply(ctx);
    if (blocked) {
      return blocked;
    }

    const query = ctx.args.join(' ');

    // Check if it's a direct URL
    let song;
    if (query.match(/^https?:\/\//)) {
      song = await SearchService.getMetadata(query);
    } else {
      song = await SearchService.search(query);
    }

    if (!song) {
      return `❌ Could not find a valid song for "${query}". Make sure the song exists and is less than 10 minutes.`;
    }

    // Check again: another request from this user may have landed during the search
    const blockedNow = blockedReply(ctx);
    if (blockedNow) {
      return blockedNow;
    }

    QueueService.enqueue(song, ctx.userId, ctx.nickname);
    if (!ctx.isModerator) {
      CooldownService.setCooldown(ctx.userId);
    }
    const mins = Math.floor(song.duration / 60);
    const secs = Math.floor(song.duration % 60);
    const position = QueueService.length;

    let response = `✅ **${song.title}** (${mins}:${secs.toString().padStart(2, '0')}) has been added to the queue!`;

    if (position > 0) {
      response += ` Position: #${position}`;
    }

    return response;
  },
};
