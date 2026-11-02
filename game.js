/* Rabbit Hole, 60 second rarity rush (frontend) */
import { DECK } from "./deck.js";
import { BANDS, bandOf, norm, indexCategory, pointsFor } from "./scoring.js";

const TOTAL = 60;
const R = 52, C = 2 * Math.PI * R;
const $ = (id) => document.getElementById(id);

// ---- active puzzle ----
let deckIndex = 0, P, CAT;      // CAT = { maxR, lookup }
function loadPuzzle(i) {
  deckIndex = ((i % DECK.length) + DECK.length) % DECK.length;
  P = DECK[deckIndex];
  CAT = indexCategory(P.entries);
  updateStartCard();
  try { localStorage.setItem("rattle-cat", deckIndex); } catch (e) {}
}
// The category of the day is the same for everyone (chosen by UTC date), so the
// daily leaderboard is one shared board.
function dayNumber(d = new Date()) {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}
function dailyIndex() { return ((dayNumber() % DECK.length) + DECK.length) % DECK.length; }

function updateStartCard() {
  const isDaily = deckIndex === dailyIndex();
  const label = $("catLabel");
  label.textContent = isDaily ? "⭐ Today's challenge" : "Category (free play)";
  label.classList.toggle("daily", isDaily);
  $("dailyJump").hidden = isDaily;
  $("startCategory").textContent = P.category + "!";
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
  round = { items: [], names: {}, base: 0, misses: 0, start: performance.now(), ended: false };
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
  if (!entry) { round.misses++; flash("Not on the list: " + raw.trim(), "bad"); return; }
  if (round.names[entry.name]) { flash("Already got " + entry.name, "warn"); return; }

  const pts = pointsFor(entry.rarity, CAT.maxR), band = bandOf(pts);
  round.items.push({ name: entry.name, points: pts, band });
  round.names[entry.name] = true;
  round.base += pts;

  addChip(entry.name, pts, band);
  floatPoints(pts, band);
  scoreEl.textContent = fmt(round.base);
  scoreEl.classList.remove("bump"); void scoreEl.offsetWidth; scoreEl.classList.add("bump");
  countEl.textContent = round.items.length;
  flash("+" + pts + "  " + entry.name + (pts >= 700 ? "  🔥" : ""), "good");
});

function flash(msg, cls) { feedbackEl.textContent = msg; feedbackEl.className = "feedback " + cls; }
function addChip(name, pts, band) {
  const c = document.createElement("div");
  c.className = "chip"; c.style.setProperty("--chip", band.color);
  c.innerHTML = name + ' <span class="pts">' + pts + "</span>";
  chipsEl.insertBefore(c, chipsEl.firstChild);
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

  const base = round.base, count = round.items.length;
  const avg = count ? Math.round(base / count) : 0;
  const volume = count * 50;
  const purist = Math.round(avg * 3);
  const deepN = round.items.filter((i) => i.points >= 700).length;
  const deep = deepN * 300;
  const total = base + volume + purist + deep;

  const dist = [0, 0, 0, 0, 0, 0];
  round.items.forEach((i) => { dist[BANDS.indexOf(i.band)]++; });
  const haul = BANDS.map((b, i) => dist[i] ? b.emoji + dist[i] : "").filter(Boolean).join("  ");

  const best = saveBest(total);
  lastRun = { categoryId: P.id, answers: round.items.map((i) => i.name), total, count, haul, dist };
  lastRank = null; lastAllRank = null;

  gameScreen.hidden = true; resultsScreen.hidden = false;
  $("finalSub").textContent = count + " named, avg " + avg + " pts" + (total >= best && total > 0 ? ", new best!" : ", best " + fmt(best));
  $("haul").innerHTML = haul || "nothing yet";
  $("breakdown").innerHTML =
    row("Answers", base, count + " named") +
    row("Volume bonus", volume, "50 each") +
    row("Connoisseur bonus", purist, "avg " + avg) +
    row("Deep cuts", deep, deepN + " over 700 pts") +
    '<div class="brow total"><span>Total</span><span class="v" id="totalV">0</span></div>';
  animateCount($("finalScore"), 0, total, 900);
  animateCount($("totalV"), 0, total, 900);
  if (total >= 3000) confetti();

  $("shareBtn").textContent = "Share result";
  $("shareBtn").onclick = doShare;

  // leaderboard
  resetLeaderboardUI();
  loadLeaderboard("today");
}
function row(label, val, tag) {
  return '<div class="brow"><span>' + label + ' <span class="tag">' + tag + '</span></span><span class="v">+' + fmt(val) + "</span></div>";
}

// ---- leaderboard (Today = this category today, All time = this category ever) ----
let lbScope = "today";
function setTab(scope) {
  $("tabToday").classList.toggle("active", scope === "today");
  $("tabAll").classList.toggle("active", scope === "all");
}
function resetLeaderboardUI() {
  $("lbWrap").classList.remove("muted");
  $("nameInput").value = getName();
  $("submitScore").disabled = false;
  $("submitScore").textContent = "Post my score";
  $("lbNote").textContent = "";
  $("lbList").innerHTML = "";
  lbScope = "today"; setTab("today");
}
async function loadLeaderboard(scope) {
  lbScope = scope; setTab(scope);
  if (!lastRun) return;
  try {
    const res = await fetch("/api/leaderboard?category=" + encodeURIComponent(lastRun.categoryId) + "&scope=" + scope);
    if (!res.ok) throw new Error("http " + res.status);
    const data = await res.json();
    renderBoard(data.top, getName());
    $("lbNote").textContent = data.top.length ? "" : (scope === "all" ? "No scores yet. Be the first." : "Be the first on today's board.");
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
      body: JSON.stringify({ categoryId: lastRun.categoryId, player: name, answers: lastRun.answers })
    });
    if (!res.ok) throw new Error("http " + res.status);
    const data = await res.json();
    lbScope = "today"; setTab("today");
    renderBoard(data.top, name);
    const allPart = data.allTimeRank ? ", #" + data.allTimeRank + " all time" : "";
    $("lbNote").textContent = "You are #" + data.rank + " today" + allPart + " in " + P.category.toLowerCase() + ".";
    btn.textContent = "Posted!";
    lastRank = data.rank; lastAllRank = data.allTimeRank || null;
    $("shareBtn").textContent = "Share my rank";
  } catch (e) {
    btn.disabled = false; btn.textContent = "Post my score";
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
  const cols = ["#2dd4bf", "#5fd36a", "#fbbf24", "#fb923c", "#ff6b8a", "#c084fc", "#ffffff"];
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

// Share (uses the native share sheet on phones to pull friends in; copies otherwise).
function buildShareText() {
  // one labelled line per rarity found, common -> legendary
  const parts = [];
  for (let i = 0; i < BANDS.length; i++) {
    if (lastRun.dist[i]) parts.push(BANDS[i].emoji + " " + lastRun.dist[i] + " " + BANDS[i].label.toLowerCase());
  }
  let t = "Rattle — Rattle off some " + P.category + "!\n\n";
  t += "I rattled off " + lastRun.count + " for " + fmt(lastRun.total) + " points! 🎉\n";
  t += "My haul, from common to legendary:\n" + parts.join("\n");
  if (lastRank) {
    t += "\n\n🏆 #" + lastRank + " today" + (lastAllRank ? ", #" + lastAllRank + " all-time" : "") +
         ". Your turn — can you beat me? 😄";
  } else {
    t += "\n\nCan you name more? 😄";
  }
  return t + "\nPlay free: " + location.href;
}
async function doShare() {
  if (!lastRun) return;
  const text = buildShareText();
  if (navigator.share) {
    try { await navigator.share({ title: "Rabbit Hole", text }); return; }
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
    if (!startScreen.hidden) loadPuzzle(dailyIndex());
  }
}
function bestKey() { return "rattle-best-" + P.id; }
function getBest() { try { return parseInt(localStorage.getItem(bestKey()) || "0", 10) || 0; } catch (e) { return 0; } }
function saveBest(total) { const b = getBest(); if (total > b) { try { localStorage.setItem(bestKey(), total); } catch (e) {} return total; } return b; }
function getName() { try { return localStorage.getItem("rattle-name") || ""; } catch (e) { return ""; } }
function setName(n) { try { localStorage.setItem("rattle-name", n); } catch (e) {} }

// ---- wire up ----
$("startBtn").addEventListener("click", startRound);
$("prevCat").addEventListener("click", () => loadPuzzle(deckIndex - 1));
$("nextCat").addEventListener("click", () => loadPuzzle(deckIndex + 1));
$("againBtn").addEventListener("click", () => { updateStartCard(); resultsScreen.hidden = true; startScreen.hidden = false; });
$("submitScore").addEventListener("click", postScore);
$("dailyJump").addEventListener("click", () => loadPuzzle(dailyIndex()));
$("tabToday").addEventListener("click", () => loadLeaderboard("today"));
$("tabAll").addEventListener("click", () => loadLeaderboard("all"));
$("howBtn").addEventListener("click", () => { $("howModal").hidden = false; });
$("closeHow").addEventListener("click", () => { $("howModal").hidden = true; });
$("howModal").addEventListener("click", function (e) { if (e.target === this) this.hidden = true; });

// ---- boot ----
// Open on today's shared challenge; the picker still lets you free-play any category.
loadPuzzle(dailyIndex());
tickCountdown();
setInterval(tickCountdown, 1000);
