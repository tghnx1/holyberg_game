/**
 * Decorative images, each unique to one Club room.
 *
 * Scenery only, the same way `ClubNpcLayer`'s ambient crowd is: no collision,
 * no dialogue trigger, no gameplay logic, and nothing here is consulted by
 * ClubScene's walking, edge or completion rules.
 *
 * Position is authored as a fraction of the *live camera* width/height, the
 * same convention `clubNpcPlacement.ts` uses for the ambient crowd — not a
 * fixed-1280px `DESIGN_SPACE` point, which is what the boss/player's
 * presentation *offsets* use. Club's room video/background is fit to
 * whatever the live viewport actually is (wider than 1280 on a wide
 * landscape phone), so a scenery item authored as a DESIGN_SPACE point drifts
 * away from the room art it's supposed to sit on as the viewport widens; a
 * camera-ratio point scales with the same art it's drawn over instead.
 *
 * One registry rather than one module per item, so adding the next piece of
 * room dressing is a new `CLUB_ROOM_SCENERY_ITEMS` entry, not a new file with
 * the same read/write plumbing copy-pasted into it.
 */
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../constants';
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

/**
 * Reads one item's authored transform against the *live* camera size, falling
 * back to its default point (itself expressed as a fraction of the canonical
 * DESIGN_WIDTH/DESIGN_HEIGHT box, so the default composition is unchanged at
 * that aspect ratio — only a viewport wider or narrower than it now shifts
 * the deck along with the room art instead of staying at a fixed pixel x).
 */
export function resolveClubRoomSceneryTransform(
  sceneKey: string,
  item: ClubRoomSceneryItem,
  cameraWidth: number,
  cameraHeight: number,
): ClubRoomSceneryTransform {
  const layout = getSceneObjectLayout(sceneKey, item.editableId);
  const xRatio = layout?.xRatio ?? item.defaultPoint.x / DESIGN_WIDTH;
  const yRatio = layout?.yRatio ?? item.defaultPoint.y / DESIGN_HEIGHT;
  return {
    x: xRatio * cameraWidth,
    y: yRatio * cameraHeight,
    scale: layout?.scale ?? item.defaultScale,
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
  setSceneObjectLayout(sceneKey, item.editableId, {
    xRatio: cameraWidth > 0 ? transform.x / cameraWidth : 0,
    yRatio: cameraHeight > 0 ? transform.y / cameraHeight : 0,
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
