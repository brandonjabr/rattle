/*
 * GET  /api/daily-run[?pid=...]   today's Daily Challenge run for this player:
 *        { run: {...} | null, posted: { score } | null }
 * POST /api/daily-run  { pid?, run }   save/replace it (also accepts sendBeacon text bodies).
 *
 * The browser keeps its run in local storage too; this copy is what lets "you've already
 * played today" survive when the browser won't keep site data. Players are identified by
 * the anonymous browser id, or, when the browser has none, by a hash of the connection
 * (the same stand-in the score API uses). The run is for display only: scores are
 * always re-checked by /api/score.
 */
import { dailyCategoryId, dayNumber, dayString } from "../../schedule.js";

const PID = /^[a-z0-9-]{8,64}$/i;
const MAX_BYTES = 16000;

export async function onRequestGet({ request, env }) {
  const pid = await identity(request, new URL(request.url).searchParams.get("pid"));
  const day = dayString(dayNumber());
  const row = await env.DB.prepare("SELECT data FROM daily_runs WHERE day=?1 AND pid=?2 AND cat=?3")
    .bind(day, pid, dailyCategoryId()).first();
  let run = null;
  try { run = row ? JSON.parse(row.data) : null; } catch (e) {}
  // Scores posted before runs were stored: at least report that today's daily is done.
  const best = run ? null : await env.DB.prepare(
    "SELECT MAX(score) AS s FROM scores WHERE day=?1 AND pid=?2 AND game_type='daily_challenge'"
  ).bind(day, pid).first();
  return Response.json({ run, posted: best && best.s != null ? { score: best.s } : null },
    { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: "Bad JSON" }, 400); }
  const run = body && body.run;
  const day = dayString(dayNumber());
  if (!run || run.day !== day || run.cat !== dailyCategoryId()) return json({ error: "Not today's Daily Challenge" }, 400);
  const data = JSON.stringify(run);
  if (data.length > MAX_BYTES) return json({ error: "Too big" }, 413);

  const pid = await identity(request, body.pid);
  // Never let a later save "un-post" or "un-end" a run.
  const prev = await env.DB.prepare("SELECT data FROM daily_runs WHERE day=?1 AND pid=?2").bind(day, pid).first();
  if (prev) {
    try {
      const p = JSON.parse(prev.data);
      if (p.posted && !run.posted) return json({ ok: true, kept: "posted" });
      if (p.ended && !run.ended) return json({ ok: true, kept: "ended" });
    } catch (e) {}
  }
  await env.DB.prepare(
    "INSERT INTO daily_runs (day, pid, cat, data, updated_at) VALUES (?1,?2,?3,?4, datetime('now')) " +
    "ON CONFLICT(day, pid) DO UPDATE SET cat=excluded.cat, data=excluded.data, updated_at=excluded.updated_at"
  ).bind(day, pid, run.cat, data).run();
  return json({ ok: true });
}

// The browser's anonymous id, or a stand-in hashed from the connection when it has none.
async function identity(request, pid) {
  if (PID.test(String(pid || ""))) return String(pid);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = request.headers.get("User-Agent") || "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("rattle|" + ip + "|" + ua));
  return "h-" + [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function json(obj, status = 200) { return Response.json(obj, { status }); }
