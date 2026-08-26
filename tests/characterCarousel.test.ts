import { describe, expect, it } from 'vitest';
import {
  assertSelectable,
  CharacterCarouselError,
  computeCarouselLayout,
  stepIndex,
  wrapIndex,
} from '../src/game/characters/characterCarousel';

const metrics = (count: number, index: number) => ({
  count,
  index,
  cardWidth: 240,
  gap: 28,
  viewportWidth: 1280,
});

describe('empty playable list', () => {
  it('fails with a developer-facing explanation rather than rendering nothing', () => {
    expect(() => assertSelectable([])).toThrow(CharacterCarouselError);
    expect(() => assertSelectable([])).toThrow(/gameplay\/idle\.png/);
  });

  it('accepts any non-empty list', () => {
    expect(() => assertSelectable(['atmos'])).not.toThrow();
  });
});

describe('index wrapping', () => {
  it('leaves an in-range index alone', () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(2, 3)).toBe(2);
  });

  it('wraps past either end', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-4, 3)).toBe(2);
  });

  it('never divides by a zero count', () => {
    expect(wrapIndex(5, 0)).toBe(0);
  });
});

describe('navigation', () => {
  it('moves forward and back with N = many', () => {
    expect(stepIndex(0, 5, 1)).toBe(1);
    expect(stepIndex(3, 5, -1)).toBe(2);
  });

  it('wraps around at both ends', () => {
    expect(stepIndex(4, 5, 1)).toBe(0);
    expect(stepIndex(0, 5, -1)).toBe(4);
  });

  it('alternates with N = 2', () => {
    expect(stepIndex(0, 2, 1)).toBe(1);
    expect(stepIndex(1, 2, 1)).toBe(0);
    expect(stepIndex(0, 2, -1)).toBe(1);
  });

  it('is a no-op with N = 1, so a single character cannot look broken', () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, 1, -1)).toBe(0);
    for (let i = 0; i < 10; i += 1) expect(stepIndex(0, 1, i)).toBe(0);
  });

  it('returns to where it started after a full lap', () => {
    let index = 0;
    for (let i = 0; i < 4; i += 1) index = stepIndex(index, 4, 1);
    expect(index).toBe(0);
  });
});

describe('layout', () => {
  it('centres the only card when N = 1', () => {
    const layout = computeCarouselLayout(metrics(1, 0));
    expect(layout.trackX + layout.cardCentres[0]).toBe(640);
    expect(layout.totalWidth).toBe(240);
    expect(layout.scrolls).toBe(false);
  });

  it('centres whichever card is focused', () => {
    for (const index of [0, 1, 2]) {
      const layout = computeCarouselLayout(metrics(3, index));
      expect(layout.trackX + layout.cardCentres[index]).toBeCloseTo(640);
    }
  });

  it('spaces cards by width plus gap', () => {
    const layout = computeCarouselLayout(metrics(3, 0));
    expect(layout.cardCentres[1] - layout.cardCentres[0]).toBe(268);
    expect(layout.totalWidth).toBe(3 * 240 + 2 * 28);
  });

  it('reports whether the track actually overflows', () => {
    expect(computeCarouselLayout(metrics(4, 0)).scrolls).toBe(false);
    expect(computeCarouselLayout(metrics(8, 0)).scrolls).toBe(true);
  });

  it('handles a large N without special-casing', () => {
    const layout = computeCarouselLayout(metrics(25, 24));
    expect(layout.cardCentres).toHaveLength(25);
    expect(layout.trackX + layout.cardCentres[24]).toBeCloseTo(640);
  });
});
