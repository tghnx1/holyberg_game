import { BERLIN_SECTIONS, sectionIndexAtX } from '../level/berlin/berlinLevelConfig';

export class SectionTracker {
  index = 0;
  damaged = false;
  markDamage(): void {
    this.damaged = true;
  }
  update(x: number): { changed: boolean; clean: boolean; label: string } {
    const next = sectionIndexAtX(x);
    if (next === this.index)
      return { changed: false, clean: false, label: BERLIN_SECTIONS[this.index].label };
    const clean = !this.damaged && next > this.index;
    this.index = next;
    this.damaged = false;
    return { changed: true, clean, label: BERLIN_SECTIONS[next].label };
  }
}
