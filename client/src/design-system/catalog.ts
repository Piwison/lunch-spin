/**
 * What the /design-system page shows, as data. Kept apart from the page so the
 * token test can check every name here against index.css — a style guide that
 * silently renders an empty swatch for a renamed token is worse than none.
 */

export type TokenEntry = { name: string; role: string };
export type TokenGroup = { title: string; note: string; tokens: TokenEntry[] };

export const COLOR_GROUPS: TokenGroup[] = [
  {
    title: "Ink",
    note: "Two primary inks coexist today: --foreground (cool, shadcn primitives) and --ink-warm (warm, the Ember-drawn screens). Which one is THE text colour is open.",
    tokens: [
      { name: "--ink-strong", role: "display type only" },
      { name: "--foreground", role: "headings, primary text (cool)" },
      { name: "--ink-warm", role: "primary text on Ember screens (warm)" },
      { name: "--body", role: "body copy" },
      { name: "--body-warm", role: "meta on Ember screens" },
      { name: "--muted-foreground", role: "labels, meta" },
      { name: "--faint", role: "placeholder, disabled" },
    ],
  },
  {
    title: "Surface",
    note: "The ground is a gradient and never blurs. --muted and --accent are pale SURFACES here (hover, panels), not the grey and persimmon their names suggest.",
    tokens: [
      { name: "--background", role: "the ground's flat mid stop" },
      { name: "--paper", role: "solid cards, text on persimmon" },
      { name: "--card", role: "card surface" },
      { name: "--muted", role: "pale panel" },
      { name: "--accent", role: "hover fill" },
      { name: "--border", role: "hairline, rules" },
    ],
  },
  {
    title: "Persimmon",
    note: "The only saturated colour in the app. Backgrounds take --brand-grad; borders and SVG take --brand-solid, because they cannot hold a gradient.",
    tokens: [
      { name: "--brand", role: "the persimmon" },
      { name: "--brand-2", role: "the gradient's light end" },
      { name: "--brand-solid", role: "persimmon as a colour: borders, SVG" },
      { name: "--brand-text", role: "persimmon type (3.48:1, accepted)" },
      { name: "--accent-ink", role: "winner display type, 34px+" },
      { name: "--on-accent", role: "ink on a persimmon fill" },
    ],
  },
  {
    title: "Semantic",
    note: "Deliberately desaturated so nothing competes with persimmon.",
    tokens: [
      { name: "--destructive", role: "errors, delete" },
      { name: "--ok", role: "success, putting back" },
      { name: "--info", role: "notices" },
      { name: "--star", role: "rating fill" },
      { name: "--star-edge", role: "rating outline (carries the contrast)" },
    ],
  },
];

export const GRADIENTS: TokenEntry[] = [
  { name: "--ground", role: "the app background" },
  { name: "--brand-grad", role: "every persimmon background" },
];

export const TYPE_SCALE = [
  { cls: "type-display", spec: "68 / 1.04 · 600 · -0.02em", use: "the winner's name, nowhere else" },
  { cls: "type-title", spec: "34 / 1.12 · 600 · -0.02em", use: "screen title" },
  { cls: "type-section", spec: "28 / 1.14 · 600 · -0.02em", use: "section title, dialog title" },
  { cls: "type-body", spec: "17 / 1.45 · 400", use: "body copy" },
  { cls: "type-meta", spec: "15 / 1.4 · 400", use: "meta, list rows, most UI text" },
  { cls: "type-eyebrow", spec: "11 · 700 · 0.2em · uppercase", use: "labels above sections" },
] as const;

export const SIZE_TOKENS: TokenEntry[] = [
  { name: "--control-lg", role: "an action: 56" },
  { name: "--control-md", role: "compact + tap-target floor: 44" },
  { name: "--radius-chip", role: "chips, badges" },
  { name: "--radius-control", role: "buttons, fields" },
  { name: "--radius-card", role: "cards" },
  { name: "--radius-sheet", role: "sheets" },
  { name: "--dock-height", role: "the dock, safe area included" },
];

export const MOTION_TOKENS: TokenEntry[] = [
  { name: "--dur-tap", role: "press feedback" },
  { name: "--dur-toggle", role: "a switch flipping" },
  { name: "--dur-view", role: "a view changing" },
  { name: "--dur-sheet-in", role: "a sheet arriving" },
  { name: "--dur-sheet-out", role: "a sheet leaving" },
  { name: "--ease-standard", role: "everything that enters" },
  { name: "--ease-exit", role: "everything that leaves" },
  { name: "--ease-settle", role: "the wheel landing — the only overshoot" },
  { name: "--press-scale", role: "how far a pressed control sinks" },
];

export const GLASS_SURFACES = [
  { cls: "glass-bar", use: "the dock, the desktop tab row" },
  { cls: "glass-sheet", use: "sheets, dialogs, the result" },
  { cls: "glass-card", use: "floating cards, menus, toasts" },
  { cls: "glass-chip", use: "small floating chrome" },
] as const;

export function catalogTokenNames(): string[] {
  return [
    ...COLOR_GROUPS.flatMap((g) => g.tokens.map((t) => t.name)),
    ...GRADIENTS.map((t) => t.name),
    ...SIZE_TOKENS.map((t) => t.name),
    ...MOTION_TOKENS.map((t) => t.name),
  ];
}
