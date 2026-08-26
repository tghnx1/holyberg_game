/**
 * Selection and layout maths for Character Select, kept free of Phaser so the
 * index behaviour can be tested for one, two and many characters without a
 * running game.
 *
 * The scene owns rendering and input; everything about *which* card is
 * focused and *where* the cards sit lives here.
 */

export class CharacterCarouselError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterCarouselError';
  }
}

/**
 * Guards the screen against having nothing to show. An empty playable list is
 * a build/asset problem — every character folder is incomplete, or none were
 * discovered — and rendering an empty carousel would hide that.
 */
export function assertSelectable<T>(characters: readonly T[]): void {
  if (characters.length === 0) {
    throw new CharacterCarouselError(
      'No playable characters were discovered. A character folder needs ' +
        'gameplay/idle.png, run, jump, crouch and damage frames, both ' +
        'dialogue portraits and dialogue/poses/metro_sit.png before it can be ' +
        'selected. Check the build warnings for what each folder is missing.',
    );
  }
}

/** Wraps into range, so moving past either end lands on the other. */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * Steps the focus by `delta`, wrapping around. With a single character every
 * move is a no-op, which is what makes the one-character screen feel
 * deliberate rather than broken.
 */
export function stepIndex(index: number, count: number, delta: number): number {
  return wrapIndex(index + delta, count);
}

export interface CarouselLayout {
  /**
   * X for the track container, chosen so the focused card lands on the
   * viewport centre. With one card that simply centres it.
   */
  trackX: number;
  /** Centre X of each card *within* the track, index-aligned. */
  cardCentres: number[];
  /** Width of all cards plus the gaps between them. */
  totalWidth: number;
  /** True when the cards cannot all fit, i.e. the track really scrolls. */
  scrolls: boolean;
}

export interface CarouselMetrics {
  count: number;
  index: number;
  cardWidth: number;
  gap: number;
  viewportWidth: number;
}

/**
 * Positions the track so the focused card is centred, whatever the count.
 *
 * Always centring — rather than only scrolling once the cards overflow —
 * keeps the focused card in the same place for every N, so the screen reads
 * the same with one character as with ten.
 */
export function computeCarouselLayout({
  count,
  index,
  cardWidth,
  gap,
  viewportWidth,
}: CarouselMetrics): CarouselLayout {
  const stride = cardWidth + gap;
  const cardCentres = Array.from({ length: count }, (_, i) => i * stride + cardWidth / 2);
  const totalWidth = count > 0 ? count * cardWidth + (count - 1) * gap : 0;
  const focused = cardCentres[wrapIndex(index, count)] ?? 0;
  return {
    trackX: viewportWidth / 2 - focused,
    cardCentres,
    totalWidth,
    scrolls: totalWidth > viewportWidth,
  };
}
