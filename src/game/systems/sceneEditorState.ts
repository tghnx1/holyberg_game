import type Phaser from 'phaser';

const activeScenes = new Set<Phaser.Scene>();

export function setSceneEditorActive(scene: Phaser.Scene, active: boolean): void {
  if (active) activeScenes.add(scene);
  else activeScenes.delete(scene);
}

export function isSceneEditorActive(scene: Phaser.Scene): boolean {
  return activeScenes.has(scene);
}

export function __resetSceneEditorStateForTests(): void {
  activeScenes.clear();
}
