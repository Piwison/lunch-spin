import { Star } from "lucide-react";
import { useState } from "react";
import { useLang } from "@/i18n";

type StarRatingProps = {
  /** Current rating; may be fractional for a read-only average. Null = unrated. */
  value: number | null;
  /** Provide to make it interactive (hover preview + click). Omit for read-only. */
  onChange?: (stars: number) => void;
  size?: number;
  disabled?: boolean;
};

/**
 * 1–5 star control. Interactive when `onChange` is supplied; otherwise a
 * read-only display that rounds a fractional average to the nearest star.
 * Stars use the warm --star token so they read in light and dark.
 */
export function StarRating({ value, onChange, size = 24, disabled = false }: StarRatingProps) {
  const { t } = useLang();
  const [hover, setHover] = useState<number | null>(null);
  const readOnly = !onChange || disabled;
  const shown = hover ?? Math.round(value ?? 0);

  return (
    <div className="inline-flex items-center gap-1" role={readOnly ? undefined : "radiogroup"} aria-label={readOnly ? undefined : t("common.rating.label")}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= shown;
        const glyph = (
          <Star
            size={size}
            style={{ fill: on ? "var(--star)" : "none", color: on ? "var(--star-edge)" : "var(--border)" }}
          />
        );
        if (readOnly) {
          return <span key={n} aria-hidden="true">{glyph}</span>;
        }
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t(n === 1 ? "common.rating.star.one" : "common.rating.star.other", { n })}
            onClick={() => onChange!(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            className="rounded transition-transform duration-100 hover:scale-110 active:scale-90"
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
}

/** Compact glanceable chip for a list row: a filled star + the average, or a
 *  dashed "New" when nothing has been rated yet. */
export function RatingChip({ average }: { average: number | null }) {
  const { t } = useLang();
  if (average == null) {
    return (
      <span
        className="inline-flex items-center gap-1 type-meta font-medium px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ border: "1px dashed var(--border)", color: "var(--muted-foreground)" }}
      >
        <Star size={11} style={{ fill: "none", color: "var(--muted-foreground)" }} /> {t("common.rating.none")}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 type-meta font-bold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: "color-mix(in oklch, var(--star) 18%, transparent)", color: "var(--foreground)" }}
    >
      <Star size={12} style={{ fill: "var(--star)", color: "var(--star-edge)" }} /> {average.toFixed(1)}
    </span>
  );
}
