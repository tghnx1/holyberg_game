/**
 * Decorative images, each unique to one Club room.
 *
 * Scenery only, the same way `ClubNpcLayer`'s ambient crowd is: no collision,
 * no dialogue trigger, no gameplay logic, and nothing here is consulted by
 * ClubScene's walking, edge or completion rules. Position/scale are authored
 * exactly like the club's other single editable objects (the player, the
 * story actor) — an absolute design-space point in `sceneLayout.json`, not a
 * displacement, since none of these ever move at runtime.
 *
 * One registry rather than one module per item, so adding the next piece of
 * room dressing is a new `CLUB_ROOM_SCENERY_ITEMS` entry, not a new file with
 * the same read/write plumbing copy-pasted into it.
 */
import {
  designPointFromLayout,
  layoutRatiosFromDesignPoint,
  type DesignPoint,
} from '../../systems/designSpace';
import { getSceneObjectLayout, setSceneObjectLayout } from '../../systems/sceneLayout';

export interface ClubRoomSceneryItem {
  /** Stable SceneEditor id and `sceneLayout.json` key. */
  editableId: string;
  /** Only this room ever shows the item; every other room must not. */
  roomId: string;
  textureKey: string;
  url: string;
  /** Reasonable starting spot; the designer places it properly in the editor. */
  defaultPoint: DesignPoint;
  defaultScale: number;
}

export const CLUB_ROOM_SCENERY_ITEMS: readonly ClubRoomSceneryItem[] = [
  {
    editableId: 'room3-scenery-dj-console',
    roomId: 'dancefloor',
    textureKey: 'club-room3-scenery-dj-console',
    url: 'assets/level_2/dj-deck.png',
    defaultPoint: { x: 1040, y: 600 },
    defaultScale: 0.5,
  },
  {
    editableId: 'room2-scenery-bar',
    roomId: 'corridor',
    textureKey: 'club-room2-scenery-bar',
    url: 'assets/level_2/bar.jpg',
    defaultPoint: { x: 960, y: 610 },
    defaultScale: 0.6,
  },
] as const;

export interface ClubRoomSceneryTransform {
  x: number;
  y: number;
  scale: number;
}

/** Reads one item's authored transform, falling back to its on-screen default. */
export function resolveClubRoomSceneryTransform(
  sceneKey: string,
  item: ClubRoomSceneryItem,
): ClubRoomSceneryTransform {
  const layout = getSceneObjectLayout(sceneKey, item.editableId);
  const point = designPointFromLayout(layout, item.defaultPoint);
  return { x: point.x, y: point.y, scale: layout?.scale ?? item.defaultScale };
}

/** Shared write path for the editor's live change and the P-save round trip. */
export function persistClubRoomScenery(
  sceneKey: string,
  item: ClubRoomSceneryItem,
  transform: ClubRoomSceneryTransform,
): void {
  setSceneObjectLayout(sceneKey, item.editableId, {
    ...layoutRatiosFromDesignPoint({ x: transform.x, y: transform.y }),
    scale: transform.scale,
  });
}

/** Every item authored for one room. */
export function getClubRoomSceneryForRoom(roomId: string): readonly ClubRoomSceneryItem[] {
  return CLUB_ROOM_SCENERY_ITEMS.filter((item) => item.roomId === roomId);
}

/**
 * True while any item authored for `roomId` is not yet shown (its `id`
 * missing from `shownIds`).
 *
 * A `currentScene` dialogue's left panel is a snapshot of the live frame, so
 * a story beat must not trigger while its room's scenery is still
 * demand-loading in — otherwise the snapshot would be missing furniture that
 * gameplay draws a moment later. Pure so this gating rule is testable
 * without a running ClubScene.
 */
export function isRoomSceneryPending(roomId: string, shownIds: ReadonlySet<string>): boolean {
  return getClubRoomSceneryForRoom(roomId).some((item) => !shownIds.has(item.editableId));
}
