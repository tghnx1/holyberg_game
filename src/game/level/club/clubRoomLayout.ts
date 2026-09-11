import { DESIGN_HEIGHT, DESIGN_WIDTH, GROUND_Y } from '../../constants';
import {
  projectFrame,
  resolveCoverFrame,
  resolveGroundedProjection,
  type ArtFrame,
  type ArtProjection,
} from '../../responsive/groundedCover';
import { CLUB_ROOMS, type ClubRoom } from './clubRooms';

/**
 * How far below Berlin's ground line the club floor sits, in design pixels.
 * The room videos are framed lower than the street, so the player stands
 * further down the frame here. This is the knob to turn to move him up or
 * down: positive is down.
 */
export const CLUB_FLOOR_DROP = 100;
/** The floor line every room is composed around, in design pixels. */
export const CLUB_FLOOR_Y = GROUND_Y + CLUB_FLOOR_DROP;
/** Floor line as a fraction of the logical height, which EXPAND pins at 720. */
export const CLUB_FLOOR_RATIO = CLUB_FLOOR_Y / DESIGN_HEIGHT;

/** Where the room's floor line falls in a viewport of this height. */
export function clubFloorY(cameraHeight: number): number {
  return cameraHeight * CLUB_FLOOR_RATIO;
}

/** The room's authored composition, as it is drawn at the design size. */
function resolveClubRoomDesignFrame(room: ClubRoom): ArtFrame {
  return resolveCoverFrame(room.artSize, DESIGN_WIDTH, DESIGN_HEIGHT, {
    shiftY: room.videoShiftY,
    overscan: room.videoOverscan,
  });
}

/**
 * The one transform Level 2 draws everything through: background, furniture,
 * crowd, story actors and the player alike. Grounded rather than centred, so
 * the room's floor line stays under the player's feet on a phone's wider
 * viewport instead of sliding below the bottom edge with the crowd on it.
 */
export function resolveClubRoomProjection(
  roomId: string,
  width: number,
  height: number,
): ArtProjection {
  const room = CLUB_ROOMS.find((entry) => entry.id === roomId);
  if (!room) return { x: 0, y: 0, scale: 1 };
  return resolveGroundedProjection({
    reference: resolveClubRoomDesignFrame(room),
    viewport: { width, height },
    designFloorY: CLUB_FLOOR_Y,
    liveFloorY: clubFloorY(height),
  });
}

/** The same grounded fit for video, poster and authored room composition. */
export function resolveClubRoomArtFrame(room: ClubRoom, width: number, height: number): ArtFrame {
  const reference = resolveClubRoomDesignFrame(room);
  return projectFrame(
    reference,
    resolveGroundedProjection({
      reference,
      viewport: { width, height },
      designFloorY: CLUB_FLOOR_Y,
      liveFloorY: clubFloorY(height),
    }),
  );
}
