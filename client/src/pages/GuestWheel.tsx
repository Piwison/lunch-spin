import BrandLoader from "@/components/BrandLoader";
import SpinWheel, { WheelSegment } from "@/components/SpinWheel";
import WinnerSurface from "@/components/WinnerSurface";
import { getLoginUrl } from "@/const";
import { segmentColor } from "@/lib/palette";
import { primaryTag } from "@shared/primaryTag";
import { trpc } from "@/lib/trpc";
import { pickWinner } from "@shared/pick";
import { shouldPromptSignup } from "@shared/onboarding";
import { copyIntentUrl } from "@shared/copyIntent";
import { ArrowRight, CopyPlus, Sparkles, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { useLang } from "@/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const { t } = useLang();
  const params = useParams<{ wheelId?: string }>();
  const wheelId = params.wheelId ? parseInt(params.wheelId) : NaN;
  const validId = Number.isFinite(wheelId);

  // One request for the whole page (server: wheels.publicBootstrap). This was
  // getPublic followed by listPublic, the second gated on the first having
  // succeeded — two SERIAL cold round trips on the one page whose entire job is
  // to make a good first impression on someone who has never signed in.
  const entryQuery = trpc.wheels.publicBootstrap.useQuery(
    { id: wheelId },
    { enabled: validId, retry: false },
  );

  const [isSpinning, setIsSpinning] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [spinResult, setSpinResult] = useState<WheelSegment | null>(null);
  const [showResult, setShowResult] = useState(false);
  // Client-only counter — gates the post-spin conversion CTA (decision 1b).
  const [spinCount, setSpinCount] = useState(0);

  const restaurants = entryQuery.data?.restaurants;

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
  // The same loader the route chunk shows (App.tsx's RouteFallback), so the
  // chunk phase and the data phase are one continuous spinner. They used to be
  // two different things in two different layouts — a centred fixed overlay
  // swapping for an in-flow block — so the orb visibly jumped at the handover.
  if (validId && entryQuery.isLoading) {
    return <BrandLoader fullscreen label={t("app.guest.loading")} />;
  }

  // ── Not available (bad id, private, or removed) ──────────────────────────────
  if (!validId || entryQuery.isError) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="text-5xl">🍽️</div>
          <h1 className="type-title" style={{ color: "var(--ink-warm)" }}>
            {t("app.guest.unavailableTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("app.guest.unavailableBody")}
          </p>
          <SignInCta />
        </div>
      </Shell>
    );
  }

  const wheel = entryQuery.data!.wheel;

  return (
    <Shell>
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6 py-10 px-4">
        {/* Header */}
        <div className="text-center">
          <div
            className="type-eyebrow inline-flex items-center gap-1.5 px-3 py-1.5 mb-3"
            style={{
              borderRadius: "var(--radius-chip)",
              background: "oklch(from var(--brand) l c h / 0.10)",
              border: "1px solid oklch(from var(--brand) l c h / 0.25)",
              color: "var(--ink-warm)",
            }}
          >
            <Utensils size={12} style={{ color: "var(--brand-text)" }} /> {t("app.guest.public")}
          </div>
          <h1 className="type-title" style={{ color: "var(--ink-warm)" }}>
            {wheel.name}
          </h1>
        </div>

        {segments.length === 0 ? (
          /* Empty public wheel */
          <div className="flex flex-col items-center gap-3 text-center mt-8">
            <div className="text-4xl">🪹</div>
            <p className="text-sm text-muted-foreground">{t("app.guest.empty")}</p>
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

            <Button
              onClick={handleSpin}
              disabled={isSpinning || segments.length === 0}
              // While the wheel turns the action is spent, not merely unavailable:
              // it goes grey rather than pale persimmon.
              className={cn("px-12 min-w-45", isSpinning && "bg-none bg-muted text-body-warm")}
            >
              {isSpinning ? t("app.guest.spinning") : t("app.guest.spin")}
            </Button>

            <p className="type-meta text-muted-foreground">
              {t(segments.length === 1 ? "app.guest.count.one" : "app.guest.count.other", { n: segments.length })}
            </p>
          </>
        )}

        {/* Persistent conversion CTA. "Copy this wheel" leads, because for the
            person reading a shared link it is strictly the better version of
            "make your own": same destination, already filled in with places a
            real team eats at. Starting from an empty wheel stays available
            underneath for anyone who wants it. */}
        <div className="mt-4 w-full flex flex-col items-center gap-3">
          <CopyWheelCta wheelId={wheelId} />
          <a
            href={getLoginUrl()}
            className="type-meta text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            {t("app.guest.emptyWheel")}
          </a>
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
          acceptLabel={t("app.guest.accept")}
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
    <div className="min-h-dvh flex items-center justify-center overflow-x-clip text-foreground" style={{ background: "var(--ground)" }}>
      {children}
    </div>
  );
}

/**
 * Take this wheel as the starting point for your own.
 *
 * A plain link, not a mutation: a guest has no session to copy WITH, so the
 * intent travels in the URL and WheelApp performs the copy once the person is
 * signed in — including sending them through sign-in first and back here after
 * (see the copyFrom handling there). That keeps this page at the one request it
 * now costs, with no auth query of its own just to decide a button's label.
 *
 * Paper, not persimmon: Spin is why anyone opened the link, and two gradient
 * buttons on one short page argue with each other. This takes the weight the
 * old "Make your own wheel" button had, which is the thing it replaces.
 */
function CopyWheelCta({ wheelId }: { wheelId: number }) {
  const { t } = useLang();
  return (
    <Button asChild variant="secondary" className="w-full px-5">
      <a href={copyIntentUrl(wheelId)}>
        <CopyPlus size={15} className="text-brand-text" /> {t("app.guest.copy")}
      </a>
    </Button>
  );
}

/** "Make your own wheel — sign in." conversion call to action. */
function SignInCta({ subtle = false }: { subtle?: boolean }) {
  const { t } = useLang();
  if (subtle) {
    return (
      <Button asChild variant="secondary" className="w-full px-5">
        <a href={getLoginUrl()}>
          <Sparkles size={15} className="text-brand-text" />
          {t("app.guest.create")}
          <ArrowRight size={14} />
        </a>
      </Button>
    );
  }
  return (
    <Button asChild className="mt-2 px-7">
      <a href={getLoginUrl()}>
        {t("app.guest.create")} <ArrowRight size={16} />
      </a>
    </Button>
  );
}
