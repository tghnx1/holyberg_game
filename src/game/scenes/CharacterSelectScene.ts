import Phaser from 'phaser';
import { Depth } from '../constants';
import { queueCharacterPreview } from '../characters/characterAssets';
import {
  assertSelectable,
  CAROUSEL_SWIPE_THRESHOLD,
  computeCarouselLayout,
  resolveCarouselDragRelease,
  stepIndex,
  wheelStep,
  type CarouselLayout,
} from '../characters/characterCarousel';
import type { CharacterDefinition } from '../characters/characterManifest';
import { getPlayableCharacters } from '../characters/characterRegistry';
import { selectCharacter } from '../characters/characterSelection';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import { UI_COLORS, UI_FONTS, uiHeadingStyle, uiSecondaryStyle } from '../ui/theme';
import { responsiveFontSize } from '../ui/mobileTypography';

const CARD_WIDTH = 236;
const CARD_HEIGHT = 304;
const CARD_GAP = 28;
/** Slop around the confirm button's visible box, for fingers. */
const TOUCH_PADDING = 18;
const CONFIRM_WIDTH = 268;
const CONFIRM_HEIGHT = 62;
const WHEEL_DELTA_THRESHOLD = 12;
const WHEEL_DEBOUNCE_MS = 240;
const WHEEL_GESTURE_GAP_MS = 140;
const CAROUSEL_SNAP_DURATION_MS = 180;

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
  /** Menu screen, not gameplay. */
  static readonly pausable = false;

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
  /** Touch drag state is intentionally scene-owned, so cards can reject its release. */
  private carouselPointer?: { id: number; startX: number; startTrackX: number; dragged: boolean };
  /** Covers both Phaser pointer-up dispatch orders: card first or scene first. */
  private dragReleasePointerIds = new Set<number>();
  private wheelDelta = 0;
  private lastWheelAt = -Infinity;
  private wheelBlockedUntil = -Infinity;

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
    this.cameras.main.setBackgroundColor(UI_COLORS.background);
    attachFullscreenExitControl(this);

    this.buildBackdrop();
    this.buildTitle();
    this.buildCards();
    this.buildConfirm();
    this.buildArrows();
    this.buildKeyboard();
    this.buildCarouselGestures();

    new OrientationController(this, { onLayout: (viewport) => this.applyLayout(viewport) });
    this.applyLayout();
  }

  // ------------------------------------------------------------------ build

  /** A soft vignette so the cards sit on something, matching the game's palette. */
  private buildBackdrop(): void {
    const glow = this.add.graphics().setDepth(Depth.FAR_BACKGROUND);
    glow.fillStyle(UI_COLORS.accentDimNumber, 0.22);
    glow.fillCircle(0, 0, 420);
    glow.setPosition(0, 0);
    this.add.existing(glow);
    glow.setData('isBackdrop', true);
  }

  private buildTitle(): void {
    this.title = this.add
      .text(0, 0, 'CHOOSE YOUR RUNNER', uiHeadingStyle('44px', { strokeThickness: 7 }))
      .setOrigin(0.5)
      .setDepth(Depth.UI);

    this.hint = this.add
      .text(0, 0, '', uiSecondaryStyle('15px'))
      .setOrigin(0.5)
      .setDepth(Depth.UI);
  }

  private buildCards(): void {
    this.track = this.add.container(0, 0).setDepth(Depth.GAMEPLAY);
    this.characters.forEach((character, index) => {
      const frame = this.add
        .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, UI_COLORS.panelNumber)
        .setStrokeStyle(3, UI_COLORS.accentDimNumber);
      const preview = this.add.image(0, 0, character.gameplay.idle?.key ?? '').setOrigin(0.5, 1);
      const name = this.add
        .text(0, 0, character.name.toUpperCase(), {
          fontFamily: UI_FONTS.body,
          fontSize: '20px',
          fontStyle: 'bold',
          color: UI_COLORS.textPrimary,
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
          if (this.isCarouselDrag(pointer)) return;
          this.focus(index);
        });
      this.track.add(root);
      this.cards.push({ character, root, frame, preview, name });
    });
  }

  private buildConfirm(): void {
    this.confirmBackground = this.add
      .rectangle(0, 0, CONFIRM_WIDTH, CONFIRM_HEIGHT, UI_COLORS.accentNumber)
      .setOrigin(0.5)
      .setStrokeStyle(2, UI_COLORS.accentBrightNumber, 0.9)
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
        fontFamily: UI_FONTS.body,
        fontSize: '24px',
        fontStyle: 'bold',
        color: UI_COLORS.background,
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
      fontFamily: UI_FONTS.display,
      fontSize: '34px',
      color: UI_COLORS.accent,
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

  /**
   * Wheel/trackpad and touch both feed the existing one-card `move` path.
   * Keeping gesture recognition here lets card taps remain simple and avoids
   * a second carousel state machine.
   */
  private buildCarouselGestures(): void {
    this.input.on('pointerdown', this.onCarouselPointerDown, this);
    this.input.on('pointermove', this.onCarouselPointerMove, this);
    this.input.on('pointerup', this.onCarouselPointerUp, this);
    this.input.on('pointerupoutside', this.onCarouselPointerUp, this);
    this.input.on('wheel', this.onCarouselWheel, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onCarouselPointerDown, this);
      this.input.off('pointermove', this.onCarouselPointerMove, this);
      this.input.off('pointerup', this.onCarouselPointerUp, this);
      this.input.off('pointerupoutside', this.onCarouselPointerUp, this);
      this.input.off('wheel', this.onCarouselWheel, this);
      this.carouselPointer = undefined;
      this.dragReleasePointerIds.clear();
      this.wheelDelta = 0;
    });
  }

  // ----------------------------------------------------------------- input

  private swallow(pointer: Phaser.Input.Pointer): void {
    this.input.stopPropagation();
    pointer.event?.stopPropagation();
  }

  private move(delta: number): void {
    this.focus(stepIndex(this.index, this.characters.length, delta));
  }

  private onCarouselPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.characters.length < 2 || !this.isInCarouselBand(pointer)) return;
    this.dragReleasePointerIds.delete(pointer.id);
    this.tweens.killTweensOf(this.track);
    this.carouselPointer = {
      id: pointer.id,
      startX: pointer.x,
      startTrackX: this.track.x,
      dragged: false,
    };
  }

  private onCarouselPointerMove(pointer: Phaser.Input.Pointer): void {
    const gesture = this.carouselPointer;
    if (!gesture || gesture.id !== pointer.id) return;
    // Mark this before pointerup so a card's own pointerup handler cannot
    // mistake a swipe release for a selection.
    if (Math.abs(pointer.x - gesture.startX) >= CAROUSEL_SWIPE_THRESHOLD) gesture.dragged = true;
    if (gesture.dragged) this.track.setX(gesture.startTrackX + pointer.x - gesture.startX);
  }

  private onCarouselPointerUp(pointer: Phaser.Input.Pointer): void {
    const gesture = this.carouselPointer;
    if (!gesture || gesture.id !== pointer.id) return;
    const nextIndex = resolveCarouselDragRelease({
      index: this.index,
      count: this.characters.length,
      startTrackX: gesture.startTrackX,
      trackX: this.track.x,
      cardCentres: this.layout.cardCentres,
      viewportWidth: this.cameras.main.width,
    });
    if (gesture.dragged) this.dragReleasePointerIds.add(pointer.id);
    this.carouselPointer = undefined;
    if (gesture.dragged) this.snapToIndex(nextIndex, true);
  }

  private onCarouselWheel(
    _pointer: Phaser.Input.Pointer,
    _objects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
  ): void {
    if (this.characters.length < 2) return;
    const now = this.time.now;
    if (now - this.lastWheelAt > WHEEL_GESTURE_GAP_MS) this.wheelDelta = 0;
    this.lastWheelAt = now;
    const rawStep = wheelStep(deltaX, deltaY);
    if (rawStep === 0) return;
    const dominant = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
    this.wheelDelta += dominant;
    if (Math.abs(this.wheelDelta) < WHEEL_DELTA_THRESHOLD || now < this.wheelBlockedUntil) return;

    this.move(this.wheelDelta > 0 ? 1 : -1);
    this.wheelDelta = 0;
    this.wheelBlockedUntil = now + WHEEL_DEBOUNCE_MS;
  }

  private isInCarouselBand(pointer: Phaser.Input.Pointer): boolean {
    return Math.abs(pointer.y - this.track.y) <= CARD_HEIGHT / 2;
  }

  private isCarouselDrag(pointer: Phaser.Input.Pointer): boolean {
    return (
      (this.carouselPointer?.id === pointer.id && this.carouselPointer.dragged) ||
      this.dragReleasePointerIds.has(pointer.id)
    );
  }

  private focus(index: number): void {
    if (this.confirmed || index === this.index) return;
    this.index = index;
    this.applyLayout(undefined, true);
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

  private applyLayout(viewport?: ViewportInfo, animateTrack = false): void {
    const camera = this.cameras.main;
    const width = camera.width;
    const height = camera.height;
    const margin = viewport?.safeMargin ?? 24;

    this.title.setFontSize(responsiveFontSize(44, viewport, 'heading'));
    this.hint
      .setFontSize(responsiveFontSize(15, viewport, 'body'))
      .setWordWrapWidth(Math.max(1, width - margin * 2), true)
      .setAlign('center');
    this.confirmLabel.setFontSize(responsiveFontSize(24, viewport, 'button'));
    this.cards.forEach((card) =>
      card.name.setFontSize(responsiveFontSize(20, viewport, 'body')),
    );
    this.arrowLeft?.setFontSize(responsiveFontSize(34, viewport, 'button'));
    this.arrowRight?.setFontSize(responsiveFontSize(34, viewport, 'button'));

    this.title.setPosition(width / 2, Math.max(margin + 26, height * 0.13));

    const cardsY = height * 0.5;
    this.layout = computeCarouselLayout({
      count: this.characters.length,
      index: this.index,
      cardWidth: CARD_WIDTH,
      gap: CARD_GAP,
      viewportWidth: width,
    });
    this.track.setY(cardsY);
    if (animateTrack) this.snapTrack(this.layout.trackX);
    else this.track.setX(this.layout.trackX);

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
    return 'SWIPE OR SCROLL   ·   ← → OR TAP A RUNNER   ·   ENTER TO START';
  }

  /** Applies selection styling then eases the live track back to that card. */
  private snapToIndex(index: number, animate: boolean): void {
    if (this.confirmed) return;
    this.index = index;
    this.applyLayout(undefined, animate);
  }

  private snapTrack(targetX: number): void {
    this.tweens.killTweensOf(this.track);
    this.tweens.add({
      targets: this.track,
      x: targetX,
      duration: CAROUSEL_SNAP_DURATION_MS,
      ease: 'Cubic.Out',
    });
  }

  /**
   * Selection is shown on the card itself — border, tint and scale — never
   * through hover, so touch users see the same state as mouse users.
   */
  private styleCard(card: CharacterCard, selected: boolean): void {
    card.frame.setStrokeStyle(
      selected ? 4 : 3,
      selected ? UI_COLORS.accentBrightNumber : UI_COLORS.accentDimNumber,
    );
    card.frame.setFillStyle(selected ? UI_COLORS.panelRaisedNumber : UI_COLORS.panelNumber);
    card.root.setScale(selected ? 1 : 0.92);
    card.root.setAlpha(selected ? 1 : 0.66);
    card.name.setColor(selected ? UI_COLORS.accentBright : UI_COLORS.textSecondary);
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
