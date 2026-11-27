/*
 * Cache-busting for deploys. Runs automatically before `npm run deploy`.
 *
 * Browsers may keep game.js / styles.css for hours (the zone's Browser Cache TTL),
 * while index.html is always fresh. Without a version in the URLs, a returning
 * player can run old JavaScript against the new server. This stamps ?v=<hash> on
 * the stylesheet, the game script and every module it imports. The hash comes from
 * the files' contents, so it only changes when the code does.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const strip = (t) => t.replace(/\?v=[a-z0-9]+/g, "");

const FILES = ["index.html", "styles.css", "game.js", "deck.js", "scoring.js", "schedule.js"];
const hash = createHash("sha1");
for (const f of FILES) hash.update(strip(read(f)));
const v = hash.digest("hex").slice(0, 10);

// index.html: <link href="styles.css"> and <script src="game.js">
let html = strip(read("index.html"))
  .replace(/href="styles\.css"/, `href="styles.css?v=${v}"`)
  .replace(/src="game\.js"/, `src="game.js?v=${v}"`);
writeFileSync(join(ROOT, "index.html"), html);

// game.js: import ... from "./deck.js" etc.
let js = strip(read("game.js")).replace(/(from\s+"\.\/[\w-]+\.js)"/g, `$1?v=${v}"`);
writeFileSync(join(ROOT, "game.js"), js);

console.log("Stamped assets with ?v=" + v);
