/**
 * The emerald spots a designer has placed in the boss arena.
 *
 * Emeralds are authored, not generated: they are objects in the level the same
 * way Level 1's collectibles are, laid out by hand in SceneEditor and saved to
 * `sceneLayout.json`. This module is only the translation between that file's
 * `emerald-*` entries and world-space points — which spots a given telegraph
 * actually shows is `emeraldField`'s decision, and drawing them is
 * `EmeraldLayer`'s.
 *
 * Positions here are *absolute* world points, unlike the scene's `player` and
 * `boss` entries, which are displacements from an anchor the fight computes.
 * Both are world-space and both resolve against the canonical `DESIGN_SPACE`
 * box, so an arena authored on a desktop is the same arena on a phone.
 */
import {
  designPointFromLayout,
  layoutRatiosFromDesignPoint,
  type DesignPoint,
} from '../systems/designSpace';
import {
  getSceneLayout,
  setSceneObjectLayout,
  type SceneObjectLayout,
} from '../systems/sceneLayout';

/**
 * Every authored emerald's id starts like this, and no other scene object
 * does. A prefix rather than a strict `emerald-<number>`: ids are also written
 * by hand in the JSON, and something like `emerald-left-wall` should be as
 * valid as `emerald-07`.
 */
const EMERALD_ID_PREFIX = 'emerald-';

export interface EmeraldSpot {
  /** The `sceneLayout.json` key this spot is saved under. */
  id: string;
  x: number;
  y: number;
  /** Authored size multiplier; drives both the drawn art and the pickup box. */
  scale: number;
}

export const isEmeraldId = (id: string): boolean =>
  id.startsWith(EMERALD_ID_PREFIX) && id.length > EMERALD_ID_PREFIX.length;

/** Formats the id for the nth spot, so a file of them sorts predictably. */
export const emeraldSpotId = (index: number): string =>
  `${EMERALD_ID_PREFIX}${String(index).padStart(2, '0')}`;

/**
 * The next free `emerald-NN`, for a copy made in the editor.
 *
 * Deliberately not the shared `uniqueEditorId`, whose `-copy`, `-copy-2`
 * suffixes would leave the arena's ids reading like an accident after a few
 * pastes. A duplicated emerald is just another emerald, so it gets the next
 * plain number.
 */
export function nextEmeraldSpotId(taken: ReadonlySet<string>): string {
  for (let index = 1; index <= taken.size + 1; index += 1) {
    const id = emeraldSpotId(index);
    if (!taken.has(id)) return id;
  }
  return emeraldSpotId(taken.size + 1);
}

/**
 * Reads the arena's authored spots, left to right.
 *
 * Sorted by position rather than by id, so a spot dragged past its neighbour
 * still reads in the order it appears on screen.
 */
export function getAuthoredEmeraldSpots(sceneKey: string): EmeraldSpot[] {
  const layout = getSceneLayout(sceneKey);
  return Object.entries(layout)
    .filter(([id]) => isEmeraldId(id))
    .map(([id, entry]) => toSpot(id, entry))
    .sort((a, b) => a.x - b.x);
}

function toSpot(id: string, entry: SceneObjectLayout): EmeraldSpot {
  const point = designPointFromLayout(entry, { x: 0, y: 0 });
  return { id, x: point.x, y: point.y, scale: entry.scale ?? 1 };
}

/** What the editor writes back for one spot. */
export function emeraldSpotLayout(point: DesignPoint, scale: number): SceneObjectLayout {
  return { ...layoutRatiosFromDesignPoint(point), scale };
}

/** Shared write path for live editor changes and save/reload verification. */
export function persistEmeraldSpot(sceneKey: string, spot: EmeraldSpot): void {
  setSceneObjectLayout(sceneKey, spot.id, emeraldSpotLayout(spot, spot.scale));
}
