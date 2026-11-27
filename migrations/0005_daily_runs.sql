-- Rattle migration 0005: keep each player's Daily Challenge run on the server, so
-- "you've already played today" survives refreshes even when the browser won't
-- keep site data (Safari "Block All Cookies", in-app browsers, private windows).
-- Run once:
--   npx wrangler d1 execute rattle-db --remote --file=./migrations/0005_daily_runs.sql

CREATE TABLE IF NOT EXISTS daily_runs (
  day        TEXT NOT NULL,   -- "YYYY-MM-DD" (UTC)
  pid        TEXT NOT NULL,   -- anonymous browser id, or a connection hash if the browser keeps none
  cat        TEXT NOT NULL,   -- the day's Daily Challenge category
  data       TEXT NOT NULL,   -- JSON: answers, review, posted/rank (display only; scores are re-checked on post)
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, pid)
);
