import type { ScheduledAttack } from './types';

/** Existing deterministic fight-plan id, formatted for stable persistence keys. */
export function bossTelegraphWindowId(attack: Pick<ScheduledAttack, 'id'>): string {
  return `attack-${String(attack.id).padStart(2, '0')}`;
}

/**
 * Each occurrence is a separate slice of the existing scene-layout store.
 * An explicitly saved empty slice is therefore distinguishable from another
 * occurrence and round-trips as exactly zero emeralds.
 */
export function bossEmeraldWindowSceneKey(bossSceneKey: string, windowId: string): string {
  return `${bossSceneKey}:telegraph:${windowId}`;
}
