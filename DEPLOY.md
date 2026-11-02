# Deploying Rabbit Hole to Cloudflare

Everything runs on Cloudflare: **Pages** serves the site, **Pages Functions** run the
API, and **D1** (a serverless SQLite database) stores the leaderboard. One vendor,
free to start, scales automatically, free SSL and global CDN included.

You will do this once. Total time: about 15 minutes. Commands are copy-paste.

---

## What is in this folder

| File / folder | What it is |
|---|---|
| `index.html`, `styles.css`, `game.js` | The game (static front end) |
| `deck.js` | The categories and answer banks (shared by browser and server) |
| `scoring.js` | The scoring rules (shared by browser and server) |
| `functions/api/score.js` | `POST /api/score` — re-scores on the server, saves it, returns the leaderboard |
| `functions/api/leaderboard.js` | `GET /api/leaderboard` — today's top scores for a category |
| `schema.sql` | The database table |
| `wrangler.toml` | Cloudflare config (you paste one id into it) |
| `package.json` | Handy `npm run` shortcuts |

The server re-scores every submission from its own copy of `deck.js`, so players can
only earn points for real answers. Leaderboards reset daily (UTC) and are per category.

---

## Step 0 — Make a free Cloudflare account

Yes, do this first. Go to **https://dash.cloudflare.com/sign-up**, make a free
account, and verify your email. That is all you need to start (no credit card for the
free tier).

You also need **Node.js** installed (https://nodejs.org, the LTS version). Check it:

```bash
node -v
```

## Step 1 — Get the code and install tools

```bash
cd ~/git/rabbit-hole
npm install
npx wrangler login
```

`wrangler login` opens your browser and asks you to authorize. Click Allow.

## Step 2 — Create the database

```bash
npx wrangler d1 create rabbit-hole-db
```

This prints a block that includes a `database_id`. **Copy that id** and paste it into
`wrangler.toml`, replacing `PASTE_YOUR_DATABASE_ID_HERE`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "rabbit-hole-db"
database_id = "the-long-id-you-just-copied"
```

Create the table, in both the local and the real database:

```bash
npm run db:init:local
npm run db:init
```

## Step 3 — Run it on your own machine first

```bash
npm run dev
```

Wrangler prints a `http://localhost:8788` URL. Open it. Play a round, type a name,
press **Post my score** — you should see yourself on the leaderboard. (This uses a
local copy of the database, so it is safe to experiment.)

Stop the dev server with `Ctrl + C`.

## Step 4 — Put it live on the internet

```bash
npm run deploy
```

The first deploy creates a Pages project named `rabbit-hole` and gives you a live URL
like `https://rabbit-hole.pages.dev`. Open it, it is live.

**Connect the database to the live site (one time):** in the Cloudflare dashboard go to
**Workers & Pages → rabbit-hole → Settings → Functions → D1 database bindings → Add
binding**. Set **Variable name** to `DB` and pick **rabbit-hole-db**. Save, then run
`npm run deploy` once more so the change takes effect. Now the live leaderboard works.

Every time you change the game later, just run `npm run deploy` again.

## Step 5 — Your own domain name

Two easy paths:

- **Buy it at Cloudflare** (cheapest, at cost): dashboard → **Domain Registration →
  Register Domains**, search a name, buy it. It is automatically on Cloudflare.
- **Already own one elsewhere?** dashboard → **Add a site**, follow the steps to point
  your registrar's nameservers at Cloudflare.

Then attach it to the game: **Workers & Pages → rabbit-hole → Custom domains → Set up a
custom domain**, type your domain (for example `rabbithole.game` or
`play.yourdomain.com`), and confirm. Cloudflare adds the DNS record and a free SSL
certificate for you in a minute or two. Done.

---

## Everyday commands

```bash
npm run dev          # play locally with the real functions + a local database
npm run deploy       # publish the latest version
npm run db:init      # (re)create the table in the live database
```

## Costs

Free tier covers a lot: Pages requests are unlimited on the free plan, Functions give
100k requests/day free, and D1 gives millions of row reads/day free. You will likely
pay nothing until the game gets genuinely popular, and even then it is a few dollars.

## Notes and next steps

- **Adding categories:** edit `deck.js` and `npm run deploy`. Both the game and the
  server pick it up automatically. (More categories also means the daily challenge
  rotates through more of them before repeating.)
- **Category of the day:** the game opens on one shared category chosen by the UTC
  date (same for everyone), so the "Today" leaderboard is a single shared board. The
  picker still lets anyone free-play other categories, with a "Back to today's
  challenge" link.
- **Leaderboards:** each result shows **Today** (this category, resets daily UTC) and
  **All time** (this category, ever). Scores are re-computed server-side, so only real
  answers count.
- **Anti-cheat:** the server only credits real answers, so scores cannot be inflated
  with junk. A determined user could still submit a full answer list; if the game gets
  competitive, add per-answer validation (so the full bank never reaches the browser)
  or simple rate limiting in `functions/api/score.js`.
