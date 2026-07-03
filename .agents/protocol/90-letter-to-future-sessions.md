# Letter to Future Sessions

Written 2026-07-03 by claude-fable-5, in the one flagship session this project gets.
Daily operation from here on runs on cheaper tiers (sonnet/opus/haiku). This letter
covers what the owner did NOT ask for but matters most, how this system will
probably decay, and where my own confidence is lowest. Read it once per quarter or
whenever the protocol feels like it's fighting you.

## 1. Three things nobody asked me, that matter most

**1. The repo IS the memory — the loop that keeps it true is the whole system.**
Model intelligence is not this project's bottleneck; state integrity is. Sessions are
ephemeral containers; conversation memory dies at idle-reclaim. Every institutional
gain — a lesson, a status flip, a protocol fix — is real only after commit+push.
The single most damaging habit a future session can have is finishing work in chat
and pushing "later". If you internalize one rule: **CLAUDE.md rules 7 and 8 are
load-bearing; everything else is optimization.** When docs and reality drift (it
already happened — mistake-log #13), weak models don't notice; they execute the
stale doc confidently. Truth maintenance is cheap; recovering from executed
falsehood is not.

**2. Checklists set a floor, not a ceiling — schedule taste separately.**
This product is a consumer toy whose value is *delight* (the spin moment, the warm
theme, the shader glow). None of my rubrics can verify delight; a session can pass
every gate and still ship something that feels dead. Countermeasure: periodically
(each milestone, or ~monthly) run an explicit **taste pass** that no checklist
gates: `design-reviewer` agent on a machine with a display, on a real phone, by a
human, or by the strongest available model with the `frontend-design` skill and
screenshots. Log taste findings as PRD notes, not mistake-log entries — they are
direction, not defects. Do not let the existence of this protocol convince anyone
that quality is now automatic.

**3. Every rule taxes every future token — practice rule hygiene.**
CLAUDE.md is read by every session forever; each added line is a permanent tax and
each added rule dilutes attention on the existing ones (weak models skim). The
reflex after an incident is to add a rule; the discipline is the promotion path in
`40-maintenance.md` §2 (log first → promote only on second occurrence) and its
counterpart: **when you add a rule, look for one to delete or merge.** A 300-line
rulebook enforcing everything protects nothing.

## 2. How this system will degrade (predicted), and counters

| Degradation pattern | Early observable symptom | Counter |
|---|---|---|
| **Checklist theater** — gates ticked with hollow evidence (a grep that matches a comment; a "test" asserting nothing) | Review reports all-PASS but findings sections are empty across several PRs | T5 reviews must quote the evidence, not the tick; acceptance criteria must name *expected output*, not just a command |
| **Rule accretion** → CLAUDE.md bloat → skimming | `wc -l CLAUDE.md` creeping toward 150 via "one small line" commits | Hard cap is HARD (maintenance §3); extract on threshold, no exceptions |
| **Escalation ladder ignored** — cheap model grinds 5 retries on one bug | Session transcript shows >2 attempts, same failing command, no model change | Rubric §4.4 two-round cap; the Stop hook already blocks done-on-red, so grinding is visible — check attempts count in any post-mortem |
| **Doc-truth loop broken by out-of-band merges** (human merges in GitHub UI, status lines never flip) | PRD says `building`, `git log` says merged (exactly mistake #13) | Session-start cross-check (diagnostic §2); T5 template checks status lines |
| **Protocol rot** — harness evolves; agent names/model enums/hook APIs in these docs go stale | Dispatch per `10-…` §2 errors with "unknown agent/model" | `10-…` §0 says re-verify if >3 months old; inventory refresh is Tier 2 (no approval needed) — fix facts immediately, legislate never |
| **Report-contract erosion** — subagent walls of text creep back into main context | Main session quoting >20-line tool results verbatim | Treat as dispatch bug: fix the template footer usage, not the subagent |
| **Protocol worship** — following the letter against the obvious intent | A session cites a rule to justify a clearly worse outcome | Rules encode past failures, not future wisdom. When rule and evident intent conflict, do the intended thing and log the conflict as a proposal (maintenance §1 Tier 1) |

## 3. Honest low-confidence list (this session's outputs)

1. **`10-model-dispatch.md` §0 (effort/parameters)** — LOWEST confidence. I verified
   only what THIS harness surface exposes (no per-call effort on the Agent tool).
   Other surfaces (CLI flags, SDK, future harness versions) may expose real effort
   knobs I could not see. Facts there are true-as-of-today, fragile-by-design;
   that's why §0 carries a re-verify clause.
2. **Fallback/billing mechanics** — UNVERIFIED end to end. The owner's own note says
   safety fallbacks to Opus 4.8 may bill as cache-read via fallback credits; I had
   no way to test from this sandbox. Treat as "unconfirmed — check the usage
   dashboard empirically" and don't build policy on it.
3. **Compaction thresholds in `40-maintenance.md` §3** (40 entries / 300 lines / 10
   handoffs) — judgment defaults, not measurements. Tune them after a month of use;
   changing the numbers is Tier 2 maintenance.
4. **T4 research template** — never exercised in this repo (no live research task ran
   under it this session). Structure is sound; slot sizes may need tuning.
5. **Claims about `design-reviewer`/Playwright** — inherited from repo docs; the web
   sandbox has no display, so I could not validate the agent actually drives a
   browser. "Best run locally" is repo folklore I preserved, not verified.

Everything else — hook behavior (read the source), model IDs (harness-announced),
repo history (git-verified), mistake-log facts (carried verbatim) — I checked
directly and will stand behind.

— claude-fable-5, 2026-07-03
