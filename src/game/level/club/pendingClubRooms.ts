import type { ClubRoom } from './clubRooms';

/**
 * Club rooms prepared for Level 2 but not yet wired into `CLUB_ROOMS`.
 *
 * Kept separate so a new room's assets and data can land — and be reviewed,
 * built, and committed — without touching `clubRooms.ts`'s ordering, which
 * other in-flight Level 2 work may also be editing. Once that work lands,
 * splice the entry into `CLUB_ROOMS` at the desired position and delete it
 * from here.
 */
export const PENDING_CLUB_ROOMS: readonly ClubRoom[] = [
  {
    id: 'dancefloor',
    label: 'MADAME CLAUDE — DANCEFLOOR',
    videoUrl: 'assets/level_2/animation_4.mp4',
    posterKey: 'club-room-4-poster',
    posterUrl: 'assets/level_2/room_4_poster.webp',
  },
] as const;
