import Phaser from 'phaser';
import { DialogueLayout } from './dialogueConstants';
import { buildPortraitClipPoints, computePortraitFitScale } from './dialogueLayoutMetrics';
import { isTalkFrameActive } from './dialogueTalkAnimation';


/**
 * The right-hand portrait panel for any speaker with a 2-frame talking
 * portrait, driven by the two frame keys it is handed. Not specific to
 * Dialogue 1, and deliberately ignorant of which character it is drawing.
 *
 * Shows `idleFrameKey` (closed mouth) at rest and alternates to
 * `talkFrameKey` (open mouth) every ~140ms while `setTalking(true, now)` is
 * in effect, switching back to the idle frame the instant talking stops.
 * `setSpeaker()` swaps which speaker's two frames are in play, snapping
 * straight back to that speaker's idle frame — "on speaker change, switch
 * portrait immediately and start from frame 1".
 */
/**
 * The two frames a portrait alternates between. Just keys: the renderer is
 * deliberately ignorant of whose face it is drawing.
 */
export interface PortraitFrames {
  idleFrameKey: string;
  talkFrameKey: string;
  /** Visual-only multiplier applied on top of the shared portrait fit. */
  scaleMultiplier?: number;
}

export class TalkingPortrait {
  readonly root: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly image: Phaser.GameObjects.Image;
  private readonly mask: Phaser.GameObjects.Graphics;
  private speaker: PortraitFrames;
  /** Latest panel box, so a speaker change can refit without a resize pass. */
  private panelWidth = 0;
  private panelHeight = 0;
  private talking = false;
  private talkStartedAt = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    initialSpeaker: PortraitFrames,
  ) {
    this.speaker = initialSpeaker;

    this.backdrop = scene.add.rectangle(0, 0, width, height, 0x140c1f).setOrigin(0, 0);
    this.image = scene.add
      .image(width / 2, height / 2, initialSpeaker.idleFrameKey)
      .setOrigin(0.5, 0.5);
    this.root = scene.add.container(0, 0, [this.backdrop, this.image]);

    // The same diagonal clip the scene panel uses, so the seam reads
    // identically whichever character is on screen.
    this.mask = scene.make.graphics({}, false);
    this.root.setMask(this.mask.createGeometryMask());
    this.resize(width, height);
  }

  /**
   * Switches which speaker's two frames this portrait shows. A no-op if
   * `config` is already the current speaker (e.g. the next line is the same
   * speaker again), so mid-line calls never reset the talk animation.
   */
  setSpeaker(config: PortraitFrames): void {
    // Compared by key, not identity: callers build a fresh frames object from
    // the resolved character each line, so identity would never match and the
    // talk animation would restart on every line.
    if (
      this.speaker.idleFrameKey === config.idleFrameKey &&
      this.speaker.scaleMultiplier === config.scaleMultiplier
    ) {
      return;
    }
    this.speaker = config;
    this.talking = false;
    this.talkStartedAt = -Infinity;
    this.showFrame(config.idleFrameKey);
  }

  /** Starts/stops the mouth-flap cycle; only the active speaker should ever be told `true`. */
  setTalking(active: boolean, nowMs: number): void {
    if (active === this.talking) return;
    this.talking = active;
    if (active) {
      this.talkStartedAt = nowMs;
    } else {
      this.showFrame(this.speaker.idleFrameKey);
    }
  }

  resize(width: number, height: number): void {
    this.panelWidth = width;
    this.panelHeight = height;
    this.backdrop.setSize(width, height);

    const clip = buildPortraitClipPoints(width, height, DialogueLayout.dividerThickness, DialogueLayout.dividerSkew);
    this.mask.clear().fillStyle(0xffffff);
    const points: Phaser.Geom.Point[] = [];
    for (let index = 0; index < clip.length; index += 2) {
      points.push(new Phaser.Geom.Point(clip[index], clip[index + 1]));
    }
    this.mask.fillPoints(points, true);

    this.fitPortrait();
  }

  /**
   * Sizes and centres the image from *its own* source dimensions.
   *
   * Called on every texture change as well as on resize: characters can have
   * differently shaped portrait canvases, so a speaker change that only swapped
   * the texture would leave the new portrait wearing the previous one's scale.
   */
  private fitPortrait(): void {
    const source = this.scene.textures.get(this.image.texture.key).getSourceImage();
    const scale = computePortraitFitScale(
      this.panelWidth,
      this.panelHeight,
      source.width,
      source.height,
      DialogueLayout.portraitFillRatio,
    ) * (this.speaker.scaleMultiplier ?? 1);
    this.image.setPosition(this.panelWidth / 2, this.panelHeight / 2).setScale(scale);
  }

  /** Single point where the drawn frame changes, so the fit can never be skipped. */
  private showFrame(key: string): void {
    if (this.image.texture.key === key) return;
    this.image.setTexture(key);
    this.fitPortrait();
  }

  /** Keeps the mask tracking the panel's on-screen position and advances the talk cycle. */
  update(nowMs: number): void {
    this.mask.setPosition(this.root.x, this.root.y);
    if (!this.talking) return;
    this.showFrame(
      isTalkFrameActive(nowMs - this.talkStartedAt)
        ? this.speaker.talkFrameKey
        : this.speaker.idleFrameKey,
    );
  }

  destroy(): void {
    this.root.clearMask(true);
    this.mask.destroy();
    this.root.destroy(true);
  }
}
