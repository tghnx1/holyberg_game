import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasAuthoredLevel4Placement,
  resolveCameraStopScroll,
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
import { buildSceneLayoutPayload, resetSceneLayout } from '../src/game/systems/sceneLayout';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';

/**
 * A scene key that never appears in the checked-in layout, so these assert the
 * resolver's own behaviour rather than whatever staging happens to be authored
 * for the real Level 4 at the time.
 */
const SCENE = 'Level4LayoutTestScene';
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
    expect(resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed)).toEqual(
      composed,
    );
  });

  it('round-trips an edit, so a reload reproduces what the editor saved', () => {
    const edited = { x: 320, y: 48, scaleX: 0.5, scaleY: 0.31 };
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, edited);
    const resolved = resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed);
    expect(resolved.x).toBeCloseTo(edited.x);
    expect(resolved.y).toBeCloseTo(edited.y);
    expect(resolved.scaleX).toBeCloseTo(edited.scaleX);
    expect(resolved.scaleY).toBeCloseTo(edited.scaleY);
  });

  it('does not fall back to the default once a value has been authored', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, { x: 100, y: 10, scaleX: 1, scaleY: 2 });
    const resolved = resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed);
    expect(resolved).not.toEqual(composed);
    expect(hasAuthoredLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet)).toBe(true);
  });

  it('keeps the non-uniform toilet scale, which a single scale cannot express', () => {
    const stretched = { x: 0, y: 0, scaleX: 0.41, scaleY: 0.98 };
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, stretched);
    const resolved = resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed);
    expect(resolved.scaleX).toBeCloseTo(0.41);
    expect(resolved.scaleY).toBeCloseTo(0.98);
    expect(resolved.scaleX).not.toBeCloseTo(resolved.scaleY);
  });

  /**
   * The responsive bug this replaced: these are *world* coordinates, and a
   * world coordinate cannot be a function of the browser window. They used
   * to be stored as fractions of the live camera, which `Scale.EXPAND` grows
   * with the aspect ratio — so the same saved NPC stood ~340px further right
   * in the room on a landscape phone than on a 16:9 desktop, while the room
   * itself (built from fixed constants) stayed exactly where it was.
   */
  it('resolves to the same world position no matter what screen is resolving it', () => {
    const authored = { x: 1571, y: 610, scaleX: 1, scaleY: 1 };
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.npc, authored);
    // Nothing in the resolver can even see a viewport any more, so this is
    // asserting the shape of the API as much as the number it produces.
    const resolved = resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.npc, composed);
    expect(resolved.x).toBeCloseTo(authored.x);
    expect(resolved.y).toBeCloseTo(authored.y);
  });

  it('keeps a world x that is several screens along the level, which a scrolling world needs', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.autoFallZone, { x: 4141, y: 550, scaleX: 220, scaleY: 220 });
    const resolved = resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.autoFallZone, composed);
    expect(resolved.x).toBeCloseTo(4141);
    // And the payload that produced it still validates through the shared route.
    expect(() => validateSceneLayout(buildSceneLayoutPayload(SCENE))).not.toThrow();
  });

  it('keeps each object independent', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.npc, { x: 900, y: 600, scaleX: 1.2, scaleY: 1.2 });
    expect(hasAuthoredLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet)).toBe(false);
    expect(resolveLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.toilet, composed)).toEqual(
      composed,
    );
  });

  it('produces a payload the shared save route accepts', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.stallDoor, { x: 512, y: 300, scaleX: 0.8, scaleY: 1.1 });
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
 * The toilet-to-Holyworld gap cutscene: `cameraStopFocusX` and `autoWalkTriggerX`
 * are independently editable world-x lines (never coupled to one shared
 * coordinate), `autoFallZone` is a rectangle, and `autoWalkSpeed` is a plain
 * absolute number rather than a position at all.
 */
describe('gap cutscene config', () => {
  const fallback = {
    cameraStopFocusX: 3000,
    autoWalkTriggerX: 3500,
    autoFallZone: { x: 3800, y: 550, width: 200, height: 200 },
    autoWalkSpeed: 240,
  };

  it('falls back to the composed defaults until something is authored', () => {
    const resolved = resolveLevel4CutsceneConfig(SCENE, fallback);
    expect(resolved).toEqual(fallback);
  });

  it('round-trips an authored camera stop and auto-walk trigger independently', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.cameraStop, { x: 2500, y: 0, scaleX: 1, scaleY: 1 });
    const resolved = resolveLevel4CutsceneConfig(SCENE, fallback);
    expect(resolved.cameraStopFocusX).toBeCloseTo(2500);
    // Moving the camera stop alone must not drag the auto-walk trigger with it.
    expect(resolved.autoWalkTriggerX).toBeCloseTo(fallback.autoWalkTriggerX);
  });

  it('round-trips an authored, resized fall zone', () => {
    storeLevel4Placement(
      SCENE,
      LEVEL4_EDITABLE_IDS.autoFallZone,
      { x: 4000, y: 500, scaleX: 300, scaleY: 150 },
    );
    const resolved = resolveLevel4CutsceneConfig(SCENE, fallback);
    expect(resolved.autoFallZone).toEqual({ x: 4000, y: 500, width: 300, height: 150 });
  });

  it('stores autoWalkSpeed as an absolute number, never a fraction of anything', () => {
    storeLevel4Number(SCENE, LEVEL4_EDITABLE_IDS.autoWalkSpeed, 320);
    expect(resolveLevel4Number(SCENE, LEVEL4_EDITABLE_IDS.autoWalkSpeed, fallback.autoWalkSpeed)).toBe(320);
    // A speed is not a position at all, and survives the round trip as the
    // absolute number it was saved as.
    expect(resolveLevel4CutsceneConfig(SCENE, fallback).autoWalkSpeed).toBe(320);
  });

  it('produces a payload the shared save route accepts', () => {
    storeLevel4Placement(SCENE, LEVEL4_EDITABLE_IDS.autoWalkTrigger, { x: 3600, y: 0, scaleX: 1, scaleY: 1 });
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

/**
 * Level 4's explicit responsive framing policy, and the reason CAMERA STOP
 * is a world focus point rather than the raw final `scrollX` it used to be.
 *
 * The game runs `Phaser.Scale.EXPAND` from a 720-unit base, so a landscape
 * viewport keeps a 720 logical height and takes whatever logical *width* its
 * aspect ratio implies — 1280 at 16:9, ~1560 on a landscape phone. A stored
 * scrollX is the frame's left edge, so the same saved number framed a
 * different composition on every device; a centre is the one point every
 * aspect ratio agrees on.
 */
describe('camera stop framing', () => {
  const WORLD = 5202;
  const widths = [1024, 1280, 1440, 1560, 1920];

  it('centres the same world point at every camera width', () => {
    const focusX = 2965;
    for (const width of widths) {
      const scroll = resolveCameraStopScroll(focusX, width, WORLD);
      expect(scroll + width / 2).toBeCloseTo(focusX);
    }
  });

  it('reveals more world symmetrically as the frame widens, never sliding the shot sideways', () => {
    const focusX = 2965;
    const narrow = resolveCameraStopScroll(focusX, 1280, WORLD);
    const wide = resolveCameraStopScroll(focusX, 1560, WORLD);
    // Both edges move outward by the same amount: half the extra width.
    expect(narrow - wide).toBeCloseTo(140);
    expect(wide + 1560 - (narrow + 1280)).toBeCloseTo(140);
  });

  it('never scrolls past either end of the level, whatever is authored', () => {
    for (const width of widths) {
      expect(resolveCameraStopScroll(-10_000, width, WORLD)).toBe(0);
      expect(resolveCameraStopScroll(10_000, width, WORLD)).toBeCloseTo(Math.max(0, WORLD - width));
    }
  });

  it('degrades to 0 rather than a negative scroll when the camera is wider than the level', () => {
    expect(resolveCameraStopScroll(2965, 8000, WORLD)).toBe(0);
  });
});
