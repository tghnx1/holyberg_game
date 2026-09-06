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

  describe('mobile viewport drift (fix: keep Club DJ deck aligned on mobile)', () => {
    it.each(CLUB_ROOM_SCENERY_ITEMS)(
      '$editableId keeps the same position ratio (not the same pixel x) on a wide landscape phone',
      (item) => {
        const desktop = resolveClubRoomSceneryTransform(SCENE, item, DESKTOP_WIDTH, DESKTOP_HEIGHT);
        const widePhone = resolveClubRoomSceneryTransform(SCENE, item, WIDE_PHONE_WIDTH, WIDE_PHONE_HEIGHT);

        // The bug: staying at the same absolute x reads as drifting left
        // relative to the room video/background, which is fit to the wider
        // live camera. A ratio-of-camera point scales with it instead.
        expect(widePhone.x).not.toBeCloseTo(desktop.x);
        expect(widePhone.x / WIDE_PHONE_WIDTH).toBeCloseTo(desktop.x / DESKTOP_WIDTH);
        expect(widePhone.y / WIDE_PHONE_HEIGHT).toBeCloseTo(desktop.y / DESKTOP_HEIGHT);
        // Same visual scale regardless of viewport width.
        expect(widePhone.scale).toBe(desktop.scale);
      },
    );

    it('re-resolves an authored (moved) position against a new camera size the same way, keeping its ratio', () => {
      persistClubRoomScenery(SCENE, djConsole, { x: 900, y: 600, scale: 0.8 }, DESKTOP_WIDTH, DESKTOP_HEIGHT);

      const desktop = resolveClubRoomSceneryTransform(SCENE, djConsole, DESKTOP_WIDTH, DESKTOP_HEIGHT);
      const widePhone = resolveClubRoomSceneryTransform(SCENE, djConsole, WIDE_PHONE_WIDTH, WIDE_PHONE_HEIGHT);

      expect(desktop.x).toBeCloseTo(900);
      expect(widePhone.x).toBeCloseTo(900 * (WIDE_PHONE_WIDTH / DESKTOP_WIDTH));
      expect(widePhone.scale).toBe(0.8);
    });

    it('P-save from a wide phone still round-trips to the same visual position on that same phone size', () => {
      // Editor drag happens live against the phone's own camera; the
      // resulting x/y are already phone-space when persisted.
      const draggedX = 0.65 * WIDE_PHONE_WIDTH;
      const draggedY = 0.8 * WIDE_PHONE_HEIGHT;
      persistClubRoomScenery(
        SCENE,
        djConsole,
        { x: draggedX, y: draggedY, scale: 0.55 },
        WIDE_PHONE_WIDTH,
        WIDE_PHONE_HEIGHT,
      );

      const reloaded = resolveClubRoomSceneryTransform(SCENE, djConsole, WIDE_PHONE_WIDTH, WIDE_PHONE_HEIGHT);
      expect(reloaded.x).toBeCloseTo(draggedX);
      expect(reloaded.y).toBeCloseTo(draggedY);
      expect(reloaded.scale).toBeCloseTo(0.55);
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
