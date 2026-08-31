import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasAuthoredLevel4Placement,
  LEVEL4_EDITABLE_IDS,
  resolveLevel4Placement,
  resolveStallEntryTargets,
  STALL_ENTRY_NPC_FRACTION,
  STALL_ENTRY_PLAYER_FRACTION,
  storeLevel4Placement,
} from '../src/game/level/level4/level4Layout';
import { resetSceneLayout } from '../src/game/systems/sceneLayout';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';

/**
 * A scene key that never appears in the checked-in layout, so these assert the
 * resolver's own behaviour rather than whatever staging happens to be authored
 * for the real Level 4 at the time.
 */
const SCENE = 'Level4LayoutTestScene';
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

/**
 * Both stall-entry destinations must stay inside the authored zone, however
 * it is moved or resized, and must read as two separate people rather than
 * one — that is the whole point of replacing the old centre-plus-spread
 * calculation with an explicit authored target.
 */
describe('stall entry targets', () => {
  it('places both targets strictly inside the zone, for a wide range of zones', () => {
    const zones = [
      { x: 0, y: 0, width: 100 },
      { x: 500, y: 200, width: 40 },
      { x: -300, y: 0, width: 250 },
      { x: 1000, y: 50, width: 1 },
    ];
    for (const zone of zones) {
      const targets = resolveStallEntryTargets(zone);
      const left = zone.x - zone.width / 2;
      const right = zone.x + zone.width / 2;
      expect(targets.playerX).toBeGreaterThan(left);
      expect(targets.playerX).toBeLessThan(right);
      expect(targets.npcX).toBeGreaterThan(left);
      expect(targets.npcX).toBeLessThan(right);
    }
  });

  it('keeps the player left of the NPC, so they read as two people', () => {
    const targets = resolveStallEntryTargets({ x: 0, y: 0, width: 200 });
    expect(targets.playerX).toBeLessThan(targets.npcX);
  });

  it('moves with the zone: dragging it moves both destinations by the same amount', () => {
    const before = resolveStallEntryTargets({ x: 0, y: 0, width: 200 });
    const after = resolveStallEntryTargets({ x: 300, y: 0, width: 200 });
    expect(after.playerX - before.playerX).toBeCloseTo(300);
    expect(after.npcX - before.npcX).toBeCloseTo(300);
  });

  it('scales with the zone width, using the documented fractions', () => {
    const zone = { x: 1000, y: 0, width: 400 };
    const targets = resolveStallEntryTargets(zone);
    const left = zone.x - zone.width / 2;
    expect(targets.playerX).toBeCloseTo(left + zone.width * STALL_ENTRY_PLAYER_FRACTION);
    expect(targets.npcX).toBeCloseTo(left + zone.width * STALL_ENTRY_NPC_FRACTION);
  });

  it('degrades to the zone centre for a zero-width zone rather than throwing', () => {
    const targets = resolveStallEntryTargets({ x: 500, y: 0, width: 0 });
    expect(targets.playerX).toBeCloseTo(500);
    expect(targets.npcX).toBeCloseTo(500);
  });
});
