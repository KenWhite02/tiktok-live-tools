/** Song metadata from search results */
export interface Song {
  id: string;
  title: string;
  url: string;
  duration: number;
  thumbnail?: string;
  uploader?: string;
  webpageUrl?: string;
}

/** Item in the playback queue */
export interface QueueItem {
  song: Song;
  requestedBy: string;
  requestedByNickname: string;
  requestedAt: Date;
  status: 'pending' | 'playing' | 'finished' | 'skipped' | 'error';
}

/** Current player state */
export interface PlayerStatus {
  state: 'playing' | 'paused' | 'stopped' | 'idle';
  volume: number;
  currentSong?: Song;
  position?: number;
  duration?: number;
}

/** Context passed to command handlers */
export interface CommandContext {
  userId: string;
  uniqueId: string;
  nickname: string;
  isModerator: boolean;
  /** The stream owner (TIKTOK_USERNAME in bridge/.env) */
  isHost: boolean;
  args: string[];
  message: string;
}

/** A registered chat command */
export interface CommandHandler {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  moderatorOnly: boolean;
  /** Only the stream owner may run this command, not even moderators */
  hostOnly?: boolean;
  execute: (ctx: CommandContext) => Promise<string | void>;
}

/** Application configuration (loaded from env) */
export interface AppConfig {
  wsHost: string;
  wsPort: number;
  overlayPort: number;
  mpvPath: string;
  ytDlpPath: string;
  /** Browser to read YouTube cookies from (e.g. chrome, firefox, safari) */
  ytDlpCookiesFromBrowser: string;
  /** Path to a Netscape cookies.txt; takes precedence over the browser option */
  ytDlpCookiesFile: string;
  cooldown: number;
  maxDuration: number;
  /** Songs one viewer may have playing + waiting at once (host is exempt) */
  maxRequestsPerUser: number;
  defaultVolume: number;
  databasePath: string;
  mpvSocketPath: string;
  logLevel: string;
}

/** Database song record */
export interface DbSong {
  id: number;
  song_id: string;
  title: string;
  url: string;
  duration: number;
  uploader: string | null;
  requested_count: number;
  last_requested: string;
  created_at: string;
}

/** Database request record */
export interface DbRequest {
  id: number;
  song_id: string;
  user_id: string;
  unique_id: string;
  nickname: string;
  status: string;
  requested_at: string;
}

/** Database user stats */
export interface DbUserStats {
  id: number;
  user_id: string;
  unique_id: string;
  nickname: string;
  request_count: number;
  last_request: string;
  created_at: string;
}
