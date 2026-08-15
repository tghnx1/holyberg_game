import Phaser from 'phaser';
import { getComboVisualIntensity, getDeckSideForLane, type BoothDeckSide } from './BoothAnimationLogic';
import { RhythmDepth } from './constants';
import {
  getRhythmAssetLayout,
  RHYTHM_DECK_PLATTER_OFFSET_X,
  RHYTHM_DECK_PLATTER_OFFSET_Y,
} from './RhythmAssetLayout';
import type { Lane } from './types';

const CYAN = 0x21d4ff;
const ORANGE = 0xff6a1a;
const MISS_RED = 0xff334f;

interface DeckEffects {
  center: Phaser.Math.Vector2;
  image: Phaser.GameObjects.Image;
  spinner: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  particles: Phaser.GameObjects.Arc[];
}

/** Reuses a fixed object pool; gameplay layers and hit geometry are untouched. */
export class RhythmBoothAnimation {
  readonly root: Phaser.GameObjects.Container;
  private readonly decks: Record<BoothDeckSide, DeckEffects>;
  private readonly missWash: Phaser.GameObjects.Rectangle;
  private missTintRecovery?: Phaser.Time.TimerEvent;
  private rotationTweens: Phaser.Tweens.Tween[] = [];
  private comboIntensity = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    centerX: number,
    leftDeck: Phaser.GameObjects.Image,
    rightDeck: Phaser.GameObjects.Image,
  ) {
    const layout = getRhythmAssetLayout(centerX);
    this.root = scene.add.container(centerX, 0).setDepth(RhythmDepth.HIGHWAY + 27);
    this.missWash = scene.add.rectangle(0, layout.deckY + 92, 780, 150, MISS_RED, 1).setAlpha(0);
    this.root.add(this.missWash);

    this.decks = {
      left: this.createDeckEffects(
        'left',
        layout.leftDeckX - centerX + RHYTHM_DECK_PLATTER_OFFSET_X,
        layout.deckY + RHYTHM_DECK_PLATTER_OFFSET_Y,
        leftDeck,
        CYAN,
      ),
      right: this.createDeckEffects(
        'right',
        layout.rightDeckX - centerX - RHYTHM_DECK_PLATTER_OFFSET_X,
        layout.deckY + RHYTHM_DECK_PLATTER_OFFSET_Y,
        rightDeck,
        ORANGE,
      ),
    };
  }

  setCenterX(centerX: number): void {
    this.root.setX(centerX);
  }

  startGameplay(): void {
    if (this.rotationTweens.length > 0) {
      this.resume();
      return;
    }
    this.decks.left.spinner.setAngle(0);
    this.decks.right.spinner.setAngle(0);
    this.rotationTweens = [
      this.scene.tweens.add({ targets: this.decks.left.spinner, angle: 360, duration: 5200, repeat: -1, ease: 'Linear' }),
      this.scene.tweens.add({ targets: this.decks.right.spinner, angle: -360, duration: 5600, repeat: -1, ease: 'Linear' }),
    ];
  }

  pause(): void {
    for (const tween of this.rotationTweens) tween.pause();
  }

  resume(): void {
    for (const tween of this.rotationTweens) tween.resume();
  }

  setCombo(combo: number): void {
    this.comboIntensity = getComboVisualIntensity(combo);
  }

  reactLane(lane: Lane): void {
    const deck = this.decks[getDeckSideForLane(lane)];
    this.kickDeck(deck, 1.04, 70);
    this.pulseDeck(deck, 0.36, 1.06, 180);
  }

  pulseBeat(strong: boolean): void {
    for (const deck of Object.values(this.decks)) {
      const passive = this.passiveGlow;
      this.scene.tweens.killTweensOf([deck.ring, deck.glow]);
      deck.ring.setScale(1).setAlpha(passive + (strong ? 0.34 : 0.2));
      deck.glow.setAlpha(passive + (strong ? 0.12 : 0.06));
      this.scene.tweens.add({ targets: deck.ring, scale: strong ? 1.09 : 1.05, alpha: passive, duration: strong ? 230 : 170 });
      this.scene.tweens.add({ targets: deck.glow, alpha: passive, duration: strong ? 230 : 170 });
    }
  }

  flashPerfect(lane: Lane): void {
    const deck = this.decks[getDeckSideForLane(lane)];
    this.kickDeck(deck, 1.06, 90);
    this.pulseDeck(deck, 0.82, 1.12, 280);
    this.burst(deck);
  }

  flashMiss(): void {
    this.scene.tweens.killTweensOf(this.missWash);
    this.missWash.setAlpha(0.18);
    this.scene.tweens.add({ targets: this.missWash, alpha: 0, duration: 190 });
    this.missTintRecovery?.remove(false);
    this.missTintRecovery = this.scene.time.delayedCall(190, () => {
      this.missTintRecovery = undefined;
      for (const deck of Object.values(this.decks)) deck.image.clearTint();
    });
    for (const deck of Object.values(this.decks)) {
      this.scene.tweens.killTweensOf(deck.image);
      deck.image.setTint(MISS_RED).setAlpha(0.72).setScale(1);
      this.scene.tweens.add({ targets: deck.image, alpha: 1, duration: 190 });
    }
  }

  stop(): void {
    for (const tween of this.rotationTweens) tween.stop();
    this.rotationTweens = [];
    const targets = Object.values(this.decks).flatMap((deck) => [
      deck.image,
      deck.spinner,
      deck.ring,
      deck.glow,
      ...deck.particles,
    ]);
    this.scene.tweens.killTweensOf([this.missWash, ...targets]);
    this.missTintRecovery?.remove(false);
    this.missTintRecovery = undefined;
    this.missWash.setAlpha(0);
    for (const deck of Object.values(this.decks)) {
      deck.image.setScale(1).setAlpha(1).clearTint();
      deck.spinner.setAngle(0);
      deck.ring.setScale(1).setAlpha(this.passiveGlow);
      deck.glow.setAlpha(this.passiveGlow);
      for (const particle of deck.particles) particle.setAlpha(0);
    }
  }

  destroy(): void {
    this.stop();
    this.root.destroy(true);
  }

  private get passiveGlow(): number {
    return 0.05 + this.comboIntensity * 0.14;
  }

  private createDeckEffects(
    side: BoothDeckSide,
    x: number,
    y: number,
    image: Phaser.GameObjects.Image,
    color: number,
  ): DeckEffects {
    const glow = this.scene.add.circle(x, y, 65, color, 1).setAlpha(0.05);
    const ring = this.scene.add.circle(x, y, 52, color, 0).setStrokeStyle(4, color, 0.9).setAlpha(0.05);
    const spinner = this.scene.add.container(x, y);
    for (let index = 0; index < 4; index += 1) {
      const angle = index * (Math.PI / 2);
      const marker = this.scene.add.rectangle(Math.cos(angle) * 43, Math.sin(angle) * 43, 14, 3, color, 0.75)
        .setRotation(angle);
      spinner.add(marker);
    }
    const particles = Array.from({ length: 6 }, (_, index) => this.scene.add.circle(x, y, 3 + (index % 2), index % 2 === 0 ? color : 0xffffff, 1).setAlpha(0));
    this.root.add([glow, ring, spinner, ...particles]);
    if (side === 'right') spinner.setAngle(45);
    return { center: new Phaser.Math.Vector2(x, y), image, spinner, ring, glow, particles };
  }

  private kickDeck(deck: DeckEffects, scale: number, duration: number): void {
    this.scene.tweens.killTweensOf(deck.image);
    deck.image.setScale(1);
    this.scene.tweens.add({ targets: deck.image, scaleX: scale, scaleY: scale, duration, yoyo: true });
  }

  private pulseDeck(deck: DeckEffects, alpha: number, scale: number, duration: number): void {
    const passive = this.passiveGlow;
    this.scene.tweens.killTweensOf([deck.ring, deck.glow]);
    deck.ring.setScale(1).setAlpha(alpha);
    deck.glow.setAlpha(alpha * 0.62);
    this.scene.tweens.add({ targets: deck.ring, scale, alpha: passive, duration });
    this.scene.tweens.add({ targets: deck.glow, alpha: passive, duration });
  }

  private burst(deck: DeckEffects): void {
    this.scene.tweens.killTweensOf(deck.particles);
    for (let index = 0; index < deck.particles.length; index += 1) {
      const particle = deck.particles[index];
      const angle = (Math.PI * 2 * index) / deck.particles.length - Math.PI / 2;
      const distance = 35 + (index % 2) * 16;
      particle.setPosition(deck.center.x, deck.center.y).setScale(1).setAlpha(0.95);
      this.scene.tweens.add({
        targets: particle,
        x: deck.center.x + Math.cos(angle) * distance,
        y: deck.center.y + Math.sin(angle) * distance,
        scale: 0.35,
        alpha: 0,
        duration: 280,
        ease: 'Quad.out',
      });
    }
  }
}
