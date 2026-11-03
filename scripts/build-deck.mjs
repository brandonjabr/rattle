/*
 * Rattle deck generator.
 *
 * Pulls every member of each category from Wikidata (authoritative, not an LLM's
 * memory) and ranks rarity by Wikidata sitelink count (how many Wikipedia
 * languages cover it — a good notability proxy). More sitelinks = more common =
 * lower rarity rank. Writes ../deck.js.
 *
 * Run:  node scripts/build-deck.mjs
 * Needs internet. Works on Node 14+ (uses node:https, not fetch).
 */
import https from "node:https";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const UA = "RattleGame/1.0 (https://github.com/brandonjabr/rattle; brandonjabr@gmail.com)";
const DECK_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "deck.js");

// Per-category source. `sparql` must bind ?item. `min` = sitelink floor (noise cut),
// `max` = how many to keep (top by sitelinks). `stop` = exact names to drop (abstract
// classes). Tune these over time.
const CATS = [
  { id: "fruit", category: "Fruits", min: 4, max: 140,
    sparql: "?item wdt:P279* wd:Q3314483 .", // edible fruit (types)
    stop: ["fruit","edible fruit","false fruit","accessory fruit","aggregate fruit","multiple fruit","stone fruit","berry","drupe","pome","citrus","vegetable","nut","seed"] },

  { id: "country", category: "Countries", min: 12, max: 200,
    sparql: "?item wdt:P463 wd:Q1065 .", // member of the United Nations
    stop: [],
    // Common abbreviations Wikidata only stores mangled (e.g. "U. S. A."), added by exact name.
    extraAliases: {
      "United States": ["USA", "US", "America"],
      "United Kingdom": ["UK", "Britain", "Great Britain"],
      "United Arab Emirates": ["UAE"],
      "Democratic Republic of the Congo": ["DRC", "Congo", "DR Congo"],
      "Republic of the Congo": ["Congo-Brazzaville"],
      "North Korea": ["DPRK"],
      "Czech Republic": ["Czechia"],
      "Kingdom of the Netherlands": ["Netherlands", "Holland"],
    } },

  { id: "element", category: "Chemical Elements", min: 2, max: 120,
    sparql: "?item wdt:P31 wd:Q11344 .", // chemical element
    stop: ["chemical element"] },

  { id: "dog", category: "Dog Breeds", min: 3, max: 170,
    sparql: "?item wdt:P31 wd:Q39367 .", // dog breed
    stop: ["dog","dog breed","dog type","landrace","dog crossbreed"] },

  { id: "instrument", category: "Musical Instruments", min: 5, max: 180,
    sparql: "{ ?item wdt:P279* wd:Q34379 } UNION { ?item wdt:P31/wdt:P279* wd:Q34379 }",
    stop: ["musical instrument","string instrument","wind instrument","percussion instrument",
           "keyboard instrument","brass instrument","woodwind instrument","chordophone","aerophone",
           "idiophone","membranophone","electrophone","lamellophone","free aerophone","plucked string instrument",
           "bowed string instrument","wind","reed","flute family","lute","electronic musical instrument"] },

  { id: "myth", category: "Greek Gods & Heroes", min: 4, max: 280,
    sparql: "VALUES ?cls { wd:Q22989102 wd:Q22988604 wd:Q23015925 } ?item wdt:P31 ?cls .",
    stop: ["greek deity","greek mythology"] },

  { id: "sport", category: "Sports", min: 5, max: 150,
    sparql: "?item wdt:P31 wd:Q31629 .", // type of sport
    stop: ["sport","team sport","individual sport","ball game","racquet sport","racket sport",
           "water sport","winter sport","combat sport","motorsport","mind sport","bat-and-ball game",
           "football","code of football","invasion game","net sport","target sport","cue sport"] },
];

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchOnce(query) {
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: "application/sparql-results+json", "User-Agent": UA } }, (res) => {
      if (res.statusCode !== 200) {
        const err = new Error("HTTP " + res.statusCode);
        err.status = res.statusCode;
        err.retryAfter = +res.headers["retry-after"] || 0;
        res.resume();
        return reject(err);
      }
      let data = ""; res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data).results.bindings); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => { req.destroy(new Error("timeout")); });
  });
}

// Retry on rate-limit / transient errors with exponential backoff.
async function sparql(query) {
  let wait = 3000;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await fetchOnce(query);
    } catch (e) {
      const transient = e.status === 429 || e.status === 503 || e.status === 500 || e.message === "timeout";
      if (!transient || attempt === 6) throw e;
      const delay = (e.retryAfter ? e.retryAfter * 1000 : wait);
      process.stdout.write(`(${e.message}, retry in ${Math.round(delay / 1000)}s) `);
      await sleep(delay);
      wait = Math.min(wait * 2, 60000);
    }
  }
}

function buildQuery(cat) {
  return `SELECT ?item ?name ?sitelinks (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  ${cat.sparql}
  ?item wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= ${cat.min})
  ?item rdfs:label ?name . FILTER(LANG(?name) = "en")
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
}
GROUP BY ?item ?name ?sitelinks
ORDER BY DESC(?sitelinks)
LIMIT ${cat.max * 6}`;
}

function badName(s) { return !s || /[()\/:]|\d/.test(s) || s.length > 40 || /^Q\d+$/.test(s); }

async function buildCategory(cat) {
  const rows = await sparql(buildQuery(cat));
  const stop = new Set(cat.stop.map(norm));
  const seen = new Set();
  const out = [];
  for (const b of rows) {
    const name = (b.name?.value || "").trim();
    if (badName(name)) continue;
    const key = norm(name);
    if (!key || seen.has(key) || stop.has(key)) continue;
    seen.add(key);
    const extra = (cat.extraAliases && cat.extraAliases[name]) || [];
    let aliases = [...extra, ...(b.alts?.value || "").split("|").map((a) => a.trim())]
      .filter((a) => a && !badName(a) && norm(a) !== key);
    // de-dupe aliases (curated extras first), cap at 8 — aliases only aid matching
    const akeys = new Set();
    aliases = aliases.filter((a) => { const k = norm(a); if (akeys.has(k)) return false; akeys.add(k); return true; }).slice(0, 8);
    out.push({ name, sitelinks: +b.sitelinks.value, aliases });
  }
  out.sort((a, b) => b.sitelinks - a.sitelinks || a.name.localeCompare(b.name));
  const kept = out.slice(0, cat.max);
  return kept.map((e, i) => {
    const o = { name: e.name, rarity: i + 1 };
    if (e.aliases.length) o.aliases = e.aliases;
    return o;
  });
}

function serialize(deck) {
  let js = "/* Rattle deck — generated from Wikidata, rarity ranked by sitelink count.\n" +
           "   Regenerate with: node scripts/build-deck.mjs  (do not hand-edit) */\n" +
           "export const DECK = [\n";
  for (const d of deck) {
    js += `  { id: ${JSON.stringify(d.id)}, category: ${JSON.stringify(d.category)}, entries: [\n`;
    for (const e of d.entries) {
      const parts = [`name: ${JSON.stringify(e.name)}`, `rarity: ${e.rarity}`];
      if (e.aliases) parts.push(`aliases: ${JSON.stringify(e.aliases)}`);
      js += `    { ${parts.join(", ")} },\n`;
    }
    js += "  ]},\n";
  }
  return js + "];\n";
}

const CHECK = { myth: ["Kratos", "Deimos", "Zeus", "Achilles", "Heracles", "Medusa"], instrument: ["Oud", "Guitar", "Theremin"], fruit: ["Durian", "Apple"], country: ["Tuvalu", "France"] };

async function main() {
  const deck = [];
  for (const cat of CATS) {
    process.stdout.write(`• ${cat.category} … `);
    try {
      const entries = await buildCategory(cat);
      deck.push({ id: cat.id, category: cat.category, entries });
      const names = new Set(entries.map((e) => e.name.toLowerCase()));
      const present = (CHECK[cat.id] || []).map((n) => (names.has(n.toLowerCase()) ? n : "✗" + n));
      console.log(`${entries.length} entries` + (present.length ? `  [${present.join(" ")}]` : ""));
    } catch (e) {
      console.log("FAILED: " + e.message);
      throw e;
    }
    await sleep(2500); // be polite to Wikidata between categories
  }
  writeFileSync(DECK_PATH, serialize(deck));
  console.log("\nWrote " + DECK_PATH);
}
main().catch((e) => { console.error(e); process.exit(1); });
