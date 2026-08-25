import { describe, expect, it } from 'vitest';
import {
  CLUB_ROOMS,
  resolveClubRoomTransition,
} from '../src/game/level/club/clubRooms';

describe('club room sequence', () => {
  it('has three rooms, each with its own video', () => {
    expect(CLUB_ROOMS).toHaveLength(3);
    expect(CLUB_ROOMS.map((room) => room.videoUrl)).toEqual([
      'assets/level_2/animation_1.mp4',
      'assets/level_2/animation_2.mp4',
      'assets/level_2/animation_3.mp4',
    ]);
    expect(new Set(CLUB_ROOMS.map((room) => room.id)).size).toBe(CLUB_ROOMS.length);
  });

  it('walks forward through the rooms, entering each from its left edge', () => {
    expect(resolveClubRoomTransition(0, 'right')).toEqual({
      roomIndex: 1,
      completesLevel: false,
      enterFrom: 'left',
    });
    expect(resolveClubRoomTransition(1, 'right')).toEqual({
      roomIndex: 2,
      completesLevel: false,
      enterFrom: 'left',
    });
  });

  it('walks back through the rooms, entering each from its right edge', () => {
    expect(resolveClubRoomTransition(2, 'left')).toEqual({
      roomIndex: 1,
      completesLevel: false,
      enterFrom: 'right',
    });
    expect(resolveClubRoomTransition(1, 'left')).toEqual({
      roomIndex: 0,
      completesLevel: false,
      enterFrom: 'right',
    });
  });

  it('completes the level only at the right edge of the last room', () => {
    expect(resolveClubRoomTransition(CLUB_ROOMS.length - 1, 'right')).toEqual({
      completesLevel: true,
    });
    for (let index = 0; index < CLUB_ROOMS.length - 1; index += 1) {
      expect(resolveClubRoomTransition(index, 'right').completesLevel).toBe(false);
    }
  });

  it('treats the first room’s left edge as a wall, not an exit', () => {
    const transition = resolveClubRoomTransition(0, 'left');
    expect(transition.completesLevel).toBe(false);
    expect(transition.roomIndex).toBeUndefined();
    expect(transition.enterFrom).toBeUndefined();
  });

  it('round-trips: every forward step is undone by walking back', () => {
    for (let index = 0; index < CLUB_ROOMS.length - 1; index += 1) {
      const forward = resolveClubRoomTransition(index, 'right');
      expect(forward.roomIndex).toBe(index + 1);
      const back = resolveClubRoomTransition(forward.roomIndex!, 'left');
      expect(back.roomIndex).toBe(index);
    }
  });
});
