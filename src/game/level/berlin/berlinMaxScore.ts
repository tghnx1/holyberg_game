import { START_TIME } from '../../constants';
import { CLEAN_SECTION_BONUS } from '../../systems/BerlinScoreSystem';
import { BERLIN_ENTITIES, BERLIN_SECTIONS } from './berlinLevelConfig';
import type { CollectibleConfig } from './types';

// Not imported from LevelBuilder.ts: that module pulls in Phaser, which this
// pure calculation (and its unit tests) has no reason to depend on.
const isCollectible = (entity: (typeof BERLIN_ENTITIES)[number]): entity is CollectibleConfig =>
  entity.type === 'collectible';

/**
 * Theoretical maximum Level 1 score: every collectible picked up, every
 * section entered undamaged, and the largest time bonus reachable by
 * collecting every time-bonus collectible — all read from the same config
 * and constants BerlinScoreSystem itself uses, so this can never drift from
 * the real scoring rules.
 *
 * `base` and `penalties` are always 0 in a perfect run (BerlinScoreSystem
 * never awards base points and a clean run takes no obstacle penalty), so
 * they are omitted rather than duplicated here.
 */
export function getBerlinMaxScore(): number {
  const collectibles = BERLIN_ENTITIES.filter(isCollectible);
  const maxCollectibleScore = collectibles.reduce((sum, entity) => sum + entity.score, 0);
  const maxSeconds = collectibles.reduce((sum, entity) => sum + (entity.timeBonus ?? 0), START_TIME);
  // Mirrors BerlinScoreSystem.finish's own formula exactly.
  const maxTimeBonus = Math.ceil(Math.max(0, maxSeconds)) * 20;
  const maxCleanSectionBonus = Math.max(0, BERLIN_SECTIONS.length - 1) * CLEAN_SECTION_BONUS;
  return maxCollectibleScore + maxTimeBonus + maxCleanSectionBonus;
}
