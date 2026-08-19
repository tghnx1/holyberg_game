import Phaser from 'phaser';
import { DialogueLayout } from './dialogueConstants';
import { buildPortraitClipPoints } from './dialogueLayoutMetrics';
import { isTalkFrameActive } from './dialogueTalkAnimation';
import type { SpeakerPortraitConfig } from './speakerPortraits';

/**
 * The right-hand portrait panel for any speaker with a 2-frame talking
 * portrait (see speakerPortraits.ts) — a reusable alternative to
 * MagicianPortrait, not specific to Dialogue 1 or to any one speaker.
 *
 * Shows `idleFrameKey` (closed mouth) at rest and alternates to
 * `talkFrameKey` (open mouth) every ~140ms while `setTalking(true, now)` is
 * in effect, switching back to the idle frame the instant talking stops.
 * `setSpeaker()` swaps which speaker's two frames are in play, snapping
 * straight back to that speaker's idle frame — "on speaker change, switch
 * portrait immediately and start from frame 1".
 */
export class TalkingPortrait {
  readonly root: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly image: Phaser.GameObjects.Image;
  private readonly mask: Phaser.GameObjects.Graphics;
  private speaker: SpeakerPortraitConfig;
  private talking = false;
  private talkStartedAt = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    initialSpeaker: SpeakerPortraitConfig,
  ) {
    this.speaker = initialSpeaker;

    this.backdrop = scene.add.rectangle(0, 0, width, height, 0x140c1f).setOrigin(0, 0);
    this.image = scene.add
      .image(width / 2, height / 2, initialSpeaker.idleFrameKey)
      .setOrigin(0.5, 0.5);
    this.root = scene.add.container(0, 0, [this.backdrop, this.image]);

    // Same diagonal clip MagicianPortrait uses, so the seam against the
    // scene panel reads identically whichever portrait a script picks.
    this.mask = scene.make.graphics({}, false);
    this.root.setMask(this.mask.createGeometryMask());
    this.resize(width, height);
  }

  /**
   * Switches which speaker's two frames this portrait shows. A no-op if
   * `config` is already the current speaker (e.g. the next line is the same
   * speaker again), so mid-line calls never reset the talk animation.
   */
  setSpeaker(config: SpeakerPortraitConfig): void {
    if (this.speaker === config) return;
    this.speaker = config;
    this.talking = false;
    this.talkStartedAt = -Infinity;
    this.image.setTexture(config.idleFrameKey);
  }

  /** Starts/stops the mouth-flap cycle; only the active speaker should ever be told `true`. */
  setTalking(active: boolean, nowMs: number): void {
    if (active === this.talking) return;
    this.talking = active;
    if (active) {
      this.talkStartedAt = nowMs;
    } else {
      this.image.setTexture(this.speaker.idleFrameKey);
    }
  }

  resize(width: number, height: number): void {
    this.backdrop.setSize(width, height);

    const clip = buildPortraitClipPoints(width, height, DialogueLayout.dividerThickness, DialogueLayout.dividerSkew);
    this.mask.clear().fillStyle(0xffffff);
    const points: Phaser.Geom.Point[] = [];
    for (let index = 0; index < clip.length; index += 2) {
      points.push(new Phaser.Geom.Point(clip[index], clip[index + 1]));
    }
    this.mask.fillPoints(points, true);

    const source = this.scene.textures.get(this.image.texture.key).getSourceImage();
    const scale = source.width > 0 && source.height > 0
      ? Math.min(width / source.width, height / source.height) * DialogueLayout.portraitFillRatio
      : 1;
    this.image.setPosition(width / 2, height / 2).setScale(scale);
  }

  /** Keeps the mask tracking the panel's on-screen position and advances the talk cycle. */
  update(nowMs: number): void {
    this.mask.setPosition(this.root.x, this.root.y);
    if (!this.talking) return;
    const key = isTalkFrameActive(nowMs - this.talkStartedAt)
      ? this.speaker.talkFrameKey
      : this.speaker.idleFrameKey;
    if (this.image.texture.key !== key) this.image.setTexture(key);
  }

  destroy(): void {
    this.root.clearMask(true);
    this.mask.destroy();
    this.root.destroy(true);
  }
}
