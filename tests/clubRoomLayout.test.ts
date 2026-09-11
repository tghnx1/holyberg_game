import { describe, expect, it } from 'vitest';
import { CLUB_ROOMS } from '../src/game/level/club/clubRooms';
import { resolveClubRoomArtFrame, resolveClubRoomProjection } from '../src/game/level/club/clubRoomLayout';

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
});
