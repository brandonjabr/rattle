/*
 * GET /api/leaderboard?category=fruit&mode=daily_challenge|free_play&scope=today|all[&day=YYYY-MM-DD]
 * Returns the top 20 scores (best per player) for a category in one game mode.
 * Daily Challenge and Free Play scores share the scores table but never mix.
 *   scope=today (default): just today's board (resets daily, UTC)
 *   scope=all:             all-time board for that category and mode
 */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "";
  const mode = url.searchParams.get("mode") === "free_play" ? "free_play" : "daily_challenge";
  const scope = url.searchParams.get("scope") === "all" ? "all" : "today";
  const day = url.searchParams.get("day") || new Date().toISOString().slice(0, 10);

  const stmt = scope === "all"
    ? env.DB.prepare(
        "SELECT player, MAX(score) AS score FROM scores WHERE category=?1 AND game_type=?2 GROUP BY player ORDER BY score DESC, player ASC LIMIT 20"
      ).bind(category, mode)
    : env.DB.prepare(
        "SELECT player, MAX(score) AS score FROM scores WHERE category=?1 AND game_type=?2 AND day=?3 GROUP BY player ORDER BY score DESC, player ASC LIMIT 20"
      ).bind(category, mode, day);

  const { results } = await stmt.all();
  return Response.json({ ok: true, category, mode, scope, day, top: results || [] });
}
