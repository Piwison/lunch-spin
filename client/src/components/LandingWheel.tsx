import { useCallback, useEffect, useRef, useState } from "react";
import { pickWinner } from "@shared/pick";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useLang } from "@/i18n";
import { Plus, X } from "lucide-react";

/**
 * The landing page's playable wheel.
 *
 * Why this exists rather than SpinWheel: the app's wheel is ~1000 lines carrying
 * a zoom camera, per-label blur, label fitting and the liquid-glass surface, and
 * it is imported by WheelApp. Mounting it on `/` — the entry route this project
 * has spent three measured rounds keeping cheap (AGENTS.md failure modes 12, 48,
 * 49) — would put all of that on the critical path for every first-time visitor.
 *
 * What is NOT duplicated: the pick. `pickWinner` is imported from shared/, so the
 * demo uses the same tested uniform selection as everything else. Only the
 * presentation is local.
 *
 * Deliberately UNLABELLED panes. Labels on a rotating disc are the part of this
 * product that has been rebuilt the most (failure modes 16, 43, 44, 51b: upside
 * down labels, truncation that does not fix legibility, capacity modelled as a
 * fraction of a line). None of that risk buys anything on a marketing page, and
 * at phone width a list beside the disc reads better than eight radial labels.
 * The winner is named in the list and in the result line; the signed-in wheel is
 * where labels belong.
 */

const MIN_PLACES = 2;
const MAX_PLACES = 10;
/** Long enough to type a real place, short enough to stay a chip on a phone. */
const MAX_NAME_LENGTH = 12;

const SPIN_MS = 3600;
const REDUCED_MS = 400;
const TURNS = 5;

/**
 * Accelerate, then decay — a wheel let go from rest.
 *
 * NOT `--ease-decay` (`cubic-bezier(0.08, 0.82, 0.17, 1)`): that curve opens at
 * roughly ten times its own average rate because it exists to take over from a
 * free spin already at speed, and used on a standing start it spends 59% of the
 * rotation in the first tenth of the duration and the rest looking stopped
 * (failure mode 45). `--ease-standard` front-loads for the same reason. This
 * wheel has no free-spin phase to hand over from — there is no server call — so
 * it needs a curve that starts at zero.
 */
const EASE_SPIN = "cubic-bezier(0.25, 0.05, 0.35, 1)";

export default function LandingWheel({ onSaveIntent }: { onSaveIntent?: () => void }) {
  const { t, demoPlaces } = useLang();
  const reducedMotion = useReducedMotion();

  const [places, setPlaces] = useState<string[]>(() => [...demoPlaces]);
  const [draft, setDraft] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  // Switching language re-seeds the demo — but only while it is still the seed.
  // Someone who typed their own places keeps them.
  const seededRef = useRef(true);
  useEffect(() => {
    if (seededRef.current) setPlaces([...demoPlaces]);
  }, [demoPlaces]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const step = 360 / Math.max(places.length, 1);

  const spin = useCallback(() => {
    if (spinning || places.length < MIN_PLACES) return;
    // Same uniform pick as the rest of the app, over indices into `places`.
    const target = pickWinner(places.map((_, i) => i));

    // Land pane `target` under the pointer at 12 o'clock. Rotation only ever
    // increases, so repeat spins never visibly rewind — the disc keeps turning
    // the same way however many times it is spun.
    const current = rotation;
    const landing = -target * step;
    const delta = TURNS * 360 + (((landing - current) % 360) + 360) % 360;

    setWinnerIndex(null);
    setSpinning(true);
    setRotation(current + delta);

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => {
        setSpinning(false);
        setWinnerIndex(target);
      },
      reducedMotion ? REDUCED_MS : SPIN_MS,
    );
  }, [places, rotation, spinning, step, reducedMotion]);

  const addPlace = () => {
    const name = draft.trim();
    if (!name || places.length >= MAX_PLACES) return;
    seededRef.current = false;
    setPlaces((prev) => [...prev, name]);
    setDraft("");
    setWinnerIndex(null);
  };

  const removePlace = (index: number) => {
    seededRef.current = false;
    setPlaces((prev) => prev.filter((_, i) => i !== index));
    setWinnerIndex(null);
  };

  // Panes alternate --paper and --muted, NOT the app wheel's --pane-heavy /
  // --pane-light. Those two are translucent whites (0.78 and 0.40) that read
  // because the in-app disc sits on the darker --ground with a glass dock over
  // it. On this page the disc sits on a --paper card, where white-on-white
  // leaves nothing to see — failure mode 29, a surface needs something behind
  // it to read against. --paper/--muted are opaque, carry their own dark-mode
  // values, and contrast in both themes.
  //
  // The landed pane is flat --brand-solid: a conic-gradient stop takes a colour,
  // not a gradient, and --brand-solid is the token that exists for exactly that
  // (failure mode 26). It stays the only saturated thing on the disc.
  const paneStops = places
    .map((_, i) => {
      const from = i * step;
      const to = (i + 1) * step;
      const fill =
        i === winnerIndex ? "var(--brand-solid)" : i % 2 === 0 ? "var(--paper)" : "var(--muted)";
      return `${fill} ${from}deg ${to}deg`;
    })
    .join(", ");

  const canSpin = places.length >= MIN_PLACES;

  return (
    <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12 w-full">
      {/* ── Disc ─────────────────────────────────────────────────────────── */}
      <div className="relative flex-none" style={{ width: 268, height: 268 }}>
        <div className="absolute left-1/2 -translate-x-1/2 -top-3 z-20">
          <svg width="22" height="26" viewBox="0 0 20 24" fill="none" aria-hidden="true">
            <path d="M10 22L1.5 4.5H18.5L10 22Z" fill="var(--brand-solid)" strokeLinejoin="round" />
          </svg>
        </div>
        <div
          className="w-full h-full rounded-full"
          role="img"
          aria-label={
            winnerIndex !== null
              ? `${t("demo.winner")}: ${places[winnerIndex]}`
              : t("demo.listLabel")
          }
          style={{
            background: `
              radial-gradient(closest-side, var(--paper) 0 22.5%, var(--border) 22.5% 24%, transparent 24%),
              repeating-conic-gradient(from ${-step / 2}deg, var(--border) 0deg 1.2deg, transparent 1.2deg ${step}deg),
              conic-gradient(from ${-step / 2}deg, ${paneStops}),
              var(--border)
            `,
            // A 2px --border rim, not the in-app 1px --wheel-hairline: a --paper
            // pane against a --paper card has no edge of its own, so without a
            // real rim the disc's silhouette scallops wherever a light pane meets
            // the card. The hub keeps its own hairline for the same reason.
            boxShadow:
              "inset 0 0 0 2px var(--border), 0 18px 40px -18px oklch(from var(--brand) l c h / 0.30)",
            transform: `rotate(${rotation}deg)`,
            transition: `transform ${reducedMotion ? REDUCED_MS : SPIN_MS}ms ${EASE_SPIN}`,
          }}
        />
      </div>

      {/* ── Places + controls ────────────────────────────────────────────── */}
      <div className="flex-1 w-full min-w-0">
        <p className="type-eyebrow mb-3" style={{ color: "var(--brand-text)" }}>
          {t("demo.listLabel")}
        </p>

        <ul className="flex flex-wrap gap-2 mb-4" aria-live="polite">
          {places.map((name, i) => {
            const won = i === winnerIndex;
            return (
              <li key={`${name}-${i}`}>
                <span
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 type-meta"
                  style={{
                    borderRadius: "var(--radius-chip)",
                    background: won ? "var(--brand-grad)" : "transparent",
                    color: won ? "var(--on-accent)" : "var(--body-warm)",
                    border: `1px solid ${won ? "transparent" : "var(--border)"}`,
                  }}
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removePlace(i)}
                    aria-label={t("demo.removeOne", { name })}
                    className="flex items-center justify-center rounded-full transition-opacity hover:opacity-100 opacity-60"
                    style={{ width: 22, height: 22, color: "inherit" }}
                  >
                    <X size={13} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        {places.length < MAX_PLACES && (
          <div className="flex gap-2 mb-5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPlace();
                }
              }}
              maxLength={MAX_NAME_LENGTH}
              placeholder={t("demo.addPlaceholder")}
              aria-label={t("demo.addPlaceholder")}
              className="flex-1 min-w-0 px-3.5 type-meta outline-none focus-visible:ring-2"
              style={{
                minHeight: 44,
                borderRadius: "var(--radius-control)",
                background: "var(--paper)",
                border: "1px solid var(--border)",
                color: "var(--ink-warm)",
              }}
            />
            <button
              type="button"
              onClick={addPlace}
              disabled={!draft.trim()}
              className="flex-none inline-flex items-center gap-1.5 px-4 type-meta disabled:opacity-40 transition-opacity"
              style={{
                minHeight: 44,
                borderRadius: "var(--radius-control)",
                background: "transparent",
                border: "1px solid var(--brand-solid)",
                color: "var(--brand-text)",
                fontWeight: 600,
              }}
            >
              <Plus size={15} />
              {t("demo.add")}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={spin}
          disabled={!canSpin || spinning}
          className="w-full sm:w-auto inline-flex items-center justify-center px-9 transition-opacity active:scale-[var(--press-scale)] disabled:opacity-50"
          style={{
            minHeight: 56,
            borderRadius: "var(--radius-control)",
            background: "var(--brand-grad)",
            color: "var(--on-accent)",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {spinning ? t("demo.spinning") : winnerIndex !== null ? t("demo.again") : t("demo.spin")}
        </button>

        {!canSpin && (
          <p className="type-meta mt-3" style={{ color: "var(--body-warm)" }}>
            {t("demo.needTwo")}
          </p>
        )}

        {/* Result. The conversion ask is earned, not shown up front — the same
            rule shared/onboarding.ts applies to the guest wheel. */}
        {winnerIndex !== null && !spinning && (
          <div className="mt-5 reveal">
            <p className="type-eyebrow mb-1" style={{ color: "var(--body-warm)" }}>
              {t("demo.winner")}
            </p>
            <p className="type-title mb-3" style={{ color: "var(--brand-text)" }}>
              {places[winnerIndex]}
            </p>
            {onSaveIntent && (
              <button
                type="button"
                onClick={onSaveIntent}
                className="type-meta underline underline-offset-4"
                style={{ color: "var(--body)", fontWeight: 600 }}
              >
                {t("demo.saveCta")} →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
