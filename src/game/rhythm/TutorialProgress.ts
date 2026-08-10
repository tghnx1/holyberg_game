import type { RhythmAction } from './types';

export class TutorialProgress {
  private index = 0;
  private readonly actions: readonly RhythmAction[] = ['tapLeft', 'tapRight', 'swipeRight', 'holdFx'];
  get currentAction(): RhythmAction | null { return this.actions[this.index] ?? null; }
  get complete(): boolean { return this.index >= this.actions.length; }
  hit(action: RhythmAction): boolean {
    if (action !== this.currentAction) return false;
    this.index += 1;
    return true;
  }
}
