/*
 * Shared scoring, used by BOTH the browser (live play) and the Cloudflare
 * function (authoritative leaderboard score). One source of truth so the
 * numbers always match and the server can re-check what the client claims.
 */

export const BANDS = [
  { max: 150,  color: "var(--c0)", emoji: "🟦", label: "Common" },
  { max: 300,  color: "var(--c1)", emoji: "🟩", label: "Easy" },
  { max: 500,  color: "var(--c2)", emoji: "🟨", label: "Tricky" },
  { max: 700,  color: "var(--c3)", emoji: "🟧", label: "Rare" },
  { max: 900,  color: "var(--c4)", emoji: "🟥", label: "Exotic" },
  { max: 1001, color: "var(--c5)", emoji: "🟪", label: "Legendary" }
];

export function bandOf(points) {
  for (let i = 0; i < BANDS.length; i++) if (points < BANDS[i].max) return BANDS[i];
  return BANDS[5];
}

export function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Build a fast lookup (name + aliases) and the max rarity for one category.
// Two passes so a real name always beats an alias, and when an ambiguous alias
// (e.g. "football") is shared, the more common entry wins — entries are ordered
// by rarity ascending, so the first binding for a key is the most common one.
export function indexCategory(entries) {
  let maxR = 1;
  const lookup = {};
  for (const e of entries) {
    if (e.rarity > maxR) maxR = e.rarity;
    const k = norm(e.name);
    if (!(k in lookup)) lookup[k] = e;
  }
  for (const e of entries) {
    if (!e.aliases) continue;
    for (const a of e.aliases) {
      const k = norm(a);
      if (!(k in lookup)) lookup[k] = e;
    }
  }
  return { maxR, lookup };
}

// Turn an obscurity rank into 0..1000 points (accelerating curve).
export function pointsFor(rank, maxR) {
  return Math.round(20 + 980 * Math.pow((rank - 1) / (maxR - 1), 1.3));
}

// Point range for each rarity tier. Used by the deck generator's curated tiers
// and for answers the AI verifies at the end of a round.
export const TIER_POINTS = {
  common: [20, 140], easy: [160, 290], tricky: [310, 490],
  rare: [510, 690], exotic: [710, 890], legendary: [910, 1000],
};

// Inverse of pointsFor() on the deck's 1..1000 rarity scale.
export function rarityForPoints(p) {
  return Math.max(1, Math.min(1000, Math.round(1 + 999 * Math.pow((p - 20) / 980, 1 / 1.3))));
}

// Score a whole round from a list of raw answer strings. Returns the base
// score, the strategy bonuses, and the total. This is what the server runs.
// `extra` maps normalized answers to AI-verified entries ({ name, rarity }).
export function scoreRound(entries, answers, extra = {}) {
  const { maxR, lookup } = indexCategory(entries);
  const seen = new Set();
  const items = [];
  let base = 0;
  for (const raw of (answers || [])) {
    const key = norm(raw);
    if (!key) continue;
    const e = lookup[key] || extra[key];
    if (!e || seen.has(e.name)) continue;
    seen.add(e.name);
    const pts = pointsFor(e.rarity, maxR);
    items.push({ name: e.name, points: pts, band: bandOf(pts) });
    base += pts;
  }
  const count = items.length;
  const avg = count ? Math.round(base / count) : 0;
  const volume = count * 50;
  const purist = Math.round(avg * 3);
  const deepN = items.filter((i) => i.points >= 700).length;
  const deep = deepN * 300;
  const total = base + volume + purist + deep;
  return { items, base, count, avg, volume, purist, deep, deepN, total };
}
