import { START_TIME } from '../../constants';
import { CLEAN_SECTION_BONUS } from '../../systems/BerlinScoreSystem';
import { BERLIN_ENTITIES, BERLIN_SECTIONS } from './berlinLevelConfig';
import type { CollectibleConfig } from './types';

// Not imported from LevelBuilder.ts: that module pulls in Phaser, which this
// pure calculation (and its unit tests) has no reason to depend on.
const isCollectible = (entity: (typeof BERLIN_ENTITIES)[number]): entity is CollectibleConfig =>
  entity.type === 'collectible';

/**
 * Theoretical maximum Level 1 score: every Emerald picked up, every section
 * entered undamaged, and the time bonus for finishing with the clock
 * untouched — all read from the same config and constants BerlinScoreSystem
 * itself uses, so this can never drift from the real scoring rules.
 *
 * No collectible adds time any more, so the best reachable clock is simply
 * the starting one.
 *
 * `base` and `penalties` are always 0 in a perfect run (BerlinScoreSystem
 * never awards base points and a clean run takes no obstacle penalty), so
 * they are omitted rather than duplicated here.
 */
export function getBerlinMaxScore(): number {
  const collectibles = BERLIN_ENTITIES.filter(isCollectible);
  const maxCollectibleScore = collectibles.reduce((sum, entity) => sum + entity.score, 0);
  // Mirrors BerlinScoreSystem.finish's own formula exactly.
  const maxTimeBonus = Math.ceil(Math.max(0, START_TIME)) * 20;
  const maxCleanSectionBonus = Math.max(0, BERLIN_SECTIONS.length - 1) * CLEAN_SECTION_BONUS;
  return maxCollectibleScore + maxTimeBonus + maxCleanSectionBonus;
}
