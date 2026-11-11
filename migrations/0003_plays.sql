-- Rattle migration 0003: who started today's Daily Challenge, for the "N people are
-- playing now" notice. One row per anonymous player per day, so replays don't count twice.
-- Run once:
--   npx wrangler d1 execute rattle-db --remote --file=./migrations/0003_plays.sql

CREATE TABLE IF NOT EXISTS plays (
  day        TEXT NOT NULL,   -- "YYYY-MM-DD" (UTC) of the Daily Challenge
  pid        TEXT NOT NULL,   -- random id kept in the player's browser (no personal data)
  started_at TEXT NOT NULL,   -- first start that day, datetime('now') UTC
  PRIMARY KEY (day, pid)
);
CREATE INDEX IF NOT EXISTS idx_plays_started ON plays (started_at);
