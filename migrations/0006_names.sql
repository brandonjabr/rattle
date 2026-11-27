-- Rattle migration 0006: unique leaderboard names. A name belongs to the first player
-- (anonymous browser id, or connection hash) who posts a score with it; matching ignores
-- capitals and extra spaces. Starts empty: names are claimed on their next post.
-- Run once:
--   npx wrangler d1 execute rattle-db --remote --file=./migrations/0006_names.sql

CREATE TABLE IF NOT EXISTS names (
  name_key   TEXT PRIMARY KEY,   -- lower-case, spaces collapsed
  name       TEXT NOT NULL,      -- as first typed
  pid        TEXT NOT NULL,      -- owner
  created_at TEXT NOT NULL
);
