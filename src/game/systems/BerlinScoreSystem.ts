export interface BerlinScoreBreakdown {
  base: number;
  collectibles: number;
  cleanSections: number;
  penalties: number;
}

export const CLEAN_SECTION_BONUS = 250;
export const OBSTACLE_SCORE_PENALTY = 100;

export class BerlinScoreSystem {
  readonly breakdown: BerlinScoreBreakdown = {
    base: 0,
    collectibles: 0,
    cleanSections: 0,
    penalties: 0,
  };
  get score(): number {
    return Math.max(
      0,
      Object.values(this.breakdown).reduce((sum, value) => sum + value, 0),
    );
  }
  addCollectible(points: number): void {
    this.breakdown.collectibles += points;
  }
  hitObstacle(): void {
    this.breakdown.penalties -= Math.min(OBSTACLE_SCORE_PENALTY, this.score);
  }
  awardCleanSection(): void {
    this.breakdown.cleanSections += CLEAN_SECTION_BONUS;
  }
  /**
   * Settles the run. Berlin has no running countdown any more (the clock
   * shown in the HUD is display-only), so this must not add anything on top
   * of `score` — doing so used to add a flat time bonus derived from the
   * unchanging start time, which silently bumped the score at the exact
   * moment the player stopped watching it update live.
   */
  finish(): number {
    return this.score;
  }
}
