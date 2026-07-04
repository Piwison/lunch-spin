import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Compass, PieChart, Repeat } from "lucide-react";
import {
  withinDays,
  varietyScore,
  cuisineMix,
  currentRut,
  type SpinEvent,
  type VarietyBand,
} from "@shared/insights";

interface TasteInsightsProps {
  /** Cuisine-annotated spin timeline, assembled by HistoryTab from existing queries. */
  events: SpinEvent[];
}

const WINDOW_DAYS = 30;

const ACCENTS = [
  "var(--brand)",
  "var(--brand-2)",
  "oklch(0.70 0.20 160)",
  "oklch(0.75 0.18 60)",
  "oklch(0.68 0.22 340)",
];

const BAND_STYLE: Record<Exclude<VarietyBand, "none">, { color: string; label: string }> = {
  high: { color: "oklch(0.70 0.20 160)", label: "Great variety" },
  medium: { color: "var(--brand-2)", label: "Decent mix" },
  low: { color: "var(--brand)", label: "A bit repetitive" },
};

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

export function TasteInsights({ events }: TasteInsightsProps) {
  const recent = useMemo(() => withinDays(events, WINDOW_DAYS), [events]);
  const variety = useMemo(() => varietyScore(recent), [recent]);
  const mix = useMemo(() => cuisineMix(recent), [recent]);
  const rut = useMemo(() => currentRut(events), [events]);

  // Nothing to summarise yet — HistoryTab also guards, but stay self-safe.
  if (variety.totalSpins === 0) return null;

  const band = variety.band === "none" ? BAND_STYLE.low : BAND_STYLE[variety.band];
  const maxCount = mix[0]?.count ?? 0;

  return (
    <div className="space-y-4">
      {/* Variety — the headline read */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Compass size={15} style={{ color: band.color }} />
          <h3 className="text-sm font-bold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
            VARIETY
          </h3>
        </div>
        <div className="flex items-end gap-3 mb-2">
          <span
            className="text-4xl font-black leading-none"
            style={{ fontFamily: "var(--font-display)", color: band.color }}
          >
            {variety.score}
          </span>
          <span className="text-sm text-muted-foreground pb-1">/ 100 · {band.label}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: "var(--muted)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(variety.score, 4)}%`, background: band.color }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {plural(variety.distinctRestaurants, "place")} · {plural(variety.distinctCuisines, "cuisine")} ·{" "}
          {plural(variety.totalSpins, "spin")} in the last {WINDOW_DAYS} days
        </p>
      </Card>

      {/* In a rut — only when recent spins cluster */}
      {rut && (
        <Card className="p-4">
          <div className="flex items-start gap-2.5">
            <Repeat size={15} className="mt-0.5 flex-shrink-0" style={{ color: "var(--brand)" }} />
            <p className="text-sm">
              <span className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                In a rut:
              </span>{" "}
              <span style={{ color: "var(--brand)" }}>{rut.label}</span>
              {rut.kind === "cuisine" ? " (cuisine)" : ""} — {rut.count} of the last {rut.window} spins.
              <span className="text-muted-foreground"> Maybe mix it up?</span>
            </p>
          </div>
        </Card>
      )}

      {/* Cuisine mix over the window */}
      {mix.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <PieChart size={15} style={{ color: "var(--brand-2)" }} />
            <h3 className="text-sm font-bold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
              CUISINE MIX
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">What you've actually been eating — last {WINDOW_DAYS} days.</p>
          <div className="space-y-3">
            {mix.map((slice, idx) => {
              const pct = maxCount > 0 ? (slice.count / maxCount) * 100 : 0;
              const accent = ACCENTS[idx % ACCENTS.length];
              return (
                <div key={slice.cuisine}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-sm font-medium truncate flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
                      {slice.cuisine}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                      {slice.pct}% · {slice.count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 6)}%`, background: accent }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
