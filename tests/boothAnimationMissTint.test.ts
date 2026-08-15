import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Vector2 {
    constructor(
      public x = 0,
      public y = 0,
    ) {}
  }

  return {
    default: {
      Math: { Vector2 },
    },
  };
});

type StubGameObject = {
  add: (child?: unknown) => StubGameObject;
  setAlpha: (value: number) => StubGameObject;
  setAngle: (value: number) => StubGameObject;
  setDepth: (value: number) => StubGameObject;
  setFlipX: (value: boolean) => StubGameObject;
  setOrigin: (x: number, y?: number) => StubGameObject;
  setPosition: (x: number, y: number) => StubGameObject;
  setRotation: (value: number) => StubGameObject;
  setScale: (x: number, y?: number) => StubGameObject;
  setStrokeStyle: (lineWidth: number, color: number, alpha?: number) => StubGameObject;
  setTint: (color: number) => StubGameObject;
  clearTint: () => StubGameObject;
  destroy: (destroyChildren?: boolean) => void;
};

function createGameObject(): StubGameObject {
  const object = {} as StubGameObject;
  object.add = vi.fn(() => object);
  object.setAlpha = vi.fn(() => object);
  object.setAngle = vi.fn(() => object);
  object.setDepth = vi.fn(() => object);
  object.setFlipX = vi.fn(() => object);
  object.setOrigin = vi.fn(() => object);
  object.setPosition = vi.fn(() => object);
  object.setRotation = vi.fn(() => object);
  object.setScale = vi.fn(() => object);
  object.setStrokeStyle = vi.fn(() => object);
  object.setTint = vi.fn(() => object);
  object.clearTint = vi.fn(() => object);
  object.destroy = vi.fn();
  return object;
}

function createSceneStub(): {
  add: {
    container: () => StubGameObject;
    rectangle: () => StubGameObject;
    circle: () => StubGameObject;
  };
  tweens: {
    add: () => { pause: () => void; resume: () => void; stop: () => void };
    killTweensOf: () => void;
  };
  time: {
    delayedCall: (delay: number, callback: () => void) => { remove: (destroy?: boolean) => void };
  };
} {
  const root = createGameObject();
  return {
    add: {
      container: vi.fn(() => root),
      rectangle: vi.fn(() => createGameObject()),
      circle: vi.fn(() => createGameObject()),
    },
    tweens: {
      add: vi.fn(() => ({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn() })),
      killTweensOf: vi.fn(),
    },
    time: {
      delayedCall: vi.fn((delay: number, callback: () => void) => {
        const timeout = setTimeout(callback, delay);
        return {
          remove: () => clearTimeout(timeout),
        };
      }),
    },
  };
}

describe('RhythmBoothAnimation MISS tint', () => {
  it('clears the MISS tint even if a deck kick happens before recovery', async () => {
    vi.useFakeTimers();
    try {
      const { RhythmBoothAnimation } = await import('../src/game/rhythm/RhythmBoothAnimation') as typeof import('../src/game/rhythm/RhythmBoothAnimation');
      const scene = createSceneStub();
      const leftImage = createGameObject();
      const rightImage = createGameObject();
      const animation = new RhythmBoothAnimation(
        scene as never,
        640,
        leftImage as never,
        rightImage as never,
      );

      animation.flashMiss();
      animation.reactLane(0);
      await vi.advanceTimersByTimeAsync(189);
      expect(leftImage.clearTint).not.toHaveBeenCalled();
      expect(rightImage.clearTint).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(leftImage.clearTint).toHaveBeenCalledOnce();
      expect(rightImage.clearTint).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
