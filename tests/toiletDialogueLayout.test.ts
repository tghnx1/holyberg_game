import { beforeEach, describe, expect, it } from 'vitest';
import { TOILET_VIEW_IDS } from '../src/game/dialogue/ToiletSceneView';
import {
  buildSceneLayoutPayload,
  getSceneObjectLayout,
  resetSceneLayout,
  setSceneObjectLayout,
} from '../src/game/systems/sceneLayout';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';

/**
 * A scene key that never appears in the checked-in layout, so these assert the
 * store's behaviour rather than whatever staging happens to be authored for
 * the real dialogue at the time.
 */
const SCENE = 'DialogueLayoutTestScene';

beforeEach(() => {
  resetSceneLayout();
});

/**
 * The toilet dialogue's staging is persisted through the shared scene-layout
 * store rather than a config of its own, saved by the same validated route
 * every other scene uses. These pin the contract the view writes against.
 */
describe('toilet dialogue staging persistence', () => {
  it('names the composition and both actors separately', () => {
    const ids = Object.values(TOILET_VIEW_IDS);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain('toilet-scene');
    expect(ids).toContain('toilet-player');
    expect(ids).toContain('toilet-npc');
  });

  it('keeps the toilet ids clear of the metro station, which owns its own config', () => {
    // Both dialogues run in the same scene, so a shared store needs the
    // prefixes to keep one dialogue's staging out of the other's.
    for (const id of Object.values(TOILET_VIEW_IDS)) {
      expect(id.startsWith('toilet-')).toBe(true);
    }
  });

  it('round-trips a framing so a reload reproduces it exactly', () => {
    setSceneObjectLayout(SCENE, TOILET_VIEW_IDS.composition, {
      xRatio: -0.12,
      yRatio: -0.3,
      scale: 1.42,
    });
    const saved = getSceneObjectLayout(SCENE, TOILET_VIEW_IDS.composition);
    expect(saved?.scale).toBeCloseTo(1.42);
    expect(saved?.xRatio).toBeCloseTo(-0.12);
    expect(saved?.yRatio).toBeCloseTo(-0.3);
  });

  it('treats an unauthored composition as absent, which is what selects the default fit', () => {
    expect(getSceneObjectLayout(SCENE, TOILET_VIEW_IDS.composition)).toBeUndefined();
  });

  it('keeps each actor independent of the composition and of each other', () => {
    setSceneObjectLayout(SCENE, TOILET_VIEW_IDS.player, { xRatio: 0.05, yRatio: 0, scale: 1.1 });
    expect(getSceneObjectLayout(SCENE, TOILET_VIEW_IDS.npc)).toBeUndefined();
    expect(getSceneObjectLayout(SCENE, TOILET_VIEW_IDS.composition)).toBeUndefined();
    expect(getSceneObjectLayout(SCENE, TOILET_VIEW_IDS.player)?.scale).toBeCloseTo(1.1);
  });

  it('carries all three in one scene slice, which is what P sends', () => {
    setSceneObjectLayout(SCENE, TOILET_VIEW_IDS.composition, { xRatio: 0, yRatio: 0, scale: 1 });
    setSceneObjectLayout(SCENE, TOILET_VIEW_IDS.player, { xRatio: 0.01, yRatio: 0, scale: 1 });
    setSceneObjectLayout(SCENE, TOILET_VIEW_IDS.npc, { xRatio: -0.01, yRatio: 0, scale: 1 });

    const payload = buildSceneLayoutPayload(SCENE);
    expect(Object.keys(payload[SCENE])).toEqual(
      expect.arrayContaining(Object.values(TOILET_VIEW_IDS)),
    );
    expect(() => validateSceneLayout(payload)).not.toThrow();
  });

  it('only ever sends this scene, so saving one dialogue cannot wipe another', () => {
    setSceneObjectLayout(SCENE, TOILET_VIEW_IDS.player, { xRatio: 0.2, yRatio: 0, scale: 1 });
    setSceneObjectLayout('OtherTestScene', 'toilet', { xRatio: 0, yRatio: 0, scaleX: 1, scaleY: 1 });
    expect(Object.keys(buildSceneLayoutPayload(SCENE))).toEqual([SCENE]);
  });

  it('accepts a negative offset, since framing legitimately pulls the room left and up', () => {
    const payload = {
      [SCENE]: { [TOILET_VIEW_IDS.composition]: { xRatio: -0.4, yRatio: -0.6, scale: 2 } },
    };
    expect(() => validateSceneLayout(payload)).not.toThrow();
  });

  it('rejects a scale that would persist an invisible composition', () => {
    expect(() =>
      validateSceneLayout({ [SCENE]: { [TOILET_VIEW_IDS.composition]: { scale: 0 } } }),
    ).toThrow();
  });
});
