import { afterEach, describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/game/constants';
import { CLUB_ROOMS } from '../src/game/level/club/clubRooms';
import {
  CLUB_ROOM_SCENERY_ITEMS,
  getClubRoomSceneryForRoom,
  isRoomSceneryPending,
  persistClubRoomScenery,
  resolveClubRoomSceneryTransform,
} from '../src/game/level/club/clubRoomScenery';
import { buildSceneLayoutPayload, resetSceneLayout } from '../src/game/systems/sceneLayout';

const SCENE = 'ClubSceneryTest';
/** Camera size equal to the canonical design box, so the desktop composition is the baseline. */
const DESKTOP_WIDTH = DESIGN_WIDTH;
const DESKTOP_HEIGHT = DESIGN_HEIGHT;
/** A wide landscape phone: notably wider than 1280 at the same 720 logical height. */
const WIDE_PHONE_WIDTH = 1600;
const WIDE_PHONE_HEIGHT = DESIGN_HEIGHT;

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
    const transform = resolveClubRoomSceneryTransform(SCENE, item, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    expect(transform.x).toBeGreaterThan(0);
    expect(transform.y).toBeGreaterThan(0);
    expect(transform.scale).toBeGreaterThan(0);
  });

  it.each(CLUB_ROOM_SCENERY_ITEMS)('$editableId falls back to exactly its default point at the design aspect ratio, preserving the current desktop composition', (item) => {
    const transform = resolveClubRoomSceneryTransform(SCENE, item, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    expect(transform.x).toBeCloseTo(item.defaultPoint.x);
    expect(transform.y).toBeCloseTo(item.defaultPoint.y);
    expect(transform.scale).toBe(item.defaultScale);
  });

  it.each(CLUB_ROOM_SCENERY_ITEMS)('$editableId persists an editor move/resize and reads it back exactly at the same camera size', (item) => {
    persistClubRoomScenery(SCENE, item, { x: 812, y: 566, scale: 0.72 }, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    const reloaded = resolveClubRoomSceneryTransform(SCENE, item, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    expect(reloaded.x).toBeCloseTo(812);
    expect(reloaded.y).toBeCloseTo(566);
    expect(reloaded.scale).toBeCloseTo(0.72);
  });

  it('writes each item under its own stable editable id, in a payload the save route can persist', () => {
    persistClubRoomScenery(SCENE, djConsole, { x: 900, y: 610, scale: 1.1 }, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    persistClubRoomScenery(SCENE, bar, { x: 400, y: 620, scale: 0.9 }, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    const payload = buildSceneLayoutPayload(SCENE);
    expect(payload[SCENE]?.[djConsole.editableId]?.scale).toBeCloseTo(1.1);
    expect(payload[SCENE]?.[bar.editableId]?.scale).toBeCloseTo(0.9);
    // Neither item's save can leak into the other's key.
    expect(payload[SCENE]?.[djConsole.editableId]).not.toEqual(payload[SCENE]?.[bar.editableId]);
  });

  it('round-trips through a fresh disk-shaped reload like every other authored object', () => {
    persistClubRoomScenery(SCENE, bar, { x: 700, y: 590, scale: 0.65 }, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    const payload = buildSceneLayoutPayload(SCENE);
    resetSceneLayout(JSON.parse(JSON.stringify(payload)));
    const reloaded = resolveClubRoomSceneryTransform(SCENE, bar, DESKTOP_WIDTH, DESKTOP_HEIGHT);
    expect(reloaded.x).toBeCloseTo(700);
    expect(reloaded.y).toBeCloseTo(590);
    expect(reloaded.scale).toBeCloseTo(0.65);
  });

  describe('mobile room composition', () => {
    it('moves the bar with the centre of the uncropped corridor, without stretching its offset', () => {
      persistClubRoomScenery(SCENE, bar, { x: 1000, y: 650, scale: 0.8 }, DESKTOP_WIDTH, DESKTOP_HEIGHT);
      const phone = resolveClubRoomSceneryTransform(SCENE, bar, WIDE_PHONE_WIDTH, WIDE_PHONE_HEIGHT);
      // The extra 320px reveals 160px on either side of this wider-than-screen video.
      expect(phone).toEqual({ x: 1160, y: 650, scale: 0.8 });
    });

    // The crop is anchored on the room's floor line rather than the centre of
    // the screen, so the deck keeps standing on the same floorboards.
    it('scales both the DJ deck and its vertical offset with the 16:9 dancefloor cover crop', () => {
      persistClubRoomScenery(SCENE, djConsole, { x: 900, y: 600, scale: 0.8 }, DESKTOP_WIDTH, DESKTOP_HEIGHT);
      const phone = resolveClubRoomSceneryTransform(SCENE, djConsole, WIDE_PHONE_WIDTH, WIDE_PHONE_HEIGHT);
      expect(phone.x).toBeCloseTo(1125);
      expect(phone.y).toBeCloseTo(572.5); // floor 710 + (600 - 710) * 1.25
      expect(phone.scale).toBeCloseTo(1);
    });

    it.each(CLUB_ROOM_SCENERY_ITEMS)('$editableId preserves desktop authoring after a phone save and disk reload', (item) => {
      persistClubRoomScenery(SCENE, item, { x: 950, y: 650, scale: 0.8 }, DESKTOP_WIDTH, DESKTOP_HEIGHT);
      const phone = resolveClubRoomSceneryTransform(SCENE, item, 1900, 720);
      persistClubRoomScenery(SCENE, item, phone, 1900, 720);
      resetSceneLayout(JSON.parse(JSON.stringify(buildSceneLayoutPayload(SCENE))));
      const desktop = resolveClubRoomSceneryTransform(SCENE, item, DESKTOP_WIDTH, DESKTOP_HEIGHT);
      expect(desktop.x).toBeCloseTo(950);
      expect(desktop.y).toBeCloseTo(650);
      expect(desktop.scale).toBeCloseTo(0.8);
    });
  });

  describe('room-scenery readiness gate (keeps a story dialogue snapshot matching gameplay)', () => {
    it('lists exactly the items authored for one room', () => {
      expect(getClubRoomSceneryForRoom('corridor')).toEqual([bar]);
      expect(getClubRoomSceneryForRoom('dancefloor')).toEqual([djConsole]);
      expect(getClubRoomSceneryForRoom('lounge')).toEqual([]);
    });

    it('is pending until every item authored for that room has been shown', () => {
      expect(isRoomSceneryPending('corridor', new Set())).toBe(true);
      expect(isRoomSceneryPending('corridor', new Set([bar.editableId]))).toBe(false);
    });

    it('is never pending for a room with no authored scenery', () => {
      expect(isRoomSceneryPending('lounge', new Set())).toBe(false);
    });

    it('is unaffected by items shown for a different room', () => {
      expect(isRoomSceneryPending('corridor', new Set([djConsole.editableId]))).toBe(true);
    });
  });
});
