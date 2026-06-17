import SpinWheel, { WheelSegment } from "@/components/SpinWheel";
import ThemeToggle from "@/components/ThemeToggle";
import { getLoginUrl } from "@/const";
import { segmentColor } from "@/lib/palette";
import { trpc } from "@/lib/trpc";
import { pickWinner } from "@shared/pick";
import { ArrowRight, Check, MapPin, RotateCw, Sparkles, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";

/**
 * Guest (no sign-in) wheel view at /w/:wheelId.
 *
 * Read-only + client-side: we fetch a *public* wheel and its restaurants through
 * the public endpoints, and the spin winner is chosen entirely in the browser
 * (`pickWinner`, uniform). Nothing is written, so "not recorded" is guaranteed by
 * construction — there is no spin mutation on this page. Owners/members get the
 * server-authoritative experience over in WheelApp; guests get a plain spin plus
 * a persistent "make your own" call to action.
 */
export default function GuestWheel() {
  const params = useParams<{ wheelId?: string }>();
  const wheelId = params.wheelId ? parseInt(params.wheelId) : NaN;
  const validId = Number.isFinite(wheelId);

  const wheelQuery = trpc.wheels.getPublic.useQuery(
    { id: wheelId },
    { enabled: validId, retry: false },
  );
  const restaurantsQuery = trpc.restaurants.listPublic.useQuery(
    { wheelId },
    { enabled: validId && wheelQuery.isSuccess, retry: false },
  );

  const [isSpinning, setIsSpinning] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [spinResult, setSpinResult] = useState<WheelSegment | null>(null);
  const [showResult, setShowResult] = useState(false);

  const restaurants = restaurantsQuery.data;

  const segments: WheelSegment[] = useMemo(
    () =>
      (restaurants ?? []).map((r, i) => ({
        id: r.id,
        label: r.name,
        color: segmentColor(r.tags[0]?.color, i),
      })),
    [restaurants],
  );

  const handleSpin = () => {
    if (isSpinning || segments.length === 0) return;
    setShowResult(false);
    setSpinResult(null);
    // Client-side uniform pick — no server round-trip, nothing recorded.
    setTargetId(pickWinner(segments.map((s) => s.id)));
    setIsSpinning(true);
  };

  const handleSpinEnd = (segment: WheelSegment) => {
    setIsSpinning(false);
    setSpinResult(segment);
    setShowResult(true);
    setTargetId(null);
  };

  const handleReSpin = () => {
    setShowResult(false);
    setSpinResult(null);
    requestAnimationFrame(() => handleSpin());
  };

  // Result overlay is a hand-rolled dialog — keep it keyboard-dismissable.
  useEffect(() => {
    if (!showResult) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowResult(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showResult]);

  const openDirections = (segment: WheelSegment) => {
    const saved = restaurants?.find((r) => r.id === segment.id)?.mapUrl?.trim();
    const url = saved || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(segment.label)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (validId && (wheelQuery.isLoading || (wheelQuery.isSuccess && restaurantsQuery.isLoading))) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full animate-orb-spin"
            style={{
              background: "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))",
              boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4)",
            }}
          />
          <p className="text-sm text-muted-foreground">Loading wheel…</p>
        </div>
      </Shell>
    );
  }

  // ── Not available (bad id, private, or removed) ──────────────────────────────
  if (!validId || wheelQuery.isError) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="text-5xl">🍽️</div>
          <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-display)" }}>
            This wheel isn’t available
          </h1>
          <p className="text-sm text-muted-foreground">
            It may be private or no longer shared. Make your own in seconds — it’s free.
          </p>
          <SignInCta />
        </div>
      </Shell>
    );
  }

  const wheel = wheelQuery.data!;

  return (
    <Shell>
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6 py-10 px-4">
        {/* Header */}
        <div className="text-center">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] mb-3 tracking-widest"
            style={{
              fontFamily: "var(--font-display)",
              background: "oklch(from var(--brand) l c h / 0.12)",
              border: "1px solid oklch(from var(--brand) l c h / 0.30)",
              color: "var(--brand)",
            }}
          >
            <Utensils size={11} /> PUBLIC WHEEL
          </div>
          <h1 className="text-3xl font-black leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            {wheel.name}
          </h1>
        </div>

        {segments.length === 0 ? (
          /* Empty public wheel */
          <div className="flex flex-col items-center gap-3 text-center mt-8">
            <div className="text-4xl">🪹</div>
            <p className="text-sm text-muted-foreground">This wheel has no restaurants yet.</p>
          </div>
        ) : (
          <>
            <SpinWheel
              segments={segments}
              onSpinEnd={handleSpinEnd}
              isSpinning={isSpinning}
              onSpinStart={handleSpin}
              targetId={targetId}
            />

            <button
              onClick={handleSpin}
              disabled={isSpinning || segments.length === 0}
              className={`relative overflow-hidden px-12 py-4 rounded-full font-black text-base tracking-[0.15em] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                !isSpinning ? "cta-pulse hover:-translate-y-1 hover:brightness-110" : ""
              }`}
              style={{
                fontFamily: "var(--font-display)",
                background: isSpinning
                  ? "var(--muted)"
                  : "linear-gradient(135deg, var(--brand), var(--brand-2))",
                boxShadow: isSpinning
                  ? "none"
                  : "0 0 40px oklch(from var(--brand) l c h / 0.5), 0 0 80px oklch(from var(--brand-2) l c h / 0.2), 0 8px 32px rgba(0,0,0,0.5)",
                color: "white",
                minWidth: "180px",
              }}
            >
              {!isSpinning && (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 3s linear infinite",
                  }}
                />
              )}
              <span className="relative">{isSpinning ? "SPINNING..." : "SPIN"}</span>
            </button>

            <p className="text-xs text-muted-foreground">
              <span className="font-semibold" style={{ color: "var(--brand)" }}>
                {segments.length}
              </span>{" "}
              restaurant{segments.length !== 1 ? "s" : ""} on the wheel
            </p>
          </>
        )}

        {/* Persistent conversion CTA */}
        <div className="mt-4 w-full">
          <SignInCta subtle />
        </div>
      </div>

      {/* ── RESULT OVERLAY ── */}
      {showResult && spinResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in"
          style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(12px)" }}
          onClick={() => setShowResult(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Spin result: ${spinResult.label}`}
            className="animate-spin-result text-center p-8 rounded-3xl max-w-sm w-full relative overflow-hidden"
            style={{
              background: "var(--card)",
              border: `2px solid ${spinResult.color}`,
              boxShadow: `0 0 80px ${spinResult.color}55, 0 0 160px ${spinResult.color}22, 0 32px 64px rgba(0,0,0,0.6)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(circle at 50% 0%, ${spinResult.color}22 0%, transparent 70%)` }}
            />
            <div className="relative">
              <div className="text-5xl mb-4 animate-float">🎉</div>
              <p
                className="text-xs mb-2 tracking-[0.2em]"
                style={{ fontFamily: "var(--font-display)", color: "var(--muted-foreground)" }}
              >
                TODAY'S LUNCH
              </p>
              <h2
                className="text-3xl font-black mb-8 leading-tight"
                style={{
                  fontFamily: "var(--font-display)",
                  color: spinResult.color,
                  textShadow: `0 0 30px ${spinResult.color}88, 0 0 60px ${spinResult.color}44`,
                }}
              >
                {spinResult.label}
              </h2>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => openDirections(spinResult)}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
                  style={{
                    background: spinResult.color + "20",
                    border: `1px solid ${spinResult.color}60`,
                    color: spinResult.color,
                    fontFamily: "var(--font-display)",
                    letterSpacing: "0.06em",
                  }}
                >
                  <MapPin size={14} /> DIRECTIONS
                </button>
                <div className="flex gap-2.5">
                  <button
                    onClick={handleReSpin}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 hover:bg-white/8"
                    style={{
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <RotateCw size={12} /> RE-SPIN
                  </button>
                  <button
                    autoFocus
                    onClick={() => setShowResult(false)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 hover:brightness-110"
                    style={{
                      background: "oklch(0.70 0.18 150 / 0.15)",
                      border: "1px solid oklch(0.70 0.18 150 / 0.45)",
                      color: "var(--ok)",
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <Check size={12} /> ACCEPT
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Page chrome: warm background, centered content, theme toggle. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background text-foreground">
      <div className="fixed top-3 right-3 z-30">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}

/** "Make your own wheel — sign in." conversion call to action. */
function SignInCta({ subtle = false }: { subtle?: boolean }) {
  if (subtle) {
    return (
      <a
        href={getLoginUrl()}
        className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
          fontFamily: "var(--font-display)",
        }}
      >
        <Sparkles size={14} style={{ color: "var(--brand-2)" }} />
        Make your own wheel
        <ArrowRight size={14} />
      </a>
    );
  }
  return (
    <a
      href={getLoginUrl()}
      className="mt-2 inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-bold text-sm tracking-wide transition-all active:scale-95 hover:-translate-y-0.5"
      style={{
        fontFamily: "var(--font-display)",
        background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
        boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4), 0 8px 24px rgba(0,0,0,0.4)",
        color: "white",
      }}
    >
      Make your own wheel <ArrowRight size={15} />
    </a>
  );
}
