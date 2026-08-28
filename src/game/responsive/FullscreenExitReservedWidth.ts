type Listener = (reservedWidth: number) => void;

/**
 * How much space, measured left from the safe-margin line at the top-right
 * corner, the fullscreen exit "✕" currently occupies — its real, measured
 * width while visible, zero while hidden (it only shows during fullscreen).
 * `attachFullscreenExitControl` publishes it on every visibility change and
 * resize; anything else anchored to that corner (currently the pause/sound
 * HUD row, on desktop only) subscribes so it can shift clear of the ✕
 * without either module knowing about the other's scene or geometry.
 */
class FullscreenExitReservedWidthImpl {
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

export const FullscreenExitReservedWidth = new FullscreenExitReservedWidthImpl();
