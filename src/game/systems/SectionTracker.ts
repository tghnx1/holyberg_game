import { BERLIN_SECTIONS, sectionIndexAtX } from '../level/berlin/berlinLevelConfig';

export interface SectionTransition {
  changed: boolean;
  clean: boolean;
  label: string;
}

export class SectionTracker {
  index = 0;
  damaged = false;
  /** Reused so the per-frame call in BerlinScene.update allocates nothing. */
  private readonly result: SectionTransition = { changed: false, clean: false, label: '' };
  markDamage(): void {
    this.damaged = true;
  }
  update(x: number): SectionTransition {
    const next = sectionIndexAtX(x);
    const result = this.result;
    if (next === this.index) {
      result.changed = false;
      result.clean = false;
      result.label = BERLIN_SECTIONS[this.index].label;
      return result;
    }
    result.changed = true;
    result.clean = !this.damaged && next > this.index;
    result.label = BERLIN_SECTIONS[next].label;
    this.index = next;
    this.damaged = false;
    return result;
  }
}
