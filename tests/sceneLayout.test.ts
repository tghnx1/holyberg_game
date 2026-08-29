import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSceneLayoutPayload,
  getSceneObjectLayout,
  resetSceneLayout,
  setSceneObjectLayout,
} from '../src/game/systems/sceneLayout';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';
import { getPlayerVisualOffset, PLAYER_EDITABLE_ID } from '../src/game/systems/playerPresentation';

afterEach(() => resetSceneLayout());

describe('shared scene layout', () => {
  it('is empty for a scene nobody has edited, so a new level still runs', () => {
    expect(getSceneObjectLayout('BrandNewScene', 'anything')).toBeUndefined();
    expect(getPlayerVisualOffset('BrandNewScene', 1280, 720)).toEqual({
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
  });

  it('resolves a saved player offset against the current viewport', () => {
    setSceneObjectLayout('Level4Scene', PLAYER_EDITABLE_ID, {
      xRatio: 0.1,
      yRatio: -0.05,
      scale: 1.25,
    });
    // Ratios, not pixels: the same saved value lands proportionally on any size.
    expect(getPlayerVisualOffset('Level4Scene', 1280, 720)).toEqual({
      offsetX: 128,
      offsetY: -36,
      scale: 1.25,
    });
    expect(getPlayerVisualOffset('Level4Scene', 640, 360)).toEqual({
      offsetX: 64,
      offsetY: -18,
      scale: 1.25,
    });
  });

  it("only ever offers one scene's slice for saving", () => {
    setSceneObjectLayout('Level4Scene', PLAYER_EDITABLE_ID, { scale: 2 });
    setSceneObjectLayout('ClubScene', PLAYER_EDITABLE_ID, { scale: 3 });
    const payload = buildSceneLayoutPayload('Level4Scene');
    expect(Object.keys(payload)).toEqual(['Level4Scene']);
  });
});

describe('scene layout validation', () => {
  it('accepts a well-formed layout', () => {
    expect(
      validateSceneLayout({ Level4Scene: { player: { xRatio: 0.1, yRatio: 0, scale: 1.2 } } }),
    ).toEqual({ Level4Scene: { player: { xRatio: 0.1, yRatio: 0, scale: 1.2 } } });
  });

  it('accepts a partial entry', () => {
    expect(validateSceneLayout({ S: { o: { scale: 2 } } })).toEqual({ S: { o: { scale: 2 } } });
  });

  it('rejects malformed or out-of-range values', () => {
    expect(() => validateSceneLayout(null)).toThrow(/keyed by scene/);
    expect(() => validateSceneLayout({ S: 3 })).toThrow(/object ids/);
    expect(() => validateSceneLayout({ S: { o: { scale: 0 } } })).toThrow(/scale/);
    expect(() => validateSceneLayout({ S: { o: { xRatio: 1000 } } })).toThrow(/xRatio/);
    expect(() => validateSceneLayout({ S: { o: { yRatio: 'x' } } })).toThrow(/finite/);
  });
});
