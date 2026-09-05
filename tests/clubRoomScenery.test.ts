import { afterEach, describe, expect, it } from 'vitest';
import { CLUB_ROOMS } from '../src/game/level/club/clubRooms';
import {
  CLUB_ROOM3_SCENERY_EDITABLE_ID,
  CLUB_ROOM3_SCENERY_ROOM_ID,
  persistClubRoom3Scenery,
  resolveClubRoom3SceneryTransform,
} from '../src/game/level/club/clubRoomScenery';
import { buildSceneLayoutPayload, resetSceneLayout } from '../src/game/systems/sceneLayout';

const SCENE = 'ClubSceneryTest';

describe('Club room 3 (dancefloor) scenery', () => {
  afterEach(() => resetSceneLayout());

  it('only names the dancefloor room, which is the last/final Club room', () => {
    expect(CLUB_ROOM3_SCENERY_ROOM_ID).toBe('dancefloor');
    const index = CLUB_ROOMS.findIndex((room) => room.id === CLUB_ROOM3_SCENERY_ROOM_ID);
    expect(index).toBe(CLUB_ROOMS.length - 1);
    // Every other room id must not match — the requirement it exists only in room 3.
    for (const room of CLUB_ROOMS) {
      if (room.id === CLUB_ROOM3_SCENERY_ROOM_ID) continue;
      expect(room.id).not.toBe(CLUB_ROOM3_SCENERY_ROOM_ID);
    }
  });

  it('falls back to a sensible on-screen default before anything is authored', () => {
    const transform = resolveClubRoom3SceneryTransform(SCENE);
    expect(transform.x).toBeGreaterThan(0);
    expect(transform.y).toBeGreaterThan(0);
    expect(transform.scale).toBeGreaterThan(0);
  });

  it('persists an editor move/resize and reads it back exactly', () => {
    persistClubRoom3Scenery(SCENE, { x: 812, y: 566, scale: 0.72 });
    const reloaded = resolveClubRoom3SceneryTransform(SCENE);
    expect(reloaded).toMatchObject({ x: 812, y: 566, scale: 0.72 });
  });

  it('writes under the stable editable id, in a payload the save route can persist', () => {
    persistClubRoom3Scenery(SCENE, { x: 900, y: 610, scale: 1.1 });
    const payload = buildSceneLayoutPayload(SCENE);
    expect(payload[SCENE]?.[CLUB_ROOM3_SCENERY_EDITABLE_ID]).toBeDefined();
    expect(payload[SCENE]?.[CLUB_ROOM3_SCENERY_EDITABLE_ID]?.scale).toBeCloseTo(1.1);
  });

  it('round-trips through a fresh disk-shaped reload like every other authored object', () => {
    persistClubRoom3Scenery(SCENE, { x: 700, y: 590, scale: 0.65 });
    const payload = buildSceneLayoutPayload(SCENE);
    resetSceneLayout(JSON.parse(JSON.stringify(payload)));
    const reloaded = resolveClubRoom3SceneryTransform(SCENE);
    expect(reloaded).toMatchObject({ x: 700, y: 590, scale: 0.65 });
  });
});
