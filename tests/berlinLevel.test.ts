import { describe, expect, it } from 'vitest';
import {
  BERLIN_ENTITIES,
  BERLIN_SECTIONS,
  GROUND_SEGMENTS,
  sectionIndexAtX,
} from '../src/game/level/berlin/berlinLevelConfig';
import { applyCollectibleReward, canFinishBerlin } from '../src/game/level/berlin/berlinRules';
import {
  canConsumeJump,
  computePlayerBodyOffset,
  COYOTE_TIME_MS,
  CROUCHING_BODY,
  JUMP_BUFFER_MS,
  playerBodyFor,
  STANDING_BODY,
} from '../src/game/level/berlin/playerPhysics';
import { GROUND_Y } from '../src/game/constants';
import { BerlinScoreSystem } from '../src/game/systems/BerlinScoreSystem';
import { SectionTracker } from '../src/game/systems/SectionTracker';

describe('Berlin level config', () => {
  it('defines contiguous sections across the 15500-unit world', () => {
    expect(BERLIN_SECTIONS.map((section) => [section.startX, section.endX])).toEqual([
      [0, 1600],
      [1600, 3200],
      [3200, 5000],
      [5000, 6800],
      [6800, 8500],
      [8500, 10300],
      [10300, 12000],
      [12000, 13800],
      [13800, 15500],
    ]);
    expect(sectionIndexAtX(1599)).toBe(0);
    expect(sectionIndexAtX(1600)).toBe(1);
  });
  it('keeps the USB pickup in the level', () => {
    // Its exact position is authored in the layout editor and changes often,
    // so this guards that it exists and is reachable, not where it sits.
    const usb = BERLIN_ENTITIES.find((entity) => entity.id === 'usb');
    expect(usb).toBeDefined();
    expect(usb?.type).toBe('collectible');
    expect(usb!.x).toBeGreaterThan(0);
    expect(usb!.x).toBeLessThan(15500);
  });
  it('gives every gameplay object a unique id and independent dimensions', () => {
    expect(new Set(BERLIN_ENTITIES.map((entity) => entity.id)).size).toBe(BERLIN_ENTITIES.length);
    expect(BERLIN_ENTITIES.every((entity) => entity.width > 0 && entity.height > 0)).toBe(true);
  });
  it('does not mark any collectible as mandatory and finishing never requires USB', () => {
    expect(
      BERLIN_ENTITIES.filter((entity) => entity.type === 'collectible').every(
        (entity) => !('mandatory' in entity) || !entity.mandatory,
      ),
    ).toBe(true);
    expect(canFinishBerlin(false)).toBe(true);
    expect(canFinishBerlin(true)).toBe(true);
  });
  it('applies collectible time bonuses and score correctly', () => {
    const nightBonus = BERLIN_ENTITIES.find((entity) => entity.id === 'night-bonus');
    if (!nightBonus || nightBonus.type !== 'collectible') throw new Error('night-bonus missing');
    expect(applyCollectibleReward(12, false, nightBonus)).toEqual({
      seconds: 12,
      score: 250,
      hasUsb: false,
    });
    const usb = BERLIN_ENTITIES.find((entity) => entity.id === 'usb');
    if (!usb || usb.type !== 'collectible') throw new Error('usb missing');
    expect(applyCollectibleReward(12, false, usb).hasUsb).toBe(true);
  });
  it('keeps every ground obstacle and platform inside the 15500-unit world', () => {
    expect(BERLIN_ENTITIES.every((entity) => entity.x >= 0 && entity.x <= 15500)).toBe(true);
  });
  it('gives the early moving platforms opposite phases', () => {
    const early = BERLIN_ENTITIES.filter(
      (entity) => entity.type === 'movingPlatform' && entity.id.startsWith('early-'),
    );
    expect(early).toHaveLength(2);
    expect(early.map((p) => 'phaseMs' in p && p.phaseMs).sort()).toEqual([0, 1350]);
  });
  it('defines one unbroken ground segment across the world', () => {
    expect(GROUND_SEGMENTS.map((segment) => [segment.startX, segment.endX])).toEqual([[0, 15500]]);
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
    expect(tracker.update(1600).clean).toBe(true);
    tracker.markDamage();
    expect(tracker.update(3200).clean).toBe(false);
  });
});

describe('Berlin player physics rules', () => {
  it('uses an explicit reduced crouch body', () => {
    expect(playerBodyFor(false)).toEqual(STANDING_BODY);
    expect(playerBodyFor(true)).toEqual(CROUCHING_BODY);
    expect(CROUCHING_BODY.height).toBeLessThan(STANDING_BODY.height);
  });

  describe('computePlayerBodyOffset (aligned against the actual physics sprite frame)', () => {
    // The physics sprite's own texture never changes (only the separate
    // visual sprite swaps animation frames), so this is always
    // ATMOS_STAY_FRAME_KEY's real dimensions in production.
    const FRAME_WIDTH = 195;
    const FRAME_HEIGHT = 184;

    it('spawns with the standing body bottom exactly at GROUND_Y', () => {
      const offset = computePlayerBodyOffset(FRAME_WIDTH, FRAME_HEIGHT, STANDING_BODY);
      // With origin (0.5, 1) the frame's own bottom edge (offsetY + height)
      // is exactly the sprite's own world y — and Player spawns with
      // `this.y = GROUND_Y` (see Player's constructor), so the body's
      // bottom lands exactly on GROUND_Y with zero extra drop distance.
      const bodyBottomInFrame = offset.offsetY + STANDING_BODY.height;
      expect(bodyBottomInFrame).toBe(FRAME_HEIGHT);
      const spawnY = GROUND_Y;
      const bodyBottomWorldY = spawnY - FRAME_HEIGHT + bodyBottomInFrame;
      expect(bodyBottomWorldY).toBe(GROUND_Y);
    });

    it('centers the body horizontally on the player', () => {
      const offset = computePlayerBodyOffset(FRAME_WIDTH, FRAME_HEIGHT, STANDING_BODY);
      const bodyCenterInFrame = offset.offsetX + STANDING_BODY.width / 2;
      expect(bodyCenterInFrame).toBe(FRAME_WIDTH / 2);
    });

    it('keeps standing and crouching bodies on exactly the same feet Y', () => {
      const standing = computePlayerBodyOffset(FRAME_WIDTH, FRAME_HEIGHT, STANDING_BODY);
      const crouching = computePlayerBodyOffset(FRAME_WIDTH, FRAME_HEIGHT, CROUCHING_BODY);
      const standingBottom = standing.offsetY + STANDING_BODY.height;
      const crouchingBottom = crouching.offsetY + CROUCHING_BODY.height;
      expect(crouchingBottom).toBe(standingBottom);
    });

    it('does not move the feet Y when the body spec changes but the frame does not', () => {
      // Simulates starting to move / switching animation state: the physics
      // sprite's own texture is unchanged (still the stay frame), so the
      // feet-Y invariant must hold for whichever body spec is active.
      for (const body of [STANDING_BODY, CROUCHING_BODY]) {
        const offset = computePlayerBodyOffset(FRAME_WIDTH, FRAME_HEIGHT, body);
        expect(offset.offsetY + body.height).toBe(FRAME_HEIGHT);
      }
    });
  });
  it('supports coyote and buffered jumps but blocks crouch jumps', () => {
    const now = 1000;
    expect(canConsumeJump(now, now - COYOTE_TIME_MS, now + JUMP_BUFFER_MS, false)).toBe(true);
    expect(canConsumeJump(now, now - COYOTE_TIME_MS - 1, now + JUMP_BUFFER_MS, false)).toBe(false);
    expect(canConsumeJump(now, now, now + JUMP_BUFFER_MS, true)).toBe(false);
  });
});
