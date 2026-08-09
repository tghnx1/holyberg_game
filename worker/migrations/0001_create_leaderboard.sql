CREATE TABLE IF NOT EXISTS leaderboard (
  instagram TEXT PRIMARY KEY,
  best_score INTEGER NOT NULL CHECK(best_score >= 0 AND best_score <= 100000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK(verification_status IN ('verified', 'unverified'))
);

CREATE INDEX IF NOT EXISTS leaderboard_score_rank
  ON leaderboard(best_score DESC, instagram ASC);
