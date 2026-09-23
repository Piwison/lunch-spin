import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, Copy, Navigation, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import BrandLoader from "@/components/BrandLoader";
import { SpinWheelIcon } from "@/components/SpinWheelIcon";
import { StatusChip } from "@/components/StatusChip";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "@/contexts/ThemeContext";
import { contrastRatio, parseColor } from "./contrast";
import { CONTRAST_PAIRS } from "./pairs";
import {
  COLOR_GROUPS,
  GLASS_SURFACES,
  GRADIENTS,
  MOTION_TOKENS,
  SIZE_TOKENS,
  TYPE_SCALE,
  catalogTokenNames,
} from "./catalog";

/**
 * /design-system — the living reference.
 *
 * Everything on this page is the REAL thing: the components are the ones the
 * app imports, the swatches read the tokens the browser actually resolved, and
 * the contrast table is measured here, in this theme, rather than copied from
 * a document. That is the point of having it inside the app instead of in a
 * separate tool: it cannot drift from what ships, and failure modes 21, 22 and
 * 25 are all cases where the source said one thing and the shipped stylesheet
 * did another.
 *
 * Internal and unlinked, so the copy is English and not run through i18n. A
 * lazy route: it costs the entry bundle nothing.
 */

function useResolvedTokens(theme: string) {
  const [values, setValues] = useState<Record<string, { raw: string; rgb: string | null }>>({});
  useEffect(() => {
    // ThemeProvider flips the <html> class in its own effect, which runs AFTER
    // this child's — read on the next frame, once the new theme has applied.
    const frame = requestAnimationFrame(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("span");
      probe.style.display = "none";
      document.body.appendChild(probe);
      const names = [...catalogTokenNames(), ...CONTRAST_PAIRS.flatMap((p) => [p.fg, p.bg])];
      const out: Record<string, { raw: string; rgb: string | null }> = {};
      for (const name of names) {
        probe.style.color = "";
        probe.style.color = `var(${name})`;
        const computed = probe.style.color ? getComputedStyle(probe).color : "";
        out[name] = { raw: root.getPropertyValue(name).trim(), rgb: computed || null };
      }
      probe.remove();
      setValues(out);
    });
    return () => cancelAnimationFrame(frame);
  }, [theme]);
  return values;
}

function toHex(rgb: string | null): string | null {
  const c = rgb ? parseColor(rgb) : null;
  return c ? `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}` : null;
}

function Section({ id, index, title, lead, children }: { id: string; index: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-6 scroll-mt-24">
      <div className="flex flex-col gap-2 max-w-2xl">
        <p className="type-eyebrow text-brand-text">{index}</p>
        <h2 id={`${id}-title`} className="type-title text-ink-warm">
          {title}
        </h2>
        <p className="type-body text-body-warm">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function Spec({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.8125rem] text-muted-foreground">{children}</code>;
}

export default function StyleGuide() {
  const { theme } = useTheme();
  const tokens = useResolvedTokens(theme);
  const [chips, setChips] = useState<Record<string, boolean>>({ Ramen: true, Curry: false, Salad: false });

  useEffect(() => {
    document.title = "Design system · Lunch Wheel";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const nav = [
    ["principles", "Principles"],
    ["colour", "Colour"],
    ["contrast", "Contrast"],
    ["type", "Type"],
    ["shape", "Size & shape"],
    ["glass", "Glass"],
    ["motion", "Motion"],
    ["components", "Components"],
    ["assets", "Brand assets"],
  ] as const;

  return (
    <div className="min-h-dvh">
      <header className="glass-bar glass-bar--bottom sticky top-0 z-20">
        <div className="container max-w-5xl flex items-center gap-3 py-2.5">
          <span className="orb-wheel w-7 h-7 flex-none" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="type-eyebrow text-body-warm">Lunch Wheel</p>
            <h1 className="type-meta font-semibold text-ink-warm truncate">Ember design system</h1>
          </div>
          <span className="type-meta text-muted-foreground hidden sm:inline">{theme} theme</span>
          <ThemeToggle />
        </div>
        <nav aria-label="Sections" className="container max-w-5xl flex gap-1 overflow-x-auto pb-2 onb-chips">
          {nav.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="type-meta flex-none px-3 py-1.5 rounded-chip text-body-warm hover:bg-accent hover:text-ink-warm">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main className="container max-w-5xl py-10 pb-24 flex flex-col gap-20">
        {/* ── 00 Principles ── */}
        <Section
          id="principles"
          index="00"
          title="Principles"
          lead="Four rules the rest of this page is the consequence of. When a screen and a rule disagree, fix the screen; when the owner looks at a screen and rejects the rule, change the rule — that has happened three times (failure modes 20, 26, 30)."
        >
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ["Persimmon is the only saturated colour.", "Primary action, the pointer, the winner. Everything else is ink on paper."],
              ["Glass is for what floats over content.", "The dock over the wheel, the result over the disc. Glass on bare ground or on other glass reads as a paler rectangle."],
              ["Nothing interactive under 44px.", "56 for an action, 44 for anything compact. Two heights, no third."],
              ["A token, a component, then a call site.", "Values live in index.css, recipes in components/ui, and a screen only says which one it wants."],
            ].map(([head, body]) => (
              <div key={head} className="p-5 rounded-card border border-border bg-paper">
                <p className="type-meta font-semibold text-ink-warm">{head}</p>
                <p className="type-meta text-body-warm mt-1">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 01 Colour ── */}
        <Section
          id="colour"
          index="01"
          title="Colour"
          lead="Semantic tokens: each name says what the colour is FOR, and the same name resolves to a different value in each theme. Values below are read from the browser, live — switch the theme to see the other set."
        >
          {COLOR_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <div>
                <h3 className="type-section text-ink-warm">{group.title}</h3>
                <p className="type-meta text-muted-foreground max-w-2xl">{group.note}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {group.tokens.map((tok) => (
                  <div key={tok.name} className="rounded-card border border-border bg-paper overflow-hidden" data-ds-swatch={tok.name}>
                    <div className="h-16 border-b border-border" style={{ background: `var(${tok.name})` }} />
                    <div className="p-3">
                      <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">{tok.name}</p>
                      <p className="type-meta text-body-warm leading-snug">{tok.role}</p>
                      <Spec>{toHex(tokens[tok.name]?.rgb ?? null) ?? tokens[tok.name]?.raw ?? "…"}</Spec>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="grid sm:grid-cols-2 gap-3">
            {GRADIENTS.map((tok) => (
              <div key={tok.name} className="rounded-card border border-border bg-paper overflow-hidden">
                <div className="h-20" style={{ backgroundImage: `var(${tok.name})` }} />
                <div className="p-3">
                  <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">{tok.name}</p>
                  <p className="type-meta text-body-warm">{tok.role}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 02 Contrast ── */}
        <Section
          id="contrast"
          index="02"
          title="Contrast, measured"
          lead="Every opaque pair the app paints, measured in this browser for the current theme. The same list runs as a unit test against index.css: a pair below its bar has to be written down as accepted (the owner chose it) or open (nobody has yet), and it may improve but never get worse."
        >
          <div className="rounded-card border border-border bg-paper overflow-x-auto">
            <table className="w-full type-meta">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-3 font-medium">Sample</th>
                  <th className="p-3 font-medium">Pair</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium text-right">Ratio</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {CONTRAST_PAIRS.map((pair) => {
                  const fg = parseColor(tokens[pair.fg]?.rgb ?? "");
                  const bg = parseColor(tokens[pair.bg]?.rgb ?? "");
                  const ratio = fg && bg ? contrastRatio(fg, bg) : null;
                  const known = pair.known?.[theme === "dark" ? "dark" : "light"];
                  const status = ratio == null ? "…" : ratio >= pair.min ? "pass" : (known?.status ?? "fail");
                  return (
                    <tr key={`${pair.fg}/${pair.bg}`} className="border-t border-border align-top" data-ds-contrast={`${pair.fg}/${pair.bg}`}>
                      <td className="p-3">
                        <span className="inline-flex px-2.5 py-1 rounded-chip font-semibold" style={{ color: `var(${pair.fg})`, background: `var(${pair.bg})` }}>
                          Aa 午餐
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[0.8125rem] text-ink-warm whitespace-nowrap">
                        {pair.fg}
                        <br />
                        <span className="text-muted-foreground">on {pair.bg}</span>
                      </td>
                      <td className="p-3 text-body-warm">{pair.role}</td>
                      <td className="p-3 text-right tabular-nums font-semibold text-ink-warm whitespace-nowrap">
                        {ratio ? ratio.toFixed(2) : "…"}
                        <span className="text-muted-foreground font-normal"> / {pair.min}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            status === "pass"
                              ? "text-ok font-semibold"
                              : status === "accepted"
                                ? "text-info font-semibold"
                                : "text-destructive font-semibold"
                          }
                        >
                          {status}
                        </span>
                        {known && status !== "pass" && <p className="text-muted-foreground mt-1 max-w-xs leading-snug">{known.why}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── 03 Type ── */}
        <Section
          id="type"
          index="03"
          title="Type"
          lead="One family — Bricolage Grotesque, falling through to PingFang / Noto Sans TC / JhengHei for Chinese. Six named rungs; any type token that can hold a restaurant name keeps line-height ≥ 1 and near-zero tracking, because CJK fills its em box (failure mode 23)."
        >
          <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-paper">
            {TYPE_SCALE.map((row) => (
              <div key={row.cls} className="p-5 grid md:grid-cols-[12rem_1fr] gap-2 items-baseline">
                <div>
                  <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">.{row.cls}</p>
                  <Spec>{row.spec}</Spec>
                  <p className="type-meta text-muted-foreground">{row.use}</p>
                </div>
                <p className={`${row.cls} text-ink-warm min-w-0 break-words`}>
                  {row.cls === "type-display" ? "鼎泰豐 Din Tai Fung" : row.cls === "type-eyebrow" ? "Today's pick · 今天吃" : "Where are we eating? 今天中午吃什麼"}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 04 Size & shape ── */}
        <Section
          id="shape"
          index="04"
          title="Size & shape"
          lead="Radius is chosen by what a thing IS, not how big it is: every button and field takes the control radius, every chip and badge the chip radius. Heights come in two sizes."
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SIZE_TOKENS.filter((t) => t.name.startsWith("--radius")).map((tok) => (
              <div key={tok.name} className="p-4 rounded-card border border-border bg-paper flex flex-col gap-3">
                <div className="h-16 border-2 border-brand-solid bg-accent" style={{ borderRadius: `var(${tok.name})` }} />
                <div>
                  <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">{tok.name}</p>
                  <p className="type-meta text-body-warm">
                    {tok.role} · {tokens[tok.name]?.raw}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-6 p-5 rounded-card border border-border bg-paper">
            {SIZE_TOKENS.filter((t) => t.name.startsWith("--control")).map((tok) => (
              <div key={tok.name} className="flex items-end gap-3">
                <div className="w-3 rounded-full bg-(image:--brand-grad)" style={{ height: `var(${tok.name})` }} />
                <div>
                  <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">{tok.name}</p>
                  <p className="type-meta text-body-warm">
                    {tok.role} · {tokens[tok.name]?.raw}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 05 Glass ── */}
        <Section
          id="glass"
          index="05"
          title="Glass"
          lead="Four surfaces and only four; no component writes its own backdrop-filter. Glass needs CONTENT behind it — over a flat colour it is only a paler rectangle (failure mode 29) — so these float over a wheel, the way they do in the app."
        >
          <div className="relative overflow-hidden rounded-sheet p-6 sm:p-10 min-h-80 border border-border">
            <div aria-hidden className="absolute -right-24 -top-24 w-md h-112 orb-wheel opacity-90" />
            {/* A run of names under every surface, so each one has something
                to blur and bend — the read that separates glass from a tint. */}
            <div aria-hidden className="absolute inset-0 p-6 flex flex-wrap content-start gap-x-6 gap-y-2 overflow-hidden type-section text-ink-warm/55 select-none">
              {Array.from({ length: 4 }, (_, row) =>
                ["拉麵 Ramen", "咖哩 Curry", "沙拉 Salad", "鼎泰豐", "Pho 88", "便當 Bento", "壽司 Sushi", "牛肉麵", "Tacos", "Bánh Mì", "火鍋 Hot pot", "水餃"].map((n) => (
                  <span key={`${row}-${n}`}>{n}</span>
                )),
              )}
            </div>
            <div className="relative grid sm:grid-cols-2 gap-4">
              {GLASS_SURFACES.map((s) => (
                <div
                  key={s.cls}
                  className={`${s.cls} p-5 flex flex-col gap-1`}
                  style={s.cls === "glass-bar" ? { borderRadius: "var(--radius-control)" } : undefined}
                  data-lens
                >
                  <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">.{s.cls}</p>
                  <p className="type-meta text-body-warm">{s.use}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── 06 Motion ── */}
        <Section
          id="motion"
          index="06"
          title="Motion"
          lead="Transform and opacity only. One moving thing at a time: the spin and the result are allowed to be dramatic; everything else is a confirmation you barely notice. Press any button on this page to feel --press-scale over --dur-tap."
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MOTION_TOKENS.map((tok) => (
              <div key={tok.name} className="p-4 rounded-card border border-border bg-paper">
                <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">{tok.name}</p>
                <p className="type-meta text-body-warm">{tok.role}</p>
                <Spec>{tokens[tok.name]?.raw ?? "…"}</Spec>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 07 Components ── */}
        <Section
          id="components"
          index="07"
          title="Components"
          lead="components/ui is the only place a recipe is written. A screen picks a variant and a size; if none fits, the answer is a new variant here, not a style prop there."
        >
          <div className="flex flex-col gap-4 p-5 sm:p-6 rounded-card border border-border bg-paper">
            <h3 className="type-section text-ink-warm">Button</h3>
            <p className="type-meta text-muted-foreground">
              Variants are roles. <Spec>{`<Button variant="…" size="lg | md | icon | icon-lg">`}</Spec>
            </p>
            {(
              [
                ["primary", "The persimmon action — one per view", <Navigation key="i" size={16} />],
                ["secondary", "An action on the bare ground", <Plus key="i" size={16} />],
                ["outline", "An action on glass", <Pencil key="i" size={16} />],
                ["brand-outline", "A branded secondary, beside a field", <Plus key="i" size={15} />],
                ["ghost", "A quiet way out", null],
                ["positive", "Putting something back", <RefreshCw key="i" size={14} />],
                ["destructive", "Confirming a delete", null],
                ["destructive-outline", "Offering a delete", <Trash2 key="i" size={16} />],
              ] as const
            ).map(([variant, use, icon]) => (
              <div key={variant} className="grid md:grid-cols-[11rem_1fr] gap-3 items-center py-2 border-t border-border">
                <div>
                  <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">{variant}</p>
                  <p className="type-meta text-muted-foreground leading-snug">{use}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant={variant} data-ds={`button-${variant}-lg`}>
                    {icon}
                    {variant === "primary" ? "Spin the wheel" : "Action"}
                  </Button>
                  <Button variant={variant} size="md" data-ds={`button-${variant}-md`}>
                    {icon}
                    Compact
                  </Button>
                  <Button variant={variant} size="md" disabled>
                    Disabled
                  </Button>
                </div>
              </div>
            ))}
            <div className="grid md:grid-cols-[11rem_1fr] gap-3 items-center py-2 border-t border-border">
              <div>
                <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">icon · icon-lg</p>
                <p className="type-meta text-muted-foreground leading-snug">Square; the glyph size is fixed by the control</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="icon" aria-label="Search" data-ds="button-primary-icon">
                  <Search />
                </Button>
                <Button size="icon" variant="outline" aria-label="Copy">
                  <Copy />
                </Button>
                <Button size="icon-lg" variant="secondary" aria-label="Add">
                  <Plus />
                </Button>
                <div className="flex gap-2 items-center flex-1 min-w-60">
                  <Input placeholder="A field and its action share 44px" aria-label="Example field" data-ds="input" />
                  <Button size="icon" variant="outline" aria-label="Look up">
                    <Search />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Switch aria-label="Example switch, off" data-ds="switch-off" />
                  <Switch aria-label="Example switch, on" defaultChecked />
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-3 p-5 sm:p-6 rounded-card border border-border bg-paper">
              <h3 className="type-section text-ink-warm">Chip</h3>
              <p className="type-meta text-muted-foreground">
                A toggle. Outlined off, persimmon on; <Spec>pressed</Spec> drives the look and <Spec>aria-pressed</Spec> together.
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(chips).map(([label, on]) => (
                  <Chip key={label} pressed={on} onClick={() => setChips((c) => ({ ...c, [label]: !c[label] }))} data-ds={`chip-${on ? "on" : "off"}`}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 p-5 sm:p-6 rounded-card border border-border bg-paper">
              <h3 className="type-section text-ink-warm">Badge</h3>
              <p className="type-meta text-muted-foreground">A count, and only a count.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Badge data-ds="badge-sm">3</Badge>
                <Badge>12</Badge>
                <Badge size="md">5</Badge>
                <Badge tone="neutral" size="md">
                  8
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-5 sm:p-6 rounded-card border border-border bg-paper">
            <h3 className="type-section text-ink-warm">Status</h3>
            <p className="type-meta text-muted-foreground">Inline feedback next to the thing it is about. Toasts are for what happened elsewhere.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <StatusChip variant="error" message="Couldn't reach Google Places — try again." />
              <StatusChip variant="success" message="Added 8 places to the wheel." />
              <StatusChip variant="info" message="Two places are closed right now." />
              <StatusChip variant="loading" message="Finding places nearby…" />
            </div>
          </div>
        </Section>

        {/* ── 08 Brand assets ── */}
        <Section
          id="assets"
          index="08"
          title="Brand assets"
          lead="The mark is the app's own resting wheel in miniature — glass panes, petal gaps, one persimmon pane under the pointer. Check it at the sizes people actually see it (failure mode 19): at 24px only the wedge and the closed rim survive."
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-card border border-border bg-paper flex flex-col gap-4">
              <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">.orb-wheel</p>
              <div className="flex items-end gap-5">
                {[16, 24, 48, 96].map((s) => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <span className="orb-wheel" style={{ width: s, height: s }} aria-hidden />
                    <Spec>{s}</Spec>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 rounded-card border border-border bg-paper flex flex-col gap-4">
              <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">SpinWheelIcon · BrandLoader</p>
              <div className="flex items-end gap-5 text-ink-warm">
                {[16, 20, 24, 32].map((s) => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <SpinWheelIcon size={s} />
                    <Spec>{s}</Spec>
                  </div>
                ))}
                <BrandLoader size={40} label="Loading" />
              </div>
            </div>
            <div className="p-5 rounded-card border border-border bg-paper flex flex-col gap-4 sm:col-span-2">
              <p className="font-mono text-[0.8125rem] font-semibold text-ink-warm">client/public</p>
              <div className="flex flex-wrap items-end gap-6">
                {[
                  ["/icon.svg", "favicon · round", 48],
                  ["/icon-maskable.svg", "PWA maskable · full bleed", 64],
                  ["/apple-touch-icon.png", "iOS home screen", 64],
                  ["/og.png", "link preview (LINE, Slack)", 0],
                ].map(([src, use, size]) => (
                  <figure key={src as string} className="flex flex-col gap-2">
                    <img
                      src={src as string}
                      alt=""
                      className="flex-none rounded-xl border border-border"
                      style={size ? { width: size as number, height: size as number } : { height: 96, width: "auto" }}
                    />
                    <figcaption>
                      <Spec>{src}</Spec>
                      <p className="type-meta text-body-warm">{use}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
          <p className="type-meta text-muted-foreground flex items-center gap-2">
            <Check size={14} className="text-ok" /> Spec, audit and roadmap: <Spec>docs/design-system/README.md</Spec>
            <ArrowRight size={14} />
          </p>
        </Section>
      </main>
    </div>
  );
}
