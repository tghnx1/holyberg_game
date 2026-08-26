import Phaser from 'phaser';
import { Depth } from '../constants';
import { queueCharacterPreview } from '../characters/characterAssets';
import {
  assertSelectable,
  computeCarouselLayout,
  stepIndex,
  type CarouselLayout,
} from '../characters/characterCarousel';
import type { CharacterDefinition } from '../characters/characterManifest';
import { getPlayableCharacters } from '../characters/characterRegistry';
import { selectCharacter } from '../characters/characterSelection';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';

const CARD_WIDTH = 236;
const CARD_HEIGHT = 304;
const CARD_GAP = 28;
/** Slop around the confirm button's visible box, for fingers. */
const TOUCH_PADDING = 18;
const CONFIRM_WIDTH = 268;
const CONFIRM_HEIGHT = 62;

interface CharacterCard {
  character: CharacterDefinition;
  root: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Rectangle;
  preview: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
}

/**
 * Character Select, built entirely from the discovered playable characters.
 *
 * Nothing here names a character, counts them, or branches on which one it
 * is: the cards come from `getPlayableCharacters()`, the label from
 * `CharacterDefinition.name` and the artwork from the discovered idle frame,
 * so a new asset folder appears with no edit to this file.
 *
 * Loads previews only — one still per character, so showing N characters
 * costs N files rather than N animation sets. Each gameplay and dialogue
 * scene queues what it needs in its own preload, which keeps that cost paid
 * once and only by whoever actually needs it.
 */
export class CharacterSelectScene extends Phaser.Scene {
  private characters: readonly CharacterDefinition[] = [];
  private cards: CharacterCard[] = [];
  private track!: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private confirmBackground!: Phaser.GameObjects.Rectangle;
  private confirmLabel!: Phaser.GameObjects.Text;
  private arrowLeft?: Phaser.GameObjects.Text;
  private arrowRight?: Phaser.GameObjects.Text;
  private index = 0;
  private layout!: CarouselLayout;
  /** Latched by the first accepted confirm, so a double tap cannot double-start. */
  private confirmed = false;

  constructor() {
    super('CharacterSelectScene');
  }

  preload(): void {
    this.characters = getPlayableCharacters();
    // Throws with an explanation rather than drawing an empty carousel.
    assertSelectable(this.characters);
    for (const character of this.characters) queueCharacterPreview(this, character);
  }

  create(): void {
    this.index = 0;
    this.confirmed = false;
    this.cards = [];
    this.cameras.main.setBackgroundColor('#090611');
    attachFullscreenExitControl(this);

    this.buildBackdrop();
    this.buildTitle();
    this.buildCards();
    this.buildConfirm();
    this.buildArrows();
    this.buildKeyboard();

    new OrientationController(this, { onLayout: (viewport) => this.applyLayout(viewport) });
    this.applyLayout();
  }

  // ------------------------------------------------------------------ build

  /** A soft vignette so the cards sit on something, matching the game's palette. */
  private buildBackdrop(): void {
    const glow = this.add.graphics().setDepth(Depth.FAR_BACKGROUND);
    glow.fillStyle(0x55145e, 0.34);
    glow.fillCircle(0, 0, 420);
    glow.setPosition(0, 0);
    this.add.existing(glow);
    glow.setData('isBackdrop', true);
  }

  private buildTitle(): void {
    this.title = this.add
      .text(0, 0, 'CHOOSE YOUR RUNNER', {
        fontFamily: 'Archivo Black',
        fontSize: '44px',
        color: '#ffdf57',
        stroke: '#55145e',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(Depth.UI);

    this.hint = this.add
      .text(0, 0, '', {
        fontFamily: 'Space Mono',
        fontSize: '15px',
        color: '#a99bc0',
      })
      .setOrigin(0.5)
      .setDepth(Depth.UI);
  }

  private buildCards(): void {
    this.track = this.add.container(0, 0).setDepth(Depth.GAMEPLAY);
    this.characters.forEach((character, index) => {
      const frame = this.add
        .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x140c22)
        .setStrokeStyle(3, 0x3a2450);
      const preview = this.add.image(0, 0, character.gameplay.idle?.key ?? '').setOrigin(0.5, 1);
      const name = this.add
        .text(0, 0, character.name.toUpperCase(), {
          fontFamily: 'Archivo Black',
          fontSize: '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0.5);
      const root = this.add.container(0, 0, [frame, preview, name]);
      // The card itself is the tap target, sized to what is drawn.
      root
        .setSize(CARD_WIDTH, CARD_HEIGHT)
        .setInteractive({
          hitArea: new Phaser.Geom.Rectangle(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
          useHandCursor: true,
        })
        // Focus on release, never on hover, so touch and mouse behave alike.
        .on('pointerup', (pointer: Phaser.Input.Pointer) => {
          this.swallow(pointer);
          this.focus(index);
        });
      this.track.add(root);
      this.cards.push({ character, root, frame, preview, name });
    });
  }

  private buildConfirm(): void {
    this.confirmBackground = this.add
      .rectangle(0, 0, CONFIRM_WIDTH, CONFIRM_HEIGHT, 0xffdf57)
      .setOrigin(0.5)
      .setDepth(Depth.UI)
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(
          -TOUCH_PADDING,
          -TOUCH_PADDING,
          CONFIRM_WIDTH + TOUCH_PADDING * 2,
          CONFIRM_HEIGHT + TOUCH_PADDING * 2,
        ),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
    this.confirmLabel = this.add
      .text(0, 0, 'SELECT', {
        fontFamily: 'Archivo Black',
        fontSize: '24px',
        color: '#090611',
      })
      .setOrigin(0.5)
      .setDepth(Depth.UI + 1);

    let pressed = false;
    this.confirmBackground.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pressed = true;
      this.swallow(pointer);
    });
    this.confirmBackground.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasPressed = pressed;
      pressed = false;
      this.swallow(pointer);
      if (wasPressed) this.confirm();
    });
  }

  /** Only drawn when there is more than one character to move between. */
  private buildArrows(): void {
    if (this.characters.length < 2) return;
    const style = {
      fontFamily: 'Archivo Black',
      fontSize: '34px',
      color: '#ffdf57',
    } as const;
    const make = (label: string, delta: number): Phaser.GameObjects.Text =>
      this.add
        .text(0, 0, label, style)
        .setOrigin(0.5)
        .setDepth(Depth.UI)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', (pointer: Phaser.Input.Pointer) => {
          this.swallow(pointer);
          this.focus(stepIndex(this.index, this.characters.length, delta));
        });
    this.arrowLeft = make('‹', -1);
    this.arrowRight = make('›', 1);
  }

  private buildKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    keyboard.on('keydown-LEFT', () => this.move(-1));
    keyboard.on('keydown-A', () => this.move(-1));
    keyboard.on('keydown-RIGHT', () => this.move(1));
    keyboard.on('keydown-D', () => this.move(1));
    keyboard.on('keydown-ENTER', () => this.confirm());
    keyboard.on('keydown-SPACE', () => this.confirm());
  }

  // ----------------------------------------------------------------- input

  private swallow(pointer: Phaser.Input.Pointer): void {
    this.input.stopPropagation();
    pointer.event?.stopPropagation();
  }

  private move(delta: number): void {
    this.focus(stepIndex(this.index, this.characters.length, delta));
  }

  private focus(index: number): void {
    if (this.confirmed || index === this.index) return;
    this.index = index;
    this.applyLayout();
  }

  private confirm(): void {
    if (this.confirmed) return;
    const character = this.characters[this.index];
    if (!character) return;
    this.confirmed = true;
    selectCharacter(character.id);
    // Straight into the campaign's opening dialogue, which resolves the
    // selection through the character system from here on.
    this.scene.start('DialogueScene', { scriptId: 'metro-magician' });
  }

  // ------------------------------------------------------------ responsive

  private applyLayout(viewport?: ViewportInfo): void {
    const camera = this.cameras.main;
    const width = camera.width;
    const height = camera.height;
    const margin = viewport?.safeMargin ?? 24;

    this.title.setPosition(width / 2, Math.max(margin + 26, height * 0.13));

    const cardsY = height * 0.5;
    this.layout = computeCarouselLayout({
      count: this.characters.length,
      index: this.index,
      cardWidth: CARD_WIDTH,
      gap: CARD_GAP,
      viewportWidth: width,
    });
    this.track.setPosition(this.layout.trackX, cardsY);

    this.cards.forEach((card, index) => {
      card.root.setPosition(this.layout.cardCentres[index], 0);
      this.styleCard(card, index === this.index);
    });

    const confirmY = Math.min(height - margin - CONFIRM_HEIGHT / 2, height * 0.86);
    this.confirmBackground.setPosition(width / 2, confirmY);
    this.confirmLabel.setPosition(width / 2, confirmY);

    this.hint
      .setPosition(width / 2, confirmY - CONFIRM_HEIGHT / 2 - 22)
      .setText(this.hintText());

    // Just outside the focused card, so they never sit under it.
    const arrowX = CARD_WIDTH / 2 + 46;
    this.arrowLeft?.setPosition(Math.max(margin + 16, width / 2 - arrowX), cardsY);
    this.arrowRight?.setPosition(Math.min(width - margin - 16, width / 2 + arrowX), cardsY);
  }

  private hintText(): string {
    if (this.characters.length < 2) return 'ENTER OR TAP SELECT TO START';
    return '← → OR TAP A RUNNER   ·   ENTER TO START';
  }

  /**
   * Selection is shown on the card itself — border, tint and scale — never
   * through hover, so touch users see the same state as mouse users.
   */
  private styleCard(card: CharacterCard, selected: boolean): void {
    card.frame.setStrokeStyle(selected ? 4 : 3, selected ? 0xffdf57 : 0x3a2450);
    card.frame.setFillStyle(selected ? 0x1d1130 : 0x140c22);
    card.root.setScale(selected ? 1 : 0.92);
    card.root.setAlpha(selected ? 1 : 0.66);
    card.name.setColor(selected ? '#ffdf57' : '#c9b6e4');
    card.name.setPosition(0, CARD_HEIGHT / 2 - 30);

    // Fit the idle still inside the card without distorting it.
    const previewBoxHeight = CARD_HEIGHT - 92;
    const texture = card.preview.texture;
    const sourceHeight = texture?.getSourceImage()?.height ?? 0;
    const sourceWidth = texture?.getSourceImage()?.width ?? 0;
    if (sourceHeight > 0 && sourceWidth > 0) {
      const scale = Math.min(previewBoxHeight / sourceHeight, (CARD_WIDTH - 48) / sourceWidth);
      card.preview.setScale(scale);
    }
    card.preview.setPosition(0, CARD_HEIGHT / 2 - 52);
  }
}
