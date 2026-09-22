import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { readBootCache } from "@/lib/bootCache";
import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Footprints, CalendarX, Users, Ban, MapPin, ListChecks, Play, Utensils } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import LandingWheel from "@/components/LandingWheel";
import { useLang } from "@/i18n";

/**
 * The real front door. Typing the domain or opening a bookmark lands here, not
 * on /app, so everything this page does before it can redirect is on the
 * critical path for a signed-in user (see AGENTS.md failure mode 12).
 *
 * Ember: the page used to run a WebGL fbm shader, a custom cursor RAF loop and
 * six hand-rolled `backdrop-filter` surfaces. The direction is a warm paper
 * ground that never blurs, with glass reserved for floating chrome — so the
 * ground is now flat paper, the sections are solid, and the only animation left
 * is the one-shot `reveal` entrance.
 *
 * The hero is a PLAYABLE wheel rather than a picture of one. The page's whole
 * job is a first impression on someone who has never signed in, and its only
 * call to action used to be a Google sign-in wall — so anyone arriving from a
 * search for "中午吃什麼" had to create an account before the product did
 * anything. `LandingWheel` spins entirely in the browser (no request, nothing
 * recorded), and the sign-in ask is earned after a spin, the same rule
 * shared/onboarding.ts applies to the guest wheel.
 *
 * The feature copy also changed: the four cards used to be Team wheels / Smart
 * exclusion / Tag filtering / "a spin worth watching", none of which mentioned
 * nearby search — the one thing that separates this from any generic wheel
 * site, and what first-run actually does (OnboardingFlow: Locate → Pick → Spin).
 */
export default function Home() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const { t } = useLang();

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

  const steps = [
    { icon: MapPin, title: t("steps.1.title"), desc: t("steps.1.desc") },
    { icon: ListChecks, title: t("steps.2.title"), desc: t("steps.2.desc") },
    { icon: Play, title: t("steps.3.title"), desc: t("steps.3.desc") },
  ];

  const features = [
    { icon: Footprints, title: t("features.1.title"), desc: t("features.1.desc") },
    { icon: CalendarX, title: t("features.2.title"), desc: t("features.2.desc") },
    { icon: Users, title: t("features.3.title"), desc: t("features.3.desc") },
    { icon: Ban, title: t("features.4.title"), desc: t("features.4.desc") },
  ];

  const ctaStyle = {
    minHeight: 56,
    borderRadius: "var(--radius-control)",
    background: "var(--brand-grad)",
    color: "var(--on-accent)",
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: "0.04em",
  } as const;

  return (
    <div
      className="relative min-h-screen overflow-x-hidden overflow-y-auto"
      style={{ background: "var(--ground)" }}
    >
      {/* Floating chrome — the only glass on the page. */}
      <div className="fixed top-3 right-3 z-30 flex items-center gap-2">
        <LangToggle />
        <ThemeToggle />
      </div>

      {/* ── HERO ── */}
      <section className="relative z-10 px-6 pt-5 pb-12">
        {/* The brand appeared nowhere on this page before — no mark, no wordmark,
            nothing a visitor could carry away and search for later. */}
        <header className="max-w-5xl mx-auto flex items-center gap-2.5 mb-14">
          <img src="/icon.svg" width={30} height={30} alt="" aria-hidden="true" />
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-warm)", letterSpacing: "-0.01em" }}>
            Lunch Wheel
          </span>
        </header>

        <div className="max-w-5xl mx-auto">
          <div className="text-center lg:text-left mb-10">
            <p
              className="type-eyebrow mb-5 reveal"
              style={{ color: "var(--brand-text)", animationDelay: "40ms" }}
            >
              {t("hero.eyebrow")}
            </p>
            <h1
              className="type-display reveal mb-5"
              style={{
                fontSize: "clamp(2.75rem, 9vw, 5rem)",
                color: "var(--ink-strong)",
                animationDelay: "120ms",
              }}
            >
              {t("hero.title")}
            </h1>
            <p
              className="type-body reveal max-w-xl mx-auto lg:mx-0"
              style={{ color: "var(--body)", animationDelay: "200ms" }}
            >
              {t("hero.subtitle")}
            </p>
          </div>

          <div
            className="reveal p-6 sm:p-8"
            style={{
              animationDelay: "300ms",
              borderRadius: "var(--radius-sheet)",
              background: "var(--paper)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="type-meta mb-6 text-center lg:text-left" style={{ color: "var(--body-warm)" }}>
              {t("hero.tryHint")}
            </p>
            <LandingWheel onSaveIntent={() => { window.location.href = getLoginUrl(); }} />
          </div>
        </div>
      </section>

      {/* ── THREE STEPS (what first run actually does) ── */}
      <section className="relative z-10 py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="type-eyebrow text-center mb-10 reveal" style={{ color: "var(--brand-text)" }}>
            {t("steps.eyebrow")}
          </p>
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {steps.map(({ icon: Icon, title, desc }, i) => (
              <li
                key={title}
                className="p-6 reveal"
                style={{
                  borderRadius: "var(--radius-card)",
                  background: "var(--paper)",
                  border: "1px solid var(--border)",
                  animationDelay: `${i * 100}ms`,
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                    style={{
                      borderRadius: "var(--radius-chip)",
                      background: "var(--brand-grad)",
                      color: "var(--on-accent)",
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-warm)" }}>
                    <span className="type-eyebrow mr-2" style={{ color: "var(--brand-text)" }}>
                      {i + 1}
                    </span>
                    {title}
                  </h3>
                </div>
                <p className="type-meta" style={{ color: "var(--body-warm)" }}>
                  {desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="relative z-10 py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="type-eyebrow text-center mb-10 reveal" style={{ color: "var(--brand-text)" }}>
            {t("features.eyebrow")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
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
                    <Icon size={19} style={{ color: "var(--brand-text)" }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-warm)", marginBottom: 4 }}>
                      {title}
                    </h3>
                    <p className="type-meta" style={{ color: "var(--body-warm)" }}>
                      {desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── POPULAR WHEELS (try without signing in) ── */}
      {popularWheels && popularWheels.length > 0 && (
        <section className="relative z-10 py-12 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="type-eyebrow text-center mb-3 reveal" style={{ color: "var(--brand-text)" }}>
              {t("popular.eyebrow")}
            </p>
            <h2 className="type-title text-center mb-10 reveal" style={{ color: "var(--ink-warm)" }}>
              {t("popular.title")}
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
                      <Utensils size={17} style={{ color: "var(--brand-text)" }} />
                    </div>
                    <span
                      className="type-eyebrow flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--brand-text)" }}
                    >
                      {t("popular.spin")} <Play size={11} />
                    </span>
                  </div>
                  <h3
                    className="truncate"
                    style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-warm)", marginBottom: 4 }}
                  >
                    {w.name}
                  </h3>
                  <p className="type-meta" style={{ color: "var(--body-warm)" }}>
                    {t("popular.restaurants", { n: w.restaurantCount })}
                    {w.spinCount > 0 && ` · ${t("popular.spins", { n: w.spinCount })}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FINAL CTA ── */}
      <section className="relative z-10 pt-12 pb-20 px-6 text-center">
        <div
          className="max-w-2xl mx-auto p-10 sm:p-12 reveal"
          style={{
            borderRadius: "var(--radius-sheet)",
            background: "var(--paper)",
            border: "1px solid var(--border)",
          }}
        >
          <h2 className="type-title mb-4" style={{ color: "var(--ink-warm)" }}>
            {t("final.title")}
          </h2>
          <p className="type-body mb-8" style={{ color: "var(--body)" }}>
            {t("final.desc")}
          </p>
          {!loading && (
            <a
              href={getLoginUrl()}
              className="group inline-flex items-center gap-2 px-8 transition-colors duration-200 active:scale-[var(--press-scale)]"
              style={ctaStyle}
            >
              {t("final.cta")}
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
