/*
 * Daily Challenge schedule, shared by the page and the server (so the server can
 * check that a "daily_challenge" score really is for today's category).
 *
 * One category per UTC day. Each week runs Monday (easiest) to Sunday (hardest):
 * every weekday has its own difficulty band, and the category for that day is
 * picked at random from the band, seeded by the week so everyone gets the same one.
 * Within a band, every category is used once before any repeats.
 *
 * Adding a category: put its id in the band that matches its difficulty.
 * Never edit LEGACY or FIRST_WEEK; they keep past puzzle numbers stable.
 */

// Monday .. Sunday, easiest to hardest.
export const BANDS = [
  ["fruit", "country", "sport"],              // Mon
  ["dog", "pasta"],                           // Tue
  ["instrument", "language", "capital"],      // Wed
  ["president", "cheese"],                    // Thu
  ["cat", "element", "dinosaur"],             // Fri
  ["myth", "constellation"],                  // Sat
  ["horse", "moon"],                          // Sun
];

// Rattle #1 was Sunday 1 Nov 2026 (UTC).
export const LAUNCH_DAY = dayNumber(new Date(Date.UTC(2026, 10, 1)));

// Before the weekly schedule: #1..#10 (1-10 Nov 2026), as they were played.
const LEGACY = ["dog", "instrument", "myth", "sport", "fruit", "constellation", "cheese", "president",
  "dinosaur", "language"];
// First week of the weekly schedule, Wed 11 Nov .. Sun 15 Nov 2026.
const FIRST_WEEK = { "2026-11-11": "fruit", "2026-11-12": "dog", "2026-11-13": "president",
  "2026-11-14": "constellation", "2026-11-15": "moon" };

export function dayNumber(d = new Date()) {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}
export function dayString(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
export function puzzleNumber(d = new Date()) { return dayNumber(d) - LAUNCH_DAY + 1; }

// Category id of the Daily Challenge for a UTC day number.
export function dailyCategoryId(n = dayNumber()) {
  const num = n - LAUNCH_DAY + 1;
  if (num >= 1 && num <= LEGACY.length) return LEGACY[num - 1];
  const fixed = FIRST_WEEK[dayString(n)];
  if (fixed) return fixed;

  const weekday = (n + 3) % 7;              // day 0 (1 Jan 1970) was a Thursday; 0 = Monday
  const week = Math.floor((n + 3) / 7) - WEEKLY_START;
  const band = BANDS[weekday], k = band.length;
  if (week < 0 || k === 1) return band[0];
  // Each cycle is a fresh shuffle of the band. Walk the cycles from the start so the
  // same category never lands on this weekday two weeks running across a seam.
  let prev = FIRST_WEEK[dayString(n - 7 * (week + 1))] || null, cur;
  for (let c = 0; c <= Math.floor(week / k); c++) {
    cur = shuffle(band, 7919 * (weekday + 1) + c);
    // Also keep the first scheduled week clear of anything from the hand-picked one.
    const avoid = c === 0 ? [prev, ...Object.values(FIRST_WEEK)] : [prev];
    const i = cur.findIndex((id) => !avoid.includes(id));
    if (i > 0) [cur[0], cur[i]] = [cur[i], cur[0]];
    prev = cur[k - 1];
  }
  return cur[week % k];
}
// The weekly schedule starts on Monday 16 Nov 2026 (week 0).
const WEEKLY_START = Math.floor((dayNumber(new Date(Date.UTC(2026, 10, 16))) + 3) / 7);

function shuffle(arr, seed) {
  let a = seed >>> 0;
  const rand = () => {           // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
