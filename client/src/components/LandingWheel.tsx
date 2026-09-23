import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { pickWinner } from "@shared/pick";
import { MAX_DEMO_NAME, isDuplicateName, userAddedNames } from "@shared/demoDraft";
import { DEMO_PLACES } from "@/i18n/dict";
import SpinWheel, { type WheelSegment } from "@/components/SpinWheel";
import WinnerSurface from "@/components/WinnerSurface";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useLang } from "@/i18n";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The landing page's playable wheel — the app's own SpinWheel, not a copy of it.
 *
 * This used to be a purpose-built unlabelled disc, on the grounds that SpinWheel
 * (~1000 lines: zoom camera, label fitting, liquid glass) would put all of that
 * on the entry route's critical path. By the time that was written it was
 * already there: App.tsx has imported WheelApp STATICALLY since August (the
 * note there says why), and WheelApp imports SpinWheel, so every first-time
 * visitor was downloading the real wheel and being shown a different one.
 * Using it here costs no bytes.
 *
 * What it buys is the 2026-09-23 user test's two complaints at once (BACKLOG
 * 5f/5g): the panes carry names, so the place list no longer has to sit between
 * the disc and Spin to explain it, and Spin goes directly under the wheel —
 * the two things a visitor came to use are on one screen at 390x844. The demo
 * also stops drifting from the product: this is the same wheel, camera and
 * result surface as the public wheel page (GuestWheel), which is the proven
 * composition this follows.
 *
 * What is NOT different from the app: the pick. `pickWinner` from shared/ is the
 * same uniform selection, over this page's own ids. Nothing is recorded — there
 * is no spin mutation here, same as GuestWheel.
 *
 * The disc sits on the page's --ground, never on a --paper card: its panes are
 * translucent whites (--pane-heavy/--pane-light) that read against the darker
 * ground, and white-on-white leaves nothing to see (failure mode 29). Home owns
 * that; the note is here because this is where someone would add a card back.
 */

const MIN_PLACES = 2;
const MAX_PLACES = 10;
/** Every language's seed, so a visitor who switched language mid-demo still has
 *  only what they TYPED counted as theirs. */
const ALL_SEEDS = [...DEMO_PLACES["zh-TW"], ...DEMO_PLACES.en];

interface DemoPlace {
  id: number;
  name: string;
}

export default function LandingWheel({
  onSaveIntent,
}: {
  /** Called with the places the visitor TYPED (never the seed) — see shared/demoDraft. */
  onSaveIntent?: (typed: string[]) => void;
}) {
  const { t, demoPlaces } = useLang();
  const reducedMotion = useReducedMotion();

  // Stable ids, because SpinWheel keys its labels and its winner by id — an
  // index would move every label after a removed place onto its neighbour.
  const nextId = useRef(1);
  const seed = (names: readonly string[]): DemoPlace[] =>
    names.map((name) => ({ id: nextId.current++, name }));

  const [places, setPlaces] = useState<DemoPlace[]>(() => seed(demoPlaces));
  const [draft, setDraft] = useState("");
  const [isSpinning, setIsSpinning] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [result, setResult] = useState<WheelSegment | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Switching language re-seeds the demo — but only while it is still the seed.
  // Someone who typed their own places keeps them.
  const seededRef = useRef(true);
  useEffect(() => {
    if (seededRef.current) setPlaces(seed(demoPlaces));
  }, [demoPlaces]);

  const names = places.map((p) => p.name);
  const segments: WheelSegment[] = places.map((p) => ({
    id: p.id,
    label: p.name,
    // Unused by the Ember wheel (colourless glass); required by the type.
    color: "var(--brand-solid)",
  }));

  const canSpin = places.length >= MIN_PLACES;

  // The camera pushes into the wheel from the first frame of a spin until the
  // result is dismissed, and the zoomed disc runs straight through everything
  // under it. Those controls are GONE for that window, not merely faded — a
  // half-faded Spin button showing through the middle of the disc reads as a
  // rendering fault (the same call WheelApp makes; measured here first as
  // exactly that). Reduced motion has no camera, so nothing needs to leave.
  const cameraIn = (isSpinning || showResult) && !reducedMotion;
  const goneWhileZoomed: CSSProperties = {
    opacity: cameraIn ? 0 : 1,
    pointerEvents: cameraIn ? "none" : undefined,
    transition: "opacity var(--dur-windup) var(--ease-standard)",
  };

  const spin = () => {
    if (isSpinning || !canSpin) return;
    setShowResult(false);
    setResult(null);
    // The target is known before the first frame, and SpinWheel still runs its
    // whole timeline: a reply that arrives instantly gets the spec's wind-up and
    // travel exactly (see its `beginDecay`), so a client-side pick does not
    // make the demo spin shorter than the real thing.
    setTargetId(pickWinner(places.map((p) => p.id)));
    setIsSpinning(true);
  };

  const onSpinEnd = (segment: WheelSegment) => {
    setIsSpinning(false);
    setTargetId(null);
    setResult(segment);
    setShowResult(true);
  };

  const respin = () => {
    setShowResult(false);
    setResult(null);
    requestAnimationFrame(() => spin());
  };

  // A repeat would get a second wedge and silently double its odds (2026-09-23
  // user test), so it is refused here, with the reason on screen.
  const draftIsDuplicate = draft.trim() !== "" && isDuplicateName(draft, names);
  const full = places.length >= MAX_PLACES;
  const typed = userAddedNames(names, ALL_SEEDS);

  const addPlace = () => {
    const name = draft.trim();
    if (!name || full || draftIsDuplicate || isSpinning) return;
    seededRef.current = false;
    setPlaces((prev) => [...prev, { id: nextId.current++, name }]);
    setDraft("");
    setResult(null);
  };

  const removePlace = (id: number) => {
    if (isSpinning) return;
    seededRef.current = false;
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    setResult(null);
  };

  const openDirections = (name: string) => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="w-full flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-12">
      {/* ── Wheel + Spin ──────────────────────────────────────────────────────
          One column, Spin directly under the disc (BACKLOG 5g). The editor is
          below it on a phone, beside it from lg. */}
      <div className="w-full lg:w-[390px] flex-none flex flex-col items-center gap-5">
        <SpinWheel
          segments={segments}
          onSpinStart={spin}
          onSpinEnd={onSpinEnd}
          isSpinning={isSpinning}
          targetId={targetId}
          zoomed={isSpinning || showResult}
          winnerId={result?.id ?? null}
          // No recede on this page (owner's pick, 2026-09-23). In the app the
          // camera parks the disc centre above the dock, so the receded winning
          // pane fills the top half; here the disc sits under the hero at ~2x,
          // and a pale disc blurred on pale ground left that half empty. Kept
          // sharp, the top half shows the pointer resting on the won pane.
          receded={false}
        />

        <div className="w-full flex flex-col items-center gap-3" style={{ maxWidth: 390, ...goneWhileZoomed }}>
          {/* font-semibold: see the landing page's final call to action. */}
          <Button type="button" onClick={spin} disabled={!canSpin || isSpinning} className="w-full px-9 font-semibold">
            {isSpinning ? t("demo.spinning") : result ? t("demo.again") : t("demo.spin")}
          </Button>

          {!canSpin && (
            <p className="type-meta text-center" style={{ color: "var(--body-warm)" }}>
              {t("demo.needTwo")}
            </p>
          )}
        </div>
      </div>

      {/* ── Places ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 w-full min-w-0" style={goneWhileZoomed}>
        {/* The try-hint heads the list it is about — beside the wheel from lg,
            under Spin on a phone. It used to sit above the disc, where it cost
            the 45-68px that kept Spin off the first screen. */}
        <p className="type-meta mb-4" style={{ color: "var(--body-warm)" }}>
          {t("hero.tryHint")}
        </p>
        {/* Ink, not persimmon: 11px persimmon on paper is 3.48:1 (failure mode
            20 keeps it for large type and fills; small labels owe 4.5:1). */}
        <p className="type-eyebrow mb-3 flex items-center gap-2" style={{ color: "var(--ink-warm)" }}>
          {t("demo.listLabel")}
          <span style={{ color: "var(--body-warm)", letterSpacing: "0.08em" }}>
            {places.length}/{MAX_PLACES}
          </span>
        </p>

        <ul className="flex flex-wrap gap-2 mb-4">
          {places.map((p) => (
            <li key={p.id}>
              <span
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 type-meta"
                style={{
                  borderRadius: "var(--radius-chip)",
                  background: "var(--paper)",
                  color: "var(--body-warm)",
                  border: "1px solid var(--border)",
                }}
              >
                {p.name}
                {/* A real 44×44 box (the mobile target), pulled back into
                    the chip by negative margins so the chip stays compact
                    and only the × glyph is visible. */}
                <button
                  type="button"
                  onClick={() => removePlace(p.id)}
                  disabled={isSpinning}
                  aria-label={t("demo.removeOne", { name: p.name })}
                  className="flex items-center justify-center rounded-full transition-opacity hover:opacity-100 opacity-60 disabled:opacity-30"
                  style={{ width: 44, height: 44, margin: "-11px -8px -11px -11px", color: "inherit" }}
                >
                  <X size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>

        {/* Stays on screen at the limit, disabled, with the reason — a control
            that silently vanishes at 10 reads as a layout failure. */}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPlace();
              }
            }}
            disabled={full}
            maxLength={MAX_DEMO_NAME}
            placeholder={t("demo.addPlaceholder")}
            aria-label={t("demo.addPlaceholder")}
            aria-invalid={draftIsDuplicate || undefined}
            aria-describedby="demo-add-note"
            className="flex-1 min-w-0 px-3.5 outline-none focus-visible:ring-2 disabled:opacity-50"
            style={{
              minHeight: 44,
              // 16px, not the 15px meta size: iOS zooms the page into any
              // focused input under 16px, and the page no longer blocks zoom.
              fontSize: 16,
              borderRadius: "var(--radius-control)",
              background: "var(--paper)",
              border: `1px solid ${draftIsDuplicate ? "var(--destructive)" : "var(--input)"}`,
              color: "var(--ink-warm)",
            }}
          />
          <Button
            type="button"
            variant="brand-outline"
            size="md"
            onClick={addPlace}
            disabled={!draft.trim() || full || draftIsDuplicate || isSpinning}
            className="flex-none gap-1.5"
          >
            <Plus size={15} />
            {t("demo.add")}
          </Button>
        </div>
        <p
          id="demo-add-note"
          role="status"
          className="type-meta mt-2 min-h-[1.4em]"
          style={{ color: draftIsDuplicate ? "var(--destructive)" : "var(--body-warm)" }}
        >
          {draftIsDuplicate ? t("demo.duplicate") : full ? t("demo.full", { max: MAX_PLACES }) : ""}
        </p>
      </div>

      {/* ── Result ─────────────────────────────────────────────────────────────
          The surface the app and the public wheel use. Portalled to <body>:
          Home wraps this demo in `.reveal`, whose animation ends on
          `transform: translateY(0)` — and any transform makes an element the
          containing block for `position: fixed` descendants, so rendered in
          place this full-screen overlay would be boxed into the hero. The
          sign-in ask is earned after a spin, and says exactly what survives
          it: the places the visitor typed, never the seeded examples. */}
      {showResult &&
        result &&
        createPortal(
          <WinnerSurface
            name={result.label}
            acceptLabel={t("app.guest.accept")}
            onAccept={() => setShowResult(false)}
            onRespin={respin}
            onDirections={() => openDirections(result.label)}
            onDismiss={() => setShowResult(false)}
          >
            {onSaveIntent && (
              <div className="w-full pt-1 text-center">
                <button
                  type="button"
                  onClick={() => onSaveIntent(typed)}
                  className="type-meta underline underline-offset-4"
                  style={{ color: "var(--body)", fontWeight: 600, minHeight: 44 }}
                >
                  {typed.length > 0 ? t("demo.saveTyped", { n: typed.length }) : t("demo.saveCta")} →
                </button>
              </div>
            )}
          </WinnerSurface>,
          document.body,
        )}
    </div>
  );
}
