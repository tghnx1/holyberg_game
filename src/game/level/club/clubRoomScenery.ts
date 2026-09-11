/**
 * Decorative images, each unique to one Club room.
 *
 * Scenery only, the same way `ClubNpcLayer`'s ambient crowd is: no collision,
 * no dialogue trigger, no gameplay logic, and nothing here is consulted by
 * ClubScene's walking, edge or completion rules.
 *
 * Positions and scales describe the canonical desktop composition. Rendering
 * projects that composition through the room background's cover fit; editor
 * saves invert the projection so mobile edits preserve desktop placement.
 *
 * One registry rather than one module per item, so adding the next piece of
 * room dressing is a new `CLUB_ROOM_SCENERY_ITEMS` entry, not a new file with
 * the same read/write plumbing copy-pasted into it.
 */
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../constants';
import { resolveClubRoomProjection } from './clubRoomLayout';
import { getSceneObjectLayout, setSceneObjectLayout } from '../../systems/sceneLayout';

interface DesignPoint {
  x: number;
  y: number;
}

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

/** Resolve an authored desktop transform through the room's live framing. */
export function resolveClubRoomSceneryTransform(
  sceneKey: string,
  item: ClubRoomSceneryItem,
  cameraWidth: number,
  cameraHeight: number,
): ClubRoomSceneryTransform {
  const layout = getSceneObjectLayout(sceneKey, item.editableId);
  const xRatio = layout?.xRatio ?? item.defaultPoint.x / DESIGN_WIDTH;
  const yRatio = layout?.yRatio ?? item.defaultPoint.y / DESIGN_HEIGHT;
  const projection = resolveClubRoomProjection(item.roomId, cameraWidth, cameraHeight);
  return {
    x: projection.x + xRatio * DESIGN_WIDTH * projection.scale,
    y: projection.y + yRatio * DESIGN_HEIGHT * projection.scale,
    scale: (layout?.scale ?? item.defaultScale) * projection.scale,
  };
}

/** Shared write path for the editor's live change and the P-save round trip. */
export function persistClubRoomScenery(
  sceneKey: string,
  item: ClubRoomSceneryItem,
  transform: ClubRoomSceneryTransform,
  cameraWidth: number,
  cameraHeight: number,
): void {
  const projection = resolveClubRoomProjection(item.roomId, cameraWidth, cameraHeight);
  setSceneObjectLayout(sceneKey, item.editableId, {
    xRatio: (transform.x - projection.x) / projection.scale / DESIGN_WIDTH,
    yRatio: (transform.y - projection.y) / projection.scale / DESIGN_HEIGHT,
    scale: transform.scale / projection.scale,
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
