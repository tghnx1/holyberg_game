import rawPlacement from '../../assets/clubNpcPlacement.json';
import { CLUB_NPC_GROUP_IDS, getClubNpcGroup, type ClubNpcGroupId } from './clubNpcAssets';

/**
 * Where each ambient NPC group stands in each club room.
 *
 * Pure data, deliberately separate from the renderer, so positions can be
 * retuned — by hand here, or by the dev-only SceneEditor writing this file
 * back — without touching `ClubNpcLayer` or `ClubScene`. Same split, and the
 * same ratio-based convention, as `dialogueStationLayout.ts`.
 *
 * Every value is a ratio of the live camera size rather than an absolute
 * pixel, so one file works at any viewport and aspect ratio: the club rooms
 * are letterboxed by Scale.EXPAND, which keeps the logical height at 720 but
 * lets the width vary a lot between a phone and a desktop.
 */

export interface ClubNpcPlacement {
  group: ClubNpcGroupId;
  /** Horizontal centre, as a fraction of camera width. */
  xRatio: number;
  /**
   * Rendered height of the *drawn figures* as a fraction of camera height.
   * Measured against the group's `contentHeight`, not its canvas, so the
   * same number means the same apparent size for every group.
   */
  heightRatio: number;
  /**
   * Floor line this group stands on, as a fraction of camera height. Higher
   * up the frame (a smaller number) reads as further back in the room. Omitted
   * means the player's own floor line, i.e. standing level with them.
   */
  baselineRatio?: number;
  /** Mirrors the artwork, so a room isn't a row of identically-facing groups. */
  flipX?: boolean;
  /** Per-cycle duration override; omitted uses NPC_IDLE_CYCLE_MS. */
  cycleMs?: number;
  /**
   * Shifts this group's position within its own loop, so two groups sharing
   * a cycle length don't animate in visible lockstep.
   */
  phaseMs?: number;
}

/** Keyed by `ClubRoom.id`; a room with no entry simply gets no NPCs. */
export type ClubNpcPlacementConfig = Record<string, readonly ClubNpcPlacement[]>;

export const CLUB_NPC_PLACEMENT = rawPlacement as ClubNpcPlacementConfig;

/**
 * One cycle of an ambient idle loop, in milliseconds. Per *cycle*, never per
 * frame, matching `characterAnimation.ts`: a 6-frame and a 10-frame group
 * therefore idle at the same tempo instead of the longer one appearing to
 * run in slow motion.
 *
 * Slower than the player's RUN_CYCLE_MS (552ms) on purpose — these are people
 * standing around talking, drinking and smoking, not moving anywhere.
 */
export const NPC_IDLE_CYCLE_MS = 1400;

export function getRoomNpcPlacements(roomId: string): readonly ClubNpcPlacement[] {
  return CLUB_NPC_PLACEMENT[roomId] ?? [];
}

/** The distinct groups a room needs, so only that room's artwork is loaded. */
export function getRoomNpcGroups(roomId: string): ClubNpcGroupId[] {
  const groups: ClubNpcGroupId[] = [];
  for (const placement of getRoomNpcPlacements(roomId)) {
    if (!groups.includes(placement.group)) groups.push(placement.group);
  }
  return groups;
}

export interface ClubNpcPixelTransform {
  x: number;
  y: number;
  scale: number;
}

/**
 * Ratios -> absolute pixels for the viewport currently being laid out.
 *
 * `y` is the placement's floor line. The renderer draws with a bottom origin
 * and then pushes the sprite down by the group's scaled `footGap`, so it is
 * the *drawn feet* that land on this line rather than the bottom of a canvas
 * that is mostly empty.
 */
export function resolveClubNpcTransform(
  placement: ClubNpcPlacement,
  cameraWidth: number,
  cameraHeight: number,
  fallbackBaselineRatio: number,
): ClubNpcPixelTransform {
  const art = getClubNpcGroup(placement.group);
  const baselineRatio = placement.baselineRatio ?? fallbackBaselineRatio;
  return {
    x: placement.xRatio * cameraWidth,
    y: baselineRatio * cameraHeight,
    scale:
      art.contentHeight > 0 ? (placement.heightRatio * cameraHeight) / art.contentHeight : 1,
  };
}

/** Absolute pixels -> ratios, so the SceneEditor can persist what it just set. */
export function toClubNpcPlacement(
  placement: ClubNpcPlacement,
  transform: ClubNpcPixelTransform,
  cameraWidth: number,
  cameraHeight: number,
): ClubNpcPlacement {
  const art = getClubNpcGroup(placement.group);
  return {
    ...placement,
    xRatio: cameraWidth > 0 ? transform.x / cameraWidth : 0,
    heightRatio:
      cameraHeight > 0 ? (art.contentHeight * transform.scale) / cameraHeight : 0,
    baselineRatio: cameraHeight > 0 ? transform.y / cameraHeight : 0,
  };
}

/** True for a group id the artwork actually defines; used by the save endpoint. */
export function isClubNpcGroupId(value: unknown): value is ClubNpcGroupId {
  return typeof value === 'string' && (CLUB_NPC_GROUP_IDS as readonly string[]).includes(value);
}
