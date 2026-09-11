import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../constants';
import { CLUB_ROOMS, type ClubRoom } from './clubRooms';

/** The same centred cover fit for video, poster and authored room composition. */
export function resolveClubRoomArtFrame(room: ClubRoom, width: number, height: number) {
  const shiftY = room.videoShiftY ?? 0;
  const { width: artWidth, height: artHeight } = room.artSize;
  const cover = Math.max(width / artWidth, height / artHeight);
  const scale = Math.max(cover * (room.videoOverscan ?? 1), (height + 2 * shiftY) / artHeight);
  return { x: width / 2, y: height / 2 + shiftY, width: artWidth * scale, height: artHeight * scale };
}

/** Map the existing desktop composition into the live room's cropped background. */
export function resolveClubRoomProjection(roomId: string, width: number, height: number) {
  const room = CLUB_ROOMS.find((entry) => entry.id === roomId);
  if (!room) return { x: 0, y: 0, scale: 1 };
  const reference = resolveClubRoomArtFrame(room, DESIGN_WIDTH, DESIGN_HEIGHT);
  const live = resolveClubRoomArtFrame(room, width, height);
  const scale = live.width / reference.width;
  return { x: live.x - reference.x * scale, y: live.y - reference.y * scale, scale };
}
