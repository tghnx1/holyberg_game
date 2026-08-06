export function textureForSlot(scene: Phaser.Scene, slot: string): string | undefined {
  return scene.textures.exists(slot) ? slot : undefined;
}
