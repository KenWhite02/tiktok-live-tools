import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection, type Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { AppConfig, Song, PlayerStatus } from '../types/index.js';
import { getLogger } from '../utils/logger.js';

interface MpvResponse {
  error: string;
  data?: unknown;
  request_id?: number;
}

interface MpvEvent {
  event: string;
  [key: string]: unknown;
}

/**
 * Audio this quiet for this long means the video's sound is gone — YouTube
 * mutes videos over copyright claims and keeps them up, so they "play" silently.
 */
const SILENCE_DB = -60;
const SILENCE_SECONDS = 8;
/** Silence that starts this close to the end is just the song's fade-out */
const SILENCE_END_MARGIN = 15;

/**
 * Controls an mpv instance via JSON IPC protocol.
 * Spawns mpv with --idle and communicates through a Unix socket.
 */
export class PlayerService extends EventEmitter {
  private config: AppConfig;
  private mpvProcess: ChildProcess | null = null;
  private socket: Socket | null = null;
  private isRunning = false;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private buffer = '';
  private currentSong: Song | null = null;
  private _volume: number;

  /** Track if a song is currently being loaded (async operation in progress) */
  private isLoadingSong = false;
  /** mpv playlist entry of the current song, to tell its end-file apart from a replaced song's */
  private currentEntryId: number | null = null;
  /** Whether song-muted already fired for the current song */
  private mutedReported = false;
  constructor(config: AppConfig) {
    super();
    this.config = config;
    this._volume = config.defaultVolume;
  }

  get volume(): number {
    return this._volume;
  }

  /** Start mpv process and connect IPC socket */
  async start(): Promise<void> {
    const logger = getLogger();

    // Clean up stale socket file
    try {
      if (fs.existsSync(this.config.mpvSocketPath)) {
        fs.unlinkSync(this.config.mpvSocketPath);
        logger.debug('Removed stale socket file');
      }
    } catch {
      // Ignore
    }

    return new Promise((resolve, reject) => {
      try {
        this.mpvProcess = spawn(this.config.mpvPath, [
          '--idle',
          `--input-ipc-server=${this.config.mpvSocketPath}`,
          '--no-terminal',
          '--no-video',
          '--no-audio-display',
          '--volume=' + this._volume,
          '--keep-open=no',
          '--cache=yes',
          '--demuxer-max-bytes=10M',
          '--demuxer-max-back-bytes=2M',
          `--af=@silence:lavfi=[silencedetect=n=${SILENCE_DB}dB:d=${SILENCE_SECONDS}]`,
        ]);

        logger.info(
          { pid: this.mpvProcess.pid, socket: this.config.mpvSocketPath },
          'mpv process spawned',
        );

        this.mpvProcess.on('error', (err) => {
          logger.error({ err }, 'mpv process error');
          this.emit('error', err);
          this.handleProcessExit();
        });

        this.mpvProcess.on('exit', (code, signal) => {
          logger.warn({ code, signal }, 'mpv process exited');
          this.handleProcessExit();
        });

        // Wait for socket to be ready
        const checkSocket = () => {
          try {
            if (fs.existsSync(this.config.mpvSocketPath)) {
              this.connectSocket();
              resolve();
            } else {
              setTimeout(checkSocket, 100);
            }
          } catch {
            setTimeout(checkSocket, 100);
          }
        };

        // Give mpv time to create the socket
        setTimeout(checkSocket, 500);
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Connect to the mpv IPC socket */
  private connectSocket(): void {
    const logger = getLogger();

    this.socket = createConnection(this.config.mpvSocketPath, () => {
      logger.info('Connected to mpv IPC socket');
      this.isRunning = true;

      // Observe useful properties
      this.rawCommand('observe_property', 1, 'pause');
      this.rawCommand('observe_property', 2, 'volume');
      this.rawCommand('observe_property', 3, 'path');
      this.rawCommand('observe_property', 4, 'duration');
      this.rawCommand('observe_property', 5, 'time-pos');
      this.rawCommand('observe_property', 6, 'eof-reached');
      this.rawCommand('observe_property', 7, 'idle-active');
      this.rawCommand('observe_property', 8, 'af-metadata/silence');
    });

    this.socket.on('data', (data: Buffer) => {
      this.handleData(data.toString('utf-8'));
    });

    this.socket.on('error', (err) => {
      logger.error({ err }, 'mpv socket error');
    });

    this.socket.on('close', () => {
      logger.warn('mpv socket closed');
      this.isRunning = false;
    });
  }

  /** Handle raw data from mpv socket */
  private handleData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');

    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        this.handleMessage(parsed);
      } catch {
        getLogger().debug({ raw: trimmed }, 'Failed to parse mpv message');
      }
    }
  }

  /** Handle a parsed mpv message */
  private handleMessage(msg: MpvResponse | MpvEvent): void {
    const logger = getLogger();

    // Response to a command
    const mpvResp = msg as MpvResponse;
    if (mpvResp.request_id !== undefined) {
      const reqId = mpvResp.request_id as number;
      const pending = this.pendingRequests.get(reqId);
      if (pending) {
        this.pendingRequests.delete(reqId);
        if (mpvResp.error === 'success') {
          pending.resolve(mpvResp.data);
        } else {
          pending.reject(new Error(String(mpvResp.error)));
        }
      }
      return;
    }

    // Event from mpv
    if ('event' in msg) {
      const event = msg as MpvEvent;
      switch (event.event) {
        case 'property-change':
          this.handlePropertyChange(event.name as string, event.data);
          break;
        case 'end-file':
          // Loading a song over another one ends the old entry; that isn't
          // the current song ending
          if (event.playlist_entry_id !== this.currentEntryId) {
            logger.debug({ entryId: event.playlist_entry_id }, 'Ignoring end of replaced song');
            break;
          }
          if (event.reason === 'error') {
            logger.warn({ fileError: event.file_error, title: this.currentSong?.title }, 'mpv failed to play song');
            this.emit('song-failed');
          } else {
            logger.debug({ reason: event.reason }, 'Song ended');
          }
          this.currentSong = null;
          this.isLoadingSong = false;
          this.emit('song-ended');
          break;
        case 'file-loaded':
          logger.debug('File loaded in mpv');
          // If we had a pending load that got overwritten, restore it
          this.isLoadingSong = false;
          break;
        case 'idle':
          this.emit('player-idle');
          break;
        case 'shutdown':
          this.isRunning = false;
          this.emit('player-shutdown');
          break;
        default:
          logger.debug({ event: event.event }, 'Unhandled mpv event');
      }
      this.emit('mpv-event', event);
    }
  }

  /** Handle property change events from mpv */
  private handlePropertyChange(name: string, data: unknown): void {
    switch (name) {
      case 'eof-reached':
        if (data === true) {
          getLogger().debug('EOF reached');
        }
        break;
      case 'idle-active':
        if (data === true && !this.isLoadingSong) {
          this.emit('player-idle');
        }
        break;
      case 'af-metadata/silence':
        this.checkMuted(data as Record<string, string> | null);
        break;
    }
  }

  /** Emit song-muted once if the current song has gone silent well before its end */
  private checkMuted(metadata: Record<string, string> | null): void {
    const silenceStart = Number(metadata?.['lavfi.silence_start']);
    const song = this.currentSong;
    if (!song || this.mutedReported || Number.isNaN(silenceStart)) return;
    if (silenceStart > song.duration - SILENCE_END_MARGIN) return;

    this.mutedReported = true;
    getLogger().warn({ title: song.title, silenceStart }, 'Song is silent, probably muted on YouTube');
    this.emit('song-muted');
  }

  /** Send a command to mpv */
  private async rawCommand(
    command: string,
    ...args: unknown[]
  ): Promise<unknown> {
    if (!this.socket || !this.isRunning) {
      throw new Error('mpv not connected');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request = JSON.stringify({
        command: [command, ...args],
        request_id: id,
      });

      this.pendingRequests.set(id, { resolve, reject });
      this.socket!.write(request + '\n');

      // Safety timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`mpv command timed out: ${command}`));
        }
      }, 10_000);
    });
  }

  /** Load and play a song */
  async loadSong(song: Song, audioUrl: string): Promise<void> {
    getLogger().info({ title: song.title }, 'Loading song into mpv');

    this.currentSong = song;
    this.mutedReported = false;

    try {
      this.isLoadingSong = true;
      // Until mpv replies, any end-file belongs to the song being replaced
      this.currentEntryId = null;
      const result = (await this.rawCommand('loadfile', audioUrl, 'replace')) as
        | { playlist_entry_id?: number }
        | undefined;
      this.currentEntryId = result?.playlist_entry_id ?? null;
      this.emit('song-start', song);
    } catch (error) {
      this.isLoadingSong = false;
      this.currentSong = null;
      getLogger().error({ error, title: song.title }, 'Failed to load song');
      throw error;
    }
  }

  /** Pause playback */
  async pause(): Promise<void> {
    try {
      await this.rawCommand('set_property', 'pause', true);
      getLogger().info('Playback paused');
    } catch (error) {
      getLogger().error({ error }, 'Failed to pause');
    }
  }

  /** Resume playback */
  async resume(): Promise<void> {
    try {
      await this.rawCommand('set_property', 'pause', false);
      getLogger().info('Playback resumed');
    } catch (error) {
      getLogger().error({ error }, 'Failed to resume');
    }
  }

  /** Stop playback */
  async stop(): Promise<void> {
    try {
      await this.rawCommand('stop');
      this.currentSong = null;
      getLogger().info('Playback stopped');
    } catch (error) {
      getLogger().error({ error }, 'Failed to stop');
    }
  }

  /** Set volume (0-100) */
  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, volume));
    try {
      await this.rawCommand('set_property', 'volume', clamped);
      this._volume = clamped;
      getLogger().info({ volume: clamped }, 'Volume set');
    } catch (error) {
      getLogger().error({ error }, 'Failed to set volume');
    }
  }

  /** Get current player status */
  async getStatus(): Promise<PlayerStatus> {
    try {
      const [pause, volume, path, duration, timePos] = await Promise.all([
        this.rawCommand('get_property', 'pause').catch(() => true),
        this.rawCommand('get_property', 'volume').catch(() => this._volume),
        this.rawCommand('get_property', 'path').catch(() => null),
        this.rawCommand('get_property', 'duration').catch(() => null),
        this.rawCommand('get_property', 'time-pos').catch(() => null),
      ]);

      const paused = pause as boolean;
      const hasPath = path !== null;

      let state: PlayerStatus['state'] = 'idle';
      if (this.currentSong && !paused) state = 'playing';
      else if (this.currentSong && paused) state = 'paused';
      else if (hasPath && paused) state = 'paused';
      else if (hasPath) state = 'playing';

      return {
        state,
        volume: volume as number,
        currentSong: this.currentSong ?? undefined,
        position: timePos as number | undefined,
        duration: duration as number | undefined,
      };
    } catch {
      return {
        state: 'idle',
        volume: this._volume,
        currentSong: this.currentSong ?? undefined,
      };
    }
  }

  /** Check if mpv is running and connected */
  isConnected(): boolean {
    return this.isRunning && this.socket !== null && !this.socket.destroyed;
  }

  /** Restart mpv process */
  async restart(): Promise<void> {
    getLogger().info('Restarting mpv...');
    await this.stop();
    await this.kill();
    await this.start();
  }

  /** Kill mpv process */
  private kill(): Promise<void> {
    return new Promise((resolve) => {
      if (this.mpvProcess && !this.mpvProcess.killed) {
        this.mpvProcess.on('exit', () => resolve());
        this.mpvProcess.kill('SIGTERM');
        setTimeout(() => {
          if (this.mpvProcess && !this.mpvProcess.killed) {
            this.mpvProcess.kill('SIGKILL');
          }
          resolve();
        }, 3000);
      } else {
        resolve();
      }
    });
  }

  /** Handle mpv process exit - attempt restart */
  private handleProcessExit(): void {
    this.isRunning = false;
    this.mpvProcess = null;
    this.socket = null;
    this.currentSong = null;
    this.currentEntryId = null;
    this.emit('player-crashed');
  }

  /** Clean shutdown */
  async shutdown(): Promise<void> {
    getLogger().info('Shutting down player...');
    await this.stop().catch(() => {});
    await this.kill();
    this.removeAllListeners();
  }
}
