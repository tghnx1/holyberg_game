export const ART_SLOTS = {
  player: {
    run: 'player.run',
    jump: 'player.jump',
    fall: 'player.fall',
    crouch: 'player.crouch',
    hurt: 'player.hurt',
  },
  backgrounds: [
    'background.apartment',
    'background.street',
    'background.bridge',
    'background.night',
    'background.club',
  ],
  obstacles: [
    'obstacle.trash',
    'obstacle.scooter',
    'obstacle.barrier',
    'obstacle.lowSign',
    'obstacle.puddle',
    'obstacle.cable',
    'obstacle.taxi',
    'obstacle.queueBarrier',
    'obstacle.pipe',
  ],
  collectibles: [
    'collectible.usb',
    'collectible.headphones',
    'collectible.poster',
    'collectible.vinyl',
    'collectible.pass',
    'collectible.energy',
  ],
  npcs: ['npc.cyclist', 'npc.wanderer'],
  finish: 'finish.backstage',
} as const;

export function textureForSlot(scene: Phaser.Scene, slot: string): string | undefined {
  return scene.textures.exists(slot) ? slot : undefined;
}
