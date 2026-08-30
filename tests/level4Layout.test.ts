import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasAuthoredLevel4Placement,
  LEVEL4_EDITABLE_IDS,
  resolveLevel4Placement,
  storeLevel4Placement,
} from '../src/game/level/level4/level4Layout';
import { resetSceneLayout } from '../src/game/systems/sceneLayout';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';

const SCENE = 'Level4Scene';
const viewport = { width: 1280, height: 720 };
const composed = { x: 0, y: 0, scaleX: 0.4, scaleY: 0.24 };

beforeEach(() => {
  resetSceneLayout();
});

/**
 * Level 4 rebuilds its scenery from constants on every entry and re-derives
 * its actors from `actor.x/y` every frame, so an editor that only moved the
 * Phaser objects lost the edit on the next update and again on the next
 * entry. Everything editable now resolves through this module, which is what
 * makes an authored value the thing the runtime actually renders.
 */
describe('authored Level 4 placement', () => {
  it('falls back to the composed default until something is authored', () => {
    expect(hasAuthoredLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet)).toBe(false);
    expect(resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed, viewport)).toEqual(
      composed,
    );
  });

  it('round-trips an edit, so a reload reproduces what the editor saved', () => {
    const edited = { x: 320, y: 48, scaleX: 0.5, scaleY: 0.31 };
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, edited, viewport);
    const resolved = resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed, viewport);
    expect(resolved.x).toBeCloseTo(edited.x);
    expect(resolved.y).toBeCloseTo(edited.y);
    expect(resolved.scaleX).toBeCloseTo(edited.scaleX);
    expect(resolved.scaleY).toBeCloseTo(edited.scaleY);
  });

  it('does not fall back to the default once a value has been authored', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, { x: 100, y: 10, scaleX: 1, scaleY: 2 }, viewport);
    const resolved = resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed, viewport);
    expect(resolved).not.toEqual(composed);
    expect(hasAuthoredLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet)).toBe(true);
  });

  it('keeps the non-uniform toilet scale, which a single scale cannot express', () => {
    const stretched = { x: 0, y: 0, scaleX: 0.41, scaleY: 0.98 };
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, stretched, viewport);
    const resolved = resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed, viewport);
    expect(resolved.scaleX).toBeCloseTo(0.41);
    expect(resolved.scaleY).toBeCloseTo(0.98);
    expect(resolved.scaleX).not.toBeCloseTo(resolved.scaleY);
  });

  it('stores positions as viewport ratios, so one layout suits every screen', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.npc, { x: 640, y: 360, scaleX: 1, scaleY: 1 }, viewport);
    // Half the width and half the height, resolved against a smaller screen.
    const phone = resolveLevel4Placement(
      SCENE,
      LEVEL4_EDITABLE_IDS.npc,
      composed,
      { width: 800, height: 480 },
    );
    expect(phone.x).toBeCloseTo(400);
    expect(phone.y).toBeCloseTo(240);
  });

  it('keeps each object independent', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.npc, { x: 900, y: 600, scaleX: 1.2, scaleY: 1.2 }, viewport);
    expect(hasAuthoredLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet)).toBe(false);
    expect(resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed, viewport)).toEqual(
      composed,
    );
  });

  it('produces a payload the shared save route accepts', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.stallDoor, { x: 512, y: 300, scaleX: 0.8, scaleY: 1.1 }, viewport);
    const payload = { [SCENE]: { [LEVEL4_EDITABLE_IDS.stallDoor]: { xRatio: 0.4, yRatio: 0.41, scaleX: 0.8, scaleY: 1.1 } } };
    expect(() => validateSceneLayout(payload)).not.toThrow();
    expect(validateSceneLayout(payload)[SCENE][LEVEL4_EDITABLE_IDS.stallDoor].scaleX).toBe(0.8);
  });

  it('still reads an older entry that only carries a uniform scale', () => {
    // Saved before scaleX/scaleY existed; both axes come from `scale`.
    const legacy = validateSceneLayout({ [SCENE]: { toilet: { xRatio: 0, yRatio: 0, scale: 0.5 } } });
    expect(legacy[SCENE].toilet.scale).toBe(0.5);
    expect(legacy[SCENE].toilet.scaleX).toBeUndefined();
  });

  it('rejects a scale the editor could never legitimately produce', () => {
    expect(() => validateSceneLayout({ [SCENE]: { toilet: { scaleX: 0 } } })).toThrow();
    expect(() => validateSceneLayout({ [SCENE]: { toilet: { scaleY: 999 } } })).toThrow();
  });
});
