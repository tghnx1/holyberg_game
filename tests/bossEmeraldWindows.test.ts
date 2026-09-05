import { afterEach, describe, expect, it } from 'vitest';
import { buildFightPlan } from '../src/game/boss/fightSequence';
import {
  emeraldSpotLayout,
  getAuthoredEmeraldSpots,
  nextEmeraldSpotId,
  persistEmeraldSpot,
} from '../src/game/boss/bossEmeraldSpots';
import {
  bossEmeraldWindowSceneKey,
  bossTelegraphWindowId,
} from '../src/game/boss/bossEmeraldWindows';
import {
  buildSceneLayoutPayload,
  removeSceneObjectLayout,
  resetSceneLayout,
} from '../src/game/systems/sceneLayout';

const keyFor = (id: number): string =>
  bossEmeraldWindowSceneKey('BossScene', bossTelegraphWindowId({ id }));

describe('Boss emerald telegraph windows', () => {
  afterEach(() => resetSceneLayout());

  it('uses the deterministic scheduled attack id as its stable identity', () => {
    expect(bossTelegraphWindowId({ id: 0 })).toBe('attack-00');
    expect(bossTelegraphWindowId({ id: 7 })).toBe('attack-07');
    expect(bossTelegraphWindowId({ id: 12 })).toBe('attack-12');
    expect(keyFor(7)).toBe('BossScene:telegraph:attack-07');
  });

  it('ships an explicit independent layout for every fight occurrence', () => {
    const plan = buildFightPlan({ minX: 70, maxX: 1210 }, 1);
    expect(plan.attacks.length).toBeGreaterThan(10);
    for (const attack of plan.attacks) {
      const spots = getAuthoredEmeraldSpots(keyFor(attack.id));
      expect(spots.map((spot) => spot.id)).toEqual([
        'emerald-02',
        'emerald-04',
        'emerald-03',
        'emerald-01',
      ]);
    }
  });

  it('copy, delete and save change the exact count in one window only', () => {
    const first = keyFor(0);
    const second = keyFor(1);
    resetSceneLayout({
      [first]: {
        'emerald-01': emeraldSpotLayout({ x: 300, y: 560 }, 1),
      },
      [second]: {
        'emerald-01': emeraldSpotLayout({ x: 900, y: 570 }, 1.5),
      },
    });

    const copyId = nextEmeraldSpotId(new Set(['emerald-01']));
    persistEmeraldSpot(first, { id: copyId, x: 420, y: 550, scale: 0.8 });
    expect(getAuthoredEmeraldSpots(first)).toHaveLength(2);
    expect(getAuthoredEmeraldSpots(second)).toHaveLength(1);

    removeSceneObjectLayout(first, 'emerald-01');
    expect(getAuthoredEmeraldSpots(first).map((spot) => spot.id)).toEqual([copyId]);
    expect(Object.keys(buildSceneLayoutPayload(first)[first])).toEqual([copyId]);
    expect(getAuthoredEmeraldSpots(second)[0]).toMatchObject({ x: 900, y: 570, scale: 1.5 });
  });

  it('keeps an intentionally saved empty window empty without fallback leakage', () => {
    const first = keyFor(0);
    const second = keyFor(1);
    resetSceneLayout({
      [first]: {},
      [second]: {
        'emerald-01': emeraldSpotLayout({ x: 700, y: 560 }, 1),
      },
    });

    expect(getAuthoredEmeraldSpots(first)).toEqual([]);
    expect(buildSceneLayoutPayload(first)).toEqual({ [first]: {} });
    expect(getAuthoredEmeraldSpots(second)).toHaveLength(1);
  });

  it('allows identical local ids without sharing transforms across windows', () => {
    const first = keyFor(2);
    const second = keyFor(3);
    resetSceneLayout({
      [first]: { 'emerald-01': emeraldSpotLayout({ x: 200, y: 540 }, 1) },
      [second]: { 'emerald-01': emeraldSpotLayout({ x: 1000, y: 580 }, 2) },
    });

    persistEmeraldSpot(first, { id: 'emerald-01', x: 350, y: 545, scale: 1.25 });
    expect(getAuthoredEmeraldSpots(first)[0]).toMatchObject({ x: 350, y: 545, scale: 1.25 });
    expect(getAuthoredEmeraldSpots(second)[0]).toMatchObject({ x: 1000, y: 580, scale: 2 });
  });
});
