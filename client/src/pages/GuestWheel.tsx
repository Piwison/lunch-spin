import SpinWheel, { WheelSegment } from "@/components/SpinWheel";
import WinnerSurface from "@/components/WinnerSurface";
import { getLoginUrl } from "@/const";
import { segmentColor } from "@/lib/palette";
import { primaryTag } from "@shared/primaryTag";
import { trpc } from "@/lib/trpc";
import { pickWinner } from "@shared/pick";
import { shouldPromptSignup } from "@shared/onboarding";
import { ArrowRight, Sparkles, Utensils } from "lucide-react";
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
  // Client-only counter — gates the post-spin conversion CTA (decision 1b).
  const [spinCount, setSpinCount] = useState(0);

  const restaurants = restaurantsQuery.data;

  const segments: WheelSegment[] = useMemo(
    () =>
      (restaurants ?? []).map((r, i) => ({
        id: r.id,
        label: r.name,
        color: segmentColor(primaryTag(r)?.color, i),
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
    setSpinCount((c) => c + 1);
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
            className="w-12 h-12 orb-wheel animate-orb-spin"
            style={{ boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4)" }}
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
              zoomed={isSpinning || showResult}
              winnerId={spinResult?.id ?? null}
              receded={showResult}
            />

            <button
              onClick={handleSpin}
              disabled={isSpinning || segments.length === 0}
              className={`relative overflow-hidden px-12 py-4 rounded-full font-black text-base tracking-[0.15em] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                !isSpinning ? "hover:-translate-y-1 hover:brightness-110" : ""
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

      {/* ── RESULT ──
          The same surface the signed-in app uses. These two pages carried two
          near-identical copies of this overlay, which is how the guest wheel kept
          drifting a release behind; the read-only and vote-once rules differ, but
          none of the presentation does. Accept here just dismisses — a guest has
          nothing to record. */}
      {showResult && spinResult && (
        <WinnerSurface
          name={spinResult.label}
          acceptLabel="Sounds good"
          onAccept={() => setShowResult(false)}
          onRespin={handleReSpin}
          onDirections={() => openDirections(spinResult)}
          onDismiss={() => setShowResult(false)}
        >
          {shouldPromptSignup(spinCount) && (
            <div className="w-full pt-1">
              <SignInCta />
            </div>
          )}
        </WinnerSurface>
      )}
    </Shell>
  );
}

/** Page chrome: warm background, centered content. Always light — see App.tsx's
 *  route-locked ThemeProvider (a shared link should look the same for every
 *  visitor, not follow their OS/localStorage preference). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background text-foreground">
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
