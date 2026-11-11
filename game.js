/* Rattle, 60 second rarity rush (frontend) */
import { DECK } from "./deck.js";
import { BANDS, bandOf, norm, indexCategory, pointsFor } from "./scoring.js";
import { dailyCategoryId, dayNumber, dayString, puzzleNumber, LAUNCH_DAY } from "./schedule.js";

const TOTAL = 60;
const R = 52, C = 2 * Math.PI * R;
const $ = (id) => document.getElementById(id);

// ---- game modes ----
// "daily": the Daily Challenge, one category per UTC day for everyone (see schedule.js),
//          with its own global leaderboard.
// "free":  Free Play, any category, with a separate Free Play leaderboard.
let mode = "daily";
const GAME_TYPE = { daily: "daily_challenge", free: "free_play" };

// ---- active puzzle ----
let deckIndex = 0, P, CAT;      // CAT = { maxR, lookup }
function loadPuzzle(i) {
  deckIndex = ((i % DECK.length) + DECK.length) % DECK.length;
  P = DECK[deckIndex];
  CAT = indexCategory(P.entries);
  updateStartCard();
  if (mode === "free") try { localStorage.setItem("rattle-cat", P.id); } catch (e) {}
}
function dailyIndex() { return Math.max(0, DECK.findIndex((d) => d.id === dailyCategoryId())); }
function savedFreeIndex() {
  let id = null;
  try { id = localStorage.getItem("rattle-cat"); } catch (e) {}
  const i = DECK.findIndex((d) => d.id === id);
  return i >= 0 ? i : deckIndex;
}
function setMode(m, idx) {
  mode = m;
  $("modeDaily").classList.toggle("active", m === "daily");
  $("modeFree").classList.toggle("active", m === "free");
  loadPuzzle(m === "daily" ? dailyIndex() : idx ?? savedFreeIndex());
}

// ---- friend challenges: links like ?c=sport&s=4995&by=Sam ----
const challenge = readChallenge();
function readChallenge() {
  const q = new URLSearchParams(location.search);
  const idx = DECK.findIndex((d) => d.id === q.get("c"));
  const score = parseInt(q.get("s"), 10);
  if (idx < 0 || !(score > 0 && score < 1000000)) return null;
  const by = (q.get("by") || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 20);
  return { idx, id: DECK[idx].id, score, by };
}
const challenger = () => (challenge.by ? challenge.by + "'s" : "your friend's");

function updateStartCard() {
  const isDaily = mode === "daily";
  const label = $("catLabel");
  label.textContent = isDaily ? "Rattle #" + puzzleNumber() + " · Daily Challenge (Global)" : "Free Play · Your pick";
  label.classList.toggle("daily", isDaily);
  $("prevCat").classList.toggle("off", isDaily);
  $("nextCat").classList.toggle("off", isDaily);
  $("prevCat").disabled = $("nextCat").disabled = isDaily;
  $("modeHint").innerHTML = isDaily
    ? (dailyDoneToday()
        ? "You've posted today's score. Replays can only go on the <b>Free Play</b> leaderboard."
        : "Same category for everyone today. Easiest on Monday, hardest on Sunday.")
    : "<b>Choose any category</b> with the arrows. Scores go on the <b>Free Play</b> leaderboard.";
  $("countdown").hidden = !isDaily;
  $("startCategory").textContent = P.category + "!";
  const banner = $("challengeBanner");
  banner.hidden = !(challenge && challenge.id === P.id);
  if (!banner.hidden) {
    banner.innerHTML = "🎯&nbsp; <b>" + escapeHtml(challenge.by || "A friend") + "</b> scored <b>" + fmt(challenge.score) +
      "</b> on " + escapeHtml(P.category) + ". Can you beat it?";
  }
  const b = getBest();
  $("startBest").textContent = b ? "Your best: " + fmt(b) : "No score yet";
}

const startScreen = $("startScreen"), gameScreen = $("gameScreen"), resultsScreen = $("resultsScreen");
const guessEl = $("guess"), scoreEl = $("score"), countEl = $("count"), feedbackEl = $("feedback"),
      chipsEl = $("chips"), floatLayer = $("floatLayer"),
      ringFg = document.querySelector(".ring-fg"), timeNum = $("timeNum"), timerWrap = document.querySelector(".timer");

ringFg.style.strokeDasharray = C;
ringFg.style.strokeDashoffset = 0;

// ---- round state ----
let round = null, raf = null, lastRun = null, lastRank = null, lastAllRank = null;

function startRound() {
  if (mode === "daily") recordDailyStart();
  activeToast.hidden = true; document.body.classList.remove("has-toast");
  round = { items: [], names: {}, base: 0, pending: [], pendingKeys: {}, start: performance.now(), ended: false,
            daily: mode === "daily", number: puzzleNumber() };
  startScreen.hidden = true; resultsScreen.hidden = true; gameScreen.hidden = false;
  chipsEl.innerHTML = ""; scoreEl.textContent = "0"; countEl.textContent = "0";
  $("catSmall").textContent = P.category.toLowerCase();
  feedbackEl.textContent = "Go!"; feedbackEl.className = "feedback good";
  ringFg.setAttribute("class", "ring-fg"); timerWrap.classList.remove("pulse");
  guessEl.value = ""; guessEl.disabled = false; guessEl.focus();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}

function tick(now) {
  const remaining = Math.max(0, TOTAL - (now - round.start) / 1000);
  const frac = remaining / TOTAL;
  ringFg.style.strokeDashoffset = C * (1 - frac);
  timeNum.textContent = Math.ceil(remaining);
  ringFg.setAttribute("class", "ring-fg" + (frac <= 0.17 ? " low" : frac <= 0.42 ? " mid" : ""));
  if (remaining <= 10 && remaining > 0) timerWrap.classList.add("pulse"); else timerWrap.classList.remove("pulse");
  if (remaining <= 0) { endRound(); return; }
  raf = requestAnimationFrame(tick);
}

$("form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (!round || round.ended) return;
  const raw = guessEl.value, key = norm(raw);
  guessEl.value = "";
  if (!key) return;

  const entry = CAT.lookup[key];
  if (!entry) {
    // Not in the deck: keep it for the AI check at the end of the round.
    const text = raw.trim().slice(0, 40);
    if (round.pendingKeys[key]) { flash("Already saved: " + text, "warn"); return; }
    round.pendingKeys[key] = true;
    round.pending.push(text);
    addChip(escapeHtml(text), "?", null);
    flash("Saved for review: " + text, "pending");
    return;
  }
  if (round.names[entry.name]) { flash("Already got " + entry.name, "warn"); return; }

  const pts = pointsFor(entry.rarity, CAT.maxR), band = bandOf(pts);
  round.items.push({ name: entry.name, points: pts, band });
  round.names[entry.name] = true;
  round.base += pts;

  addChip(entry.name, pts, band);
  floatPoints(pts, band);
  if (pts >= 510) burst(chipsEl.firstChild, pts, band);
  scoreEl.textContent = fmt(round.base);
  scoreEl.classList.remove("bump"); void scoreEl.offsetWidth; scoreEl.classList.add("bump");
  countEl.textContent = round.items.length;
  flash("+" + pts + "  " + entry.name + (pts >= 700 ? "  🔥" : ""), "good");
});

function flash(msg, cls) { feedbackEl.textContent = msg; feedbackEl.className = "feedback " + cls; }
function addChip(name, pts, band) {
  const c = document.createElement("div");
  c.className = "chip" + (band ? "" : " pending");
  if (band) c.style.setProperty("--chip", band.color);
  c.innerHTML = name + ' <span class="pts">' + pts + "</span>";
  chipsEl.insertBefore(c, chipsEl.firstChild);
}
// Explosion for Rare (510+), bigger for Exotic (710+) and Legendary (910+).
function burst(el, pts, band) {
  const level = pts >= 910 ? 3 : pts >= 710 ? 2 : 1;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const colors = [band.color, band.color, "var(--c2)", level === 3 ? "var(--c5)" : band.color];
  const add = (cls, style, life) => {
    const d = document.createElement("div");
    d.className = cls; d.style.cssText = "left:" + x + "px;top:" + y + "px;" + style;
    floatLayer.appendChild(d);
    setTimeout(() => d.remove(), life);
    return d;
  };

  const n = [0, 16, 26, 40][level];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 45 + Math.random() * (35 + level * 30);
    add("spark" + (Math.random() < 0.35 ? " sq" : ""),
      "--c:" + colors[i % colors.length] + ";--dx:" + (Math.cos(a) * dist).toFixed(1) + "px;--dy:" + (Math.sin(a) * dist).toFixed(1) + "px;" +
      "--s:" + (5 + Math.random() * (3 + level * 2)).toFixed(1) + "px;--t:" + Math.round(550 + Math.random() * 350) + "ms;" +
      "--rot:" + Math.round(Math.random() * 540 - 270) + "deg", 1000);
  }
  for (let k = 0; k < level; k++) {
    add("shock", "--c:" + band.color + ";--k:" + (5 + level * 1.5 + k * 2) + ";animation-delay:" + k * 110 + "ms", 900 + k * 110);
  }
  add("burst-label" + (level === 3 ? " lv3" : ""), "--c:" + band.color, 1100).textContent = band.label.toUpperCase() + "!";

  el.classList.add("boom");
  if (level === 3) {
    const app = document.querySelector(".app");
    app.classList.remove("shake"); void app.offsetWidth; app.classList.add("shake");
  }
  if (navigator.vibrate) navigator.vibrate(level === 1 ? 15 : level === 2 ? [15, 30, 25] : [20, 30, 20, 30, 45]);
}
function floatPoints(pts, band) {
  const r = scoreEl.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "floatpt"; f.textContent = "+" + pts; f.style.color = band.color;
  f.style.left = (r.left + 6) + "px"; f.style.top = (r.top - 6) + "px";
  floatLayer.appendChild(f);
  setTimeout(() => f.remove(), 900);
}

// ---- end of round ----
function endRound() {
  if (round.ended) return;
  round.ended = true; cancelAnimationFrame(raf);
  guessEl.disabled = true; timerWrap.classList.remove("pulse");
  gameScreen.hidden = true; resultsScreen.hidden = false;
  lastRank = null; lastAllRank = null;

  const total = renderResults(0);
  if (total >= 3000) confetti();

  $("shareBtn").textContent = "Share result";
  $("shareBtn").onclick = doShare;

  // leaderboard
  resetLeaderboardUI();
  loadLeaderboard("today");

  renderReview(round.pending.map((answer) => ({ answer, state: "checking" })));
  if (round.pending.length) verifyPending();
}

// Totals, breakdown and haul for the current round. Counts up from `from`.
function renderResults(from) {
  const base = round.base, count = round.items.length;
  const avg = count ? Math.round(base / count) : 0;
  const volume = count * 50;
  const purist = Math.round(avg * 3);
  const deepN = round.items.filter((i) => i.points >= 700).length;
  const deep = deepN * 300;
  const total = base + volume + purist + deep;

  const dist = [0, 0, 0, 0, 0, 0];
  round.items.forEach((i) => { dist[BANDS.indexOf(i.band)]++; });

  const best = saveBest(total);
  // Verified answers are sent as typed: the server matches them against its own verified table.
  lastRun = { categoryId: P.id, answers: round.items.map((i) => i.raw || i.name), total, count, dist,
              daily: round.daily, number: round.number,
              gameType: round.daily && !round.freeOnly ? GAME_TYPE.daily : GAME_TYPE.free };

  $("finalSub").textContent = count + " named, avg " + avg + " pts" + (total >= best && total > 0 ? ", new best!" : ", best " + fmt(best));
  $("haul").innerHTML = haulCard(dist, round.items, count);
  const vs = $("challengeResult");
  vs.hidden = !(challenge && challenge.id === P.id);
  if (!vs.hidden) {
    const diff = total - challenge.score;
    vs.className = "challenge-result" + (diff > 0 ? " won" : "");
    vs.textContent = diff > 0 ? "🎉 You beat " + challenger() + " " + fmt(challenge.score) + "!"
      : diff === 0 ? "🤝 Tied with " + challenger() + " " + fmt(challenge.score) + "!"
      : fmt(-diff) + " short of " + challenger() + " " + fmt(challenge.score) + ". One more try?";
  }
  $("breakdown").innerHTML =
    row("Answers", base, count + " named") +
    row("Volume bonus", volume, "50 each") +
    row("Connoisseur bonus", purist, "avg " + avg) +
    row("Deep cuts", deep, deepN + " over 700 pts") +
    '<div class="brow total"><span>Total</span><span class="v" id="totalV">0</span></div>';
  animateCount($("finalScore"), from, total, 900);
  animateCount($("totalV"), from, total, 900);
  return total;
}

// ---- answers saved for review (checked by AI in one batch) ----
async function verifyPending() {
  const pendingRound = round;
  const btn = $("submitScore");
  btn.disabled = true; btn.textContent = "Checking answers...";
  let results = null;
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: P.id, answers: pendingRound.pending })
    });
    if (!res.ok) throw new Error("http " + res.status);
    results = (await res.json()).results;
  } catch (e) { /* shown as "couldn't check" below */ }
  if (round !== pendingRound) return;   // a new round started meanwhile

  const byKey = {};
  for (const r of results || []) byKey[norm(r.answer)] = r;
  const before = lastRun.total;
  const rows = pendingRound.pending.map((answer) => {
    const r = byKey[norm(answer)];
    if (!r || r.unchecked) return { answer, state: "unchecked" };
    if (!r.valid) return { answer, state: "rejected" };
    if (round.names[r.name]) return { answer, state: "duplicate", name: r.name };
    const pts = pointsFor(r.rarity, CAT.maxR), band = bandOf(pts);
    round.items.push({ name: r.name, points: pts, band, raw: answer });
    round.names[r.name] = true;
    round.base += pts;
    return { answer, state: "accepted", name: r.name, pts, band };
  });
  renderReview(rows);
  if (rows.some((x) => x.state === "accepted")) renderResults(before);

  if (btn.textContent === "Checking answers...") { btn.disabled = false; btn.textContent = postLabel(); }
}

function renderReview(rows) {
  const box = $("review");
  box.hidden = !rows.length;
  if (!rows.length) return;
  const checking = rows.some((x) => x.state === "checking");
  const label = {
    checking: () => '<span class="rv-state">checking…</span>',
    accepted: (x) => '<span class="rv-state ok" style="color:' + x.band.color + '">+' + x.pts + "</span>",
    rejected: () => '<span class="rv-state no">didn\'t count</span>',
    duplicate: (x) => '<span class="rv-state no">already had ' + escapeHtml(x.name) + "</span>",
    unchecked: () => '<span class="rv-state no">couldn\'t check</span>',
  };
  const icon = { checking: "⏳", accepted: "✅", rejected: "❌", duplicate: "↩️", unchecked: "⚠️" };
  box.innerHTML =
    '<div class="haul-title">' + (checking ? "Saved for review, checking " + rows.length + "…" : "Reviewed answers") + "</div>" +
    rows.map((x) =>
      '<div class="rv-row' + (x.state === "checking" ? " busy" : "") + '"><span class="rv-icon">' + icon[x.state] + "</span>" +
      '<span class="rv-answer">' + escapeHtml(x.answer) +
      (x.name && norm(x.name) !== norm(x.answer) && x.state === "accepted" ? ' <span class="rv-as">as ' + escapeHtml(x.name) + "</span>" : "") +
      "</span>" + label[x.state](x) + "</div>"
    ).join("");
}
function row(label, val, tag) {
  return '<div class="brow"><span>' + label + ' <span class="tag">' + tag + '</span></span><span class="v">+' + fmt(val) + "</span></div>";
}

// ---- leaderboard (Today = this category today, All time = this category ever) ----
let lbScope = "today", lbStickyNote = "";   // sticky = stays put while boards reload
function setTab(scope) {
  $("tabToday").classList.toggle("active", scope === "today");
  $("tabAll").classList.toggle("active", scope === "all");
}
function resetLeaderboardUI() {
  lbStickyNote = "";
  $("lbWrap").classList.remove("muted");
  $("lbTitle").textContent = lastRun && lastRun.daily ? "Daily Challenge leaderboard" : "Free Play leaderboard";
  $("nameInput").value = getName();
  $("submitScore").disabled = false;
  $("submitScore").textContent = "Post my score";
  $("lbNote").textContent = "";
  $("lbList").innerHTML = "";
  lbScope = "today"; setTab("today");
  // Already posted today's Daily Challenge: this replay can only go on Free Play.
  if (lastRun && lastRun.gameType === GAME_TYPE.daily && dailyDoneToday()) {
    postAsFreePlay("You've already posted today's Daily Challenge, so this round can only go on the Free Play leaderboard.");
  }
}
// One Daily Challenge score per player per day (enforced by the server too).
function dailyDoneToday() {
  try { return localStorage.getItem("rattle-daily-done") === dayString(dayNumber()); } catch (e) { return false; }
}
function markDailyDone(day) { try { localStorage.setItem("rattle-daily-done", day || dayString(dayNumber())); } catch (e) {} }
function postLabel() { return round && round.freeOnly ? "Post to Free Play" : "Post my score"; }
function postAsFreePlay(note) {
  lastRun.gameType = GAME_TYPE.free;
  if (round) round.freeOnly = true;
  $("lbTitle").textContent = "Free Play leaderboard";
  $("submitScore").disabled = false;
  $("submitScore").textContent = "Post to Free Play";
  $("lbNote").textContent = lbStickyNote = note;
}
async function loadLeaderboard(scope) {
  lbScope = scope; setTab(scope);
  if (!lastRun) return;
  try {
    const res = await fetch("/api/leaderboard?category=" + encodeURIComponent(lastRun.categoryId) +
      "&mode=" + lastRun.gameType + "&scope=" + scope);
    if (!res.ok) throw new Error("http " + res.status);
    const data = await res.json();
    renderBoard(data.top, getName());
    $("lbNote").textContent = lbStickyNote ||
      (data.top.length ? "" : (scope === "all" ? "No scores yet. Be the first." : "Be the first on today's board."));
  } catch (e) {
    $("lbList").innerHTML = "";
    $("lbNote").textContent = "Leaderboard is offline here. It works once deployed to Cloudflare (or via wrangler pages dev).";
    $("lbWrap").classList.add("muted");
  }
}
async function postScore() {
  if (!lastRun) return;
  const name = ($("nameInput").value.trim() || "Anonymous").slice(0, 20);
  setName(name);
  const btn = $("submitScore");
  btn.disabled = true; btn.textContent = "Posting...";
  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: lastRun.categoryId, player: name, pid: playerId(),
                             answers: lastRun.answers, gameType: lastRun.gameType })
    });
    if (res.status === 409) {
      // Server says today's Daily Challenge is already posted (e.g. from before
      // this browser remembered it). Offer Free Play instead.
      const err = await res.json().catch(() => ({}));
      markDailyDone();
      postAsFreePlay(err.error || "You've already posted today's Daily Challenge. For the rest of the day you can only post Free Play scores.");
      loadLeaderboard("today");
      updateStartCard();
      return;
    }
    if (res.status === 400) {
      // e.g. the Daily Challenge rolled over to a new category mid-round
      const err = await res.json().catch(() => ({}));
      btn.textContent = "Not posted";
      $("lbNote").textContent = err.error || "Could not post this score.";
      return;
    }
    if (!res.ok) throw new Error("http " + res.status);
    const data = await res.json();
    lbStickyNote = "";
    if (data.gameType === GAME_TYPE.daily) markDailyDone(data.day);
    lbScope = "today"; setTab("today");
    renderBoard(data.top, name);
    const allPart = data.allTimeRank ? ", #" + data.allTimeRank + " all time" : "";
    $("lbNote").textContent = "You are #" + data.rank + " today" + allPart +
      (data.gameType === GAME_TYPE.daily ? " in the Daily Challenge." : " in Free Play " + P.category.toLowerCase() + ".");
    btn.textContent = "Posted!";
    lastRank = data.rank; lastAllRank = data.allTimeRank || null;
    $("shareBtn").textContent = "Share my rank";
  } catch (e) {
    btn.disabled = false; btn.textContent = postLabel();
    $("lbNote").textContent = "Could not reach the leaderboard. Deploy to Cloudflare to enable it.";
  }
}
function renderBoard(top, myName) {
  const list = $("lbList");
  list.innerHTML = "";
  top.forEach((rowData, i) => {
    const li = document.createElement("li");
    const mine = myName && rowData.player === myName;
    li.className = "lb-row" + (mine ? " me" : "");
    li.innerHTML = '<span class="lb-rank">' + (i + 1) + '</span>' +
                   '<span class="lb-name">' + escapeHtml(rowData.player) + '</span>' +
                   '<span class="lb-score">' + fmt(rowData.score) + '</span>';
    list.appendChild(li);
  });
}

// ---- helpers ----
function fmt(n) { return n.toLocaleString("en-US"); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function animateCount(el, from, to, dur) {
  const t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
  // Safety: guarantee the final value even if animation frames are throttled.
  setTimeout(() => { el.textContent = fmt(to); }, dur + 80);
}
function confetti() {
  const wrap = $("confetti"); wrap.innerHTML = "";
  const cols = ["#5d81a8", "#6aaa64", "#c9a227", "#d07a3c", "#c4524a", "#8e6bb8", "#1d1b18"];
  for (let i = 0; i < 44; i++) {
    const s = document.createElement("i");
    s.style.left = Math.random() * 100 + "%";
    s.style.background = cols[i % cols.length];
    s.style.animationDuration = (1.6 + Math.random() * 1.6) + "s";
    s.style.animationDelay = (Math.random() * 0.5) + "s";
    s.style.transform = "rotate(" + (Math.random() * 360) + "deg)";
    wrap.appendChild(s);
  }
  setTimeout(() => { wrap.innerHTML = ""; }, 3600);
}
function copy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fb); else fb();
  function fb() { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); }
}

// Results haul: a mix bar plus one labelled row per rarity found, common -> legendary.
function haulCard(dist, items, count) {
  if (!count) return '<div class="haul-empty">Nothing this time. Give it another go!</div>';
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let bar = "", rows = "";
  BANDS.forEach((b, i) => {
    if (!dist[i]) return;
    bar += '<span style="flex:' + dist[i] + ';background:' + b.color + '"></span>';
    const names = items.filter((it) => it.band === b)
      .map((it) => esc(it.name.charAt(0).toUpperCase() + it.name.slice(1))).join(", ");
    rows += '<div class="hrow"><span class="hsq" style="background:' + b.color + '"></span>' +
      '<span class="hcount" style="color:' + b.color + '">' + dist[i] + '</span>' +
      '<span class="hmain"><span class="hlabel">' + b.label + '</span>' +
      '<span class="hnames">' + names + '</span></span></div>';
  });
  return '<div class="haul-title">Your haul, from common to legendary</div>' +
    '<div class="hbar">' + bar + '</div>' + rows;
}

// Share (uses the native share sheet on phones to pull friends in; copies otherwise).
function buildShareText() {
  // one labelled line per rarity found, common -> legendary
  const parts = [];
  for (let i = 0; i < BANDS.length; i++) {
    if (lastRun.dist[i]) parts.push(BANDS[i].emoji + " " + lastRun.dist[i] + " " + BANDS[i].label.toLowerCase());
  }
  let t = (lastRun.daily ? "Rattle #" + lastRun.number + " · " + P.category : "Rattle Free Play · " + P.category) + "\n\n";
  t += "I rattled off " + lastRun.count + " for " + fmt(lastRun.total) + " points! 🎉\n";
  t += "My haul, from common to legendary:\n" + parts.join("\n");
  if (lastRank) t += "\n\n🏆 #" + lastRank + " today" + (lastAllRank ? ", #" + lastAllRank + " all-time" : "") +
    (lastRun.gameType === GAME_TYPE.daily ? "." : " in Free Play.");
  return t + "\n\nCan you beat me? 👇\n" + challengeUrl();
}
// Link that opens this category with my score as the target to beat.
function challengeUrl() {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set("c", P.id);
  u.searchParams.set("s", lastRun.total);
  const name = getName();
  if (name) u.searchParams.set("by", name);
  return u.toString();
}
async function doShare() {
  if (!lastRun) return;
  const text = buildShareText();
  if (navigator.share) {
    try { await navigator.share({ title: "Rattle", text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  copy(text);
  $("shareBtn").textContent = "Copied!";
}

// Countdown to the next daily challenge (midnight UTC).
function msToNextUtcDay() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return next - now.getTime();
}
function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h + "h " + p(m) + "m " + p(sec) + "s";
}
let lastDay = dayNumber();
function tickCountdown() {
  const el = $("countdown");
  if (el) el.innerHTML = "New challenge in <b>" + fmtDur(msToNextUtcDay()) + "</b>";
  const d = dayNumber();
  if (d !== lastDay) {               // day rolled over: refresh the daily category
    lastDay = d;
    if (!startScreen.hidden && mode === "daily") loadPuzzle(dailyIndex());
  }
}
function bestKey() { return "rattle-best-" + P.id; }
function getBest() { try { return parseInt(localStorage.getItem(bestKey()) || "0", 10) || 0; } catch (e) { return 0; } }
function saveBest(total) { const b = getBest(); if (total > b) { try { localStorage.setItem(bestKey(), total); } catch (e) {} return total; } return b; }
function getName() { try { return localStorage.getItem("rattle-name") || ""; } catch (e) { return ""; } }
function setName(n) { try { localStorage.setItem("rattle-name", n); } catch (e) {} }

// ---- leaderboards screen: swipe between categories, Daily Challenge or Free Play ----
const boardsScreen = $("boardsScreen"), bdTrack = $("bdTrack"), bdChips = $("bdChips");
const boards = { mode: "daily", scope: "latest", cards: [], active: -1, cache: {} };
const MEDALS = ["🥇", "🥈", "🥉"];

function lastDailyDay(id) {
  for (let n = dayNumber(); n >= LAUNCH_DAY; n--) if (dailyCategoryId(n) === id) return n;
  return null;
}
function nextDailyDay(id) {
  const t = dayNumber();
  for (let n = t + 1; n < t + 180; n++) if (dailyCategoryId(n) === id) return n;
  return null;
}
function shortDate(n) {
  return new Date(n * 86400000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function openBoards() {
  startScreen.hidden = true; resultsScreen.hidden = true; boardsScreen.hidden = false;
  activeToast.hidden = true; document.body.classList.remove("has-toast");
  if (location.hash !== "#leaderboards") history.pushState({ boards: true }, "", "#leaderboards");
  window.scrollTo(0, 0);
  setBoards("daily", "latest", dailyCategoryId());
}
function closeBoards() {
  boardsScreen.hidden = true; startScreen.hidden = false;
  updateStartCard();
  updateActiveToast();
}

// ---- "N people are playing now": Daily Challenge starts in the last hour ----
const ACTIVE_MIN = 6;                       // show the notice when more than 5 are playing
const activeToast = $("activeToast");
let activeCount = 0, activeDismissed = false;
function playerId() {
  // Anonymous id kept in this browser, so a player counts once per day.
  try {
    let id = localStorage.getItem("rattle-pid");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      localStorage.setItem("rattle-pid", id);
    }
    return id;
  } catch (e) { return null; }
}
function recordDailyStart() {
  const pid = playerId();
  if (!pid) return;
  fetch("/api/active", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pid }), keepalive: true }).catch(() => {});
}
async function refreshActive() {
  if (document.hidden) return;
  try {
    const res = await fetch("/api/active");
    if (res.ok) activeCount = (await res.json()).count || 0;
  } catch (e) { /* offline: keep the last count */ }
  updateActiveToast();
}
function updateActiveToast() {
  const show = activeCount >= ACTIVE_MIN && !activeDismissed && !startScreen.hidden;
  if (show) {
    $("activeJoin").innerHTML = '<span class="live"></span><span><b>' + fmt(activeCount) +
      " people</b> are playing Rattle's daily challenge now! Join the fun and see where you rank!</span>";
  }
  activeToast.hidden = !show;
  document.body.classList.toggle("has-toast", show);   // room so it never covers the buttons
}

// Rebuild the cards for a mode + scope, landing on category `focusId`.
function setBoards(mode, scope, focusId) {
  boards.mode = mode; boards.scope = scope;
  $("bdDaily").classList.toggle("active", mode === "daily");
  $("bdFree").classList.toggle("active", mode === "free");
  $("bdLatest").classList.toggle("active", scope === "latest");
  $("bdAll").classList.toggle("active", scope === "all");
  $("bdLatest").textContent = mode === "daily" ? "Latest" : "Today";

  let cards = DECK.map((d, i) => ({ id: d.id, idx: i, category: d.category }));
  if (mode === "daily") {
    // Today's challenge first, then past dailies (most recent first), then upcoming ones.
    for (const c of cards) { c.last = lastDailyDay(c.id); c.next = c.last === null ? nextDailyDay(c.id) : null; }
    cards.sort((a, b) => (b.last ?? -1e9) - (a.last ?? -1e9) || (a.next ?? 1e9) - (b.next ?? 1e9));
  }
  boards.cards = cards;

  bdChips.innerHTML = cards.map((c, i) =>
    '<button class="bd-chip" role="tab" data-i="' + i + '">' +
    (mode === "daily" && c.last === dayNumber() ? '<span class="dot"></span>' : "") + escapeHtml(c.category) + "</button>").join("");
  bdTrack.innerHTML = cards.map((c, i) =>
    '<article class="bd-card" data-i="' + i + '">' + cardHead(c) + '<ol class="bd-list">' + skeleton() + "</ol></article>").join("");

  boards.active = -1;
  const i = Math.max(0, cards.findIndex((c) => c.id === focusId));
  requestAnimationFrame(() => { goToCard(i, false); setActiveCard(i); });
}

function cardHead(c) {
  const today = dayNumber();
  let kicker, live = false;
  if (boards.mode === "daily") {
    if (c.last === today) { kicker = "Today · Rattle #" + puzzleNumber(); live = true; }
    else if (boards.scope === "all") kicker = c.last !== null ? "Daily Challenge · All time" : "Daily Challenge";
    else if (c.last !== null) kicker = "Rattle #" + (c.last - LAUNCH_DAY + 1) + " · " + shortDate(c.last);
    else kicker = c.next ? "Coming " + shortDate(c.next) : "Not scheduled yet";
    if (live && boards.scope === "all") kicker = "Live today · All time";
  } else {
    kicker = boards.scope === "all" ? "Free Play · All time" : "Free Play · Today";
  }
  const isToday = boards.mode === "daily" && c.id === dailyCategoryId();
  return '<div class="bd-head"><div><div class="bd-kicker' + (live ? " live" : "") + '">' + kicker + "</div>" +
    '<div class="bd-cat">' + escapeHtml(c.category) + "</div></div>" +
    '<button class="bd-play" data-play="' + c.idx + '">' + (isToday ? "Play today" : "Free play") + " ›</button></div>";
}
function skeleton() {
  return Array.from({ length: 5 }, () => '<li class="bd-row skel"><span class="r">·</span><span class="n"></span><span class="s"></span></li>').join("");
}

function goToCard(i, smooth = true) {
  const card = bdTrack.children[i];
  if (!card) return;
  bdTrack.scrollTo({ left: card.offsetLeft - (bdTrack.clientWidth - card.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" });
}
function setActiveCard(i) {
  if (i === boards.active) return;
  boards.active = i;
  [...bdTrack.children].forEach((el, k) => el.classList.toggle("active", k === i));
  [...bdChips.children].forEach((el, k) => {
    el.classList.toggle("active", k === i);
    el.setAttribute("aria-selected", k === i);
  });
  const chip = bdChips.children[i];
  if (chip) bdChips.scrollTo({ left: chip.offsetLeft - (bdChips.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  $("bdPrev").disabled = i === 0;
  $("bdNext").disabled = i === boards.cards.length - 1;
  for (const k of [i, i + 1, i - 1]) if (boards.cards[k]) loadCard(k);
}

// Which leaderboard a card shows, or null when there is nothing to fetch.
function cardQuery(c) {
  if (boards.mode === "free") return "mode=free_play&scope=" + (boards.scope === "all" ? "all" : "today");
  if (boards.scope === "all") return "mode=daily_challenge&scope=all";
  return c.last === null ? null : "mode=daily_challenge&scope=today&day=" + dayString(c.last);
}
async function loadCard(i) {
  const c = boards.cards[i], q = cardQuery(c), want = boards.mode + boards.scope;
  const list = bdTrack.children[i]?.querySelector(".bd-list");
  if (!list) return;
  if (!q) { list.outerHTML = emptyCard(c); return; }
  const key = c.id + "|" + q, hit = boards.cache[key];
  let top;
  if (hit && Date.now() - hit.t < 30000) top = hit.top;
  else {
    try {
      const res = await fetch("/api/leaderboard?category=" + encodeURIComponent(c.id) + "&" + q);
      if (!res.ok) throw new Error("http " + res.status);
      top = (await res.json()).top || [];
      boards.cache[key] = { t: Date.now(), top };
    } catch (e) {
      top = null;
    }
  }
  // The user may have switched mode or scope while this was loading.
  if (boards.mode + boards.scope !== want || boards.cards[i] !== c) return;
  const cur = bdTrack.children[i]?.querySelector(".bd-list, .bd-empty");
  if (!cur) return;
  if (top === null) { cur.outerHTML = '<div class="bd-empty"><span class="big">📡</span>Leaderboards are offline right now.</div>'; return; }
  if (!top.length) { cur.outerHTML = emptyCard(c); return; }
  const me = getName();
  cur.outerHTML = '<ol class="bd-list">' + top.map((r, k) =>
    '<li class="bd-row' + (k < 3 ? " top" : "") + (k === 0 ? " first" : "") + (me && r.player === me ? " me" : "") + '">' +
    '<span class="r">' + (MEDALS[k] || k + 1) + '</span><span class="n">' + escapeHtml(r.player) + "</span>" +
    '<span class="s">' + fmt(r.score) + "</span></li>").join("") + "</ol>";
}
function emptyCard(c) {
  const today = dayNumber();
  let msg;
  if (boards.mode === "daily" && boards.scope === "latest" && c.last === null)
    msg = c.next ? "Not a Daily Challenge yet. It's coming " + shortDate(c.next) + ".<br>Warm up in Free Play." : "Not a Daily Challenge yet.";
  else if (boards.mode === "daily" && boards.scope === "latest" && c.last !== today) msg = "Nobody posted a score that day.";
  else if (boards.scope === "latest") msg = "No scores yet today.<br>Be the first!";
  else msg = "No scores yet.<br>Be the first!";
  return '<div class="bd-empty"><span class="big">🏁</span>' + msg + "</div>";
}

let bdScrollRaf = 0;
bdTrack.addEventListener("scroll", () => {
  cancelAnimationFrame(bdScrollRaf);
  bdScrollRaf = requestAnimationFrame(() => {
    const mid = bdTrack.scrollLeft + bdTrack.clientWidth / 2;
    let best = 0, bestD = Infinity;
    [...bdTrack.children].forEach((el, k) => {
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (d < bestD) { bestD = d; best = k; }
    });
    setActiveCard(best);
  });
}, { passive: true });
bdChips.addEventListener("click", (e) => {
  const b = e.target.closest(".bd-chip");
  if (b) goToCard(+b.dataset.i);
});
bdTrack.addEventListener("click", (e) => {
  const b = e.target.closest(".bd-play");
  if (b) {
    const idx = +b.dataset.play;
    closeBoards();
    if (location.hash === "#leaderboards") history.replaceState(null, "", location.pathname + location.search);
    if (boards.mode === "daily" && DECK[idx].id === dailyCategoryId()) setMode("daily"); else setMode("free", idx);
    return;
  }
  const card = e.target.closest(".bd-card");
  if (card && +card.dataset.i !== boards.active) goToCard(+card.dataset.i);
});
const activeId = () => boards.cards[boards.active]?.id;
$("bdPrev").addEventListener("click", () => goToCard(boards.active - 1));
$("bdNext").addEventListener("click", () => goToCard(boards.active + 1));
$("bdDaily").addEventListener("click", () => setBoards("daily", boards.scope, activeId()));
$("bdFree").addEventListener("click", () => setBoards("free", boards.scope, activeId()));
$("bdLatest").addEventListener("click", () => setBoards(boards.mode, "latest", activeId()));
$("bdAll").addEventListener("click", () => setBoards(boards.mode, "all", activeId()));
$("boardsBtn").addEventListener("click", openBoards);
$("boardsBack").addEventListener("click", () => {
  if (history.state && history.state.boards) history.back(); else { closeBoards(); history.replaceState(null, "", location.pathname + location.search); }
});
window.addEventListener("popstate", () => {
  if (location.hash === "#leaderboards") { if (boardsScreen.hidden) openBoards(); }
  else if (!boardsScreen.hidden) closeBoards();
});
document.addEventListener("keydown", (e) => {
  if (boardsScreen.hidden) return;
  if (e.key === "ArrowLeft") goToCard(boards.active - 1);
  if (e.key === "ArrowRight") goToCard(boards.active + 1);
});

// ---- wire up ----
$("startBtn").addEventListener("click", startRound);
$("prevCat").addEventListener("click", () => loadPuzzle(deckIndex - 1));
$("nextCat").addEventListener("click", () => loadPuzzle(deckIndex + 1));
$("againBtn").addEventListener("click", () => { updateStartCard(); resultsScreen.hidden = true; startScreen.hidden = false; updateActiveToast(); });
$("activeJoin").addEventListener("click", () => {
  activeDismissed = true; updateActiveToast();
  setMode("daily");
  $("startBtn").focus();
});
$("activeClose").addEventListener("click", () => { activeDismissed = true; updateActiveToast(); });
$("submitScore").addEventListener("click", postScore);
$("modeDaily").addEventListener("click", () => setMode("daily"));
$("modeFree").addEventListener("click", () => setMode("free"));
$("tabToday").addEventListener("click", () => loadLeaderboard("today"));
$("tabAll").addEventListener("click", () => loadLeaderboard("all"));
$("howBtn").addEventListener("click", () => { $("howModal").hidden = false; });
$("closeHow").addEventListener("click", () => { $("howModal").hidden = true; });
$("howModal").addEventListener("click", function (e) { if (e.target === this) this.hidden = true; });

// ---- boot ----
// Open on today's Daily Challenge. A friend's challenge link opens the Daily Challenge
// if it is today's category, otherwise Free Play on that category.
if (challenge && challenge.idx !== dailyIndex()) setMode("free", challenge.idx);
else setMode("daily");
if (location.hash === "#leaderboards") openBoards();
refreshActive();
setInterval(refreshActive, 2 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshActive(); });
tickCountdown();
setInterval(tickCountdown, 1000);
