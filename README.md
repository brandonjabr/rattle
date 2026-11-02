# Rattle

A daily **60-second "name as many X as you can, deep cuts worth more" game**. One category; name as many things as you can
before the clock runs out. Every answer is worth **0–1000 points** by how rare it
is — common picks score a little, deep cuts score big — and at the end you earn
**strategy bonuses** for going wide (lots of answers) or going deep (only rare ones).
Both styles can win. Screenshot your score and see who tops it.

> Today's prototype category: **Name a fruit.**

## Run it

The game is static files, but it now uses JavaScript modules and a small
Cloudflare backend for the leaderboard, so it needs to be served over http (not
opened with a double-click).

- **Full experience, with leaderboards** (recommended): `npm install` then
  `npm run dev` (Cloudflare Wrangler). See `DEPLOY.md` for the full setup and how to
  put it live on the internet with your own domain.
- **Just the game, no leaderboard** (quick look): `python3 -m http.server 8000` then
  open `http://localhost:8000`. The leaderboard shows an "offline" note.

Designed to be responsive and lively on both laptop and iPhone (circular countdown,
safe-area aware, 16px inputs so iOS doesn't zoom).

To go live on Cloudflare (Pages + Functions + D1 database + your own domain), follow
**`DEPLOY.md`** step by step.

## How a round works

1. Hit **Start** — you get **60 seconds** (circular countdown up top).
2. Type an answer, press enter. Each valid, new answer scores points by rarity and
   pops in as a colored chip.
3. Duplicates and non-answers just flash — no penalty, keep going.
4. At `0:00`, your score is tallied with bonuses:
   - **Base** — sum of every answer's points.
   - **Volume bonus** — +50 per answer (rewards breadth).
   - **Connoisseur bonus** — scales with your *average* rarity (rewards going rare).
   - **Deep cuts** — +300 for each 700+ point answer.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Start / play / results screens + how-to modal |
| `styles.css` | Colorful responsive styling, circular timer, chips, leaderboard |
| `game.js` | Timer, live scoring, results, share, leaderboard submit (ES module) |
| `deck.js` | All categories + rarity-ranked answer banks (shared by client + server) |
| `scoring.js` | Scoring rules (shared by client + server, one source of truth) |
| `functions/api/` | Cloudflare Functions: `score` and `leaderboard` |
| `schema.sql`, `wrangler.toml` | Database table + Cloudflare config |
| `DEPLOY.md` | Step-by-step: deploy to Cloudflare with a database and domain |
| `SPEC.md` | Full design + the answer-bank prep pipeline |

## Notes

- One hard-coded day; points are computed from each item's obscurity rank. In
  production a new pre-vetted, rarity-ranked bank is served per date — see `SPEC.md`.
- Best score is stored in `localStorage` (per device). The prototype lets you replay;
  a production daily would lock to one attempt per day.
