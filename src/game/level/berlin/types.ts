export type SectionId =
  | 'tutorial'
  | 'firstPit'
  | 'kiez'
  | 'bridge'
  | 'night'
  | 'scaffold'
  | 'rooftops'
  | 'finalPit'
  | 'finale';
export type PlayerAnimationState = 'run' | 'jump' | 'doubleJump' | 'fall' | 'crouch' | 'hurt';
export type ObstacleAction = 'jump' | 'duck' | 'moving';
/** Level 1 has a single collectible type; every pickup on the map is an Emerald. */
export type CollectibleKind = 'emerald';
export type PlatformAxis = 'horizontal' | 'vertical';

export interface BerlinSection {
  id: SectionId;
  label: string;
  startX: number;
  endX: number;
  artSlot: string;
}

export interface GroundSegment {
  id: string;
  startX: number;
  endX: number;
}


export interface LevelEntityBase {
  id: string;
  x: number;
  width: number;
  height: number;
  artSlot: string;
  /** Written by the dev editor once legacy platform dimensions are explicitly resized. */
  editorSized?: boolean;
}

export interface HitboxSpec {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface ObstacleConfig extends LevelEntityBase {
  type: 'obstacle';
  action: ObstacleAction;
  label: string;
  y: number;
  hitbox: HitboxSpec;
  movement?: { distance: number; durationMs: number };
}

export interface PlatformConfig extends LevelEntityBase {
  type: 'platform';
  label: string;
  y: number;
  topY: number;
  height: number;
}

export interface MovingPlatformConfig extends LevelEntityBase {
  type: 'movingPlatform';
  label: string;
  y: number;
  topY: number;
  height: number;
  axis: PlatformAxis;
  movementDistance: number;
  durationMs: number;
  phaseMs: number;
  /** If set, the platform stays parked until the player reaches this world x, then starts moving once. */
  activationX?: number;
  /** If true, the platform's first leg moves toward the low/left extreme instead of the high/right one. */
  reverseInitialDirection?: boolean;
}

export interface CollectibleConfig extends LevelEntityBase {
  type: 'collectible';
  kind: CollectibleKind;
  label: string;
  y: number;
  /** Always EMERALD_SCORE: one consistent value for the level's one pickup type. */
  score: number;
}


export type BerlinEntity =
  | ObstacleConfig
  | CollectibleConfig
  | PlatformConfig
  | MovingPlatformConfig;

/**
 * Body width/height only: the offset that centers/grounds the body against
 * the physics sprite's actual current frame is computed in Player.applyBody,
 * not stored here, so it can never drift from whatever texture the physics
 * sprite is really showing.
 */
export interface PlayerBodySpec {
  width: number;
  height: number;
}
