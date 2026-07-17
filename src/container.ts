/**
 * Service container — holds singleton service instances.
 * Both app.ts and command handlers import from here.
 */

import type {
  BridgeService as BridgeServiceClass,
  PlayerService as PlayerServiceClass,
  QueueService as QueueServiceClass,
  SearchService as SearchServiceClass,
  DatabaseService as DatabaseServiceClass,
  CooldownService as CooldownServiceClass,
  TikTokService as TikTokServiceClass,
} from './services/index.js';

// These are set during app initialization
export let BridgeService: InstanceType<typeof BridgeServiceClass>;
export let PlayerService: InstanceType<typeof PlayerServiceClass>;
export let QueueService: InstanceType<typeof QueueServiceClass>;
export let SearchService: InstanceType<typeof SearchServiceClass>;
export let DatabaseService: InstanceType<typeof DatabaseServiceClass>;
export let CooldownService: InstanceType<typeof CooldownServiceClass>;
export let TikTokService: InstanceType<typeof TikTokServiceClass>;

export function setPlayerService(instance: typeof PlayerService): void {
  PlayerService = instance;
}

export function setQueueService(instance: typeof QueueService): void {
  QueueService = instance;
}

export function setSearchService(instance: typeof SearchService): void {
  SearchService = instance;
}

export function setDatabaseService(instance: typeof DatabaseService): void {
  DatabaseService = instance;
}

export function setCooldownService(instance: typeof CooldownService): void {
  CooldownService = instance;
}

export function setBridgeService(instance: typeof BridgeService): void {
  BridgeService = instance;
}

export function setTikTokService(instance: typeof TikTokService): void {
  TikTokService = instance;
}
