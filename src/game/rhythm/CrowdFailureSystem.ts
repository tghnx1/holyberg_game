import { CROWD_FAILURE_SECONDS } from './constants';

export class CrowdFailureSystem {
  private zeroSince: number | null = null;

  update(energy: number, songTime: number): boolean {
    if (energy > 0) {
      this.zeroSince = null;
      return false;
    }
    this.zeroSince ??= songTime;
    return songTime - this.zeroSince >= CROWD_FAILURE_SECONDS;
  }

  reset(): void {
    this.zeroSince = null;
  }
}
