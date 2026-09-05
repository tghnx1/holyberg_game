import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSceneLayoutPayload,
  getSceneObjectLayout,
  resetSceneLayout,
  setSceneObjectLayout,
} from '../src/game/systems/sceneLayout';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';
import { getPlayerVisualOffset, PLAYER_EDITABLE_ID } from '../src/game/systems/playerPresentation';
import { DESIGN_SPACE } from '../src/game/systems/designSpace';

afterEach(() => resetSceneLayout());

describe('shared scene layout', () => {
  it('is empty for a scene nobody has edited, so a new level still runs', () => {
    expect(getSceneObjectLayout('BrandNewScene', 'anything')).toBeUndefined();
    expect(getPlayerVisualOffset('BrandNewScene')).toEqual({
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      flipX: false,
    });
  });

  /**
   * The offset is a distance in the world from the character's own gameplay
   * anchor, so it resolves against the canonical design box and is the same
   * number on every device. It used to be multiplied by the live camera
   * width, which `Scale.EXPAND` grows with the aspect ratio — so the drawn
   * character sat further from its anchor on a landscape phone than the
   * layout was authored with.
   */
  it('resolves a saved player offset in world pixels, identically on every screen', () => {
    setSceneObjectLayout('Level4Scene', PLAYER_EDITABLE_ID, {
      xRatio: 0.1,
      yRatio: -0.05,
      scale: 1.25,
      flipX: false,
    });
    expect(getPlayerVisualOffset('Level4Scene')).toEqual({
      offsetX: 0.1 * DESIGN_SPACE.width,
      offsetY: -0.05 * DESIGN_SPACE.height,
      scale: 1.25,
      flipX: false,
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

  it('persists a boolean character flip without accepting arbitrary values', () => {
    expect(validateSceneLayout({ S: { actor: { flipX: true } } })).toEqual({
      S: { actor: { flipX: true } },
    });
    expect(() => validateSceneLayout({ S: { actor: { flipX: 'true' } } })).toThrow(/flipX/);
  });

  it('rejects malformed or out-of-range values', () => {
    expect(() => validateSceneLayout(null)).toThrow(/keyed by scene/);
    expect(() => validateSceneLayout({ S: 3 })).toThrow(/object ids/);
    expect(() => validateSceneLayout({ S: { o: { scale: 0 } } })).toThrow(/scale/);
    expect(() => validateSceneLayout({ S: { o: { xRatio: 1000 } } })).toThrow(/xRatio/);
    expect(() => validateSceneLayout({ S: { o: { yRatio: 'x' } } })).toThrow(/finite/);
  });
});
