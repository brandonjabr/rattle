-- Rattle migration 0004: one Daily Challenge score per player per day.
-- `pid` is the anonymous browser id (the same one the "N people playing" count uses).
-- The partial unique index makes the database itself refuse a second daily score,
-- even if two submits race. Free Play is unaffected.
-- Run once:
--   npx wrangler d1 execute rattle-db --remote --file=./migrations/0004_one_daily.sql

ALTER TABLE scores ADD COLUMN pid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_daily
  ON scores (day, pid) WHERE game_type = 'daily_challenge' AND pid IS NOT NULL;
