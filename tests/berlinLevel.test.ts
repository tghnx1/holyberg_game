import { describe, expect, it } from 'vitest';
import {
  BERLIN_ENTITIES,
  BERLIN_SECTIONS,
  sectionIndexAtX,
} from '../src/game/level/berlin/berlinLevelConfig';
import { applyCollectibleReward, canFinishBerlin } from '../src/game/level/berlin/berlinRules';
import {
  canConsumeJump,
  COYOTE_TIME_MS,
  CROUCHING_BODY,
  JUMP_BUFFER_MS,
  playerBodyFor,
  STANDING_BODY,
} from '../src/game/level/berlin/playerPhysics';
import { BerlinScoreSystem } from '../src/game/systems/BerlinScoreSystem';
import { SectionTracker } from '../src/game/systems/SectionTracker';

describe('Berlin level config', () => {
  it('defines contiguous sections across the 7000-unit world', () => {
    expect(BERLIN_SECTIONS.map((section) => [section.startX, section.endX])).toEqual([
      [0, 800],
      [800, 2200],
      [2200, 3800],
      [3800, 5200],
      [5200, 7000],
    ]);
    expect(sectionIndexAtX(3799)).toBe(2);
    expect(sectionIndexAtX(3800)).toBe(3);
  });
  it('keeps mandatory USB and finish at their authored positions', () => {
    expect(BERLIN_ENTITIES.find((entity) => entity.id === 'usb')?.x).toBe(650);
    expect(BERLIN_ENTITIES.find((entity) => entity.type === 'finish')?.x).toBe(6800);
  });
  it('gives every gameplay object a unique id and independent dimensions', () => {
    expect(new Set(BERLIN_ENTITIES.map((entity) => entity.id)).size).toBe(BERLIN_ENTITIES.length);
    expect(BERLIN_ENTITIES.every((entity) => entity.width > 0 && entity.height > 0)).toBe(true);
  });
  it('applies the timer pickup and requires USB at finish', () => {
    const energy = BERLIN_ENTITIES.find((entity) => entity.id === 'energy');
    if (!energy || energy.type !== 'collectible') throw new Error('Energy config missing');
    expect(applyCollectibleReward(12, false, energy)).toEqual({
      seconds: 15,
      score: 0,
      hasUsb: false,
    });
    expect(canFinishBerlin(false)).toBe(false);
    expect(canFinishBerlin(true)).toBe(true);
  });
});

describe('Berlin scoring and sections', () => {
  it('tracks pickups, hits, clean sections and final time separately', () => {
    const scoring = new BerlinScoreSystem();
    scoring.addCollectible(500);
    scoring.hitObstacle();
    scoring.awardCleanSection();
    expect(scoring.finish(3.1)).toBe(730);
    expect(scoring.breakdown).toEqual({
      base: 0,
      collectibles: 500,
      cleanSections: 250,
      penalties: -100,
      timeBonus: 80,
    });
  });
  it('does not let an obstacle produce a negative total', () => {
    const scoring = new BerlinScoreSystem();
    scoring.hitObstacle();
    expect(scoring.score).toBe(0);
  });
  it('awards only undamaged forward section crossings', () => {
    const tracker = new SectionTracker();
    expect(tracker.update(900).clean).toBe(true);
    tracker.markDamage();
    expect(tracker.update(2300).clean).toBe(false);
  });
});

describe('Berlin player physics rules', () => {
  it('uses an explicit reduced crouch body', () => {
    expect(playerBodyFor(false)).toEqual(STANDING_BODY);
    expect(playerBodyFor(true)).toEqual(CROUCHING_BODY);
    expect(CROUCHING_BODY.height).toBeLessThan(STANDING_BODY.height);
  });
  it('supports coyote and buffered jumps but blocks crouch jumps', () => {
    const now = 1000;
    expect(canConsumeJump(now, now - COYOTE_TIME_MS, now + JUMP_BUFFER_MS, false)).toBe(true);
    expect(canConsumeJump(now, now - COYOTE_TIME_MS - 1, now + JUMP_BUFFER_MS, false)).toBe(false);
    expect(canConsumeJump(now, now, now + JUMP_BUFFER_MS, true)).toBe(false);
  });
});
