/*
 * Rattle deck generator.
 *
 * Coverage: every category merges Wikidata class queries with Wikipedia's own
 * "List of ..." pages, joined on the English Wikipedia article they point to.
 *
 * Rarity, in two layers:
 *   1. Automatic, for the long tail: a blend of the article's English Wikipedia
 *      pageviews (last 12 months) and how many Wikipedias cover it (sitelinks).
 *   2. Curated, for the well-known head: scripts/tiers/<id>.txt pins answers to a
 *      tier (common .. legendary) and adds any the sources missed. Edit those files
 *      to fix a ranking or a missing answer, then re-run.
 *
 * Run:  node scripts/build-deck.mjs     (Node 18+, needs internet)
 * API results are cached in node_modules/.cache/rattle-deck, so re-runs are fast.
 * Delete that folder to refresh pageviews.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { norm, pointsFor, bandOf, TIER_POINTS as TIERS, rarityForPoints } from "../scoring.js";

const UA = "RattleDeckBuilder/1.0 (https://playrattle.io)";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "node_modules", ".cache", "rattle-deck");
const MAX_R = 1000;

// `wikidata` must bind ?item. `lists` are English Wikipedia list pages.
// `stop` drops abstract class names that are not real answers.
const CATS = [
  { id: "fruit", category: "Fruits",
    wikidata: "{ ?item wdt:P279* wd:Q3314483 } UNION { ?item wdt:P279/wdt:P279? wd:Q1364 }",
    lists: ["List of culinary fruits"],
    stop: ["fruit","edible fruit","false fruit","accessory fruit","aggregate fruit","multiple fruit","simple fruit",
           "stone fruit","berry","drupe","pome","citrus","hesperidium","pepo","achene","capsule","legume","nut",
           "seed","vegetable","fruit vegetable","dried fruit","schizocarp","samara","caryopsis","follicle","silique"] },

  { id: "country", category: "Countries",
    wikidata: "?item wdt:P463 wd:Q1065 . FILTER NOT EXISTS { ?item wdt:P576 ?end }",
    lists: [], stop: [] },

  { id: "element", category: "Chemical Elements",
    wikidata: "?item wdt:P31 wd:Q11344 ; wdt:P1086 ?z . FILTER(?z <= 118)",
    lists: [], stop: ["chemical element"] },

  { id: "dog", category: "Dog Breeds",
    wikidata: "?item wdt:P31 wd:Q39367 .",
    lists: ["List of dog breeds"],
    stop: ["dog","dog breed","dog type","landrace","dog crossbreed"] },

  { id: "instrument", category: "Musical Instruments",
    wikidata: "{ ?item wdt:P279* wd:Q34379 } UNION { ?item wdt:P31/wdt:P279* wd:Q34379 }",
    lists: ["List of musical instruments"],
    stop: ["musical instrument","string instrument","wind instrument","percussion instrument","keyboard instrument",
           "brass instrument","woodwind instrument","chordophone","aerophone","idiophone","membranophone",
           "electrophone","lamellophone","free aerophone","plucked string instrument","bowed string instrument",
           "electronic musical instrument","drum kit","hornbostel sachs","musical ensemble"] },

  { id: "myth", category: "Greek Gods & Heroes",
    // Members of these classes or any subclass (e.g. Olympian god -> Greek deity).
    // Expanded in two steps: Wikidata times out on the combined path query.
    wikidataRoots: ["Q22989102", "Q22988604", "Q23015925"],
    lists: ["List of Greek deities", "List of mortals in Greek mythology", "List of Greek mythological creatures"],
    stop: ["greek deity","greek mythology","twelve olympians","titans","primordial deities"] },

  { id: "sport", category: "Sports",
    wikidata: "?item wdt:P31 wd:Q31629 .",
    lists: ["List of sports"],
    stop: ["sport","sports","team sport","individual sport","ball game","racquet sport","racket sport","water sport",
           "winter sport","combat sport","motorsport","mind sport","bat and ball game","football","code of football",
           "invasion game","net sport","target sport","cue sport","dance","dancing","extreme sport","esports"] },

  { id: "constellation", category: "Constellations",
    wikidata: "", lists: ["IAU designated constellations"], stop: [] },

  { id: "dinosaur", category: "Dinosaurs",
    wikidata: "", lists: ["List of dinosaur genera"], stop: ["dinosaur","dinosauria"] },

  { id: "moon", category: "Moons",
    wikidata: "", lists: ["List of natural satellites"], stop: ["natural satellite","see list","moons of jupiter","moons of saturn","moons of uranus","moons of neptune",
           "moons of mars","moons of pluto","moons of haumea","moons of eris","minor planet moon"] },

  { id: "president", category: "US Presidents", surnames: true,
    // Real people only: fictional presidents from films and TV carry the same statement.
    wikidata: "?item p:P39/ps:P39 wd:Q11696 ; wdt:P31 wd:Q5 .", lists: [], stop: [] },

  { id: "capital", category: "Capital Cities",
    wikidata: "?c wdt:P463 wd:Q1065 ; wdt:P36 ?item . FILTER NOT EXISTS { ?c wdt:P576 ?end }",
    lists: [], stop: [] },

  { id: "language", category: "Languages",
    wikidata: "?item wdt:P218 ?iso .", lists: [], stop: [] },

  { id: "cat", category: "Cat Breeds",
    wikidata: "?item wdt:P31 wd:Q43577 .", lists: ["List of cat breeds"],
    stop: ["cat","cat breed","domestic cat"] },

  { id: "horse", category: "Horse Breeds",
    wikidata: "?item wdt:P31 wd:Q1160573 .", lists: ["List of horse breeds"],
    stop: ["horse","horse breed","pony","landrace"] },

  { id: "cheese", category: "Cheeses",
    // Wikidata only: the "List of cheeses" tables link regions in every row.
    wikidata: "{ ?item wdt:P279+ wd:Q10943 } UNION { ?item wdt:P31/wdt:P279* wd:Q10943 }", lists: [],
    trim: / (PDO|DOP|AOP|AOC|PGI|IGP|PAT)$/i, dropSuffix: " cheese",
    stop: ["cheese","types of cheese","cheese dish"] },

  { id: "pasta", category: "Pasta Shapes",
    // Italian-origin pasta, minus finished dishes. Without the origin filter,
    // "stuffed pasta" pulls in every dumpling on Earth (gyoza, pierogi, samosa...).
    wikidata: "{ ?item wdt:P279+ wd:Q178 } UNION { ?item wdt:P31/wdt:P279* wd:Q178 } ?item wdt:P495 wd:Q38 . " +
              "FILTER NOT EXISTS { ?item wdt:P279*|wdt:P31/wdt:P279* wd:Q18679685 }",
    lists: [], trim: / (PAT|IGP|PGI)$/i, stop: ["pasta","stuffed pasta","noodle","dumpling"] },
];


// ---------- small utilities ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const stripParen = (s) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
const badName = (s) => !s || /[\/:]|\d/.test(s) || s.length > 40 || /^Q\d+$/.test(s);

async function getJSON(url, init = {}) {
  let wait = 2000;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers || {}) } });
    } catch (e) {
      if (attempt >= 6) throw e;
      await sleep(wait); wait *= 2; continue;
    }
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt >= 6) throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
    const ra = +res.headers.get("retry-after");
    await sleep(ra ? ra * 1000 : wait); wait = Math.min(wait * 2, 60000);
  }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

function loadCache(name) {
  const f = join(CACHE_DIR, name + ".json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
}
function saveCache(name, data) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, name + ".json"), JSON.stringify(data));
}

// ---------- sources ----------

async function sparql(query) {
  const body = "query=" + encodeURIComponent(query);
  const j = await getJSON("https://query.wikidata.org/sparql", {
    method: "POST", body,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
  });
  return j.results.bindings;
}

// Wikidata members that have an English Wikipedia article.
async function fromWikidata(cat) {
  let pattern = cat.wikidata;
  if (cat.wikidataRoots) {
    const roots = cat.wikidataRoots.map((q) => "wd:" + q).join(" ");
    const subs = await sparql(`SELECT DISTINCT ?cls WHERE { VALUES ?root { ${roots} } ?cls wdt:P279* ?root }`);
    pattern = `VALUES ?cls { ${subs.map((b) => "wd:" + b.cls.value.split("/").pop()).join(" ")} } ?item wdt:P31 ?cls .`;
  }
  if (!pattern) return [];
  const rows = await sparql(`SELECT ?item ?name ?title (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  ${pattern}
  ?art schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
  OPTIONAL { ?item rdfs:label ?name . FILTER(LANG(?name) = "en") }
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
} GROUP BY ?item ?name ?title`);
  return rows.map((b) => ({
    name: b.name?.value || stripParen(b.title.value),
    title: b.title.value,
    aliases: (b.alts?.value || "").split("|").filter(Boolean),
    fromList: false,
  }));
}

// First link of each table row / bullet on a Wikipedia list page.
async function fromList(page) {
  const j = await getJSON("https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=" + encodeURIComponent(page));
  if (!j?.parse) { console.warn(`  ! list page missing: ${page}`); return []; }
  const text = j.parse.wikitext.split(/^==\s*(?:See also|References|Notes|External links|Further reading|Sources)\s*==/m)[0];
  const re = /^(?:\|\||\||\*+|#+)\s*(?:'')?\s*\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/gm;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const title = m[1].trim();
    if (/:/.test(title)) continue;
    const name = (m[2] || title).replace(/''/g, "").replace(/\{\{okina\}\}/gi, "ʻ").trim();
    if (/[{}]/.test(name)) continue;
    out.push({ name, title, aliases: [], fromList: true });
  }
  return out;
}

// Follow redirects; get each article's Wikidata item and whether it is a disambiguation page.
async function resolveTitles(titles) {
  const cache = loadCache("titles");
  const todo = [...new Set(titles)].filter((t) => !(t in cache));
  for (const batch of chunk(todo, 50)) {
    const j = await getJSON("https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1" +
      "&prop=pageprops&ppprop=wikibase_item|disambiguation&titles=" + encodeURIComponent(batch.join("|")));
    const step = {};
    for (const n of j.query?.normalized || []) step[n.from] = n.to;
    for (const r of j.query?.redirects || []) step[r.from] = r.to;
    const pages = {};
    for (const p of j.query?.pages || []) pages[p.title] = p;
    for (const t of batch) {
      let cur = t;
      for (let k = 0; k < 5 && step[cur]; k++) cur = step[cur];
      const p = pages[cur];
      cache[t] = !p || p.missing || p.invalid ? null
        : { title: p.title, qid: p.pageprops?.wikibase_item || null, disambig: p.pageprops?.disambiguation !== undefined };
    }
  }
  saveCache("titles", cache);
  return cache;
}

// Monthly English Wikipedia pageviews, summed over the last 12 full months.
async function pageviews(titles) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const range = ymd(start) + "-" + ymd(end);
  const cache = loadCache("pageviews-" + range);
  const todo = [...new Set(titles)].filter((t) => !(t in cache));
  let done = 0;
  await pool(todo, 12, async (t) => {
    const url = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/" +
      encodeURIComponent(t.replace(/ /g, "_")) + `/monthly/${ymd(start)}/${ymd(end)}`;
    const j = await getJSON(url);
    cache[t] = (j?.items || []).reduce((s, i) => s + i.views, 0);
    if (++done % 500 === 0) { process.stdout.write(`    pageviews ${done}/${todo.length}\n`); saveCache("pageviews-" + range, cache); }
  });
  saveCache("pageviews-" + range, cache);
  return cache;
}

async function sitelinks(qids) {
  const cache = loadCache("sitelinks");
  const todo = [...new Set(qids)].filter((q) => q && !(q in cache));
  for (const batch of chunk(todo, 400)) {
    const rows = await sparql(`SELECT ?item ?n WHERE { VALUES ?item { ${batch.map((q) => "wd:" + q).join(" ")} } ?item wikibase:sitelinks ?n }`);
    for (const q of batch) cache[q] = 0;
    for (const b of rows) cache[b.item.value.split("/").pop()] = +b.n.value;
    await sleep(500);
  }
  saveCache("sitelinks", cache);
  return cache;
}

// ---------- curated tiers ----------

// scripts/tiers/<id>.txt:  "## common" headings, then "Name | alias | alias" lines.
function loadTiers(id) {
  const f = join(ROOT, "scripts", "tiers", id + ".txt");
  const tiers = {}; const remove = [];
  if (!existsSync(f)) return { tiers, remove };
  let cur = null;
  for (const raw of readFileSync(f, "utf8").split("\n")) {
    const line = raw.trim();
    const h = line.match(/^##\s*(\w+)/);
    if (h) { cur = h[1].toLowerCase(); continue; }
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
    if (cur === "remove") remove.push(...parts);
    else if (TIERS[cur]) (tiers[cur] ||= []).push(parts);
  }
  return { tiers, remove };
}

// ---------- build one category ----------

const quantile = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;

async function buildCategory(cat) {
  const raw = [...await fromWikidata(cat)];
  for (const page of cat.lists) raw.push(...await fromList(page));

  const resolved = await resolveTitles(raw.map((r) => r.title));
  const stop = new Set(cat.stop.map(norm));

  // One entry per Wikipedia article.
  const byTitle = new Map();
  for (const r of raw) {
    const info = resolved[r.title];
    if (!info || info.disambig) continue;
    let e = byTitle.get(info.title);
    if (!e) { e = { title: info.title, qid: info.qid, name: null, listName: null, aliases: new Set() }; byTitle.set(info.title, e); }
    if (r.fromList && !e.listName && !badName(r.name)) e.listName = r.name;
    if (!r.fromList && !e.name && !badName(r.name)) e.name = r.name;
    for (const a of [r.name, ...r.aliases, stripParen(info.title)]) if (!badName(a)) e.aliases.add(a);
  }

  let entries = [];
  for (const e of byTitle.values()) {
    let name = stripParen(e.listName || e.name || e.title);
    if (cat.trim) name = name.replace(cat.trim, "").trim();
    if (badName(name) || stop.has(norm(name))) continue;
    const aliases = [...e.aliases].map(stripParen);
    if (cat.surnames) aliases.push(name.split(" ").pop());
    if (cat.dropSuffix && name.toLowerCase().endsWith(cat.dropSuffix)) aliases.push(name.slice(0, -cat.dropSuffix.length));
    entries.push({ name: cap1(name), title: e.title, qid: e.qid, aliases });
  }

  // Automatic rarity from pageviews + sitelinks.
  const views = await pageviews(entries.map((e) => e.title));
  const links = await sitelinks(entries.map((e) => e.qid));
  const lv = entries.map((e) => Math.log10((views[e.title] || 0) + 1));
  const ls = entries.map((e) => Math.log10((links[e.qid] || 0) + 1));
  const scale = (arr) => {
    const s = [...arr].sort((a, b) => a - b), lo = quantile(s, 0.03), hi = quantile(s, 0.97);
    return arr.map((v) => Math.max(0, Math.min(1, (v - lo) / ((hi - lo) || 1))));
  };
  const nv = scale(lv), ns = scale(ls);
  // The tier files cover the well-known answers, so anything left to the automatic
  // ranking scores at least Tricky; within that range, more views/sitelinks = fewer points.
  const [autoLo] = TIERS.tricky;
  entries.forEach((e, i) => {
    const common = 0.6 * nv[i] + 0.4 * ns[i];
    const p = 20 + 980 * Math.pow(1 - common, 1.3);
    e.rarity = rarityForPoints(autoLo + (p - 20) * (1000 - autoLo) / 980);
  });

  // Same display name from two articles: keep the more common one.
  const byName = new Map();
  for (const e of entries) {
    const k = norm(e.name), prev = byName.get(k);
    if (!prev || e.rarity < prev.rarity) byName.set(k, e);
  }
  entries = [...byName.values()];

  // Curated tiers pin rarity (and rename / add aliases / add missing answers).
  const { tiers, remove } = loadTiers(cat.id);
  const find = (parts) => {
    const keys = parts.map(norm);
    return entries.find((e) => keys.includes(norm(e.name))) ||
           entries.find((e) => e.aliases.some((a) => keys.includes(norm(a))));
  };
  const removeKeys = new Set(remove.map(norm));
  entries = entries.filter((e) => !removeKeys.has(norm(e.name)));
  const added = [];
  for (const [tier, lines] of Object.entries(tiers)) {
    const [lo, hi] = TIERS[tier];
    lines.forEach((parts, i) => {
      const pts = lo + (hi - lo) * (lines.length > 1 ? i / (lines.length - 1) : 0);
      let e = find(parts);
      if (!e) { e = { name: parts[0], aliases: [] }; entries.push(e); added.push(parts[0]); }
      // Curated aliases go first so the alias cap below never drops them.
      e.aliases = [...parts.slice(1), ...(norm(e.name) !== norm(parts[0]) ? [e.name] : []), ...e.aliases];
      e.name = parts[0];
      e.rarity = rarityForPoints(pts);
      e.pinned = true;
    });
  }

  // Make sure the rarest entry sits at MAX_R so pointsFor() spans 20..1000.
  entries.sort((a, b) => a.rarity - b.rarity || a.name.localeCompare(b.name));
  const last = entries[entries.length - 1];
  if (last && last.rarity < MAX_R) last.rarity = MAX_R;

  // Tidy aliases: unique, not the name itself, a handful is plenty.
  for (const e of entries) {
    const seen = new Set([norm(e.name)]);
    e.aliases = e.aliases.filter((a) => { const k = norm(a); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
  }
  return { entries, added };
}

function serialize(deck) {
  let js = "/* Rattle deck, generated by scripts/build-deck.mjs from Wikidata + Wikipedia lists,\n" +
           "   ranked by pageviews/sitelinks with curated tiers from scripts/tiers/. Do not hand-edit. */\n" +
           "export const DECK = [\n";
  for (const d of deck) {
    js += `  { id: ${JSON.stringify(d.id)}, category: ${JSON.stringify(d.category)}, entries: [\n`;
    for (const e of d.entries) {
      const parts = [`name: ${JSON.stringify(e.name)}`, `rarity: ${e.rarity}`];
      if (e.aliases.length) parts.push(`aliases: ${JSON.stringify(e.aliases)}`);
      js += `    { ${parts.join(", ")} },\n`;
    }
    js += "  ]},\n";
  }
  return js + "];\n";
}

async function main() {
  const only = process.argv[2];
  const deck = [];
  for (const cat of CATS) {
    console.log(`• ${cat.category}`);
    const { entries, added } = await buildCategory(cat);
    deck.push({ id: cat.id, category: cat.category, entries });
    const bands = {};
    for (const e of entries) { const b = bandOf(pointsFor(e.rarity, MAX_R)).label; bands[b] = (bands[b] || 0) + 1; }
    console.log(`    ${entries.length} entries  ` + Object.entries(bands).map(([k, v]) => `${k} ${v}`).join(", "));
    if (added.length) console.log(`    added from tiers file (not in sources): ${added.join(", ")}`);
    if (only && only === cat.id) {
      for (const e of entries.slice(0, 200)) console.log(`      ${pointsFor(e.rarity, MAX_R)}\t${e.pinned ? "*" : " "} ${e.name}`);
    }
  }
  writeFileSync(join(ROOT, "deck.js"), serialize(deck));
  console.log("\nWrote deck.js");
}
main().catch((e) => { console.error(e); process.exit(1); });
