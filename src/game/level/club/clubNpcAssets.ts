/**
 * Artwork for Level 2's ambient club NPCs.
 *
 * These are scenery, not characters: they never appear in the character
 * manifest or CharacterRegistry, are never playable, and are never cast in a
 * dialogue. They exist only to populate the club rooms, so their frames live
 * here rather than under `assets/players/`.
 *
 * Kept free of Phaser so the placement config, the loader and the renderer
 * can all share one list instead of duplicating file paths, exactly as
 * `stationAssets.ts` does for the metro station's scenery.
 *
 * `contentHeight` and `footGap` are measured from the artwork's alpha
 * bounding box (union across every frame of the group, so an animation can
 * never make the group drift or resize between frames):
 *
 *  - `contentHeight` is how tall the drawn figures actually are inside the
 *    567x567 canvas, so a placement can ask for a rendered height and get a
 *    scale that means the same thing for every group regardless of how much
 *    empty canvas each one carries.
 *  - `footGap` is the transparent padding below the drawn feet, in source
 *    pixels. Every one of these groups has ~100-120px of it, so seating them
 *    with a plain bottom origin would float them well above the floor. This
 *    is the same quantity `CharacterAssetRef.footGap` carries for player
 *    artwork, and it is consumed the same way, through
 *    `footOffset(footGap, scale)`.
 */

export const CLUB_NPC_GROUP_IDS = [
  'three_people_smoke',
  'three_people_talk',
  'two_people_talk',
  'green_drinker',
  'pink_drinker',
  'seated_pair',
  'violet_pair',
] as const;

export type ClubNpcGroupId = (typeof CLUB_NPC_GROUP_IDS)[number];

export interface ClubNpcFrame {
  key: string;
  url: string;
}

export interface ClubNpcGroupArt {
  id: ClubNpcGroupId;
  /** Frames in loop order, one per file, zero-padded on disk. */
  frames: readonly ClubNpcFrame[];
  /** Drawn height of the figures in source pixels; a rendered height scales against this. */
  contentHeight: number;
  /** Transparent source pixels below the drawn feet; seats the group on the floor line. */
  footGap: number;
}

interface GroupSpec {
  frameCount: number;
  contentHeight: number;
  footGap: number;
}

/** Measured from the artwork; see the module comment for what each value means. */
const GROUP_SPECS: Record<ClubNpcGroupId, GroupSpec> = {
  three_people_smoke: { frameCount: 10, contentHeight: 339, footGap: 118 },
  three_people_talk: { frameCount: 9, contentHeight: 365, footGap: 101 },
  two_people_talk: { frameCount: 6, contentHeight: 399, footGap: 117 },
  green_drinker: { frameCount: 6, contentHeight: 354, footGap: 109 },
  pink_drinker: { frameCount: 6, contentHeight: 357, footGap: 109 },
  seated_pair: { frameCount: 6, contentHeight: 386, footGap: 112 },
  violet_pair: { frameCount: 9, contentHeight: 362, footGap: 107 },
};

const ASSET_ROOT = 'assets/level_2/npcs';

/** Texture key for one frame. Nothing outside this module builds these strings. */
function frameKey(group: ClubNpcGroupId, frameNumber: number): string {
  return `club-npc-${group}-${String(frameNumber).padStart(2, '0')}`;
}

function buildGroup(id: ClubNpcGroupId): ClubNpcGroupArt {
  const spec = GROUP_SPECS[id];
  const frames: ClubNpcFrame[] = [];
  for (let frameNumber = 1; frameNumber <= spec.frameCount; frameNumber += 1) {
    const padded = String(frameNumber).padStart(2, '0');
    frames.push({ key: frameKey(id, frameNumber), url: `${ASSET_ROOT}/${id}/${padded}.png` });
  }
  return { id, frames, contentHeight: spec.contentHeight, footGap: spec.footGap };
}

const GROUPS = ((): Record<ClubNpcGroupId, ClubNpcGroupArt> => {
  const built = {} as Record<ClubNpcGroupId, ClubNpcGroupArt>;
  for (const id of CLUB_NPC_GROUP_IDS) built[id] = buildGroup(id);
  return built;
})();

export function getClubNpcGroup(id: ClubNpcGroupId): ClubNpcGroupArt {
  return GROUPS[id];
}

/**
 * Every frame the given groups need, deduplicated. Callers pass only the
 * groups the room they are entering actually shows, so walking into the
 * lounge never costs the backstage's artwork.
 */
export function collectClubNpcFrames(groups: readonly ClubNpcGroupId[]): ClubNpcFrame[] {
  const frames: ClubNpcFrame[] = [];
  const seen: Record<string, true> = {};
  for (const id of groups) {
    for (const frame of GROUPS[id].frames) {
      if (seen[frame.key]) continue;
      seen[frame.key] = true;
      frames.push(frame);
    }
  }
  return frames;
}
