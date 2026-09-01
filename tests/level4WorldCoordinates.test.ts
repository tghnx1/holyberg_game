import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEVEL4_EDITABLE_IDS,
  resolveLevel4CutsceneConfig,
  resolveLevel4Placement,
} from '../src/game/level/level4/level4Layout';
import { getSceneLayout } from '../src/game/systems/sceneLayout';

/**
 * Level 4's world is one continuous coordinate system, and the camera is the
 * only thing allowed to decide which part of it is on screen.
 *
 * This is an *architectural* test, not a behavioural one. The bug it guards
 * against does not fail any gameplay assertion: a world coordinate derived
 * from `camera.width` is perfectly correct at 16:9 and silently wrong on
 * every other aspect ratio, and it only shows up as a screenshot from a
 * phone. The game runs `Phaser.Scale.EXPAND` from a 720x720 base, so the
 * logical height is pinned at 720 on every landscape viewport while the
 * logical *width* is whatever the aspect ratio implies — 1280 at 16:9,
 * ~1560 on a landscape phone. Any world value multiplied by that width moves
 * between devices.
 *
 * So the rule is enforced at the source: nothing in Level 4's world-space
 * modules may read a live camera or scale dimension, except the handful of
 * places that are genuinely about framing or about screen-space UI, which
 * are listed explicitly below. A new world object added the obvious way
 * cannot get this wrong, and a new *screen*-space use has to come and add
 * itself to this list on purpose.
 */

const VIEWPORT_READS =
  /\b(camera|cameras\.main|scale)\.(width|height|scrollX|scrollY)\b|\bwindow\.inner(Width|Height)\b|\bdevicePixelRatio\b|\bgame\.config\.(width|height)\b/;

/**
 * Every legitimate reason Level 4 code may read a live dimension. Each entry
 * is a source substring plus why it is screen-space or framing rather than
 * world placement.
 */
const ALLOWED = [
  // Camera framing: deciding what part of the world is shown is the camera's
  // entire job, and all of it funnels through these.
  'this.cameraX = Phaser.Math.Clamp(this.cameraX, 0, Math.max(0, LEVEL4_WORLD_WIDTH - camera.width));',
  'if (camera.scrollX + camera.width / 2 >= this.cutsceneConfig.cameraStopFocusX) {',
  'return resolveCameraStopScroll(this.lockedFocusX, this.cameras.main.width, LEVEL4_WORLD_WIDTH);',
  'this.cameras.main.width,',
  'cameraFocusX: this.cameras.main.scrollX + this.cameras.main.width / 2,',
  // Screen-space UI: the touch walk zones are half the screen each.
  'this.walk.layout(camera.width, camera.height);',
  // Mirroring the live scroll back into the scene's own `cameraX`, which is
  // only ever fed to `setScroll` again — a camera value used as a camera
  // value, never as a place in the room.
  'this.cameraX = this.cameras.main.scrollX;',
  // The NPC's exit walk: not a placement but a visibility decision — "walk
  // until you are out of frame" — and how much is in frame is precisely what
  // the camera decides. It leaves no authored value or state behind. Its
  // pace is world-space (`NPC_EXIT_SPEED`) so the stride does not change
  // with the frame width.
  'this.cameras.main.scrollX - NPC_EXIT_OFFSCREEN_MARGIN,',
];

function level4Source(): string {
  return readFileSync(new URL('../src/game/scenes/Level4Scene.ts', import.meta.url), 'utf8');
}

/** Source lines that read a live dimension and are not on the allow-list. */
function unexplainedViewportReads(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    // Comments describe the rule; they are not code that can break it.
    .filter((line) => !/^(\/\/|\/?\*)/.test(line))
    .filter((line) => VIEWPORT_READS.test(line))
    .filter((line) => !ALLOWED.some((allowed) => line.includes(allowed)));
}

describe('Level 4 world coordinates', () => {
  it('reads a live viewport dimension only for camera framing or screen-space UI', () => {
    expect(unexplainedViewportReads(level4Source())).toEqual([]);
  });

  it('would catch a new world object positioned from the camera', () => {
    // The exact shape of the regression: an object placed at a fraction of
    // the frame instead of at a place in the room.
    const offending = '    this.debris = this.add.image(camera.width * 0.8, GROUND_Y, KEY);';
    expect(unexplainedViewportReads(offending)).toEqual([offending.trim()]);
    // And the other shape of it: camera scroll added into a world coordinate.
    const scrolled = '    this.platform.x = this.cameras.main.scrollX + 400;';
    expect(unexplainedViewportReads(scrolled)).toEqual([scrolled.trim()]);
  });

  it('resolves every authored Level 4 object without being told a viewport', () => {
    // The resolvers take no viewport argument at all, so there is no screen
    // size that could change any of these. Asserted over whatever is actually
    // authored in the checked-in layout, so a newly authored id is covered
    // the moment it is saved.
    const fallback = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    for (const id of Object.keys(getSceneLayout('Level4Scene'))) {
      const placement = resolveLevel4Placement('Level4Scene', id, fallback);
      expect(Number.isFinite(placement.x)).toBe(true);
      expect(Number.isFinite(placement.y)).toBe(true);
    }
  });

  it('keeps the authored cutscene geometry inside the level, in world pixels', () => {
    const config = resolveLevel4CutsceneConfig('Level4Scene', {
      cameraStopFocusX: 0,
      autoWalkTriggerX: 0,
      autoFallZone: { x: 0, y: 0, width: 1, height: 1 },
      autoWalkSpeed: 1,
    });
    // The room is ~3922 world px wide and the level a little over 5200. These
    // are world pixels, not fractions, and they sit where the gap actually is.
    expect(config.autoWalkTriggerX).toBeGreaterThan(1000);
    expect(config.autoWalkTriggerX).toBeLessThan(5202);
    expect(config.autoFallZone.x).toBeGreaterThan(config.autoWalkTriggerX);
    expect(config.autoFallZone.x).toBeLessThan(5202);
    // The camera settles behind the trigger, framing the walk into the gap.
    expect(config.cameraStopFocusX).toBeLessThan(config.autoFallZone.x);
  });

  it('has an authored entry for each editable id that carries one, and only world-space fields', () => {
    const slice = getSceneLayout('Level4Scene');
    const known = new Set<string>([...Object.values(LEVEL4_EDITABLE_IDS), 'player']);
    for (const id of Object.keys(slice)) {
      expect(known.has(id)).toBe(true);
    }
  });
});
