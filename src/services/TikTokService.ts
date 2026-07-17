import { EventEmitter } from 'node:events';
import { getLogger } from '../utils/logger.js';
import type { BridgeService } from './BridgeService.js';

/**
 * Manages TikTok Live event consumption via the Python Bridge.
 *
 * This is an adapter over BridgeService — instead of connecting to TikTok
 * directly via tiktok-live-connector, it subscribes to events emitted by
 * the BridgeService (which receives them from the Python TikTokLive bridge
 * over a local WebSocket).
 *
 * The public EventEmitter API is preserved identically so that existing
 * command handlers and event subscribers do not need to change.
 */
export class TikTokService extends EventEmitter {
  private bridgeService: BridgeService;
  private _connected = false;

  constructor(bridgeService: BridgeService) {
    super();
    this.bridgeService = bridgeService;
  }

  /** Subscribe to BridgeService events and begin receiving TikTok events. */
  async connect(): Promise<void> {
    const logger = getLogger();
    logger.info('TikTokService: subscribing to BridgeService events');

    this._registerBridgeListeners();

    // If the bridge client is already connected, mark as connected immediately
    if (this.bridgeService.connected) {
      this._connected = true;
      this.emit('connected');
    }

    logger.info('TikTokService: listening for bridge events');
  }

  /** Unsubscribe from all BridgeService events. */
  async disconnect(): Promise<void> {
    this._connected = false;
    this._removeBridgeListeners();
    getLogger().info('TikTokService: unsubscribed from BridgeService events');
  }

  /** Whether we are currently receiving events (delegates to bridge connection). */
  get connected(): boolean {
    return this._connected;
  }

  // ------------------------------------------------------------------
  // Bridge event wiring
  // ------------------------------------------------------------------

  private _bridgeChatListener!: (...args: unknown[]) => void;
  private _bridgeMemberListener!: (...args: unknown[]) => void;
  private _bridgeFollowListener!: (...args: unknown[]) => void;
  private _bridgeShareListener!: (...args: unknown[]) => void;
  private _bridgeGiftListener!: (...args: unknown[]) => void;
  private _bridgeLikeListener!: (...args: unknown[]) => void;
  private _bridgeConnectedListener!: (...args: unknown[]) => void;
  private _bridgeDisconnectedListener!: (...args: unknown[]) => void;

  private _registerBridgeListeners(): void {
    this._bridgeChatListener = (data: unknown) => {
      const d = data as {
        userId?: string;
        uniqueId?: string;
        nickname?: string;
        comment?: string;
        isModerator?: boolean;
        timestamp?: Date;
      };
      this.emit('chat', {
        userId: d.userId ?? '',
        uniqueId: d.uniqueId ?? 'unknown',
        nickname: d.nickname ?? 'unknown',
        comment: d.comment ?? '',
        isModerator: d.isModerator ?? false,
        timestamp: d.timestamp ?? new Date(),
      });
    };

    this._bridgeMemberListener = (data: unknown) => {
      const d = data as {
        userId?: string;
        uniqueId?: string;
        nickname?: string;
        timestamp?: Date;
      };
      this.emit('member', {
        userId: d.userId ?? '',
        uniqueId: d.uniqueId ?? 'unknown',
        nickname: d.nickname ?? 'unknown',
        timestamp: d.timestamp ?? new Date(),
      });
    };

    this._bridgeFollowListener = (data: unknown) => {
      const d = data as {
        userId?: string;
        uniqueId?: string;
        nickname?: string;
        timestamp?: Date;
      };
      this.emit('follow', {
        userId: d.userId ?? '',
        uniqueId: d.uniqueId ?? 'unknown',
        nickname: d.nickname ?? 'unknown',
        timestamp: d.timestamp ?? new Date(),
      });
    };

    this._bridgeShareListener = (data: unknown) => {
      const d = data as {
        userId?: string;
        uniqueId?: string;
        nickname?: string;
        count?: number;
        timestamp?: Date;
      };
      this.emit('share', {
        userId: d.userId ?? '',
        uniqueId: d.uniqueId ?? 'unknown',
        nickname: d.nickname ?? 'unknown',
        count: d.count ?? 1,
        timestamp: d.timestamp ?? new Date(),
      });
    };

    this._bridgeGiftListener = (data: unknown) => {
      const d = data as {
        userId?: string;
        uniqueId?: string;
        nickname?: string;
        giftId?: number;
        giftName?: string;
        diamondCost?: number;
        repeatCount?: number;
        timestamp?: Date;
      };
      this.emit('gift', {
        userId: d.userId ?? '',
        uniqueId: d.uniqueId ?? 'unknown',
        nickname: d.nickname ?? 'unknown',
        giftId: d.giftId ?? 0,
        giftName: d.giftName ?? 'unknown',
        diamondCost: d.diamondCost ?? 0,
        repeatCount: d.repeatCount ?? 1,
        timestamp: d.timestamp ?? new Date(),
      });
    };

    this._bridgeLikeListener = (data: unknown) => {
      const d = data as {
        userId?: string;
        uniqueId?: string;
        nickname?: string;
        likeCount?: number;
        totalLikes?: number;
        timestamp?: Date;
      };
      this.emit('like', {
        userId: d.userId ?? '',
        uniqueId: d.uniqueId ?? 'unknown',
        nickname: d.nickname ?? 'unknown',
        likeCount: d.likeCount ?? 1,
        totalLikes: d.totalLikes ?? 0,
        timestamp: d.timestamp ?? new Date(),
      });
    };

    this._bridgeConnectedListener = () => {
      this._connected = true;
      this.emit('connected');
    };

    this._bridgeDisconnectedListener = () => {
      this._connected = false;
      this.emit('disconnected');
    };

    // Subscribe
    this.bridgeService.on('bridge-chat', this._bridgeChatListener);
    this.bridgeService.on('bridge-member', this._bridgeMemberListener);
    this.bridgeService.on('bridge-follow', this._bridgeFollowListener);
    this.bridgeService.on('bridge-share', this._bridgeShareListener);
    this.bridgeService.on('bridge-gift', this._bridgeGiftListener);
    this.bridgeService.on('bridge-like', this._bridgeLikeListener);
    this.bridgeService.on('bridge-connected', this._bridgeConnectedListener);
    this.bridgeService.on('bridge-disconnected', this._bridgeDisconnectedListener);
  }

  private _removeBridgeListeners(): void {
    this.bridgeService.off('bridge-chat', this._bridgeChatListener);
    this.bridgeService.off('bridge-member', this._bridgeMemberListener);
    this.bridgeService.off('bridge-follow', this._bridgeFollowListener);
    this.bridgeService.off('bridge-share', this._bridgeShareListener);
    this.bridgeService.off('bridge-gift', this._bridgeGiftListener);
    this.bridgeService.off('bridge-like', this._bridgeLikeListener);
    this.bridgeService.off('bridge-connected', this._bridgeConnectedListener);
    this.bridgeService.off('bridge-disconnected', this._bridgeDisconnectedListener);
  }
}
