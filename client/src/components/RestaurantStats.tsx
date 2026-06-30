import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Sparkles, Users } from "lucide-react";
import {
  rankStats,
  totalPicks as sumPicks,
  overdueRestaurants,
  daysSinceLastPick,
  picksByPerson,
  type RestaurantStat,
} from "@shared/stats";

interface RestaurantStatsProps {
  stats: RestaurantStat[];
  /** Spin history — enables the "who's been picking" fairness view on shared wheels. */
  history?: { spunBy: number; spunByName: string | null }[];
  /** Shared wheel? Controls whether the fairness view is shown. */
  showPeople?: boolean;
  isLoading?: boolean;
}

const ACCENTS = [
  "var(--brand)",
  "var(--brand-2)",
  "oklch(0.70 0.20 160)",
  "oklch(0.75 0.18 60)",
  "oklch(0.68 0.22 340)",
];

/** "3d ago" / "today" / "never" from a whole-day count. */
function lastPickedLabel(lastPickedAt: Date | null): string {
  const days = daysSinceLastPick(lastPickedAt);
  if (days === null) return "never picked";
  if (days === 0) return "picked today";
  if (days === 1) return "picked yesterday";
  return `picked ${days}d ago`;
}

export function RestaurantStats({ stats, history, showPeople, isLoading }: RestaurantStatsProps) {
  const ranked = useMemo(() => rankStats(stats), [stats]);
  const total = useMemo(() => sumPicks(stats), [stats]);
  const placesTried = useMemo(() => stats.filter((s) => s.pickCount > 0).length, [stats]);
  const top = useMemo(() => ranked.slice(0, 5), [ranked]);
  const maxPicks = top[0]?.pickCount ?? 0;

  // Decision-grade: places the group is neglecting (never picked, or not in 14d).
  const overdue = useMemo(
    () => overdueRestaurants(stats, { thresholdDays: 14 }).slice(0, 6),
    [stats]
  );

  const people = useMemo(
    () => (showPeople && history ? picksByPerson(history) : []),
    [showPeople, history]
  );
  const maxPersonPicks = people[0]?.count ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // No spins yet — restaurants may exist, but there's nothing to summarise.
  if (total === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <div className="text-3xl mb-2 opacity-30">📊</div>
        <p className="text-sm">No spins recorded yet. Spin the wheel to start building insights.</p>
      </Card>
    );
  }

  const favorite = ranked[0];

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Total spins</div>
          <div className="text-2xl font-bold mt-1" style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}>{total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Places tried</div>
          <div className="text-2xl font-bold mt-1" style={{ fontFamily: "var(--font-display)" }}>
            {placesTried}<span className="text-base text-muted-foreground font-normal">/{stats.length}</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Favourite</div>
          <div className="text-sm font-bold mt-1.5 truncate" title={favorite?.name} style={{ fontFamily: "var(--font-display)" }}>
            {favorite?.name ?? "—"}
          </div>
        </Card>
      </div>

      {/* Due for a comeback — the actionable "what should we eat" nudge */}
      {overdue.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={15} style={{ color: "var(--brand-2)" }} />
            <h3 className="text-sm font-bold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>DUE FOR A COMEBACK</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Spots you haven't had in a while (or ever) — maybe spin one of these.</p>
          <div className="flex flex-wrap gap-2">
            {overdue.map(({ stat, daysSince }) => (
              <span
                key={stat.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: "oklch(from var(--brand-2) l c h / 0.10)",
                  border: "1px solid oklch(from var(--brand-2) l c h / 0.25)",
                  color: "var(--foreground)",
                }}
              >
                {stat.name}
                <span className="text-[10px] text-muted-foreground">
                  {daysSince === null ? "never" : `${daysSince}d`}
                </span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Most picked — horizontal bars (clear even with only a handful of spins) */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Crown size={15} style={{ color: "var(--brand)" }} />
          <h3 className="text-sm font-bold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>MOST PICKED</h3>
        </div>
        <div className="space-y-3">
          {top.map((r, idx) => {
            const pct = maxPicks > 0 ? (r.pickCount / maxPicks) * 100 : 0;
            const accent = ACCENTS[idx % ACCENTS.length];
            return (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-sm font-medium truncate flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
                    {r.name}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {r.pickCount} · {lastPickedLabel(r.lastPickedAt)}
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

      {/* Who's been picking — fairness on shared wheels */}
      {people.length > 1 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users size={15} style={{ color: "oklch(0.70 0.20 160)" }} />
            <h3 className="text-sm font-bold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>WHO'S BEEN PICKING</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Who's been driving the spins — keep it balanced.</p>
          <div className="space-y-3">
            {people.map((p, idx) => {
              const pct = maxPersonPicks > 0 ? (p.count / maxPersonPicks) * 100 : 0;
              const accent = ACCENTS[idx % ACCENTS.length];
              return (
                <div key={p.userId}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-sm font-medium truncate">{p.name ?? "Unknown"}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {p.count} spin{p.count !== 1 ? "s" : ""}
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
