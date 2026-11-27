-- Rattle migration 0007: fix names claimed over someone else's existing scores.
-- When name claims launched (0006) the names table started empty, so a name already on
-- the leaderboard could be claimed by a different player. This releases those claims
-- (the score API now checks existing scores before claiming), and adds an index for
-- that check.
-- Run once:
--   npx wrangler d1 execute rattle-db --remote --file=./migrations/0007_name_cleanup.sql

CREATE INDEX IF NOT EXISTS idx_scores_player ON scores (player COLLATE NOCASE);

DELETE FROM names WHERE EXISTS (
  SELECT 1 FROM scores s
  WHERE s.player = names.name COLLATE NOCASE
    AND s.pid IS NOT NULL AND s.pid != names.pid
    AND s.created_at < names.created_at
);
