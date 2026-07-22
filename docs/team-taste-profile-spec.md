# Spec — Team Taste Profile

Status: **DRAFT / awaiting sign-off** · Owner: @egg0322 · Author: post-MVP roadmap (P3)
Branch: `claude/post-mvp-review-roadmap-8cqtym`

> One-liner: surface the rating data the app **already collects** (loved / ok / never)
> as a team insight — "your team leans Thai, cools on salads; Din Tai Fung is a
> crowd favourite" — so the post-spin feedback loop pays off visibly, not just as a
> hidden spin-weight multiplier.

---

## 1. User stories

- **As a team member**, when I open the History tab, I want to see what my team
  actually enjoys, so picking lunch feels informed rather than random.
- **As a wheel owner**, I want proof the wheel is learning our tastes, so rating
  spins feels worthwhile and the team keeps doing it.
- **As a solo user** (personal wheel), I want to see my own taste pattern across the
  places I've tried.

## 2. Problem / motivation

Milestone 8 shipped post-spin ratings: every spin can be rated loved / ok / never,
and the **latest** rating per restaurant already biases future spins
(`shared/rating.ts` → `applyRatingWeights`, folded into `spins.create` and
`smart.pick`). But that value is **invisible** — a rating only shows as a small
badge on its own history row, and its effect on the wheel is silent. Users have no
reason to believe rating does anything, so the loop under-delivers. This feature
makes the collected sentiment legible.

## 3. Goals / non-goals

**Goals**
- A read-only "Team taste" card in the History tab, aggregating existing ratings.
- Per-cuisine sentiment (what the team leans toward / cools on).
- Per-restaurant standouts (most-loved, repeat "never again").
- A headline number that rewards rating ("38 meals rated · 72% positive").
- Pure, tested aggregation in `shared/*.ts`; server stays authoritative.

**Non-goals (this iteration)**
- No new rating UI — ratings are already captured in `HistoryTab`.
- No schema change, no migration, no external API, no push/secrets.
- No per-person leaderboard or "who rated what" attribution (privacy — see §6).
- No ML / no time-series "trending" (deferred to v2, §8).

## 4. Data model — **no migration**

Source is entirely existing data: `spin_history.rating` (`enum loved|ok|never`,
nullable), authored by `spin_history.spunBy`, joined to `restaurants` for the
cuisine dimension. The new `spin_history(wheelId, spunAt)` index from migration 0014
already covers the read. **Nothing to add to the schema.**

Cuisine dimension per restaurant (first match wins):
1. `restaurants.primaryTagId` → a tag with `category = 'cuisine'` (from Milestone 6
   auto-linking + seeded cuisine tags), else
2. `restaurants.cuisine` (provider string), else
3. `"Uncategorized"` — counted in totals but excluded from the per-cuisine ranking.

> ⚠️ Dependency/risk: user-typed restaurants often have neither a cuisine tag nor a
> provider cuisine, so the **per-cuisine** section is only as rich as tag coverage.
> The **per-restaurant** section works regardless. Acceptable; called out in §9.

## 5. Architecture

Follows the repo seam: pure math in `shared/`, server orchestrates, thin client card.

- **`shared/tasteProfile.ts`** (new, pure, **test written first**):
  `buildTasteProfile(rows: RatedSpin[]): TasteProfile`
  - `RatedSpin = { restaurantId; restaurantName; cuisine: string | null; rating: Rating; ratedAt: Date }`
  - `TasteProfile = { totalRated; positivePct; leans: CuisineStat[]; cools: CuisineStat[]; loved: RestaurantStat[]; neverAgain: RestaurantStat[]; hasEnoughData: boolean }`
  - Deterministic, order-stable, no I/O. All thresholds/scoring live here (§7).
- **`shared/tasteProfile.test.ts`** — empty set, below-threshold, single-vote guard,
  cuisine fallback, tie-breaks, positive/negative ranking.
- **Server** — `server/db.ts` `getRatedSpinsForProfile(wheelId)`: selects only
  `WHERE rating IS NOT NULL`, joins restaurant name + cuisine tag/field. New
  `stats.tasteProfile` procedure (member-gated, mirrors `stats.getRestaurantStats`):
  fetches rows → `buildTasteProfile` → returns `TasteProfile`. Rebuild `api/index.js`.
- **Client** — `client/src/components/TasteProfile.tsx`: renders the card; mounted in
  `HistoryTab` next to `RestaurantStats`. Warm-appetite tokens, skeleton while loading,
  teaser empty-state. `stats.tasteProfile.useQuery({ wheelId })`.

## 6. Design decisions (resolved; ★ = please confirm)

| # | Decision | Recommended answer | Rationale |
|---|---|---|---|
| D1 | Which tab / placement | History tab, a "Team taste" card above `RestaurantStats` | Ratings + history already live here; one scroll surface |
| D2 | Sentiment scale | loved = +1, ok = 0, never = −1; rank cuisines by net = (loved−never)/n | Interpretable; do **not** reuse the 1.6/0.15 spin multipliers for display |
| D3 | Headline metric | `positivePct = loved / total_rated` | Simple, rewarding, monotonic with rating |
| D4 | Card unlock threshold | ≥ **5** rated spins on the wheel, else teaser | Avoids a noisy card from 1–2 ratings |
| D5 | Per-cuisine min sample | ≥ **3** ratings for that cuisine to appear | "Team hates salads" from one vote is wrong |
| D6 | Per-restaurant min sample | ≥ **2** ratings to show "loved by X/Y" / "never ×N" | Same anti-noise reason |
| D7 ★ | Per-person attribution | **Aggregate only** — counts, never names ("loved by 4/5") | Privacy; avoids social friction. Matches home-vs-office privacy calls |
| D8 ★ | Personal wheels | Show too, relabelled "Your taste" (vs "Team taste") | Still useful solo; cheap to support |
| D9 | Cold start | Teaser empty-state: "Rate a few spins to unlock your team's taste profile" | Turns the gap into a rating prompt |
| D10 | Trending / time-series | **Defer to v2** | Adds windowing complexity; land the static profile first |

## 7. Aggregation rules (the pure function)

- Consider only rated spins (`rating != null`).
- `totalRated` = count; `positivePct = round(100 · loved / totalRated)`.
- `hasEnoughData = totalRated >= 5` (D4).
- **Cuisine roll-up**: bucket by resolved cuisine (§4), drop `Uncategorized` and any
  bucket with `n < 3` (D5). `net = (loved − never) / n`. `leans` = buckets with
  `net > 0` sorted by net desc then n desc (top 3). `cools` = buckets with `net < 0`
  sorted by net asc then n desc (top 2).
- **Restaurant roll-up**: bucket by restaurantId, require `n >= 2` (D6).
  `loved` = highest loved-ratio (tie-break n desc), top 3. `neverAgain` = `never`
  is a strict majority of that restaurant's ratings, top 3.
- Ties broken deterministically (by count, then id) so output is stable for tests.

## 8. v2 / later (out of scope now)

- **Trending**: loved-rate over the last 7–14d vs the prior window ("Korean is heating up").
- One-line taste teaser in the spin-result modal ("your team loves this cuisine").
- Cuisine coverage nudge: prompt to tag untagged restaurants to enrich the profile.

## 9. Risks

- **Cold-start (primary):** the card is empty until people rate ~5 spins. Mitigated by
  the teaser (D9) and the fact that rating already exists. Not a code risk, a habit one.
- **Cuisine coverage:** per-cuisine section depends on tag/cuisine coverage (§4). The
  per-restaurant section is unaffected, so the card is never useless.
- **Small teams:** thresholds (D4–D6) may hide sections for a 2–3 person wheel; that's
  intended (better empty than wrong).

## 10. Definition of done

- `shared/tasteProfile.ts` + `.test.ts` (test first), `stats.tasteProfile`,
  `TasteProfile.tsx` in History tab.
- `pnpm check && pnpm test && pnpm build` green; `api/index.js` rebuilt (server changed).
- No schema change. No new env/secret.
- Manual: a wheel with ≥5 mixed ratings shows leans/cools/loved; a fresh wheel shows
  the teaser.

## 11. Open questions for owner

1. **D7** — OK to keep it aggregate-only (no "who rated" names)? (Recommended: yes.)
2. **D8** — Show on personal wheels as "Your taste" too, or shared-only? (Rec: show both.)
3. Copy tone — playful ("Your squad is Team Ramen 🍜") vs neutral ("Most loved: Ramen")?
   (Rec: playful, matching the landing voice.)
