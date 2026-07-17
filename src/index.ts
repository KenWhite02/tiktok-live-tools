#!/usr/bin/env node

/**
 * TikTok Live Music Request Bot
 *
 * Reads chat from TikTok Live, processes !play commands,
 * searches YouTube via yt-dlp, and plays audio through mpv.
 *
 * https://github.com/zerodytrash/TikTok-Live-Connector
 */

import { startBot } from './app.js';

startBot().catch((error) => {
  console.error('Failed to start bot:', error);
  process.exit(1);
});
