# PRD — Milestone 1: Smart Pick (AI Sous-chef)

**Status:** Built · pending review + deploy · **Branch:** `claude/ai-suggest` · **Date:** 2026-06-14

## Decisions (locked 2026-06-14)
- **Engine: free heuristic, NO LLM.** No `invokeLLM`, no API key, no per-click
  cost; works offline; deterministic + unit-tested. (User prefers free.)
- Mood input: **chips + free-text**.
- NL-add tagging: **map to existing cuisine tags only** (never invents tags).
- NL-add UX: **confirm-preview before writing**.
- Shared wheels: AI/Smart picks **broadcast** like a normal spin.
- User-facing name: **"Smart Pick" / "Smart Add"** (honest — it's not an LLM).

## Problem
Decision fatigue at lunch. The wheel randomizes, but users want a *reasoned*
nudge and a faster way to fill a wheel than typing each place.

## Goal
Make the wheel feel like a smart lunch buddy — it can decide *for* you with a
reason and build your wheel from a loose list — while the server stays the
source of truth for the pick (anti-tamper intact) and it stays **free**.

## User stories
- **US1 — Smart Pick** ✅: I tap "Smart Pick" → the wheel lands on one eligible
  restaurant with a short reason, recorded to history.
- **US2 — Mood-aware** ✅: I optionally pick mood chips (Light/Spicy/Quick/…)
  or type a vibe; matching spots get boosted and the reason reflects it.
- **US3 — Smart Add** ✅: I paste "Joe's Pizza, the new ramen spot and two taco
  places" → it's parsed into a clean list with recognised cuisines mapped to
  existing tags → I confirm (dups flagged) → added.
- **US4 — Shared-wheel** ✅: a Smart Pick broadcasts to members like a spin.

## How it works (no LLM)
- **Pick** = the wheel's existing weighting (fairness/recency via `weight.ts`,
  cuisine rotation, votes via `session.ts`) + an optional **mood boost**
  (`shared/smartPick.ts`), then `pickWeighted`. Reason is a truthful template
  derived from the chosen spot (overdue / never-picked / cuisine / mood).
- **Add** = `shared/parseAddList.ts` splits a blob (commas/"and"/newlines/
  bullets), strips command filler, dedupes, and maps a guessed cuisine to an
  **existing** wheel tag only.
- Server: `smart.pick` (authoritative: weights → picks → records → broadcasts)
  and `smart.parseAdd` (read-only proposal). Writes reuse `restaurants.add`.

## Components
- `shared/smartPick.ts` (+15 tests) · `shared/parseAddList.ts` (+11 tests).
- `server/routers.ts` → `smart` router (replaced the LLM `ai` router).
- `client` → WheelApp "Smart Pick" + mood control; RestaurantTab "Smart Add"
  parse→confirm→add dialog.

## Success criteria
- ✅ check clean · 121 tests · build green (CI to confirm on push).
- ⏳ Live smoke (deploy-gate): Smart Pick lands w/ reason; mood changes picks;
  Smart Add parses + confirm adds, dups skipped; works with no DB-less LLM key.

## Milestone breakdown
- **M1.1 Smart Pick** ✅ · **M1.2 Mood** ✅ · **M1.3 Smart Add** ✅ ·
  **M1.4 Shared broadcast** ✅.

## Risks / notes
- Heuristic reasons are templated (not prose) — acceptable per cost decision.
- Cuisine guessing is keyword-based; only ever maps to existing tags, so a wrong
  guess just means "no tag", never a bad/new tag.
- LLM can be added later as an optional, off-by-default enhancement.
