-- Rattle leaderboard storage (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT    NOT NULL,   -- e.g. "fruit", "country"
  game_type  TEXT    NOT NULL DEFAULT 'free_play'
             CHECK (game_type IN ('daily_challenge', 'free_play')),
  day        TEXT    NOT NULL,   -- "YYYY-MM-DD" (UTC); leaderboards reset daily
  player     TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  count      INTEGER NOT NULL,
  avg        INTEGER NOT NULL,
  created_at TEXT    NOT NULL
);

-- Fresh databases only. An existing one gets game_type from migrations/0002_game_type.sql.
CREATE INDEX IF NOT EXISTS idx_board ON scores (category, game_type, day, score DESC);

-- Answers the AI checked at the end of a round (one row per category + normalized
-- answer), so each new answer is judged once and the score API can trust it.
CREATE TABLE IF NOT EXISTS verified (
  category   TEXT    NOT NULL,
  answer     TEXT    NOT NULL,   -- normalized (scoring.js norm)
  valid      INTEGER NOT NULL,   -- 1 = counts, 0 = rejected
  name       TEXT,               -- display name when valid
  rarity     INTEGER,            -- 1..1000 deck rarity when valid
  created_at TEXT    NOT NULL,
  PRIMARY KEY (category, answer)
);
