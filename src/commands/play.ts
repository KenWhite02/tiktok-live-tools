import type { CommandHandler } from '../types/index.js';
import { QueueService, SearchService } from '../container.js';

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

    QueueService.enqueue(song, ctx.userId, ctx.nickname);
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
