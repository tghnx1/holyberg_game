type Listener = (reservedWidth: number) => void;

/**
 * How much space, measured left from the safe-margin line at the top-right
 * corner, the pause/sound button row currently occupies. `PauseControl`
 * publishes the real, measured width of its own buttons here every time it
 * changes — on layout and on every mute toggle, since "SND ON"/"SND OFF"
 * aren't the same width — and anything anchoring its own UI to the right
 * edge (currently `HudSystem`'s SCORE label) subscribes so it can never
 * overlap the buttons, without either side knowing anything about the
 * other's scene, text, or exact geometry.
 */
class PauseHudReservedWidthImpl {
  private width = 0;
  private readonly listeners = new Set<Listener>();

  get value(): number {
    return this.width;
  }

  set(width: number): void {
    if (width === this.width) return;
    this.width = width;
    for (const listener of this.listeners) listener(width);
  }

  /** Returns an unsubscribe function. Fires immediately with the current value. */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.width);
    return () => this.listeners.delete(listener);
  }
}

export const PauseHudReservedWidth = new PauseHudReservedWidthImpl();
