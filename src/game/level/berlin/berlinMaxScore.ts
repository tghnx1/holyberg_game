import { CLEAN_SECTION_BONUS } from '../../systems/BerlinScoreSystem';
import { BERLIN_ENTITIES, BERLIN_SECTIONS } from './berlinLevelConfig';
import type { CollectibleConfig } from './types';

// Not imported from LevelBuilder.ts: that module pulls in Phaser, which this
// pure calculation (and its unit tests) has no reason to depend on.
const isCollectible = (entity: (typeof BERLIN_ENTITIES)[number]): entity is CollectibleConfig =>
  entity.type === 'collectible';

/**
 * Theoretical maximum Level 1 score: every Emerald picked up and every
 * section entered undamaged — read from the same config and constants
 * BerlinScoreSystem itself uses, so this can never drift from the real
 * scoring rules. No time bonus: BerlinScoreSystem.finish() no longer awards
 * one (there is no running countdown to reward finishing early on).
 *
 * `base` and `penalties` are always 0 in a perfect run (BerlinScoreSystem
 * never awards base points and a clean run takes no obstacle penalty), so
 * they are omitted rather than duplicated here.
 */
export function getBerlinMaxScore(): number {
  const collectibles = BERLIN_ENTITIES.filter(isCollectible);
  const maxCollectibleScore = collectibles.reduce((sum, entity) => sum + entity.score, 0);
  const maxCleanSectionBonus = Math.max(0, BERLIN_SECTIONS.length - 1) * CLEAN_SECTION_BONUS;
  return maxCollectibleScore + maxCleanSectionBonus;
}
