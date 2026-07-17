import { EventEmitter } from 'node:events';
import { getLogger } from '../utils/logger.js';

/**
 * Central typed event bus for TikTok events.
 * Allows multiple subscribers to independently listen to specific events.
 *
 * Usage:
 *   TikTokEventBus.on('chat', (data) => { ... });
 *   TikTokEventBus.on('gift', (data) => { ... });
 */
class TikTokEventBusClass extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /** Emit a chat event */
  emitChat(data: ChatEventData): void {
    this.emit('chat', data);
  }

  /** Emit a member join event */
  emitMember(data: MemberEventData): void {
    this.emit('member', data);
  }

  /** Emit a follow event */
  emitFollow(data: FollowEventData): void {
    this.emit('follow', data);
  }

  /** Emit a share event */
  emitShare(data: ShareEventData): void {
    this.emit('share', data);
  }

  /** Emit a gift event */
  emitGift(data: GiftEventData): void {
    this.emit('gift', data);
  }

  /** Emit a like event */
  emitLike(data: LikeEventData): void {
    this.emit('like', data);
  }

  /** Emit a connection event */
  emitConnected(): void {
    this.emit('connected');
  }

  /** Emit a disconnection event */
  emitDisconnected(): void {
    this.emit('disconnected');
  }

  /** Log all registered listeners */
  logListeners(): void {
    const events = this.eventNames();
    getLogger().debug(
      { events: events.map((e) => ({ event: e, count: this.listenerCount(e) })) },
      'Registered event listeners',
    );
  }
}

// ─── Event Data Types ─────────────────────────────────────────────────────

export interface ChatEventData {
  userId: string;
  uniqueId: string;
  nickname: string;
  comment: string;
  isModerator: boolean;
  timestamp: Date;
}

export interface MemberEventData {
  userId: string;
  uniqueId: string;
  nickname: string;
  timestamp: Date;
}

export interface FollowEventData {
  userId: string;
  uniqueId: string;
  nickname: string;
  timestamp: Date;
}

export interface ShareEventData {
  userId: string;
  uniqueId: string;
  nickname: string;
  count: number;
  timestamp: Date;
}

export interface GiftEventData {
  userId: string;
  uniqueId: string;
  nickname: string;
  giftId: number;
  giftName: string;
  diamondCost: number;
  repeatCount: number;
  timestamp: Date;
}

export interface LikeEventData {
  userId: string;
  uniqueId: string;
  nickname: string;
  likeCount: number;
  totalLikes: number;
  timestamp: Date;
}

/** Singleton instance */
export const TikTokEventBus = new TikTokEventBusClass();
