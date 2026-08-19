import { describe, expect, it } from 'vitest';
import { START_TIME } from '../src/game/constants';
import { CLEAN_SECTION_BONUS } from '../src/game/systems/BerlinScoreSystem';
import { BERLIN_ENTITIES, BERLIN_SECTIONS } from '../src/game/level/berlin/berlinLevelConfig';
import { getBerlinMaxScore } from '../src/game/level/berlin/berlinMaxScore';
import type { BerlinEntity, CollectibleConfig } from '../src/game/level/berlin/types';

const isCollectible = (entity: BerlinEntity): entity is CollectibleConfig =>
  entity.type === 'collectible';

describe('getBerlinMaxScore', () => {
  it('matches a from-scratch calculation using only existing config/constants', () => {
    const collectibles = BERLIN_ENTITIES.filter(isCollectible);
    const maxCollectibleScore = collectibles.reduce((sum, entity) => sum + entity.score, 0);
    const maxSeconds = collectibles.reduce((sum, entity) => sum + (entity.timeBonus ?? 0), START_TIME);
    const maxTimeBonus = Math.ceil(maxSeconds) * 20;
    const maxCleanSectionBonus = (BERLIN_SECTIONS.length - 1) * CLEAN_SECTION_BONUS;
    const expected = maxCollectibleScore + maxTimeBonus + maxCleanSectionBonus;

    expect(getBerlinMaxScore()).toBe(expected);
  });

  it('is strictly positive and comfortably above the sum of collectible scores alone', () => {
    const max = getBerlinMaxScore();
    const collectibleOnly = BERLIN_ENTITIES.filter(isCollectible).reduce((sum, e) => sum + e.score, 0);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(collectibleOnly);
  });

  it('is deterministic', () => {
    expect(getBerlinMaxScore()).toBe(getBerlinMaxScore());
  });
});
