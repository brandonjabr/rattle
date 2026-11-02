-- Rattle leaderboard storage (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT    NOT NULL,   -- e.g. "fruit", "country"
  day        TEXT    NOT NULL,   -- "YYYY-MM-DD" (UTC); leaderboards reset daily
  player     TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  count      INTEGER NOT NULL,
  avg        INTEGER NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board ON scores (category, day, score DESC);
