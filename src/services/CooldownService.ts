import { getLogger } from '../utils/logger.js';

interface CooldownEntry {
  expiresAt: number;
}

/**
 * Anti-spam cooldown tracking.
 * Each user can only request one song per cooldown period.
 * Moderators are exempt.
 */
export class CooldownService {
  private cooldowns = new Map<string, CooldownEntry>();
  private readonly cooldownSeconds: number;

  constructor(cooldownSeconds: number) {
    this.cooldownSeconds = cooldownSeconds;
    getLogger().info(
      { cooldownSeconds },
      'CooldownService initialized',
    );

    // Periodically clean up expired entries to prevent memory leaks
    setInterval(() => this.cleanup(), 60_000);
  }

  /** Check if a user is on cooldown */
  isOnCooldown(userId: string): boolean {
    const entry = this.cooldowns.get(userId);
    if (!entry) return false;

    if (Date.now() >= entry.expiresAt) {
      this.cooldowns.delete(userId);
      return false;
    }

    return true;
  }

  /** Get remaining cooldown time in seconds for a user */
  getRemainingCooldown(userId: string): number {
    const entry = this.cooldowns.get(userId);
    if (!entry) return 0;

    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    if (remaining <= 0) {
      this.cooldowns.delete(userId);
      return 0;
    }

    return remaining;
  }

  /** Set cooldown for a user */
  setCooldown(userId: string): void {
    this.cooldowns.set(userId, {
      expiresAt: Date.now() + this.cooldownSeconds * 1000,
    });
  }

  /** Manually clear cooldown for a user */
  clearCooldown(userId: string): void {
    this.cooldowns.delete(userId);
  }

  /** Remove expired entries */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [userId, entry] of this.cooldowns) {
      if (now >= entry.expiresAt) {
        this.cooldowns.delete(userId);
        removed++;
      }
    }

    if (removed > 0) {
      getLogger().debug({ removed }, 'Cleaned up expired cooldowns');
    }
  }
}
