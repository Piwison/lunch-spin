import { useState } from "react";
import { promptableLunch, taipeiDayIndex, type SpinFacts } from "@shared/lunch";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";

const DISMISSED_KEY = "lw:lunchPromptDismissed";

function readDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<number>) {
  try {
    // Only recent spins can ever be prompted, so the newest few are all worth keeping.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids).slice(-50)));
  } catch {
    /* private mode — the prompt just comes back on reload */
  }
}

export interface PromptSpin extends SpinFacts {
  restaurantName: string;
}

interface RecentLunchPromptProps {
  spins: PromptSpin[];
  /** Places the viewer has already starred — never asked about again. */
  ratedRestaurantIds: ReadonlySet<number>;
  currentUserId: number;
  onRate: (restaurantId: number, stars: number) => void;
  rating: boolean;
  /** The spinner's "we didn't go": marks the spin skipped for everyone. */
  onSkipped: (spinId: number) => void;
  skipping: boolean;
}

/**
 * "Lunch yesterday at X? ★★★★★" — the rating, asked after the meal rather than
 * on the result card, before anyone had eaten (plan A5).
 *
 * Two different "no"s. "I didn't go" is personal and only stops asking this
 * viewer (localStorage). "We didn't go", offered to whoever spun it, marks the
 * spin skipped for the whole team: it stops excluding the place and drops out
 * of History's counts (shared/lunch.ts).
 */
export default function RecentLunchPrompt({
  spins,
  ratedRestaurantIds,
  currentUserId,
  onRate,
  rating,
  onSkipped,
  skipping,
}: RecentLunchPromptProps) {
  const { t } = useLang();
  const [dismissed, setDismissed] = useState(readDismissed);
  const now = new Date();
  const lunch = promptableLunch(
    spins.filter((s) => !dismissed.has(s.id)),
    now,
    ratedRestaurantIds,
  );
  if (!lunch) return null;

  const daysAgo = taipeiDayIndex(now) - taipeiDayIndex(new Date(lunch.spunAt));
  const dismiss = () => {
    const next = new Set(dismissed).add(lunch.id);
    setDismissed(next);
    writeDismissed(next);
  };

  return (
    <section
      className="w-full flex flex-col gap-3 px-4 py-3.5"
      style={{ borderRadius: "var(--radius-card)", background: "var(--paper)", border: "1px solid var(--border)" }}
    >
      <p className="font-semibold text-balance" style={{ color: "var(--ink-warm)", fontSize: 17 }}>
        {daysAgo === 1
          ? t("wheel.prompt.yesterday", { name: lunch.restaurantName })
          : t("wheel.prompt.daysAgo", { name: lunch.restaurantName, n: daysAgo })}
      </p>
      <StarRating value={null} size={30} disabled={rating} onChange={(stars) => onRate(lunch.restaurantId, stars)} />
      <p className="type-meta" style={{ color: "var(--body)" }}>
        {t("wheel.prompt.why")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="md" onClick={dismiss}>
          {t("wheel.prompt.notMe")}
        </Button>
        {lunch.spunBy === currentUserId && (
          <Button variant="outline" size="md" disabled={skipping} onClick={() => onSkipped(lunch.id)}>
            {t("wheel.prompt.skipped")}
          </Button>
        )}
      </div>
    </section>
  );
}
