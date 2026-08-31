import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLUB_NPC_GROUP_IDS,
  collectClubNpcFrames,
  getClubNpcGroup,
  type ClubNpcGroupId,
} from '../src/game/level/club/clubNpcAssets';
import {
  CLUB_NPC_PLACEMENT,
  getRoomNpcGroups,
  getRoomNpcPlacements,
  isClubNpcGroupId,
  NPC_IDLE_CYCLE_MS,
  resolveClubNpcTransform,
  toClubNpcPlacement,
} from '../src/game/level/club/clubNpcPlacement';
import { validateClubNpcSaveRequest } from '../src/game/level/club/clubNpcPlacementSchema';
import { CLUB_ROOMS } from '../src/game/level/club/clubRooms';
import { footOffset, loopedFrameIndex } from '../src/game/characters/characterAnimation';

describe('club NPC artwork', () => {
  it('points every frame of every group at a file that exists', () => {
    for (const id of CLUB_NPC_GROUP_IDS) {
      const group = getClubNpcGroup(id);
      expect(group.frames.length).toBeGreaterThan(0);
      for (const frame of group.frames) {
        expect(existsSync(`public/${frame.url}`), `${frame.url} is missing`).toBe(true);
      }
    }
  });

  it('numbers frames contiguously from 01, so a loop has no gaps', () => {
    for (const id of CLUB_NPC_GROUP_IDS) {
      const group = getClubNpcGroup(id);
      const numbers = group.frames.map((frame) => frame.url.split('/').pop());
      const expected = group.frames.map((_frame, index) =>
        `${String(index + 1).padStart(2, '0')}.png`,
      );
      expect(numbers).toEqual(expected);
    }
  });

  it('keeps every filename free of spaces', () => {
    for (const id of CLUB_NPC_GROUP_IDS) {
      for (const frame of getClubNpcGroup(id).frames) {
        expect(frame.url).not.toContain(' ');
        expect(frame.key).not.toContain(' ');
      }
    }
  });

  it('lives outside the player artwork, so NPCs are never mistaken for characters', () => {
    for (const id of CLUB_NPC_GROUP_IDS) {
      for (const frame of getClubNpcGroup(id).frames) {
        expect(frame.url.startsWith('assets/level_2/npcs/')).toBe(true);
        expect(frame.url).not.toContain('assets/players/');
      }
    }
  });

  it('gives every group a positive content height and a foot gap to seat it on the floor', () => {
    for (const id of CLUB_NPC_GROUP_IDS) {
      const group = getClubNpcGroup(id);
      expect(group.contentHeight).toBeGreaterThan(0);
      // Every one of these carries ~100px of empty canvas below the feet; a
      // zero here would mean the measurement was lost and the group floats.
      expect(group.footGap).toBeGreaterThan(0);
      expect(group.footGap).toBeLessThan(group.contentHeight);
    }
  });

  it('collects each frame once, even when a room repeats a group', () => {
    const frames = collectClubNpcFrames(['green_drinker', 'green_drinker', 'pink_drinker']);
    const keys = frames.map((frame) => frame.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(
      getClubNpcGroup('green_drinker').frames.length + getClubNpcGroup('pink_drinker').frames.length,
    );
  });
});

describe('club NPC placement', () => {
  it('places every group somewhere across the club rooms', () => {
    const placed = new Set<ClubNpcGroupId>();
    for (const room of CLUB_ROOMS) {
      for (const group of getRoomNpcGroups(room.id)) placed.add(group);
    }
    expect([...placed].sort()).toEqual([...CLUB_NPC_GROUP_IDS].sort());
  });

  it('populates each room without crowding it', () => {
    for (const room of CLUB_ROOMS) {
      const placements = getRoomNpcPlacements(room.id);
      if (room.id === 'dancefloor') {
        // The dancefloor's crowd art is one wide group rather than a few
        // small knots, so it takes fewer of them to fill; how many is an
        // authoring decision made in the editor, not a fixed number.
        expect(placements.length).toBeGreaterThanOrEqual(1);
        expect(placements.length).toBeLessThanOrEqual(2);
      } else {
        expect(placements.length).toBeGreaterThanOrEqual(2);
        expect(placements.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('only references rooms that exist, and only known groups', () => {
    const roomIds = CLUB_ROOMS.map((room) => room.id);
    for (const roomId of Object.keys(CLUB_NPC_PLACEMENT)) {
      expect(roomIds).toContain(roomId);
    }
    for (const room of CLUB_ROOMS) {
      for (const placement of getRoomNpcPlacements(room.id)) {
        expect(isClubNpcGroupId(placement.group)).toBe(true);
      }
    }
  });

  it('spreads groups horizontally so the player can walk between them', () => {
    for (const room of CLUB_ROOMS) {
      const xs = getRoomNpcPlacements(room.id)
        .map((placement) => placement.xRatio)
        .sort((a, b) => a - b);
      for (const x of xs) {
        // Clear of both doorway edges, so a group never sits on a transition.
        expect(x).toBeGreaterThan(0.1);
        expect(x).toBeLessThan(0.95);
      }
      for (let i = 1; i < xs.length; i += 1) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThan(room.id === 'lounge' ? 0.1 : 0.15);
      }
    }
  });

  it('keeps NPCs no larger than the player reads at, so they sit in the room', () => {
    for (const room of CLUB_ROOMS) {
      for (const placement of getRoomNpcPlacements(room.id)) {
        expect(placement.heightRatio).toBeGreaterThan(0.15);
        expect(placement.heightRatio).toBeLessThanOrEqual(room.id === 'dancefloor' ? 0.65 : 0.45);
      }
    }
  });
});

describe('club NPC transforms', () => {
  const placement = { group: 'green_drinker' as const, xRatio: 0.5, heightRatio: 0.3 };

  it('derives a scale that renders the drawn figures at the requested height', () => {
    const art = getClubNpcGroup('green_drinker');
    const transform = resolveClubNpcTransform(placement, 1280, 720, 0.9);
    expect(art.contentHeight * transform.scale).toBeCloseTo(0.3 * 720, 6);
    expect(transform.x).toBe(640);
  });

  it('falls back to the room floor line only when a placement omits its own', () => {
    expect(resolveClubNpcTransform(placement, 1280, 720, 0.9).y).toBeCloseTo(648, 6);
    expect(
      resolveClubNpcTransform({ ...placement, baselineRatio: 0.8 }, 1280, 720, 0.9).y,
    ).toBeCloseTo(576, 6);
  });

  it('scales identically at any viewport, so one config fits every screen', () => {
    const small = resolveClubNpcTransform(placement, 640, 360, 0.9);
    const large = resolveClubNpcTransform(placement, 1280, 720, 0.9);
    expect(large.scale / small.scale).toBeCloseTo(2, 6);
    expect(large.x / small.x).toBeCloseTo(2, 6);
    expect(large.y / small.y).toBeCloseTo(2, 6);
  });

  it('round-trips through the editor conversion without drifting', () => {
    const original = { ...placement, baselineRatio: 0.88, flipX: true, phaseMs: 250 };
    const transform = resolveClubNpcTransform(original, 1280, 720, 0.9);
    const restored = toClubNpcPlacement(original, transform, 1280, 720);
    expect(restored.xRatio).toBeCloseTo(original.xRatio, 6);
    expect(restored.heightRatio).toBeCloseTo(original.heightRatio, 6);
    expect(restored.baselineRatio).toBeCloseTo(original.baselineRatio, 6);
    // Fields the editor does not touch survive the trip.
    expect(restored.flipX).toBe(true);
    expect(restored.phaseMs).toBe(250);
    expect(restored.group).toBe('green_drinker');
  });

  it('seats the drawn feet on the floor line rather than the bottom of the canvas', () => {
    const art = getClubNpcGroup('green_drinker');
    const transform = resolveClubNpcTransform(placement, 1280, 720, 0.9);
    // The renderer draws with a bottom origin at y + this offset, so the
    // sprite's bottom sits below the floor by exactly the scaled empty
    // padding — putting the feet themselves on the line.
    const spriteBottom = transform.y + footOffset(art.footGap, transform.scale);
    expect(spriteBottom - art.footGap * transform.scale).toBeCloseTo(transform.y, 6);
    expect(spriteBottom).toBeGreaterThan(transform.y);
  });
});

describe('club NPC animation timing', () => {
  it('completes one cycle per NPC_IDLE_CYCLE_MS regardless of frame count', () => {
    for (const id of CLUB_NPC_GROUP_IDS) {
      const { frames } = getClubNpcGroup(id);
      expect(loopedFrameIndex(0, frames.length, NPC_IDLE_CYCLE_MS)).toBe(0);
      expect(loopedFrameIndex(NPC_IDLE_CYCLE_MS, frames.length, NPC_IDLE_CYCLE_MS)).toBe(0);
      expect(loopedFrameIndex(NPC_IDLE_CYCLE_MS - 1, frames.length, NPC_IDLE_CYCLE_MS)).toBe(
        frames.length - 1,
      );
    }
  });

  it('idles slower than the player runs, so the crowd reads as standing around', () => {
    expect(NPC_IDLE_CYCLE_MS).toBeGreaterThan(552);
  });

  it('staggers groups that share a room so they do not animate in lockstep', () => {
    for (const room of CLUB_ROOMS) {
      const phases = getRoomNpcPlacements(room.id).map((placement) => placement.phaseMs ?? 0);
      expect(new Set(phases).size).toBe(phases.length);
    }
  });
});

describe('club NPC save endpoint validation', () => {
  const valid = {
    roomId: 'lounge',
    placements: [{ group: 'green_drinker', xRatio: 0.5, heightRatio: 0.3, baselineRatio: 0.9 }],
  };

  it('accepts a well-formed request', () => {
    expect(validateClubNpcSaveRequest(valid).roomId).toBe('lounge');
    expect(validateClubNpcSaveRequest(valid).placements).toHaveLength(1);
  });

  it('accepts the optional fields being absent', () => {
    expect(() =>
      validateClubNpcSaveRequest({
        roomId: 'lounge',
        placements: [{ group: 'pink_drinker', xRatio: 0.2, heightRatio: 0.3 }],
      }),
    ).not.toThrow();
  });

  it('rejects an unknown group, so a typo cannot silently blank the crowd', () => {
    expect(() =>
      validateClubNpcSaveRequest({
        roomId: 'lounge',
        placements: [{ group: 'nobody_here', xRatio: 0.5, heightRatio: 0.3 }],
      }),
    ).toThrow(/Invalid placement at index 0/);
  });

  it('rejects malformed requests', () => {
    expect(() => validateClubNpcSaveRequest(null)).toThrow();
    expect(() => validateClubNpcSaveRequest({ placements: [] })).toThrow(/roomId/);
    expect(() => validateClubNpcSaveRequest({ roomId: 'lounge' })).toThrow(/placements/);
    expect(() =>
      validateClubNpcSaveRequest({
        roomId: 'lounge',
        placements: [{ group: 'green_drinker', xRatio: Number.NaN, heightRatio: 0.3 }],
      }),
    ).toThrow(/index 0/);
  });

  it('keeps its group list in step with the artwork it validates against', () => {
    // The schema is standalone by design (it runs inside the vite config's own
    // TS project), so this guards the one thing that duplication can drift on.
    for (const id of CLUB_NPC_GROUP_IDS) {
      expect(() =>
        validateClubNpcSaveRequest({
          roomId: 'lounge',
          placements: [{ group: id, xRatio: 0.5, heightRatio: 0.3 }],
        }),
      ).not.toThrow();
    }
  });
});
