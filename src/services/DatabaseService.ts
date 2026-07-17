import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { AppConfig, Song, DbSong, DbRequest, DbUserStats } from '../types/index.js';
import { getLogger } from '../utils/logger.js';

export class DatabaseService {
  private db: Database.Database;

  constructor(config: AppConfig) {
    const dbDir = path.dirname(config.databasePath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(config.databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        duration REAL NOT NULL,
        uploader TEXT,
        requested_count INTEGER DEFAULT 0,
        last_requested TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        unique_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested',
        requested_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (song_id) REFERENCES songs(song_id)
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        unique_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        request_count INTEGER DEFAULT 0,
        last_request TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_requests_song_id ON requests(song_id);
      CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_songs_requested_count ON songs(requested_count DESC);
      CREATE INDEX IF NOT EXISTS idx_users_request_count ON users(request_count DESC);
    `);

    getLogger().info('Database initialized successfully');
  }

  /** Record or update a song in the database */
  recordSong(song: Song): void {
    const stmt = this.db.prepare(`
      INSERT INTO songs (song_id, title, url, duration, uploader, requested_count, last_requested)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(song_id) DO UPDATE SET
        requested_count = requested_count + 1,
        last_requested = datetime('now'),
        title = excluded.title,
        url = excluded.url,
        duration = excluded.duration,
        uploader = excluded.uploader
    `);

    stmt.run(song.id, song.title, song.url, song.duration, song.uploader ?? null);
  }

  /** Record a song request */
  recordRequest(song: Song, userId: string, uniqueId: string, nickname: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO requests (song_id, user_id, unique_id, nickname, status)
      VALUES (?, ?, ?, ?, 'requested')
    `);

    stmt.run(song.id, userId, uniqueId, nickname);
  }

  /** Update user stats */
  recordUser(userId: string, uniqueId: string, nickname: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (user_id, unique_id, nickname, request_count, last_request)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        request_count = request_count + 1,
        last_request = datetime('now'),
        unique_id = excluded.unique_id,
        nickname = excluded.nickname
    `);

    stmt.run(userId, uniqueId, nickname);
  }

  /** Get song history (most requested first) */
  getFavoriteSongs(limit = 10): DbSong[] {
    const stmt = this.db.prepare(
      'SELECT * FROM songs ORDER BY requested_count DESC LIMIT ?',
    );
    return stmt.all(limit) as DbSong[];
  }

  /** Get a user's request count */
  getUserRequestCount(userId: string): number {
    const stmt = this.db.prepare('SELECT request_count FROM users WHERE user_id = ?');
    const row = stmt.get(userId) as DbUserStats | undefined;
    return row?.request_count ?? 0;
  }

  /** Get recent requests */
  getRecentRequests(limit = 20): DbRequest[] {
    const stmt = this.db.prepare(
      'SELECT * FROM requests ORDER BY requested_at DESC LIMIT ?',
    );
    return stmt.all(limit) as DbRequest[];
  }

  /** Get total number of requests */
  getTotalRequests(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM requests').get() as {
      count: number;
    };
    return row.count;
  }

  /** Get total unique songs played */
  getTotalUniqueSongs(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM songs').get() as {
      count: number;
    };
    return row.count;
  }

  /** Get top users by request count */
  getTopUsers(limit = 10): DbUserStats[] {
    const stmt = this.db.prepare(
      'SELECT * FROM users ORDER BY request_count DESC LIMIT ?',
    );
    return stmt.all(limit) as DbUserStats[];
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
    getLogger().info('Database connection closed');
  }
}
