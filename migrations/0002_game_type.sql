-- Rattle migration 0002: split leaderboards into Daily Challenge and Free Play.
-- Run once on the existing database:
--   npx wrangler d1 execute rattle-db --remote --file=./migrations/0002_game_type.sql

ALTER TABLE scores ADD COLUMN game_type TEXT NOT NULL DEFAULT 'free_play'
  CHECK (game_type IN ('daily_challenge', 'free_play'));

-- Existing scores for the category that was the daily on that day were Daily Challenge
-- plays; everything else was free play. (#1..#10 = 1..10 Nov 2026.)
UPDATE scores SET game_type = 'daily_challenge'
WHERE (day, category) IN (VALUES
    ('2026-11-01', 'dog'),
    ('2026-11-02', 'instrument'),
    ('2026-11-03', 'myth'),
    ('2026-11-04', 'sport'),
    ('2026-11-05', 'fruit'),
    ('2026-11-06', 'constellation'),
    ('2026-11-07', 'cheese'),
    ('2026-11-08', 'president'),
    ('2026-11-09', 'dinosaur'),
    ('2026-11-10', 'language'));

DROP INDEX IF EXISTS idx_board;
CREATE INDEX IF NOT EXISTS idx_board ON scores (category, game_type, day, score DESC);
