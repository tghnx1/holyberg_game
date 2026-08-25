/**
 * Level 2's three club interiors, in walking order.
 *
 * Pure data, free of Phaser, so the room sequence and the edge-transition
 * rules can be unit tested without a running scene.
 */

export interface ClubRoom {
  id: string;
  label: string;
  /** Streamed straight from this URL; never preloaded into the Phaser cache. */
  videoUrl: string;
}

export const CLUB_ROOMS: readonly ClubRoom[] = [
  { id: 'lounge', label: 'MADAME CLAUDE — LOUNGE', videoUrl: 'assets/level_2/animation_1.mp4' },
  { id: 'corridor', label: 'MADAME CLAUDE — CORRIDOR', videoUrl: 'assets/level_2/animation_2.mp4' },
  { id: 'backstage', label: 'MADAME CLAUDE — BACKSTAGE', videoUrl: 'assets/level_2/animation_3.mp4' },
] as const;

/** Which side of a room the player crossed to leave it. */
export type ClubRoomEdge = 'left' | 'right';

export interface ClubRoomTransition {
  /** Room to show next, or `undefined` when the move is not possible. */
  roomIndex?: number;
  /** True only when walking out of the right edge of the last room. */
  completesLevel: boolean;
  /**
   * Which edge of the *new* room the player should enter from. Walking right
   * puts them just inside the left edge, and vice versa, so the walk reads as
   * continuous through a doorway.
   */
  enterFrom?: ClubRoomEdge;
}

/**
 * Resolves what leaving `roomIndex` by `edge` does. The first room's left
 * edge is a wall — there is nothing before it — so the player simply stops.
 */
export function resolveClubRoomTransition(
  roomIndex: number,
  edge: ClubRoomEdge,
): ClubRoomTransition {
  if (edge === 'right') {
    const next = roomIndex + 1;
    if (next >= CLUB_ROOMS.length) return { completesLevel: true };
    return { roomIndex: next, completesLevel: false, enterFrom: 'left' };
  }
  const previous = roomIndex - 1;
  if (previous < 0) return { completesLevel: false };
  return { roomIndex: previous, completesLevel: false, enterFrom: 'right' };
}
