import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PauseHudReservedWidth } from '../src/game/systems/pause/PauseHudReservedWidth';

describe('PauseHudReservedWidth', () => {
  beforeEach(() => {
    PauseHudReservedWidth.set(0);
  });

  it('starts at zero and reflects the last published width', () => {
    expect(PauseHudReservedWidth.value).toBe(0);
    PauseHudReservedWidth.set(180);
    expect(PauseHudReservedWidth.value).toBe(180);
  });

  it('notifies subscribers only on an actual change, immediately with the current value', () => {
    const listener = vi.fn();
    const unsubscribe = PauseHudReservedWidth.onChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(0);

    PauseHudReservedWidth.set(0);
    expect(listener).toHaveBeenCalledTimes(1);

    PauseHudReservedWidth.set(220);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(220);

    unsubscribe();
    PauseHudReservedWidth.set(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('lets a late subscriber (e.g. a scene HUD built after the buttons attach) pick up the current width immediately', () => {
    PauseHudReservedWidth.set(240);
    const listener = vi.fn();
    PauseHudReservedWidth.onChange(listener);
    expect(listener).toHaveBeenCalledWith(240);
  });
});
