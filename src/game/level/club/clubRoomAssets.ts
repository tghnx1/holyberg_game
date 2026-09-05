import { collectClubNpcFirstFrames, type ClubNpcFrame } from './clubNpcAssets';
import { getRoomNpcGroups } from './clubNpcPlacement';
import { CLUB_ROOMS, type ClubRoom } from './clubRooms';

export interface ClubRoomMinimumAssets {
  room: ClubRoom;
  images: ClubNpcFrame[];
}

/**
 * Everything Club needs before create for one requested starting room.
 * Kept pure so direct cold routes cannot silently drift from campaign room 1.
 */
export function getClubRoomMinimumAssets(roomIndex: number): ClubRoomMinimumAssets {
  const room = CLUB_ROOMS[roomIndex] ?? CLUB_ROOMS[0];
  return {
    room,
    images: [
      { key: room.posterKey, url: room.posterUrl },
      ...collectClubNpcFirstFrames(getRoomNpcGroups(room.id)),
    ],
  };
}
