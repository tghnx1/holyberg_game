import type { BerlinEntity } from './types';

export interface BerlinEntityZoneLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pure world-space collider geometry used by LevelBuilder and unit tests. */
export function getBerlinEntityZoneLayout(config: BerlinEntity): BerlinEntityZoneLayout {
  const hitbox = config.type === 'obstacle' ? config.hitbox : undefined;
  const isPlatform = config.type === 'platform' || config.type === 'movingPlatform';
  return {
    x: hitbox ? config.x + hitbox.offsetX : config.x,
    y: hitbox ? config.y + hitbox.offsetY : config.y,
    width: hitbox ? hitbox.width : isPlatform ? config.width : config.width * 0.78,
    height: hitbox ? hitbox.height : isPlatform ? config.height : config.height * 0.82,
  };
}
