export interface BerlinScoreBreakdown {
  base: number;
  collectibles: number;
  cleanSections: number;
  penalties: number;
  timeBonus: number;
}

export const CLEAN_SECTION_BONUS = 250;
export const OBSTACLE_SCORE_PENALTY = 100;

export class BerlinScoreSystem {
  readonly breakdown: BerlinScoreBreakdown = {
    base: 0,
    collectibles: 0,
    cleanSections: 0,
    penalties: 0,
    timeBonus: 0,
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
  finish(seconds: number): number {
    this.breakdown.timeBonus = Math.ceil(Math.max(0, seconds)) * 20;
    return this.score;
  }
}
