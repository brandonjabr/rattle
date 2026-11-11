/*
 * Active players on the Daily Challenge (Cloudflare Pages Function, D1 = env.DB).
 *
 * POST /api/active  { pid }  records that this browser started today's Daily Challenge.
 *   Only the first start per player per day is stored, so replays don't inflate it.
 * GET  /api/active          { count } = distinct players who started in the last hour.
 *   Cached at the edge for 60 s, so the database sees about one read a minute per
 *   location no matter how many people have the page open.
 */
const PID = /^[a-z0-9-]{8,64}$/i;
const CACHE_SECONDS = 60;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const pid = String(body.pid || "");
  if (!PID.test(pid)) return json({ error: "Bad player id" }, 400);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO plays (day, pid, started_at) VALUES (?1, ?2, datetime('now'))"
  ).bind(new Date().toISOString().slice(0, 10), pid).run();
  return json({ ok: true });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL("/api/active", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const row = await env.DB.prepare(
    "SELECT COUNT(DISTINCT pid) AS c FROM plays WHERE started_at >= datetime('now', '-1 hour')"
  ).first();
  const res = Response.json({ count: row?.c ?? 0 }, {
    headers: { "Cache-Control": "public, max-age=" + CACHE_SECONDS },
  });
  waitUntil(cache.put(key, res.clone()));
  return res;
}

function json(obj, status = 200) { return Response.json(obj, { status }); }
