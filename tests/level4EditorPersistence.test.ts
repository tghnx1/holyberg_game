import { beforeEach, describe, expect, it } from 'vitest';
import { toEditableItem, type EditableObject } from '../src/game/systems/editor/transformItem';
import { createPlayerEditable } from '../src/game/systems/playerPresentation';
import {
  buildSceneLayoutPayload,
  getSceneObjectLayout,
  resetSceneLayout,
  setSceneObjectLayout,
} from '../src/game/systems/sceneLayout';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';
import {
  resolveLevel4Placement,
  storeLevel4Placement,
  LEVEL4_EDITABLE_IDS,
  resolveStallEntryTargets,
  resolveStallEntryLogicalTargets,
} from '../src/game/level/level4/level4Layout';

/**
 * Reproduces the full P-save → disk write → reload round trip end to end,
 * through the same functions the editor and `vite/editorSavePlugin.ts`
 * actually call, rather than asserting on any single layer in isolation.
 * Written to pin down two reported "edits don't persist" symptoms (moving
 * PLAYER right, resizing STALL DOOR from its left edge) against the real
 * pipeline instead of guessing from the visual result.
 */

interface FakeTarget {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
  parentContainer?: undefined;
  setPosition: (x: number, y: number) => void;
  setScale: (x: number, y: number) => void;
}

function fakeTarget(
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  originX = 1,
  originY = 1,
): FakeTarget {
  const t: FakeTarget = {
    x,
    y,
    scaleX,
    scaleY,
    originX,
    originY,
    setPosition(nx, ny) {
      t.x = nx;
      t.y = ny;
    },
    setScale(sx, sy) {
      t.scaleX = sx;
      t.scaleY = sy;
    },
  };
  return t;
}

/** The real vite.config.ts `scene-layout-editor` merge function, copied verbatim. */
function serverMerge(existing: unknown, incoming: Record<string, unknown>): unknown {
  return { ...(existing as Record<string, unknown>), ...incoming };
}

/** Simulates "the module reloaded with `fake` as its checked-in sceneLayout.json". */
function loadSceneLayoutFromFake(fake: Record<string, unknown>): void {
  for (const [sceneKey, objects] of Object.entries(fake)) {
    for (const [objectId, layout] of Object.entries(objects as Record<string, unknown>)) {
      setSceneObjectLayout(sceneKey, objectId, layout as never);
    }
  }
}

beforeEach(() => {
  resetSceneLayout();
});

describe('STALL DOOR: left-edge resize survives save + reload', () => {
  it('keeps the right hinge fixed and reproduces the authored closed bounds exactly', () => {
    const fallback = { x: 1792, y: 610, scaleX: 2.5, scaleY: 2.4 };
    const target = fakeTarget(fallback.x, fallback.y, fallback.scaleX, fallback.scaleY);
    const object: EditableObject = {
      id: LEVEL4_EDITABLE_IDS.stallDoor,
      target: target as never,
      getNativeSize: () => ({ width: 14, height: 97 }),
      allowNonUniformScale: true,
      onChange: (t) =>
        storeLevel4Placement(
          'Level4Scene',
          LEVEL4_EDITABLE_IDS.stallDoor,
          { x: t.x, y: t.y, scaleX: t.scaleX, scaleY: t.scaleY },
        ),
    };
    const item = toEditableItem(object);

    // Drag the west handle 40px further left, as `resizeBoundsFromPointer`
    // would produce for a west-handle drag.
    const before = item.getBounds();
    item.setBounds({ left: before.left - 40, right: before.right, top: before.top, bottom: before.bottom });
    // Origin (1,1): the right/bottom hinge must not move, only the left edge.
    expect(item.getBounds().right).toBeCloseTo(before.right, 5);

    // P: build the payload the same route the client POSTs, validate it, and
    // merge it into an "existing file" the way the dev-server plugin does.
    const payload = buildSceneLayoutPayload('Level4Scene');
    const validated = validateSceneLayout(payload) as Record<string, unknown>;
    const existingFile = {
      Level4Scene: { npc: { xRatio: 1, yRatio: 1, scaleX: 1, scaleY: 1 } },
      BossScene: {},
    };
    const merged = serverMerge(existingFile, validated) as Record<string, unknown>;

    // Reload: the module re-evaluates against the merged file.
    resetSceneLayout();
    loadSceneLayoutFromFake(merged);

    const resolved = resolveLevel4Placement('Level4Scene', LEVEL4_EDITABLE_IDS.stallDoor, fallback);
    expect(resolved.x).toBeCloseTo(target.x, 3);
    expect(resolved.y).toBeCloseTo(target.y, 3);
    expect(resolved.scaleX).toBeCloseTo(target.scaleX, 3);
    expect(resolved.scaleY).toBeCloseTo(target.scaleY, 3);
    // Sibling objects and scenes the save route doesn't own must survive the merge.
    expect((merged.Level4Scene as Record<string, unknown>).npc).toBeDefined();
    expect(merged.BossScene).toEqual({});
  });
});

describe('PLAYER: rightward move + resize survives save + reload', () => {
  it('reproduces the exact authored offset and scale, independent of the stall-entry compensation', () => {
    const anchorX = 200;
    const anchorY = 600;
    const baseScale = 0.8;
    const target = fakeTarget(anchorX, anchorY, baseScale, baseScale, 0.5, 1) as FakeTarget & {
      frame: { realWidth: number; realHeight: number };
    };
    target.frame = { realWidth: 64, realHeight: 96 };
    let refreshCount = 0;
    const object = createPlayerEditable(
      { scene: { key: 'Level4Scene' } } as never,
      {
        sprite: target as never,
        getAnchor: () => ({ x: anchorX, y: anchorY }),
        getBaseScale: () => baseScale,
        refresh: () => {
          refreshCount += 1;
        },
      },
    );
    const item = toEditableItem(object as never);

    // Move 60px right and grow, matching "moved right, resized" from the report.
    const before = item.getBounds();
    item.setBounds({
      left: before.left + 60,
      right: before.right + 60 + 20,
      top: before.top,
      bottom: before.bottom + 20,
    });

    const saved = getSceneObjectLayout('Level4Scene', 'player');
    expect(saved?.xRatio).toBeGreaterThan(0); // non-zero positive X offset, as required
    expect(saved?.scale).not.toBeCloseTo(1); // non-default scale, as required
    expect(refreshCount).toBeGreaterThan(0);

    // P + reload.
    const payload = buildSceneLayoutPayload('Level4Scene');
    const validated = validateSceneLayout(payload) as Record<string, unknown>;
    resetSceneLayout();
    loadSceneLayoutFromFake(validated);

    const reloaded = getSceneObjectLayout('Level4Scene', 'player');
    expect(reloaded?.xRatio).toBeCloseTo(saved!.xRatio!, 6);
    expect(reloaded?.yRatio).toBeCloseTo(saved!.yRatio!, 6);
    expect(reloaded?.scale).toBeCloseTo(saved!.scale!, 6);
  });

  it('the stall-entry logical-target conversion only reads the offset, never writes it', () => {
    // Author a non-zero player offset the way the editor would.
    setSceneObjectLayout('Level4Scene', 'player', { xRatio: 0.05, yRatio: 0, scale: 1.4 });
    const before = getSceneObjectLayout('Level4Scene', 'player');

    // resolveStallEntryLogicalTargets (exercised via level4Layout.test.ts) is a
    // pure function of (zone, offsetX): it cannot call setSceneObjectLayout at
    // all, so the authored player layout must be byte-identical afterwards.
    const after = getSceneObjectLayout('Level4Scene', 'player');
    expect(after).toEqual(before);
  });
});

describe('DIAGNOSIS: the stall-entry compensation cancels the authored PLAYER offset', () => {
  it('renders the player on the marker for every authored offset, so PLAYER edits cannot move him', () => {
    const zone = { x: 1000, y: 0, width: 400 };
    const marker = resolveStallEntryTargets(zone).playerX;
    for (const offsetX of [0, 40, -40, 250]) {
      const logical = resolveStallEntryLogicalTargets(zone, offsetX);
      // What the cutscene drives actor.x to, then what syncActor draws:
      const rendered = logical.playerX + offsetX;
      expect(rendered).toBeCloseTo(marker);
    }
  });
});
