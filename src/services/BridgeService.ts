import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';
import { getLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Event payload type definitions
// ---------------------------------------------------------------------------

export interface BridgeChatPayload {
  userId: string;
  uniqueId: string;
  nickname: string;
  comment: string;
  isModerator: boolean;
  timestamp: Date;
}

export interface BridgeMemberPayload {
  userId: string;
  uniqueId: string;
  nickname: string;
  timestamp: Date;
}

export interface BridgeFollowPayload {
  userId: string;
  uniqueId: string;
  nickname: string;
  timestamp: Date;
}

export interface BridgeSharePayload {
  userId: string;
  uniqueId: string;
  nickname: string;
  count: number;
  timestamp: Date;
}

export interface BridgeGiftPayload {
  userId: string;
  uniqueId: string;
  nickname: string;
  giftId: number;
  giftName: string;
  diamondCost: number;
  repeatCount: number;
  timestamp: Date;
}

export interface BridgeLikePayload {
  userId: string;
  uniqueId: string;
  nickname: string;
  likeCount: number;
  totalLikes: number;
  timestamp: Date;
}

export interface BridgeConnectedPayload {
  timestamp: Date;
}

export interface BridgeDisconnectedPayload {
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Event map
// ---------------------------------------------------------------------------

export interface BridgeServiceEvents {
  'bridge-chat': [BridgeChatPayload];
  'bridge-member': [BridgeMemberPayload];
  'bridge-follow': [BridgeFollowPayload];
  'bridge-share': [BridgeSharePayload];
  'bridge-gift': [BridgeGiftPayload];
  'bridge-like': [BridgeLikePayload];
  'bridge-connected': [BridgeConnectedPayload];
  'bridge-disconnected': [BridgeDisconnectedPayload];
  'bridge-timeout': [];
}

export type BridgeServiceEventName = keyof BridgeServiceEvents;

// ---------------------------------------------------------------------------
// Heartbeat constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// BridgeService
// ---------------------------------------------------------------------------

export class BridgeService extends EventEmitter {
  private wsHost: string;
  private wsPort: number;
  private server: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private lastHeartbeat: number = Date.now();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _started = false;

  constructor(wsHost: string, wsPort: number) {
    super();
    this.wsHost = wsHost;
    this.wsPort = wsPort;

    // Increase max listeners to accommodate TikTokService and potential debuggers
    this.setMaxListeners(20);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** Whether a bridge client is currently connected. */
  get connected(): boolean {
    return this.client !== null && this.client?.readyState === WebSocket.OPEN;
  }

  /** Whether the WebSocket server has been started. */
  get started(): boolean {
    return this._started;
  }

  /**
   * Start the WebSocket server and begin listening for bridge connections.
   */
  start(): void {
    if (this._started) {
      getLogger().warn('BridgeService is already started');
      return;
    }

    this.server = new WebSocketServer({ host: this.wsHost, port: this.wsPort });

    this.server.on('listening', () => {
      this._started = true;
      getLogger().info(
        `BridgeService: WebSocket server listening on ws://${this.wsHost}:${this.wsPort}`,
      );
    });

    this.server.on('error', (err: Error) => {
      getLogger().error({ err }, 'BridgeService: WebSocket server error');
    });

    this.server.on('connection', (ws: WebSocket) => {
      this._handleConnection(ws);
    });

    // Start heartbeat checker
    this.heartbeatTimer = setInterval(() => {
      this._checkHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop the WebSocket server and disconnect any client.
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.client) {
      try {
        this.client.close();
      } catch {
        // Ignore close errors
      }
      this.client = null;
    }

    if (this.server) {
      try {
        this.server.close();
      } catch {
        // Ignore close errors
      }
      this.server = null;
    }

    this._started = false;
    getLogger().info('BridgeService: stopped');
  }

  // Restrict emit to known event types
  emit(event: BridgeServiceEventName, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: BridgeServiceEventName, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  // ------------------------------------------------------------------
  // Connection handling
  // ------------------------------------------------------------------

  private _handleConnection(ws: WebSocket): void {
    getLogger().info('BridgeService: bridge client connected');

    this.client = ws;
    this.lastHeartbeat = Date.now();

    // Emit connected event
    this.emit('bridge-connected', { timestamp: new Date() });

    ws.on('message', (raw: Buffer) => {
      this._handleMessage(raw);
    });

    ws.on('close', () => {
      getLogger().warn('BridgeService: bridge client disconnected');
      this.client = null;
      this.emit('bridge-disconnected', { timestamp: new Date() });
    });

    ws.on('error', (err: Error) => {
      getLogger().error({ err }, 'BridgeService: bridge client connection error');
    });
  }

  // ------------------------------------------------------------------
  // Message handling
  // ------------------------------------------------------------------

  private _handleMessage(raw: Buffer): void {
    let data: unknown;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      getLogger().warn(
        { raw: raw.toString().slice(0, 200) },
        'BridgeService: received invalid JSON from bridge client',
      );
      return;
    }

    if (!data || typeof data !== 'object') {
      getLogger().warn('BridgeService: received non-object message from bridge client');
      return;
    }

    const msg = data as Record<string, unknown>;

    if (typeof msg.type !== 'string') {
      getLogger().warn(
        { msg },
        'BridgeService: received message without a valid "type" field',
      );
      return;
    }

    switch (msg.type) {
      case 'heartbeat':
        this.lastHeartbeat = Date.now();
        break;

      case 'chat':
        this.emit('bridge-chat', {
          userId: String(msg.userId ?? ''),
          uniqueId: String(msg.uniqueId ?? ''),
          nickname: String(msg.nickname ?? ''),
          comment: String(msg.message ?? ''),
          isModerator: msg.isModerator === true || Number(msg.userRole ?? 0) >= 3,
          timestamp: new Date(),
        });
        break;

      case 'member':
      case 'join':
        this.emit('bridge-member', {
          userId: String(msg.userId ?? ''),
          uniqueId: String(msg.uniqueId ?? ''),
          nickname: String(msg.nickname ?? ''),
          timestamp: new Date(),
        });
        break;

      case 'follow':
        this.emit('bridge-follow', {
          userId: String(msg.userId ?? ''),
          uniqueId: String(msg.uniqueId ?? ''),
          nickname: String(msg.nickname ?? ''),
          timestamp: new Date(),
        });
        break;

      case 'share':
        this.emit('bridge-share', {
          userId: String(msg.userId ?? ''),
          uniqueId: String(msg.uniqueId ?? ''),
          nickname: String(msg.nickname ?? ''),
          count: Number(msg.count ?? 1),
          timestamp: new Date(),
        });
        break;

      case 'gift':
        this.emit('bridge-gift', {
          userId: String(msg.userId ?? ''),
          uniqueId: String(msg.uniqueId ?? ''),
          nickname: String(msg.nickname ?? ''),
          giftId: Number(msg.giftId ?? 0),
          giftName: String(msg.giftName ?? ''),
          diamondCost: Number(msg.diamondCost ?? 0),
          repeatCount: Number(msg.repeatCount ?? 0),
          timestamp: new Date(),
        });
        break;

      case 'like':
        this.emit('bridge-like', {
          userId: String(msg.userId ?? ''),
          uniqueId: String(msg.uniqueId ?? ''),
          nickname: String(msg.nickname ?? ''),
          likeCount: Number(msg.count ?? 0),
          totalLikes: Number(msg.totalLikes ?? 0),
          timestamp: new Date(),
        });
        break;

      case 'connect':
        this.emit('bridge-connected', { timestamp: new Date() });
        break;

      case 'disconnect':
        this.emit('bridge-disconnected', { timestamp: new Date() });
        break;

      default:
        getLogger().debug(
          { type: msg.type },
          'BridgeService: received unknown event type from bridge',
        );
        break;
    }
  }

  // ------------------------------------------------------------------
  // Heartbeat detection
  // ------------------------------------------------------------------

  private _checkHeartbeat(): void {
    if (!this.client) return; // No client to check

    const elapsed = Date.now() - this.lastHeartbeat;

    if (elapsed > HEARTBEAT_TIMEOUT_MS) {
      getLogger().warn(
        { elapsedMs: elapsed },
        'BridgeService: heartbeat timeout — no heartbeat received for >30s',
      );
      this.emit('bridge-timeout');

      // Force-close the client so it can reconnect
      try {
        this.client.close();
      } catch {
        // Ignore close errors
      }
      this.client = null;
    }
  }
}
