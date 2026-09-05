import type Phaser from 'phaser';

export interface ClubRuntimeImageAsset {
  key: string;
  url: string;
}

/**
 * Serialises every post-create Club image batch through Phaser's one scene
 * loader. Phaser exposes one mutable queue per scene: attaching unrelated
 * COMPLETE listeners and calling start() from room-tail and neighbour loads
 * independently lets one batch observe another batch's completion (or add
 * files while it is already processing). Keeping one promise chain makes a
 * batch atomic without making Club depend on campaign HTTP prefetch.
 */
export class ClubRuntimeAssetLoader {
  private tail: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {}

  load(assets: readonly ClubRuntimeImageAsset[]): Promise<void> {
    const run = async (): Promise<void> => {
      if (this.destroyed) return;
      await this.waitUntilIdle();
      if (this.destroyed) return;

      const missing = assets.filter((asset) => !this.scene.textures.exists(asset.key));
      if (missing.length === 0) return;
      for (const asset of missing) this.scene.load.image(asset.key, asset.url);
      await this.startQueuedBatch();
    };
    const result = this.tail.then(run, run);
    // A failed image is reported by Phaser but must not poison later rooms.
    this.tail = result.catch(() => undefined);
    return result;
  }

  destroy(): void {
    this.destroyed = true;
  }

  private waitUntilIdle(): Promise<void> {
    if (!this.scene.load.isLoading()) return Promise.resolve();
    return new Promise((resolve) => {
      this.scene.load.once('complete', resolve);
      this.scene.events.once('shutdown', resolve);
    });
  }

  private startQueuedBatch(): Promise<void> {
    return new Promise((resolve) => {
      this.scene.load.once('complete', resolve);
      this.scene.events.once('shutdown', resolve);
      this.scene.load.start();
    });
  }
}
