import dotenv from 'dotenv';
import type { AppConfig } from '../types/index.js';

dotenv.config();

function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : defaultValue;
}

function numericEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value && value.trim() !== '') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return defaultValue;
}

export function loadConfig(): AppConfig {
  return {
    wsHost: optionalEnv('WS_HOST', '127.0.0.1'),
    wsPort: numericEnv('WS_PORT', 9090),
    overlayPort: numericEnv('OVERLAY_PORT', 9091),
    mpvPath: optionalEnv('MPV_PATH', 'mpv'),
    ytDlpPath: optionalEnv('YTDLP_PATH', 'yt-dlp'),
    ytDlpCookiesFromBrowser: optionalEnv('YTDLP_COOKIES_FROM_BROWSER', ''),
    ytDlpCookiesFile: optionalEnv('YTDLP_COOKIES_FILE', ''),
    cooldown: numericEnv('COOLDOWN', 120),
    maxDuration: numericEnv('MAX_DURATION', 600),
    maxRequestsPerUser: numericEnv('MAX_REQUESTS_PER_USER', 2),
    defaultVolume: numericEnv('DEFAULT_VOLUME', 30),
    databasePath: optionalEnv('DATABASE_PATH', './data/bot.db'),
    mpvSocketPath: optionalEnv('MPV_SOCKET_PATH', '/tmp/tiktok-mpv.sock'),
    logLevel: optionalEnv('LOG_LEVEL', 'info'),
  };
}
