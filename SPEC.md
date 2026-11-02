# Rattle — design & pipeline spec

A daily **60-second rarity rush**. One category per day; name as many things as you
can before the clock runs out. Every answer is worth **0–1000 points** by how rare
it is, and at the end you earn **strategy bonuses** that reward either going wide
(lots of answers) or going deep (only rare ones) — so different styles can both win.
The share is your score plus a colored "haul" of the rarity bands you collected.

This prototype is one hard-coded day (`data.js`). The sections below describe how
the real product generates and serves a new, trustworthy puzzle every day.

---

## 1. Why it works (design pillars)

- **Time pressure + deep-knowledge flex.** 60 seconds turns recall into a thrill;
  the rarity scoring means your niche knowledge is what separates a good score from
  a great one.
- **"I can't believe that counts."** Naming an obscure, half-remembered answer and
  watching it land 900+ points is the dopamine hit — which requires a generous,
  correct, rarity-ranked bank (see §3).
- **Two real strategies.** Volume (spam everything) and Connoisseur (snipe only rare
  ones) are both viable via the end-of-round bonuses, so players express a style and
  argue about which is better.
- **Low floor, no ceiling.** Anyone can name apples and bananas; experts chase the
  Legendary tail.

## 2. Rules & scoring (this game)

- **60-second timer** (circular countdown). Name as many valid, unique answers as
  you can.
- Each answer scores **points = f(rarity)**, mapped to 0–1000 so commons are worth a
  little and deep cuts a lot. Points are shown live and chips are colored by band.
- Duplicates and non-answers just flash — **no penalty** (keeps the pace fast).
- **End-of-round score:**
  - *Base* — sum of all answer points.
  - *Volume bonus* — `count × 50` (rewards breadth).
  - *Connoisseur bonus* — `round(avgPoints × 3)` (rewards a high average → the
    go-rare strategy; pays even with few answers).
  - *Deep cuts* — `+300` per answer worth ≥ 700.
- Share: `Score N · count named` + a **haul** of band counts (`🟦2 🟨4 🟧3 🟥2 🟪1`).

The six rarity bands (by points): Common · Easy · Tricky · Rare · Exotic · Legendary.

> Bonus weights are the balance knobs. Tune them so Volume and Connoisseur players
> reach comparable ceilings — the whole point is that both styles are competitive.

## 3. The answer-bank pipeline (the moat)

Defensibility is a **pre-computed, self-vetted answer bank** per puzzle. For Rattle the bank additionally needs a **reliable total ordering by rarity**, because the
whole game is "rarer than the last." Run a week ahead, adversarial with itself:

1. **Over-generate.** Prompt an LLM for the long tail of valid answers in many passes
   (high temperature, "50 more obscure examples", regional/colloquial names). Capture
   *every reasonable* answer.
2. **Critic pass.** A second model verifies each candidate truly satisfies the
   category with a one-line justification; hallucinations and edge cases are pruned.
   (For "fruit," set an explicit culinary-vs-botanical policy — e.g., tomato/avocado
   — and apply it consistently.)
3. **Canonicalize.** Merge synonyms/spellings/diacritics into one entry with an alias
   list (`carambola` → Starfruit; `snake fruit` → Salak).
4. **Rarity *ranking*.** Assign a strictly increasing obscurity rank grounded in
   **real signals** (word/product frequency, Wikipedia pageviews, search volume)
   blended with LLM judgment. Resolve ties so the order is total and defensible — the
   ordering is the thing players will argue about, so it must feel right.
5. **Adversarial gap-hunt.** The model hunts for valid answers *missing* from the
   bank and invalid ones *inside* it, and for ranking inversions ("is X really rarer
   than Y?"), looping until stable.
6. **Human spot-check & freeze.** Review the rank order around the boundaries, then
   freeze and schedule by date.

### Runtime (cheap + robust)
- Submitted text is normalized and matched against the frozen bank + aliases — a pure
  offline lookup. The accept/reject rule is just `rank > current`.
- Only a genuinely novel, plausibly-valid submission escalates to a **live LLM judge**
  that must also place it in the ranking; the verdict is cached and folded back in.
- Cost: ~one batched generation run per puzzle; near-zero at play time.

### Data schema
```
{ id, date, category, blurb,
  entries: [ { name, rarity: <strictly-increasing int>, aliases?: [string] } ] }
```

## 4. Sharing & growth

- Spoiler-free "core sample" + depth number → built for the screenshot and the
  "can you fall further than me?" reply.
- **Solo → crowd arc:** launch solo (AI-predicted ranks *are* the mechanic, solving
  cold-start). Later, replace/augment predicted ranks with **real player depth
  distributions** ("you out-descended 88% of players") and add friend leaderboards.

## 5. Platform

Web first (this prototype: vanilla HTML/CSS/JS, no build, responsive for phone +
laptop). An iOS wrapper later can match locally and judge novel answers **on-device**
via Apple's Foundation Models (free, private, offline) on supported devices.

## 6. Open questions / risks

- **Ranking trust** is everything here — a single wrong "that's not rarer" erodes it.
  Ground ranks in real signals and surface a dispute path.
- **Category supply** — need many categories with long, cleanly-rankable tails
  (fruits, dog breeds, elements, programming languages, composers…).
- **Edge-case policy** (what counts) must be explicit in the help text.
