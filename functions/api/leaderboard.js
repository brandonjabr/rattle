/*
 * GET /api/leaderboard?category=fruit&scope=today|all[&day=YYYY-MM-DD]
 * Returns the top 20 scores (best per player) for a category.
 *   scope=today (default): just today's board (resets daily, UTC)
 *   scope=all:             all-time board for that category
 */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "";
  const scope = url.searchParams.get("scope") === "all" ? "all" : "today";
  const day = url.searchParams.get("day") || new Date().toISOString().slice(0, 10);

  const stmt = scope === "all"
    ? env.DB.prepare(
        "SELECT player, MAX(score) AS score FROM scores WHERE category=?1 GROUP BY player ORDER BY score DESC, player ASC LIMIT 20"
      ).bind(category)
    : env.DB.prepare(
        "SELECT player, MAX(score) AS score FROM scores WHERE category=?1 AND day=?2 GROUP BY player ORDER BY score DESC, player ASC LIMIT 20"
      ).bind(category, day);

  const { results } = await stmt.all();
  return Response.json({ ok: true, category, scope, day, top: results || [] });
}
