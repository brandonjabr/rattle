/*
 * POST /api/score   (Cloudflare Pages Function, bound to D1 as `env.DB`)
 *
 * Body: { categoryId, player, pid, answers: [string, ...], gameType: "daily_challenge" | "free_play" }
 * The server re-scores the answers from its own copy of the deck, so a player
 * can only earn points for real answers at their real values. It stores the
 * score and returns that mode's leaderboard for the day plus this player's rank.
 * A daily_challenge score must be for today's Daily Challenge category, and each
 * player (pid = anonymous browser id) gets one daily_challenge score per day.
 * A second one is refused with 409 { code: "daily_done" }; Free Play is unlimited.
 */
import { DECK } from "../../deck.js";
import { scoreRound, indexCategory, norm } from "../../scoring.js";
import { dailyCategoryId, dayNumber, dayString } from "../../schedule.js";

const GAME_TYPES = ["daily_challenge", "free_play"];
const GRACE_MS = 10 * 60 * 1000;   // a round started just before midnight UTC still counts for that day
const PID = /^[a-z0-9-]{8,64}$/i;
const DAILY_DONE = "You've already posted today's Daily Challenge. For the rest of the day you can only post Free Play scores.";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  const categoryId = String(body.categoryId || "");
  const player = cleanName(body.player);
  const pid = PID.test(String(body.pid || "")) ? String(body.pid) : null;
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 500).map(String) : [];

  const puzzle = DECK.find((d) => d.id === categoryId);
  if (!puzzle) return json({ error: "Unknown category" }, 400);

  const gameType = GAME_TYPES.includes(body.gameType) ? body.gameType : "free_play";
  let day = dayString(dayNumber());
  if (gameType === "daily_challenge") {
    const now = Date.now(), n = dayNumber(new Date(now));
    if (categoryId === dailyCategoryId(n)) day = dayString(n);
    else if (categoryId === dailyCategoryId(n - 1) && now - n * 86400000 < GRACE_MS) day = dayString(n - 1);
    else return json({ error: "That isn't today's Daily Challenge. Play it in Free Play instead." }, 400);
    if (!pid) return json({ error: "Please refresh the page and try again." }, 400);
    const done = await env.DB.prepare(
      "SELECT 1 FROM scores WHERE day=?1 AND pid=?2 AND game_type='daily_challenge' LIMIT 1"
    ).bind(day, pid).first();
    if (done) return json({ error: DAILY_DONE, code: "daily_done" }, 409);
  }

  const r = scoreRound(puzzle.entries, answers, await verifiedExtras(env, categoryId, puzzle.entries, answers));

  try {
    await env.DB.prepare(
      "INSERT INTO scores (category, game_type, day, player, pid, score, count, avg, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8, datetime('now'))"
    ).bind(categoryId, gameType, day, player, pid, r.total, r.count, r.avg).run();
  } catch (e) {
    // Two daily submits racing: the unique index lets only the first one in.
    if (/UNIQUE/i.test(String(e && e.message))) return json({ error: DAILY_DONE, code: "daily_done" }, 409);
    throw e;
  }

  // today's rank for this category and mode
  const betterToday = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM (SELECT player, MAX(score) s FROM scores WHERE category=?1 AND game_type=?2 AND day=?3 AND player!=?5 GROUP BY player) WHERE s > ?4"
  ).bind(categoryId, gameType, day, r.total, player).first();
  const rank = (betterToday?.c ?? 0) + 1;

  // all-time rank for this category and mode
  const betterAll = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM (SELECT player, MAX(score) s FROM scores WHERE category=?1 AND game_type=?2 AND player!=?4 GROUP BY player) WHERE s > ?3"
  ).bind(categoryId, gameType, r.total, player).first();
  const allTimeRank = (betterAll?.c ?? 0) + 1;

  const top = await topScores(env, categoryId, gameType, day);
  return json({ ok: true, player, gameType, day, total: r.total, count: r.count, avg: r.avg, rank, allTimeRank, top });
}

// Answers outside the deck count only if /api/verify already accepted them,
// so the client can't invent its own extra answers.
async function verifiedExtras(env, category, entries, answers) {
  const { lookup } = indexCategory(entries);
  const keys = [...new Set(answers.map(norm).filter((k) => k && !lookup[k]))].slice(0, 90);
  if (!keys.length) return {};
  const { results } = await env.DB.prepare(
    `SELECT answer, name, rarity FROM verified WHERE category = ?1 AND valid = 1 AND answer IN (${keys.map((_, i) => "?" + (i + 2)).join(",")})`
  ).bind(category, ...keys).all();
  const extra = {};
  for (const r of results || []) extra[r.answer] = { name: r.name, rarity: r.rarity };
  return extra;
}

async function topScores(env, category, gameType, day) {
  const { results } = await env.DB.prepare(
    "SELECT player, MAX(score) AS score FROM scores WHERE category=?1 AND game_type=?2 AND day=?3 GROUP BY player ORDER BY score DESC, player ASC LIMIT 20"
  ).bind(category, gameType, day).all();
  return results || [];
}

function cleanName(v) {
  const s = String(v || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 20);
  return s || "Anonymous";
}
function json(obj, status = 200) { return Response.json(obj, { status }); }
