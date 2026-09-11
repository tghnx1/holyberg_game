import { describe, expect, it } from 'vitest';
import {
  BOSS_BACKDROP_SOURCE,
  bossFloorY,
  resolveBossArenaFrames,
  resolveBossArenaProjection,
} from '../src/game/boss/bossArenaLayout';
import { BOSS_PLATFORM } from '../src/game/boss/bossAssets';
import { BOSS_ARENA } from '../src/game/boss/bossConfig';

/** 1280x720 is the design size; the rest are landscape-phone logical sizes. */
const viewports: readonly [number, number][] = [
  [1280, 720],
  [1558, 720],
  [1836, 720],
  [960, 720],
];

describe('boss arena layout', () => {
  it('draws the authored desktop composition unchanged at the design size', () => {
    expect(resolveBossArenaProjection(1280, 720)).toEqual({ x: 0, y: 0, scale: 1 });
    const { platform } = resolveBossArenaFrames(1280, 720);
    const scale = 1280 / BOSS_PLATFORM.sourceWidth;
    expect(platform.y - platform.height / 2).toBeCloseTo(
      BOSS_ARENA.floorY - BOSS_PLATFORM.visibleTopRow * scale - 70,
    );
  });

  it.each(viewports)('covers a %sx%s viewport with the backdrop', (width, height) => {
    const { backdrop } = resolveBossArenaFrames(width, height);
    expect(backdrop.width).toBeGreaterThanOrEqual(width - 1e-9);
    expect(backdrop.height).toBeGreaterThanOrEqual(height - 1e-9);
    expect(backdrop.x - backdrop.width / 2).toBeLessThanOrEqual(1e-9);
    expect(backdrop.y - backdrop.height / 2).toBeLessThanOrEqual(1e-9);
    expect(backdrop.x + backdrop.width / 2).toBeGreaterThanOrEqual(width - 1e-9);
    expect(backdrop.y + backdrop.height / 2).toBeGreaterThanOrEqual(height - 1e-9);
    expect(backdrop.width / backdrop.height).toBeCloseTo(
      BOSS_BACKDROP_SOURCE.width / BOSS_BACKDROP_SOURCE.height,
    );
  });

  it.each(viewports)(
    'seats the platform lip the same depth into the grass at %sx%s',
    (width, height) => {
      const { platform } = resolveBossArenaFrames(width, height);
      const artScale = platform.width / BOSS_PLATFORM.sourceWidth;
      const lipY = platform.y - platform.height / 2 + BOSS_PLATFORM.visibleTopRow * artScale;
      // The player's feet are pinned to the arena floor, so the lip has to
      // stay the *same point of the artwork* above them — which means a
      // distance that grows with the art, not the flat 70px it used to be.
      const designScale = 1280 / BOSS_PLATFORM.sourceWidth;
      expect(bossFloorY(height) - lipY).toBeCloseTo(70 * (artScale / designScale));
    },
  );

  it.each(viewports)('spans the full width with the platform at %sx%s', (width, height) => {
    const { platform } = resolveBossArenaFrames(width, height);
    expect(platform.width).toBeGreaterThanOrEqual(width - 1e-9);
    expect(platform.width / platform.height).toBeCloseTo(
      BOSS_PLATFORM.sourceWidth / BOSS_PLATFORM.sourceHeight,
    );
  });

  it('keeps the backdrop ground on the fight floor line on a wide phone', () => {
    const desktop = resolveBossArenaFrames(1280, 720).backdrop;
    const phone = resolveBossArenaFrames(1836, 720).backdrop;
    // The backdrop row that sat on the floor line at the design size still
    // does, instead of sliding below the bottom edge with the crop.
    const v = (BOSS_ARENA.floorY - (desktop.y - desktop.height / 2)) / desktop.height;
    expect(phone.y - phone.height / 2 + v * phone.height).toBeCloseTo(bossFloorY(720));
  });
});
