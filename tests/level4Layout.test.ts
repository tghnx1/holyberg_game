import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasAuthoredLevel4Placement,
  LEVEL4_EDITABLE_IDS,
  resolveLevel4CutsceneConfig,
  resolveLevel4Number,
  resolveLevel4Placement,
  resolveStallEntryLogicalTargets,
  resolveStallEntryTargets,
  STALL_ENTRY_NPC_FRACTION,
  STALL_ENTRY_PLAYER_FRACTION,
  storeLevel4Number,
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
    expect(() => validateSceneLayout({ [SCENE]: { toilet: { scaleY: 99_999 } } })).toThrow();
  });

  /**
   * `scale` multiplies an object's *native* size, and the stall-entry zone's
   * native size is 1x1 — so its scaleX/scaleY are its width and height in
   * world pixels. A few-hundred-pixel zone is completely ordinary and must
   * validate; the ceiling that used to sit at 20 rejected the whole POST,
   * taking the player and door edits in the same slice down with it.
   */
  it('accepts the pixel-sized scale a 1x1 zone legitimately produces', () => {
    expect(() =>
      validateSceneLayout({
        [SCENE]: { [LEVEL4_EDITABLE_IDS.stallEntryTarget]: { xRatio: 1.34, scaleX: 125, scaleY: 402 } },
      }),
    ).not.toThrow();
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

/**
 * The player is drawn at `actor.x + playerOffsetX`, an editor-authored
 * presentation offset — never zero once PLAYER has been nudged in the visual
 * editor — while the story NPC's rendered position is its logical `x`
 * unchanged. Walking `actor.x` straight to the marker therefore leaves the
 * rendered player sitting `playerOffsetX` away from where it visibly needed
 * to stop; this is what the walk-in has to drive `actor.x` to instead, so
 * that `actor.x + playerOffsetX` lands exactly on the marker.
 */
describe('stall entry logical targets (corrected for the player render offset)', () => {
  const zone = { x: 1000, y: 0, width: 400 };

  it('is identical to the visual targets when nothing has been authored (offset 0)', () => {
    const visual = resolveStallEntryTargets(zone);
    const logical = resolveStallEntryLogicalTargets(zone, 0);
    expect(logical.playerX).toBeCloseTo(visual.playerX);
    expect(logical.npcX).toBeCloseTo(visual.npcX);
  });

  it('subtracts the offset from the player target only, leaving the NPC target untouched', () => {
    const visual = resolveStallEntryTargets(zone);
    const logical = resolveStallEntryLogicalTargets(zone, 45);
    expect(logical.playerX).toBeCloseTo(visual.playerX - 45);
    expect(logical.npcX).toBeCloseTo(visual.npcX);
  });

  it('walking the logical target to actor.x reproduces the marker once rendered', () => {
    // This is the actual guarantee: actor.x + playerOffsetX === the marker,
    // for any offset, in either direction.
    for (const playerOffsetX of [-120, -1, 0, 1, 63, 250]) {
      const logical = resolveStallEntryLogicalTargets(zone, playerOffsetX);
      const renderedX = logical.playerX + playerOffsetX;
      expect(renderedX).toBeCloseTo(resolveStallEntryTargets(zone).playerX);
    }
  });

  it('still moves the pair together with the zone, offset or not', () => {
    const before = resolveStallEntryLogicalTargets(zone, 30);
    const moved = { ...zone, x: zone.x + 300 };
    const after = resolveStallEntryLogicalTargets(moved, 30);
    expect(after.playerX - before.playerX).toBeCloseTo(300);
    expect(after.npcX - before.npcX).toBeCloseTo(300);
  });

  it('works for any offset magnitude, not one hardcoded to a specific character', () => {
    // Nothing here is Atmos-specific: the function only ever sees a number.
    for (const offset of [-500, -37.5, 0, 12.25, 800]) {
      const logical = resolveStallEntryLogicalTargets(zone, offset);
      expect(logical.playerX + offset).toBeCloseTo(resolveStallEntryTargets(zone).playerX);
    }
  });
});

/**
 * The toilet-to-Holyworld gap cutscene: `cameraStopX` and `autoWalkTriggerX`
 * are independently editable world-x lines (never coupled to one shared
 * coordinate), `autoFallZone` is a rectangle, and `autoWalkSpeed` is a plain
 * absolute number rather than a screen-position ratio, so it must not
 * silently change when resolved against a different viewport than the one it
 * was saved from.
 */
describe('gap cutscene config', () => {
  const viewport = { width: 1280, height: 720 };
  const fallback = {
    cameraStopX: 3000,
    autoWalkTriggerX: 3500,
    autoFallZone: { x: 3800, y: 550, width: 200, height: 200 },
    autoWalkSpeed: 240,
  };

  it('falls back to the composed defaults until something is authored', () => {
    const resolved = resolveLevel4CutsceneConfig(SCENE, viewport, fallback);
    expect(resolved).toEqual(fallback);
  });

  it('round-trips an authored camera stop and auto-walk trigger independently', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.cameraStop, { x: 2500, y: 0, scaleX: 1, scaleY: 1 }, viewport);
    const resolved = resolveLevel4CutsceneConfig(SCENE, viewport, fallback);
    expect(resolved.cameraStopX).toBeCloseTo(2500);
    // Moving the camera stop alone must not drag the auto-walk trigger with it.
    expect(resolved.autoWalkTriggerX).toBeCloseTo(fallback.autoWalkTriggerX);
  });

  it('round-trips an authored, resized fall zone', () => {
    storeLevel4Placement(
      SCENE,
      LEVEL4_EDITABLE_IDS.autoFallZone,
      { x: 4000, y: 500, scaleX: 300, scaleY: 150 },
      viewport,
    );
    const resolved = resolveLevel4CutsceneConfig(SCENE, viewport, fallback);
    expect(resolved.autoFallZone).toEqual({ x: 4000, y: 500, width: 300, height: 150 });
  });

  it('stores autoWalkSpeed as an absolute number, unaffected by the resolving viewport', () => {
    storeLevel4Number(SCENE, LEVEL4_EDITABLE_IDS.autoWalkSpeed, 320);
    expect(resolveLevel4Number(SCENE, LEVEL4_EDITABLE_IDS.autoWalkSpeed, fallback.autoWalkSpeed)).toBe(320);
    // A speed is not a screen position: resolving it against a completely
    // different viewport must not change it, unlike xRatio/yRatio.
    const phone = resolveLevel4CutsceneConfig(SCENE, { width: 400, height: 800 }, fallback);
    expect(phone.autoWalkSpeed).toBe(320);
  });

  it('produces a payload the shared save route accepts', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.autoWalkTrigger, { x: 3600, y: 0, scaleX: 1, scaleY: 1 }, viewport);
    storeLevel4Number(SCENE, LEVEL4_EDITABLE_IDS.autoWalkSpeed, 260);
    const payload = {
      [SCENE]: {
        [LEVEL4_EDITABLE_IDS.autoWalkTrigger]: { xRatio: 2.8125, yRatio: 0, scaleX: 1, scaleY: 1 },
        [LEVEL4_EDITABLE_IDS.autoWalkSpeed]: { value: 260 },
      },
    };
    expect(() => validateSceneLayout(payload)).not.toThrow();
    expect(validateSceneLayout(payload)[SCENE][LEVEL4_EDITABLE_IDS.autoWalkSpeed].value).toBe(260);
  });
});
