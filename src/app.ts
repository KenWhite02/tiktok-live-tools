import type { AppConfig, QueueItem } from './types/index.js';
import { loadConfig } from './config/index.js';
import { displayTitle } from './models/Song.js';
import { createLogger, getLogger } from './utils/logger.js';
import {
  BridgeService,
  DatabaseService,
  CooldownService,
  SearchService,
  PlayerService,
  QueueService,
  TikTokService,
  OverlayService,
} from './services/index.js';
import {
  setBridgeService,
  setDatabaseService,
  setCooldownService,
  setSearchService,
  setPlayerService,
  setQueueService,
  setTikTokService,
} from './container.js';
import { buildCommands, registerCommands, executeCommand } from './commands/index.js';
import { TikTokEventBus } from './events/TikTokEventBus.js';
import { registerEventHandlers } from './events/handlers.js';

/** Whether the bot is shutting down */
let isShuttingDown = false;

/**
 * Initialize all services and start the bot.
 */
export async function startBot(): Promise<void> {
  const config = loadConfig();
  createLogger(config);
  const logger = getLogger();

  logger.info('Starting TikTok Live Music Request Bot...');
  logger.info({ config: sanitizeConfig(config) }, 'Configuration loaded');

  // ─── Initialize Services ──────────────────────────────────────────────────
  const db = new DatabaseService(config);
  const cooldown = new CooldownService(config.cooldown);
  const search = new SearchService(config);
  const player = new PlayerService(config);
  const queue = new QueueService(config);
  const bridge = new BridgeService(config.wsHost, config.wsPort);
  const tiktok = new TikTokService(bridge);
  const overlay = new OverlayService(config, player, queue, bridge);

  // Store in container for command handlers
  setBridgeService(bridge);
  setDatabaseService(db);
  setCooldownService(cooldown);
  setSearchService(search);
  setPlayerService(player);
  setQueueService(queue);
  setTikTokService(tiktok);

  // ─── Register Commands ────────────────────────────────────────────────────
  const commands = buildCommands();
  registerCommands(commands);

  // ─── Register Event Handlers ──────────────────────────────────────────────
  registerEventHandlers(db);

  // ─── Wire TikTok → Command Execution ──────────────────────────────────────
  tiktok.on('chat', async (data: {
    userId: string;
    uniqueId: string;
    nickname: string;
    comment: string;
    isModerator: boolean;
    isHost: boolean;
  }) => {
    logger.debug(
      { user: data.uniqueId, comment: data.comment },
      'Chat message received',
    );

    // Also emit to the event bus for modular handlers
    TikTokEventBus.emitChat({ ...data, timestamp: new Date() });

    // Cooldown and per-user limits are enforced inside !play, which sees every alias
    const response = await executeCommand(data.comment, {
      userId: data.userId,
      uniqueId: data.uniqueId,
      nickname: data.nickname,
      isModerator: data.isModerator,
      isHost: data.isHost,
    });

    if (response) {
      // Log response to console (TikTok can't receive chat back without auth)
      console.log(`\n📢 @${data.uniqueId}: ${data.comment}`);
      console.log(`🤖 ${response}\n`);
      // Viewers see replies on the stream overlay
      overlay.addReply(data.nickname, response);
    }
  });

  // ─── TikTok Event Logging ─────────────────────────────────────────────────
  tiktok.on('member', (data: { uniqueId: string; nickname: string }) => {
    TikTokEventBus.emitMember({ ...data, userId: data.uniqueId, timestamp: new Date() });
    logger.info({ user: data.uniqueId }, 'User joined');
  });

  tiktok.on('follow', (data: { uniqueId: string; nickname: string }) => {
    TikTokEventBus.emitFollow({ ...data, userId: data.uniqueId, timestamp: new Date() });
    logger.info({ user: data.uniqueId }, 'User followed');
  });

  tiktok.on('share', (data: { uniqueId: string; nickname: string; count: number }) => {
    TikTokEventBus.emitShare({ ...data, userId: data.uniqueId, timestamp: new Date() });
    logger.info({ user: data.uniqueId, count: data.count }, 'User shared');
  });

  tiktok.on('gift', (data: {
    userId: string;
    uniqueId: string;
    nickname: string;
    giftId: number;
    giftName: string;
    diamondCost: number;
    repeatCount: number;
  }) => {
    TikTokEventBus.emitGift({ ...data, timestamp: new Date() });
    logger.info(
      {
        user: data.uniqueId,
        gift: data.giftName,
        diamonds: data.diamondCost * data.repeatCount,
        count: data.repeatCount,
      },
      'Gift received',
    );
  });

  tiktok.on('like', (data: { userId: string; uniqueId: string; nickname: string; likeCount: number; totalLikes: number }) => {
    TikTokEventBus.emitLike({ ...data, timestamp: new Date() });
    logger.debug({ user: data.uniqueId, count: data.likeCount }, 'User liked');
  });

  tiktok.on('disconnected', () => {
    TikTokEventBus.emitDisconnected();
    logger.warn('TikTok disconnected, waiting for reconnect...');
  });

  tiktok.on('connected', () => {
    TikTokEventBus.emitConnected();
    logger.info('TikTok reconnected');
  });

  // ─── Queue → Player Pipeline ──────────────────────────────────────────────

  /** Tell viewers on the overlay that a request couldn't be played */
  function announceFailure(item: QueueItem): void {
    overlay.addReply(item.requestedByNickname, `❌ Couldn't play **${displayTitle(item.song.title)}**, skipping.`);
  }

  /** Play the next song in the queue */
  async function playNext(): Promise<void> {
    if (isShuttingDown) return;
    // A song ending and a new request can both trigger this; only start one song
    if (queue.getCurrent()) return;

    const next = queue.dequeue();
    if (!next) {
      logger.info('Queue empty, player idle');
      return;
    }

    logger.info(
      { title: next.song.title, requestedBy: next.requestedByNickname },
      'Playing next song',
    );

    try {
      const audioUrl = await search.getAudioUrl(next.song);
      if (!audioUrl) {
        logger.warn({ title: next.song.title }, 'Could not get audio URL, skipping');
        announceFailure(next);
        queue.completeCurrent();
        setTimeout(() => playNext(), 100);
        return;
      }

      await player.loadSong(next.song, audioUrl);

      // Record in database
      db.recordSong(next.song);
      db.recordRequest(next.song, next.requestedBy, next.requestedBy, next.requestedByNickname);
      db.recordUser(next.requestedBy, next.requestedBy, next.requestedByNickname);
    } catch (error) {
      logger.error({ error, title: next.song.title }, 'Failed to play song, skipping');
      announceFailure(next);
      queue.completeCurrent();
      setTimeout(() => playNext(), 100);
    }
  }

  // mpv couldn't play the stream; song-ended follows and moves on
  player.on('song-failed', () => {
    const current = queue.getCurrent();
    if (current) announceFailure(current);
  });

  // The video's audio is muted on YouTube → skip it like !skip does
  player.on('song-muted', async () => {
    const current = queue.getCurrent();
    if (!current) return;
    overlay.addReply(current.requestedByNickname, `🔇 **${displayTitle(current.song.title)}** is muted on YouTube, skipping.`);
    await player.stop();
    queue.skipCurrent();
  });

  // When song ends → play next
  player.on('song-ended', () => {
    logger.debug('Song ended, playing next');
    queue.completeCurrent();
    setTimeout(() => playNext(), 500);
  });

  // If mpv crashes → restart and continue
  player.on('player-crashed', async () => {
    logger.warn('mpv crashed, attempting restart...');
    if (isShuttingDown) return;

    try {
      await player.restart();
      logger.info('mpv restarted successfully');

      // Resume playing if there are queued items
      const current = queue.getCurrent();
      if (current) {
        const audioUrl = await search.getAudioUrl(current.song);
        if (audioUrl) {
          await player.loadSong(current.song, audioUrl);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to restart mpv');
    }
  });

  // ─── Auto-play: when queue is updated and nothing is playing ──────────────
  queue.on('queue-updated', () => {
    const current = queue.getCurrent();
    if (!current && !queue.isEmpty()) {
      playNext().catch((err) => logger.error({ err }, 'Auto-play failed'));
    }
  });

  // ─── Connect Services ─────────────────────────────────────────────────────

  // Start mpv first
  try {
    await player.start();
    logger.info('Player service started');
  } catch (error) {
    logger.error({ error }, 'Failed to start player. Make sure mpv is installed.');
  }

  // Start the WebSocket bridge server and subscribe to events
  bridge.start();
  overlay.start();
  await tiktok.connect();

  // ─── Graceful Shutdown ────────────────────────────────────────────────────
  process.on('SIGINT', () => handleShutdown(bridge, player, tiktok, db, overlay, logger));
  process.on('SIGTERM', () => handleShutdown(bridge, player, tiktok, db, overlay, logger));
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
  });

  logger.info('Bot started successfully!');
  logger.info('Commands: !play, !queue, !np, !skip, !pause, !resume, !stop, !volume, !clear, !help');

  // Periodic status log
  setInterval(() => {
    const current = queue.getCurrent();
    const queueLength = queue.length;
    const playerStatus = player.isConnected() ? 'connected' : 'disconnected';
    const tiktokStatus = tiktok.connected ? 'connected' : 'disconnected';

    logger.debug(
      {
        nowPlaying: current?.song.title ?? 'none',
        queueLength,
        player: playerStatus,
        tiktok: tiktokStatus,
      },
      'Bot status',
    );
  }, 30_000);
}

/**
 * Gracefully shut down the bot.
 */
export async function handleShutdown(
  bridge: BridgeService,
  player: PlayerService,
  tiktok: TikTokService,
  db: DatabaseService,
  overlay: OverlayService,
  logger: ReturnType<typeof getLogger>,
): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Shutting down gracefully...');

  try {
    bridge.stop();
    overlay.stop();
    await player.shutdown();
    await tiktok.disconnect();
    db.close();
    logger.info('Shutdown complete');
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
  }

  process.exit(0);
}

function sanitizeConfig(config: AppConfig): Partial<AppConfig> {
  return { ...config };
}
