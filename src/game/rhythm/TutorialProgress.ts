import type { Lane } from './types';

export class TutorialProgress {
  private index = 0;
  private readonly lanes: readonly Lane[] = [0, 1, 2, 3];
  get currentLane(): Lane | null { return this.lanes[this.index] ?? null; }
  get complete(): boolean { return this.index >= this.lanes.length; }
  hit(lane: Lane): boolean {
    if (lane !== this.currentLane) return false;
    this.index += 1;
    return true;
  }
}
