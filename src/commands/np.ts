import type { CommandHandler } from '../types/index.js';
import { PlayerService, QueueService } from '../container.js';
import { displayTitle } from '../models/Song.js';

export const npCommand: CommandHandler = {
  name: 'np',
  aliases: ['nowplaying', 'current'],
  description: 'Show the currently playing song',
  usage: '!np',
  moderatorOnly: false,
  async execute() {

    const status = await PlayerService.getStatus();
    const current = QueueService.getCurrent();

    if (!current || !status.currentSong) {
      return '🎵 No song is currently playing. Use !play <song> to request music!';
    }

    const mins = Math.floor(current.song.duration / 60);
    const secs = Math.floor(current.song.duration % 60);
    const posMins = status.position ? Math.floor(status.position / 60) : 0;
    const posSecs = status.position ? Math.floor(status.position % 60) : 0;

    let stateIcon = '▶️';
    if (status.state === 'paused') stateIcon = '⏸️';

    let response = `${stateIcon} **Now Playing**: ${displayTitle(current.song.title)}\n`;
    response += `📝 Requested by: ${current.requestedByNickname}\n`;
    response += `⏱️ ${posMins}:${posSecs.toString().padStart(2, '0')} / ${mins}:${secs.toString().padStart(2, '0')}\n`;

    if (current.song.uploader) {
      response += `👤 Uploader: ${current.song.uploader}\n`;
    }

    response += `🔊 Volume: ${status.volume}%`;

    return response;
  },
};
