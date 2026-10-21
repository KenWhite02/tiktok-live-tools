import { createServer, type Server } from 'node:http';
import type { AppConfig } from '../types/index.js';
import type { PlayerService } from './PlayerService.js';
import type { QueueService } from './QueueService.js';
import { OVERLAY_HTML } from '../overlay/page.js';
import { getLogger } from '../utils/logger.js';

/** A bot reply shown on the overlay */
interface OverlayReply {
  user: string;
  text: string;
  at: number;
}

/** Keep only the latest few replies; the page fades them out after a while */
const MAX_REPLIES = 3;
const MAX_UP_NEXT = 5;

/**
 * Serves a stream overlay (now playing, up next, latest bot replies).
 * Viewers can't see bot replies in TikTok chat, so add this page to
 * TikTok LIVE Studio / OBS as a browser source instead.
 */
export class OverlayService {
  private readonly port: number;
  private readonly player: PlayerService;
  private readonly queue: QueueService;
  private server: Server | null = null;
  private replies: OverlayReply[] = [];

  constructor(config: AppConfig, player: PlayerService, queue: QueueService) {
    this.port = config.overlayPort;
    this.player = player;
    this.queue = queue;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/`;
  }

  /** Show a bot reply on the overlay */
  addReply(user: string, text: string): void {
    // Chat replies use **bold** markers meant for the console
    const clean = text.replace(/\*\*/g, '').trim();
    if (!clean) return;
    this.replies.unshift({ user, text: clean, at: Date.now() });
    this.replies.length = Math.min(this.replies.length, MAX_REPLIES);
  }

  start(): void {
    const logger = getLogger();

    this.server = createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];

      if (path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(OVERLAY_HTML);
        return;
      }

      if (path === '/state') {
        this.getState()
          .then((state) => {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            });
            res.end(JSON.stringify(state));
          })
          .catch((error) => {
            logger.error({ error }, 'Failed to build overlay state');
            res.writeHead(500).end();
          });
        return;
      }

      res.writeHead(404).end();
    });

    this.server.on('error', (err) => {
      logger.error({ err, port: this.port }, 'Overlay server error (is OVERLAY_PORT in use?)');
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      logger.info({ url: this.url }, 'Overlay ready — add it as a browser source');
    });
  }

  private async getState() {
    const current = this.queue.getCurrent();
    const status = current ? await this.player.getStatus() : null;

    return {
      now: current && {
        title: current.song.title,
        requestedBy: current.requestedByNickname,
        duration: current.song.duration,
        position: status?.position ?? 0,
        paused: status?.state === 'paused',
      },
      upNext: this.queue.getQueue().slice(0, MAX_UP_NEXT).map((item) => ({
        title: item.song.title,
        requestedBy: item.requestedByNickname,
      })),
      queueLength: this.queue.length,
      replies: this.replies,
      serverTime: Date.now(),
    };
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}
