# UI string namespaces

One file per area of the product. `../dict.ts` only combines them.

| File | Prefixes | Area |
|---|---|---|
| `common.ts` | `lang.` | the language switch (anything rendered by more than one area) |
| `landing.ts` | `hero.` `demo.` `steps.` `features.` `popular.` `final.` | the landing page `/` |
| `onboarding.ts` | `onb.` `loc.` | first run + the shared `LocationPicker` |
| `app.ts` | `app.` | signed-in shell: header, profile menu, dock, cross-tab toasts |
| `wheel.ts` | `wheel.` | Wheel tab: hub, spin button, result, filters, round panel |
| `places.ts` | `places.` | Restaurants tab, add form, ADD NEARBY, tags, ratings |
| `history.ts` | `history.` | History tab, stats, taste profile |
| `settings.ts` | `settings.` | WheelSelector: switcher, create/settings/delete/leave, invites |
| `err.ts` | `err.` | user-facing errors, keyed by tRPC error code |

## Rules

1. **A file may only use its own prefixes.** Each `zh` object ends in
   `as const satisfies Record<`prefix.${string}`, string>`, so a key with another
   file's prefix is a type error. That is what makes the spread in `dict.ts` safe:
   two files cannot define the same key and silently overwrite each other.
2. **Every key needs both languages.** `en` is `Record<keyof typeof zh, string>`,
   so a missing or extra English string fails `pnpm check`.
3. **Don't edit `dict.ts` to add strings.** All nine namespaces are already
   registered there. Adding a NEW namespace is the only reason to touch it.
4. **Placeholders are `{name}`**, substituted by `t(key, { name })`. There is no
   plural support: for English plurals add `x.one` / `x.other` and pick in the
   component by `n === 1`, or phrase around the count (`"{n} nearby"`).
5. **Data is not UI.** Restaurant names, tag labels stored in the DB and wheel
   names are user or seed data. Translate a canonical tag label for DISPLAY via a
   map in `places.ts`; never rename the stored value (cuisine matching relies on
   the English labels `shared/placeMapping.ts` emits).
6. **Words:** `docs/i18n/glossary.md`. **Workflow:** `docs/i18n/codex-flow.md`.
