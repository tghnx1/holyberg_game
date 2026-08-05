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
export type CollectibleKind = 'usb' | 'headphones' | 'poster' | 'vinyl' | 'pass' | 'energy';
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

export interface PitZone {
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
  score: number;
  timeBonus?: number;
  mandatory?: boolean;
}

export interface FinishConfig extends LevelEntityBase {
  type: 'finish';
  label: string;
  y: number;
}

export type BerlinEntity =
  | ObstacleConfig
  | CollectibleConfig
  | FinishConfig
  | PlatformConfig
  | MovingPlatformConfig;

export interface PlayerBodySpec {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}
