import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating, RatingChip } from "@/components/StarRating";
import { Star, TrendingUp, TrendingDown } from "lucide-react";
import { useLang } from "@/i18n";
import { tagLabel } from "@/lib/tagLabel";

/** History-tab card that turns the wheel's star ratings into a team taste read:
 *  overall mood, crowd-favourite places, and cuisines the team leans / cools on.
 *  Read-only; the data comes from stats.tasteProfile. */
export function TasteProfile({ wheelId }: { wheelId: number }) {
  const { t } = useLang();
  const { data, isLoading } = trpc.stats.tasteProfile.useQuery({ wheelId });

  if (isLoading) {
    return (
      <Card className="p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }
  if (!data) return null;

  const Title = (
    <div className="flex items-center gap-2">
      <Star size={16} style={{ fill: "var(--star)", color: "var(--star-edge)" }} />
      <h3 className="type-eyebrow" style={{ color: "var(--ink-warm)" }}>{t("history.taste.title")}</h3>
    </div>
  );

  if (!data.hasEnoughData) {
    const pct = Math.min(100, (data.totalRatings / 5) * 100);
    return (
      <Card className="p-5 space-y-3">
        {Title}
        <p className="text-sm text-muted-foreground">
          {t("history.taste.help")}
        </p>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--brand)" }} />
        </div>
        <p className="type-meta text-muted-foreground">{t("history.taste.progress", { n: data.totalRatings })}</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-5">
      {Title}

      {/* Headline mood */}
      {data.overallAverage != null && (
        <div className="flex items-center gap-3">
          <span className="type-section tabular-nums" style={{ fontSize: 34, color: "var(--ink-warm)" }}>
            {data.overallAverage.toFixed(1)}
          </span>
          <div>
            <StarRating value={data.overallAverage} size={18} />
            <div className="type-meta text-muted-foreground mt-0.5">
              {t(data.totalRatings === 1 ? "history.taste.ratings.one" : "history.taste.ratings.other", { n: data.totalRatings })}
            </div>
          </div>
        </div>
      )}

      {/* Crowd favourites */}
      {data.topPlaces.length > 0 && (
        <div>
          <div className="type-eyebrow mb-2" style={{ color: "var(--body-warm)" }}>{t("history.taste.favorites")}</div>
          <div className="space-y-1.5">
            {data.topPlaces.map((p) => (
              <div key={p.restaurantId} className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{p.name}</span>
                <RatingChip average={p.average} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cuisine leans / cools */}
      {(data.leans.length > 0 || data.cools.length > 0) && (
        <div className="space-y-3">
          {data.leans.length > 0 && (
            <div>
              <div className="type-eyebrow flex items-center gap-1.5 mb-2" style={{ color: "var(--body-warm)" }}>
                <TrendingUp size={13} style={{ color: "var(--ok)" }} /> {t("history.taste.leans")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.leans.map((c) => (
                  <CuisineChip key={c.cuisine} cuisine={tagLabel(c.cuisine, t)} average={c.average} tone="up" />
                ))}
              </div>
            </div>
          )}
          {data.cools.length > 0 && (
            <div>
              <div className="type-eyebrow flex items-center gap-1.5 mb-2" style={{ color: "var(--body-warm)" }}>
                <TrendingDown size={13} style={{ color: "var(--muted-foreground)" }} /> {t("history.taste.cools")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.cools.map((c) => (
                  <CuisineChip key={c.cuisine} cuisine={tagLabel(c.cuisine, t)} average={c.average} tone="down" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CuisineChip({ cuisine, average, tone }: { cuisine: string; average: number; tone: "up" | "down" }) {
  const up = tone === "up";
  return (
    <span
      className="inline-flex items-center gap-1 px-3 py-1"
      style={{
        borderRadius: "var(--radius-chip)",
        background: up ? "color-mix(in oklch, var(--star) 15%, transparent)" : "var(--muted)",
        color: up ? "var(--ink-warm)" : "var(--body-warm)",
        border: up ? "1px solid color-mix(in oklch, var(--star) 35%, transparent)" : "1px solid var(--border)",
        fontSize: 15,
        fontWeight: 500,
      }}
    >
      {cuisine}
      <span className="inline-flex items-center gap-0.5 opacity-80">
        <Star size={10} style={{ fill: "var(--star)", color: "var(--star-edge)" }} />
        {average.toFixed(1)}
      </span>
    </span>
  );
}
