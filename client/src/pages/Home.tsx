import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { readBootCache } from "@/lib/bootCache";
import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "wouter";
import { Users, Clock, Tags, Sparkles, ArrowRight, Utensils, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ThemeToggle from "@/components/ThemeToggle";

const FEATURES = [
  { icon: Users, label: "Team wheels", desc: "Shared wheels for your whole squad" },
  { icon: Clock, label: "Smart exclusion", desc: "Auto-skip recently picked spots" },
  { icon: Tags, label: "Tag filtering", desc: "Filter by cuisine or food type" },
  { icon: Sparkles, label: "A spin worth watching", desc: "The camera pushes into the wheel" },
];

const STATS = [
  { value: "10s", label: "to decide lunch" },
  { value: "0", label: "arguments" },
  { value: "∞", label: "restaurants" },
];

/**
 * The real front door. Typing the domain or opening a bookmark lands here, not
 * on /app, so everything this page does before it can redirect is on the
 * critical path for a signed-in user (see AGENTS.md failure mode 12).
 *
 * Ember: the page used to run a WebGL fbm shader, a custom cursor RAF loop and
 * six hand-rolled `backdrop-filter` surfaces. The direction is a warm paper
 * ground that never blurs, with glass reserved for floating chrome — so the
 * ground is now flat paper, the sections are solid, and the only animation left
 * is the one-shot `reveal` entrance. That also takes the marketing page from
 * ~41 idle frames a second to zero.
 */
export default function Home() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  // A signed-in visitor is redirected to /app, so the public-wheels query is
  // pure waste for them. Gate it behind "we know this visitor is anonymous".
  const isGuest = !loading && !user;

  // ── Don't make signed-in visitors pay for this page ───────────────────────
  // 1. A returning visitor has last session's payload in localStorage, so we
  //    know they're signed in before the first paint. Redirect in a layout
  //    effect and never render the marketing page at all.
  const [hasStoredSession] = useState(() => readBootCache() !== null);
  useLayoutEffect(() => {
    if (hasStoredSession) navigate("/app", { replace: true });
  }, [hasStoredSession, navigate]);

  // 2. Everyone else: issue bootstrap HERE, in the same tick as useAuth's
  //    auth.me, so httpBatchLink folds both into ONE request. By the time the
  //    redirect below fires, WheelApp's entry payload is already in the cache
  //    and it re-renders warm instead of starting a second round trip.
  //    The `{ wheelId: null }` input must match WheelApp's query key exactly —
  //    it freezes to null when the URL carries no wheel. That's also why the
  //    redirect goes to "/app" and never "/app/<id>": a wheel-specific URL
  //    would change the key and re-issue the request we just paid for.
  //    Anonymous visitors cost nothing here — bootstrap returns user:null
  //    without touching the database.
  trpc.wheels.bootstrap.useQuery({ wheelId: null }, { staleTime: 30_000 });

  // Popular public wheels — guests can try one without signing in.
  const { data: popularWheels } = trpc.wheels.listPublic.useQuery(
    { limit: 6 },
    { enabled: isGuest },
  );

  useEffect(() => {
    if (!loading && user) navigate("/app", { replace: true });
  }, [user, loading, navigate]);

  // Returning signed-in visitor: the layout effect above is already navigating
  // to /app. Render nothing rather than flashing a marketing page they'll never
  // read. (After every hook, so the hook order stays stable.)
  if (hasStoredSession) return null;

  return (
    <div className="relative min-h-screen overflow-x-hidden overflow-y-auto" style={{ background: "var(--ground)" }}>
      {/* Theme toggle — the one piece of floating chrome, so the one piece of glass. */}
      <div className="fixed top-3 right-3 z-30">
        <ThemeToggle />
      </div>

      {/* ── HERO ── */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 pt-16 pb-24">
        <div className="mb-10 flex justify-center reveal" style={{ animationDelay: "40ms" }}>
          <div className="relative">
            {/* Pointer — the same shape that bites into the rim in the app. */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-3 z-30">
              <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true">
                <path d="M10 22L1.5 4.5H18.5L10 22Z" fill="var(--brand)" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Wheel face — real palette segments, so the hero IS the product */}
            <div className="w-36 h-36 orb-wheel" style={{ boxShadow: "0 18px 40px rgb(20 22 28 / 0.14)" }} />
            <div
              className="absolute inset-0 m-auto w-9 h-9 rounded-full"
              style={{ background: "var(--paper)", boxShadow: "0 2px 8px rgb(20 22 28 / 0.18)" }}
            />
          </div>
        </div>

        <div className="text-center mb-6">
          <h1
            className="type-display reveal"
            style={{ fontSize: "clamp(3.25rem, 12vw, 7rem)", color: "var(--brand)", animationDelay: "120ms" }}
          >
            Spin
          </h1>
          <h1
            className="type-display reveal"
            style={{ fontSize: "clamp(3.25rem, 12vw, 7rem)", color: "var(--ink-strong)", animationDelay: "200ms" }}
          >
            your lunch
          </h1>
        </div>

        <p
          className="type-body text-center mb-12 max-w-md reveal"
          style={{ color: "var(--body)", animationDelay: "320ms" }}
        >
          Stop debating. Start spinning. The lunch wheel for teams who can&apos;t decide.
        </p>

        <div className="reveal" style={{ animationDelay: "440ms" }}>
          {loading ? (
            <div className="h-14 w-48 animate-pulse" style={{ borderRadius: "var(--radius-control)", background: "var(--muted)" }} />
          ) : (
            <a
              href={getLoginUrl()}
              className="group inline-flex items-center justify-center gap-3 px-10 transition-colors duration-200 active:scale-[var(--press-scale)]"
              style={{
                minHeight: 56,
                borderRadius: "var(--radius-control)",
                background: "var(--brand)",
                color: "var(--on-accent)",
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: "0.05em",
              }}
            >
              <span>Get started</span>
              <ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-1" />
            </a>
          )}
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="relative z-10 py-12 px-6">
        <div
          className="max-w-3xl mx-auto grid grid-cols-3 gap-4 p-6"
          style={{ borderRadius: "var(--radius-card)", background: "var(--paper)", border: "1px solid var(--border)" }}
        >
          {STATS.map(({ value, label }, i) => (
            <div key={label} className="text-center reveal" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="type-title mb-1.5" style={{ color: "var(--brand)" }}>{value}</div>
              <div className="type-eyebrow" style={{ color: "var(--body-warm)" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="type-eyebrow text-center mb-12 reveal" style={{ color: "var(--brand)" }}>
            Built for the 11:45 scramble
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, label, desc }, i) => (
              <div
                key={label}
                className="p-6 reveal"
                style={{
                  borderRadius: "var(--radius-card)",
                  background: "var(--paper)",
                  border: "1px solid var(--border)",
                  animationDelay: `${i * 100}ms`,
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 flex items-center justify-center flex-shrink-0"
                    style={{
                      borderRadius: "var(--radius-chip)",
                      background: "oklch(from var(--brand) l c h / 0.10)",
                      border: "1px solid oklch(from var(--brand) l c h / 0.22)",
                    }}
                  >
                    <Icon size={19} style={{ color: "var(--brand)" }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-warm)", marginBottom: 4 }}>{label}</h3>
                    <p className="type-meta" style={{ color: "var(--body-warm)" }}>{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── POPULAR WHEELS (try without signing in) ── */}
      {popularWheels && popularWheels.length > 0 && (
        <section className="relative z-10 py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="type-eyebrow text-center mb-3 reveal" style={{ color: "var(--brand)" }}>
              Try without signing in
            </p>
            <h2 className="type-title text-center mb-10 reveal" style={{ color: "var(--ink-warm)" }}>
              Popular wheels
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {popularWheels.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => navigate(`/w/${w.id}`)}
                  className="group p-5 text-left reveal transition-colors duration-200"
                  style={{
                    borderRadius: "var(--radius-card)",
                    background: "var(--paper)",
                    border: "1px solid var(--border)",
                    animationDelay: `${i * 80}ms`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div
                      className="w-11 h-11 flex items-center justify-center flex-shrink-0"
                      style={{
                        borderRadius: "var(--radius-chip)",
                        background: "oklch(from var(--brand) l c h / 0.10)",
                        border: "1px solid oklch(from var(--brand) l c h / 0.22)",
                      }}
                    >
                      <Utensils size={17} style={{ color: "var(--brand)" }} />
                    </div>
                    <span
                      className="type-eyebrow flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--brand)" }}
                    >
                      Spin <Play size={11} />
                    </span>
                  </div>
                  <h3 className="truncate" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-warm)", marginBottom: 4 }}>
                    {w.name}
                  </h3>
                  <p className="type-meta" style={{ color: "var(--body-warm)" }}>
                    {w.restaurantCount} restaurant{w.restaurantCount !== 1 ? "s" : ""}
                    {w.spinCount > 0 && ` · ${w.spinCount} spin${w.spinCount !== 1 ? "s" : ""}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FINAL CTA ── */}
      <section className="relative z-10 py-24 px-6 text-center">
        <div
          className="max-w-2xl mx-auto p-12 reveal"
          style={{ borderRadius: "var(--radius-sheet)", background: "var(--paper)", border: "1px solid var(--border)" }}
        >
          <h2 className="type-title mb-4" style={{ color: "var(--ink-warm)" }}>Ready to spin?</h2>
          <p className="type-body mb-8" style={{ color: "var(--body)" }}>
            Create your first wheel in seconds. Add your team&apos;s favourite spots and let fate decide.
          </p>
          {!loading && (
            <a
              href={getLoginUrl()}
              className="group inline-flex items-center gap-2 px-8 transition-colors duration-200 active:scale-[var(--press-scale)]"
              style={{
                minHeight: 56,
                borderRadius: "var(--radius-control)",
                background: "var(--brand)",
                color: "var(--on-accent)",
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: "0.05em",
              }}
            >
              Start for free
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
