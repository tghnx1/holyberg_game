export type GameState = 'intro' | 'running' | 'gameOver' | 'won';
export interface BerlinProgress {
  state: GameState;
  seconds: number;
  score: number;
}
