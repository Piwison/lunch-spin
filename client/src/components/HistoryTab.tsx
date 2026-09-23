import { trpc } from "@/lib/trpc";
import { RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";
import { RestaurantStats } from "./RestaurantStats";
import { TasteProfile } from "./TasteProfile";
import { StarRating, RatingChip } from "@/components/StarRating";
import { useLang } from "@/i18n";
import { userError } from "@/lib/userError";
import { timeLeftLabel } from "@/lib/timeLabels";

interface HistoryTabProps {
  wheelId: number;
  onReenabled: () => void;
  /** Shared wheel? Enables the per-person fairness view in stats. */
  isShared?: boolean;
  /** This wheel's exclusion window in days — drives the legend copy. */
  exclusionDays?: number;
  /** The signed-in user — only their own spins are rateable. */
  currentUserId: number;
  /** Jump to the Wheel tab — wired to the empty-state CTA. */
  onGoToWheel?: () => void;
}

export default function HistoryTab({ wheelId, onReenabled, isShared, exclusionDays, currentUserId, onGoToWheel }: HistoryTabProps) {
  const { t } = useLang();
  const timeAgo = (date: Date): string => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return t("history.time.now");
    if (mins < 60) return t("history.time.minutes", { n: mins });
    if (hours < 24) return t("history.time.hours", { n: hours });
    return t("history.time.days", { n: days });
  };
  const utils = trpc.useUtils();
  const { data: history, isLoading } = trpc.spins.history.useQuery({ wheelId });
  const { data: restaurants } = trpc.restaurants.list.useQuery({ wheelId });
  const { data: stats, isLoading: statsLoading } =
    trpc.stats.getRestaurantStats.useQuery({ wheelId });

  // Per-restaurant star ratings (team average + the viewer's own star).
  const { data: ratingSummaries } = trpc.restaurants.ratings.useQuery({ wheelId });
  const ratingByRestaurant = new Map((ratingSummaries ?? []).map((s) => [s.restaurantId, s]));

  const reenable = trpc.spins.reenable.useMutation({
    onSuccess: () => {
      utils.spins.history.invalidate({ wheelId });
      onReenabled();
      toast.success(t("history.reenabled"));
    },
    onError: e => toast.error(userError(e, t)),
  });

  const rateRestaurant = trpc.restaurants.rate.useMutation({
    onSuccess: () => utils.restaurants.ratings.invalidate({ wheelId }),
    onError: () => toast.error(t("history.ratingError")),
  });

  // restaurantId → server-computed exclusion expiry. The server derives this
  // from the wheel's own exclusion window, so the countdown shown here can
  // never drift from the real rule (the window is configurable per wheel).
  const excludedUntilMap = new Map<number, Date>(
    (restaurants ?? [])
      .filter(r => r.isExcluded && r.excludedUntil)
      .map(r => [r.id, new Date(r.excludedUntil!)])
  );

  // Deduplicate history entries to show latest spin per restaurant for exclusion status
  const latestByRestaurant = new Map<
    number,
    NonNullable<typeof history>[number]
  >();
  for (const entry of history ?? []) {
    if (!latestByRestaurant.has(entry.restaurantId)) {
      latestByRestaurant.set(entry.restaurantId, entry);
    }
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Statistics Section */}
      {stats && stats.length > 0 && (
        <div>
          <h2 className="type-section mb-4" style={{ color: "var(--ink-warm)" }}>
            {t("history.insights")}
          </h2>
          <RestaurantStats
            stats={stats}
            history={history}
            showPeople={isShared}
            isLoading={statsLoading}
          />
          <TasteProfile wheelId={wheelId} />
        </div>
      )}

      {/* History Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="type-section" style={{ color: "var(--ink-warm)" }}>
            {t("history.title")}
          </h2>
          <span className="type-meta text-muted-foreground">
            {t((history?.length ?? 0) === 1 ? "history.count.one" : "history.count.other", { n: history?.length ?? 0 })}
          </span>
        </div>

        {/* Exclusion legend */}
        {restaurants && restaurants.filter(r => r.isExcluded).length > 0 && (
          <div
            className="flex items-start gap-2 px-3.5 py-2.5 type-meta"
            style={{
              borderRadius: "var(--radius-chip)",
              background: "oklch(from var(--brand) l c h / 0.08)",
              border: "1px solid oklch(from var(--brand) l c h / 0.22)",
              color: "var(--body-warm)",
            }}
          >
            <Clock size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              {exclusionDays
                ? t(exclusionDays === 1 ? "history.exclusion.one" : "history.exclusion.other", { n: exclusionDays })
                : t("history.exclusion.default")}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="h-14 animate-pulse"
                style={{ borderRadius: "var(--radius-control)", background: "var(--muted)" }}
              />
            ))}
          </div>
        ) : !history || history.length === 0 ? (
          <div className="flex flex-col items-center text-center py-12 gap-4">
            <div className="text-4xl opacity-30">🎡</div>
            <div>
              <p className="type-section mb-1.5" style={{ color: "var(--ink-warm)" }}>
                {t("history.empty.title")}
              </p>
              <p className="text-sm text-muted-foreground">{t("history.empty.body")}</p>
            </div>
            {onGoToWheel && (
              <button
                onClick={onGoToWheel}
                className="flex items-center gap-2 px-6 transition-colors active:scale-[var(--press-scale)]"
                style={{
                  minHeight: 56,
                  borderRadius: "var(--radius-control)",
                  background: "var(--brand-grad)",
                  color: "var(--on-accent)",
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: "0.05em",
                }}
              >
                <Clock size={15} /> {t("history.empty.action")}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((entry, idx) => {
              const isLatestForRestaurant =
                latestByRestaurant.get(entry.restaurantId)?.id === entry.id;
              const excludedUntil = excludedUntilMap.get(entry.restaurantId);
              const isCurrentlyExcluded = excludedUntil !== undefined;
              const showReenableBtn =
                isLatestForRestaurant &&
                isCurrentlyExcluded &&
                !entry.manuallyReenabled;
              const spunAtDate = new Date(entry.spunAt);
              const timeLeft = excludedUntil
                ? timeLeftLabel(t, excludedUntil)
                : null;

              return (
                <div
                  key={entry.id}
                  /* Solid paper, not glass: the direction reserves glass for
                     floating chrome and overlays, and a scrolling list of
                     backdrop-filtered rows is the exact stacking the perf
                     budget warns about. */
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    borderRadius: "var(--radius-control)",
                    background: "var(--paper)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {/* Rank / index */}
                  <span className="type-meta text-muted-foreground/50 w-5 text-right flex-shrink-0">
                    {idx + 1}
                  </span>

                  {/* Restaurant name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {entry.restaurantName}
                      </span>
                      {isCurrentlyExcluded && isLatestForRestaurant && (
                        // max-w-full, not flex-shrink-0: this column shares the
                        // row with the re-enable button, and at 360px the chip
                        // ran 26px under it (English; 41px in Chinese).
                        <span
                          className="type-meta px-2 py-0.5 rounded-full max-w-full text-balance"
                          style={{
                            background: "oklch(from var(--destructive) l c h / 0.15)",
                            color: "var(--brand-text)",
                            border: "1px solid oklch(from var(--destructive) l c h / 0.3)",
                          }}
                        >
                          {timeLeft === null ? t("history.expired") : t("history.excluded", { time: timeLeft })}
                        </span>
                      )}
                      {entry.manuallyReenabled && (
                        <span
                          className="type-meta px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            background: "oklch(from var(--ok) l c h / 0.15)",
                            color: "var(--ok)",
                            border: "1px solid oklch(from var(--ok) l c h / 0.3)",
                          }}
                        >
                          {t("history.reenabledBadge")}
                        </span>
                      )}
                    </div>
                    <p className="type-meta text-muted-foreground mt-0.5 text-pretty">
                      {timeAgo(spunAtDate)} · {t("history.by", { name: entry.spunByName ?? t("history.unknown") })}
                    </p>

                    {/* Rate this place (1–5 stars) — writes the restaurant's team
                        rating; teammates' rows show the team average read-only.
                        Rating is per place now, so only the latest spin of each
                        restaurant carries the control (no duplicate stars). */}
                    {isLatestForRestaurant && (
                      entry.spunBy === currentUserId ? (
                        <div className="mt-1.5">
                          <StarRating
                            value={ratingByRestaurant.get(entry.restaurantId)?.myStars ?? null}
                            size={20}
                            disabled={rateRestaurant.isPending}
                            onChange={(stars) => rateRestaurant.mutate({ wheelId, restaurantId: entry.restaurantId, stars })}
                          />
                        </div>
                      ) : (
                        ratingByRestaurant.get(entry.restaurantId)?.average != null ? (
                          <div className="mt-1.5">
                            <RatingChip average={ratingByRestaurant.get(entry.restaurantId)!.average} />
                          </div>
                        ) : null
                      )
                    )}
                  </div>

                  {/* Re-enable button */}
                  {showReenableBtn && (
                    <button
                      onClick={() =>
                        reenable.mutate({
                          wheelId,
                          restaurantId: entry.restaurantId,
                        })
                      }
                      disabled={reenable.isPending}
                      className="flex items-center gap-1.5 px-4 transition-colors active:scale-[var(--press-scale)] flex-shrink-0 disabled:opacity-50"
                      style={{
                        minHeight: 44,
                        borderRadius: "var(--radius-chip)",
                        background: "oklch(from var(--ok) l c h / 0.15)",
                        border: "1px solid oklch(from var(--ok) l c h / 0.4)",
                        color: "var(--ok)",
                        fontSize: 15,
                        fontWeight: 500,
                      }}
                    >
                      {reenable.isPending
                        ? <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                        : <RefreshCw size={11} />}
                      {reenable.isPending ? t("history.enabling") : t("history.reenable")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
