import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {
  Scene: class {},
  Geom: { Rectangle: class {
    constructor(readonly x: number, readonly y: number, readonly width: number, readonly height: number) {}
    static Contains = vi.fn();
  } },
} }));

import { CharacterSelectScene } from '../src/game/scenes/CharacterSelectScene';
import { getPlayableCharacters } from '../src/game/characters/characterRegistry';
import { computeCarouselLayout } from '../src/game/characters/characterCarousel';

type Pointer = { id: number; x: number; y: number; event: { stopPropagation: () => void } };
class DisplayObject {
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  input?: { hitArea: { x: number; y: number; width: number; height: number } };
  listeners = new Map<string, (pointer: Pointer) => void>();
  setDepth() { return this; }
  setOrigin() { return this; }
  setStrokeStyle() { return this; }
  setSize(width: number, height: number) { this.width = width; this.height = height; return this; }
  setInteractive(input: NonNullable<DisplayObject['input']>) { this.input = input; return this; }
  setX(x: number) { this.x = x; return this; }
  add() { return this; }
  on(event: string, callback: (pointer: Pointer) => void) { this.listeners.set(event, callback); return this; }
}

function setup() {
  const current = new CharacterSelectScene();
  const containers: DisplayObject[] = [];
  const start = vi.fn();
  Object.assign(current, {
    characters: getPlayableCharacters(),
    add: {
      container: () => { const root = new DisplayObject(); containers.push(root); return root; },
      rectangle: () => new DisplayObject(), image: () => new DisplayObject(), text: () => new DisplayObject(),
    },
    input: { stopPropagation: vi.fn() },
    scene: { start }, cameras: { main: { width: 1280 } },
    tweens: { killTweensOf: vi.fn() },
  });
  current['buildCards']();
  current['layout'] = computeCarouselLayout({ count: current['characters'].length, index: 0, cardWidth: 236, gap: 28, viewportWidth: 1280 });
  current['track'].x = current['layout'].trackX;
  const layout = vi.fn();
  Object.assign(current, { applyLayout: layout });
  return { current, cards: containers.slice(1), start, layout };
}

const pointer = (x: number): Pointer => ({ id: 1, x, y: 0, event: { stopPropagation: vi.fn() } });

describe('character card input', () => {
  it('covers the full drawn card after Phaser adds its display origin', () => {
    // Given the scene-created cards.
    const { cards } = setup();
    // When Phaser transforms drawn local positions into its hit coordinates.
    for (const card of cards) {
      const hit = card.input?.hitArea;
      if (!hit) throw new Error('Missing card hit area');
      // Then all four visible corners fall inside the hit rectangle.
      for (const x of [-card.width / 2 + 1, card.width / 2 - 1]) {
        for (const y of [-card.height / 2 + 1, card.height / 2 - 1]) {
          expect(x + card.width / 2).toBeGreaterThanOrEqual(hit.x);
          expect(x + card.width / 2).toBeLessThan(hit.x + hit.width);
          expect(y + card.height / 2).toBeGreaterThanOrEqual(hit.y);
          expect(y + card.height / 2).toBeLessThan(hit.y + hit.height);
        }
      }
    }
  });

  it('focuses a tapped side card and ends the gesture without starting gameplay', () => {
    // Given a pointer down on a side card.
    const { current, cards, layout, start } = setup();
    const tap = pointer(300);
    Reflect.apply(current['onCarouselPointerDown'], current, [tap]);
    // When the card receives pointerup before the scene does.
    cards[1].listeners.get('pointerup')?.(tap);
    // Then it takes the existing animated layout path and releases the gesture.
    expect(current['index']).toBe(1);
    expect(layout).toHaveBeenCalledWith(undefined, true);
    expect(current['carouselPointer']).toBeUndefined();
    expect(start).not.toHaveBeenCalled();
  });

  it('snaps a real drag without treating its release over a card as a tap', () => {
    // Given a drag with its final move delivered only on pointerup.
    const { current, cards, layout, start } = setup();
    Reflect.apply(current['onCarouselPointerDown'], current, [pointer(300)]);
    const snap = vi.fn();
    Object.assign(current, { snapToIndex: snap });
    // When release lands on the side card.
    cards[1].listeners.get('pointerup')?.(pointer(180));
    // Then only drag snapping occurs, with no card focus or game start.
    expect(snap).toHaveBeenCalledTimes(1);
    expect(layout).not.toHaveBeenCalled();
    expect(current['carouselPointer']).toBeUndefined();
    expect(start).not.toHaveBeenCalled();
  });
});
