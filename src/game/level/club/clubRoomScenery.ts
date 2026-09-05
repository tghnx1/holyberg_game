/**
 * One decorative image, unique to the dancefloor — the final Club room, where
 * the last DJ story beat plays.
 *
 * Scenery only, the same way `ClubNpcLayer`'s ambient crowd is: no collision,
 * no dialogue trigger, no gameplay logic, and nothing here is consulted by
 * ClubScene's walking, edge or completion rules. Position/scale are authored
 * exactly like the club's other single editable objects (the player, the
 * story actor) — an absolute design-space point in `sceneLayout.json`, not a
 * displacement, since this object never moves at runtime.
 */
import {
  designPointFromLayout,
  layoutRatiosFromDesignPoint,
  type DesignPoint,
} from '../../systems/designSpace';
import { getSceneObjectLayout, setSceneObjectLayout } from '../../systems/sceneLayout';

/** Only this room ever shows the scenery; every other room must not. */
export const CLUB_ROOM3_SCENERY_ROOM_ID = 'dancefloor';

/** Stable SceneEditor id and `sceneLayout.json` key. */
export const CLUB_ROOM3_SCENERY_EDITABLE_ID = 'room3-scenery-dj-console';

export const CLUB_ROOM3_SCENERY_TEXTURE_KEY = 'club-room3-scenery-dj-console';
export const CLUB_ROOM3_SCENERY_URL = 'assets/level_2/dj-console-scenery.jpg';

/** Reasonable starting spot; the designer places it properly in the editor. */
const DEFAULT_POINT: DesignPoint = { x: 1040, y: 600 };
const DEFAULT_SCALE = 0.5;

export interface ClubRoom3SceneryTransform {
  x: number;
  y: number;
  scale: number;
}

/** Reads the authored transform, falling back to a sane on-screen default. */
export function resolveClubRoom3SceneryTransform(sceneKey: string): ClubRoom3SceneryTransform {
  const layout = getSceneObjectLayout(sceneKey, CLUB_ROOM3_SCENERY_EDITABLE_ID);
  const point = designPointFromLayout(layout, DEFAULT_POINT);
  return { x: point.x, y: point.y, scale: layout?.scale ?? DEFAULT_SCALE };
}

/** Shared write path for the editor's live change and the P-save round trip. */
export function persistClubRoom3Scenery(sceneKey: string, transform: ClubRoom3SceneryTransform): void {
  setSceneObjectLayout(sceneKey, CLUB_ROOM3_SCENERY_EDITABLE_ID, {
    ...layoutRatiosFromDesignPoint({ x: transform.x, y: transform.y }),
    scale: transform.scale,
  });
}
