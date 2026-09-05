import { afterEach, describe, expect, it } from 'vitest';
import { CLUB_ROOMS } from '../src/game/level/club/clubRooms';
import {
  CLUB_ROOM_SCENERY_ITEMS,
  persistClubRoomScenery,
  resolveClubRoomSceneryTransform,
} from '../src/game/level/club/clubRoomScenery';
import { buildSceneLayoutPayload, resetSceneLayout } from '../src/game/systems/sceneLayout';

const SCENE = 'ClubSceneryTest';

const djConsole = CLUB_ROOM_SCENERY_ITEMS.find((item) => item.roomId === 'dancefloor')!;
const bar = CLUB_ROOM_SCENERY_ITEMS.find((item) => item.roomId === 'corridor')!;

describe('Club room scenery', () => {
  afterEach(() => resetSceneLayout());

  it('the DJ console names the dancefloor room, the last/final Club room', () => {
    expect(djConsole.roomId).toBe('dancefloor');
    const index = CLUB_ROOMS.findIndex((room) => room.id === djConsole.roomId);
    expect(index).toBe(CLUB_ROOMS.length - 1);
  });

  it('the bar names the corridor room, the second Club room', () => {
    expect(bar.roomId).toBe('corridor');
    const index = CLUB_ROOMS.findIndex((room) => room.id === bar.roomId);
    expect(index).toBe(1);
  });

  it('every item names a room only once, and every id/texture key is unique', () => {
    const roomIds = CLUB_ROOM_SCENERY_ITEMS.map((item) => item.roomId);
    expect(new Set(roomIds).size).toBe(roomIds.length);
    const editableIds = CLUB_ROOM_SCENERY_ITEMS.map((item) => item.editableId);
    expect(new Set(editableIds).size).toBe(editableIds.length);
    const textureKeys = CLUB_ROOM_SCENERY_ITEMS.map((item) => item.textureKey);
    expect(new Set(textureKeys).size).toBe(textureKeys.length);
  });

  it.each(CLUB_ROOM_SCENERY_ITEMS)('$editableId falls back to a sensible on-screen default before anything is authored', (item) => {
    const transform = resolveClubRoomSceneryTransform(SCENE, item);
    expect(transform.x).toBeGreaterThan(0);
    expect(transform.y).toBeGreaterThan(0);
    expect(transform.scale).toBeGreaterThan(0);
  });

  it.each(CLUB_ROOM_SCENERY_ITEMS)('$editableId persists an editor move/resize and reads it back exactly', (item) => {
    persistClubRoomScenery(SCENE, item, { x: 812, y: 566, scale: 0.72 });
    const reloaded = resolveClubRoomSceneryTransform(SCENE, item);
    expect(reloaded).toMatchObject({ x: 812, y: 566, scale: 0.72 });
  });

  it('writes each item under its own stable editable id, in a payload the save route can persist', () => {
    persistClubRoomScenery(SCENE, djConsole, { x: 900, y: 610, scale: 1.1 });
    persistClubRoomScenery(SCENE, bar, { x: 400, y: 620, scale: 0.9 });
    const payload = buildSceneLayoutPayload(SCENE);
    expect(payload[SCENE]?.[djConsole.editableId]?.scale).toBeCloseTo(1.1);
    expect(payload[SCENE]?.[bar.editableId]?.scale).toBeCloseTo(0.9);
    // Neither item's save can leak into the other's key.
    expect(payload[SCENE]?.[djConsole.editableId]).not.toEqual(payload[SCENE]?.[bar.editableId]);
  });

  it('round-trips through a fresh disk-shaped reload like every other authored object', () => {
    persistClubRoomScenery(SCENE, bar, { x: 700, y: 590, scale: 0.65 });
    const payload = buildSceneLayoutPayload(SCENE);
    resetSceneLayout(JSON.parse(JSON.stringify(payload)));
    const reloaded = resolveClubRoomSceneryTransform(SCENE, bar);
    expect(reloaded).toMatchObject({ x: 700, y: 590, scale: 0.65 });
  });
});
