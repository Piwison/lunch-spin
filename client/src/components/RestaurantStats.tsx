import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { overdueRestaurants, type RestaurantStat } from "@shared/stats";
import { useLang } from "@/i18n";

interface ComebackCardProps {
  /** Lunches per place (shared/lunch.ts), places never eaten at included. */
  stats: RestaurantStat[];
  /** Vote for this place in today's round. */
  onVote: (restaurantId: number, name: string) => void;
  disabled?: boolean;
}

/**
 * "Due for a comeback": places the team hasn't eaten at in two weeks, or ever.
 * Each one is a button now — a tap is a vote for it in today's round, which the
 * spin already weights (applyVoteWeights). A list of neglected places you could
 * only read was advice with no way to take it.
 */
export function ComebackCard({ stats, onVote, disabled = false }: ComebackCardProps) {
  const { t } = useLang();
  const overdue = useMemo(() => overdueRestaurants(stats, { thresholdDays: 14 }).slice(0, 6), [stats]);
  if (overdue.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={15} style={{ color: "var(--brand-text)" }} />
        <h3 className="type-eyebrow" style={{ color: "var(--ink-warm)" }}>
          {t("history.stats.comeback")}
        </h3>
      </div>
      <p className="type-meta text-muted-foreground mb-3">{t("history.stats.comebackBody")}</p>
      <div className="flex flex-wrap gap-2">
        {overdue.map(({ stat, daysSince }) => (
          // A Button, not a Chip: voting is an action, and Chip is a toggle
          // whose aria-pressed would announce a state this does not have.
          <Button
            key={stat.id}
            variant="outline"
            size="md"
            disabled={disabled}
            onClick={() => onVote(stat.id, stat.name)}
            aria-label={t("history.stats.voteAria", { name: stat.name })}
          >
            {stat.name}
            <span className="type-meta text-muted-foreground">
              {daysSince === null ? t("history.stats.never") : t("history.stats.days", { n: daysSince })}
            </span>
          </Button>
        ))}
      </div>
    </Card>
  );
}
