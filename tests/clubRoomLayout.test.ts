import { describe, expect, it } from 'vitest';
import { CLUB_ROOMS } from '../src/game/level/club/clubRooms';
import {
  clubFloorY,
  resolveClubRoomArtFrame,
  resolveClubRoomProjection,
  CLUB_FLOOR_Y,
} from '../src/game/level/club/clubRoomLayout';

const viewports = [[1280, 720], [1600, 720], [1900, 720], [960, 720], [844, 390]];

describe('Club background and stationary composition', () => {
  it.each(CLUB_ROOMS)('$id preserves the authored desktop transform exactly', (room) => {
    expect(resolveClubRoomProjection(room.id, 1280, 720)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it.each(CLUB_ROOMS)('$id keeps furniture corners on the same background pixels on every viewport', (room) => {
    const desktop = resolveClubRoomArtFrame(room, 1280, 720);
    // Both origin and a corner matter: the old ratio-only fix moved the
    // origin but left the furniture's extent/scale detached from the video.
    for (const [width, height] of viewports) {
      const live = resolveClubRoomArtFrame(room, width, height);
      const projection = resolveClubRoomProjection(room.id, width, height);
      for (const [x, y] of [[1000, 640], [900, 450]]) {
        const u = (x - desktop.x) / desktop.width;
        const v = (y - desktop.y) / desktop.height;
        expect((projection.x + x * projection.scale - live.x) / live.width).toBeCloseTo(u);
        expect((projection.y + y * projection.scale - live.y) / live.height).toBeCloseTo(v);
      }
      expect(live.x - live.width / 2).toBeLessThanOrEqual(1e-9);
      expect(live.y - live.height / 2).toBeLessThanOrEqual(1e-9);
      expect(live.x + live.width / 2).toBeGreaterThanOrEqual(width - 1e-9);
      expect(live.y + live.height / 2).toBeGreaterThanOrEqual(height - 1e-9);
    }
  });

  it.each(CLUB_ROOMS)('$id keeps its floor line under the player on every viewport', (room) => {
    for (const [width, height] of viewports) {
      const projection = resolveClubRoomProjection(room.id, width, height);
      // The room's authored floor line is where the player, the crowd and the
      // furniture all stand. A centred cover fit walked it off the bottom of a
      // landscape phone; grounded, it lands on the same line the scene puts
      // the player's feet on, on every viewport.
      expect(projection.y + CLUB_FLOOR_Y * projection.scale).toBeCloseTo(clubFloorY(height));
    }
  });

  it.each(CLUB_ROOMS)('$id scales the player with the room, never below it', (room) => {
    const wide = resolveClubRoomProjection(room.id, 1836, 720);
    const desktop = resolveClubRoomArtFrame(room, 1280, 720);
    const live = resolveClubRoomArtFrame(room, 1836, 720);
    // The player is drawn at `projection.scale`, so this is also the check
    // that he does not stay desktop-sized in a room that grew around him.
    expect(wide.scale).toBeCloseTo(live.width / desktop.width);
    expect(wide.scale).toBeGreaterThanOrEqual(1);
  });
});
