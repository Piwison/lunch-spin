# Maintenance & Evolution Protocol

Who may change what, how lessons get written back, and when files must be compacted.
"Weak model" below = any future session, whatever the tier — the rules don't depend
on trusting the editor.

## 1. Edit-permission tiers

### Tier 0 — hook-blocked (machine-enforced, ask the user, never route around)
`.env*` · `server/_core/*` · `shared/const.ts` — `guard-edit.mjs` denies these.
A denial is policy, not an error.

### Tier 1 — user approval required BEFORE editing
- `CLAUDE.md` — loads into every future session; an unnoticed bad rule compounds
  forever. Propose the diff in chat, get approval, then apply.
- `.claude/settings.json` + `.claude/hooks/*` — hooks execute with full trust.
- `.agents/protocol/10-model-dispatch.md` §§1–6 and `20-judgment-rubric.md` — the
  constitution. (Exception: §0 inventory refresh in `10-…` is Tier 2 — updating
  *verified facts* about available models is maintenance, not legislation.)
- `drizzle/meta/*` (generated), `vercel.json`, `api/index.js` by hand (regenerate via
  `pnpm build` instead).

### Tier 2 — weak model may edit autonomously (report the edit, don't ask)
- `.agents/protocol/mistake-log.md` — **append-only** (fix typos in your own new
  entry only; never rewrite old entries).
- `.agents/protocol/00-quick-diagnostic.md` — may append new numbered sections.
- `.agents/protocol/30-delegation-templates.md` — may add templates or tighten slots;
  may not delete the report contract footer.
- `.claude/skills/*/SKILL.md` for project skills (`wheel-logic`, `shader-style`,
  `deploy-gate`, `frontend-design`) — additive fixes when code has moved; anything
  that *loosens* a rule is Tier 1.
- `.agents/prd/*`, `.agents/design/*`, `.agents/handoff/*`, `todo.md` — living
  product docs; keeping status lines truthful is mandatory (CLAUDE.md rule 7).

Any edit in a tier above your authorization: stage NOTHING; write the proposal to
`.agents/protocol/proposals/{{date}}-{{topic}}.md` (create the directory if absent)
and surface it to the user.

## 2. Lesson write-back (the learning loop)

- **Where:** ONE file — `.agents/protocol/mistake-log.md`. Do not scatter lessons
  into skills/CLAUDE.md directly; the log is the intake queue.
- **When:** the moment a mistake is *confirmed* (not when suspected). Same
  session, before moving on — deferred lessons don't get written.
- **Format:** one numbered entry per lesson: bold one-line title; observable facts
  (commands, error text, PR numbers); then `→` the preventive rule, imperative and
  mechanically checkable. No feelings, no introspection, no blame.
- **Promotion path:** a lesson that fires ≥2 times earns promotion — add a rule to
  the relevant skill (Tier 2) or propose a CLAUDE.md absolute rule (Tier 1),
  keeping the log entry as the citation. This is how the constitution grows
  evidence-first instead of speculation-first.

## 3. Compaction thresholds (checked whenever you touch the file)

| File | Threshold | Action |
|---|---|---|
| `CLAUDE.md` | >150 lines (`wc -l`) | HARD STOP: must extract to a routed file before commit. Never "just this once". |
| `mistake-log.md` | >40 entries or >300 lines | Move *(Historical)*/superseded entries to `archive/mistake-log-archive.md`; keep numbering; leave a stub line "N. (archived)". |
| `.agents/handoff/` | >10 files | Keep newest 5; move the rest to `.agents/handoff/archive/`. |
| `.agents/prd/*` of a shipped milestone | on ship | Don't archive — flip the status line and leave in place (cheap, greppable history). |
| Any protocol file | >250 lines | Split by section; update CLAUDE.md routing table in the same commit. |
| Conversation context | milestone boundary reached | `/compact` per `00-quick-diagnostic.md` §1 — files first, then compact. |

Compaction commits are standalone (`docs: compact …`), never mixed into feature PRs
(same principle as mistake-log #12).

## 4. Verifying a maintenance change (cheap, mandatory)

1. `wc -l` the edited file against its threshold.
2. If CLAUDE.md's routing table changed: every referenced path must exist —
   `ls` each target (a broken route silently orphans a rule for all future sessions).
3. Read back the specific lines you changed (`Read` with offset) — confirm no
   truncation, no accidental deletion of neighbors.
4. Commit with a message that names the rule/lesson driving the change, and push.
