import { describe, expect, it, vi } from 'vitest';
import { buildLiveActorEditable } from '../src/game/dialogue/currentSceneLiveActorProxy';
import type { CurrentSceneLiveActor } from '../src/game/dialogue/currentSceneLiveStage';

function target(x = 0, y = 0) {
  return {
    x,
    y,
    scaleX: 1,
    scaleY: 1,
    setPosition(nextX: number, nextY: number) {
      this.x = nextX;
      this.y = nextY;
      return this;
    },
    setScale(nextX: number, nextY: number) {
      this.scaleX = nextX;
      this.scaleY = nextY;
      return this;
    },
  };
}

describe('current-scene live dialogue actors', () => {
  it('exposes the real clone through the existing EditableObject contract', () => {
    const sourceTarget = target(900, 400);
    const cloneTarget = target(300, 400);
    const onChange = vi.fn();
    const actor = {
      id: 'player',
      label: 'PLAYER',
      sourceScrollX: 600,
      sourceScrollY: 0,
      source: {
        id: 'player',
        target: sourceTarget,
        getNativeSize: () => ({ width: 100, height: 200 }),
        onChange,
      },
    } as unknown as CurrentSceneLiveActor;

    const editable = buildLiveActorEditable(actor, cloneTarget as never);
    expect(editable.id).toBe('player');
    expect(editable.target).toBe(cloneTarget);
    expect(editable.getNativeSize()).toEqual({ width: 100, height: 200 });

    editable.onChange?.({ x: 340, y: 410, scaleX: 1.2, scaleY: 1.2 });
    expect(sourceTarget).toMatchObject({ x: 940, y: 410, scaleX: 1.2, scaleY: 1.2 });
    expect(onChange).toHaveBeenCalledWith({ x: 940, y: 410, scaleX: 1.2, scaleY: 1.2 });
  });

  it('keeps each actor independently editable', () => {
    const first = target();
    const second = target();
    const definition = (id: string, sourceTarget: ReturnType<typeof target>) => ({
      id,
      label: id,
      sourceScrollX: 0,
      sourceScrollY: 0,
      source: { id, target: sourceTarget, getNativeSize: () => ({ width: 1, height: 1 }) },
    }) as unknown as CurrentSceneLiveActor;
    const a = buildLiveActorEditable(definition('a', first), target() as never);
    const b = buildLiveActorEditable(definition('b', second), target() as never);
    a.onChange?.({ x: 25, y: 35, scaleX: 2, scaleY: 2 });
    expect(first).toMatchObject({ x: 25, y: 35, scaleX: 2, scaleY: 2 });
    expect(second).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    expect(b.id).toBe('b');
  });
});
