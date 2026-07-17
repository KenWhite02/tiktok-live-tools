import { TikTokEventBus, type ChatEventData, type GiftEventData } from './TikTokEventBus.js';
import { getLogger } from '../utils/logger.js';
import type { DatabaseService } from '../services/DatabaseService.js';

/**
 * Register default event handlers.
 * This provides a centralized place to wire event → action mappings.
 */
export function registerEventHandlers(_db: DatabaseService): void {
  const logger = getLogger();

  // Log all chat messages (optional, for statistics)
  TikTokEventBus.on('chat', (data: ChatEventData) => {
    logger.debug(
      { user: data.uniqueId, comment: data.comment },
      'Chat event via bus',
    );
  });

  // Log all gifts
  TikTokEventBus.on('gift', (data: GiftEventData) => {
    logger.info(
      {
        user: data.uniqueId,
        gift: data.giftName,
        totalDiamonds: data.diamondCost * data.repeatCount,
        count: data.repeatCount,
      },
      'Gift event via bus',
    );
  });

  logger.debug('Event handlers registered');
}

/**
 * Placeholder for future event handlers.
 *
 * To add a new event handler:
 * 1. Define the handler function here
 * 2. Register it in registerEventHandlers()
 *
 * Examples of future handlers:
 * - Database logging for gifts
 * - Auto-respond to certain keywords
 * - Song request via gift triggers
 * - User reputation tracking
 */
