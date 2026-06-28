import { trpc } from "@/lib/trpc";
import { RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";
import { RestaurantStats } from "./RestaurantStats";

interface HistoryTabProps {
  wheelId: number;
  onReenabled: () => void;
  /** Shared wheel? Enables the per-person fairness view in stats. */
  isShared?: boolean;
  /** Jump to the Wheel tab — wired to the empty-state CTA. */
  onGoToWheel?: () => void;
}

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function exclusionTimeLeft(spunAt: Date): string {
  const expiresAt = new Date(spunAt).getTime() + 3 * 24 * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "expired";
  const hours = Math.floor(remaining / 3600000);
  const days = Math.floor(remaining / 86400000);
  if (days > 0) return `${days}d ${hours % 24}h left`;
  return `${hours}h left`;
}

export default function HistoryTab({ wheelId, onReenabled, isShared, onGoToWheel }: HistoryTabProps) {
  const utils = trpc.useUtils();
  const { data: history, isLoading } = trpc.spins.history.useQuery({ wheelId });
  const { data: restaurants } = trpc.restaurants.list.useQuery({ wheelId });
  const { data: stats, isLoading: statsLoading } =
    trpc.stats.getRestaurantStats.useQuery({ wheelId });

  const reenable = trpc.spins.reenable.useMutation({
    onSuccess: () => {
      utils.spins.history.invalidate({ wheelId });
      onReenabled();
      toast.success("Restaurant re-enabled on the wheel");
    },
    onError: e => toast.error(e.message),
  });

  // Build a map of restaurantId → isExcluded from restaurants list
  const excludedMap = new Map<number, boolean>(
    restaurants?.map(r => [r.id, r.isExcluded]) ?? []
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
          <h2
            className="text-lg font-bold tracking-tight mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            INSIGHTS
          </h2>
          <RestaurantStats
            stats={stats}
            history={history}
            showPeople={isShared}
            isLoading={statsLoading}
          />
        </div>
      )}

      {/* History Section */}
      <div>
        <div className="flex items-center justify-between">
          <h2
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            SPIN HISTORY
          </h2>
          <span className="text-xs text-muted-foreground">
            {history?.length ?? 0} spin{history?.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Exclusion legend */}
        {restaurants && restaurants.filter(r => r.isExcluded).length > 0 && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
            style={{
              background: "oklch(from var(--destructive) l c h / 0.1)",
              border: "1px solid oklch(from var(--destructive) l c h / 0.3)",
              color: "var(--brand)",
            }}
          >
            <Clock size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              Restaurants are auto-excluded for 3 days after being spun. You can
              manually re-enable them below.
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="h-14 rounded-xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : !history || history.length === 0 ? (
          <div className="flex flex-col items-center text-center py-12 gap-4">
            <div className="text-4xl opacity-30">🎡</div>
            <div>
              <p className="font-semibold text-foreground/70 mb-1" style={{ fontFamily: "var(--font-display)" }}>
                No spins yet
              </p>
              <p className="text-sm text-muted-foreground">Your picks and exclusions will show up here.</p>
            </div>
            {onGoToWheel && (
              <button
                onClick={onGoToWheel}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 hover:-translate-y-0.5"
                style={{
                  fontFamily: "var(--font-display)",
                  background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                  boxShadow: "0 0 24px oklch(from var(--brand) l c h / 0.35)",
                  color: "white",
                }}
              >
                <Clock size={14} /> Spin to start a history
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((entry, idx) => {
              const isLatestForRestaurant =
                latestByRestaurant.get(entry.restaurantId)?.id === entry.id;
              const isCurrentlyExcluded =
                excludedMap.get(entry.restaurantId) ?? false;
              const showReenableBtn =
                isLatestForRestaurant &&
                isCurrentlyExcluded &&
                !entry.manuallyReenabled;
              const spunAtDate = new Date(entry.spunAt);

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{
                    background:
                      idx === 0
                        ? "var(--card)"
                        : "var(--card)",
                    border:
                      idx === 0
                        ? "1px solid var(--border)"
                        : "1px solid var(--border)",
                  }}
                >
                  {/* Rank / index */}
                  <span className="text-xs text-muted-foreground/50 w-5 text-right flex-shrink-0">
                    {idx + 1}
                  </span>

                  {/* Restaurant name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {entry.restaurantName}
                      </span>
                      {isCurrentlyExcluded && isLatestForRestaurant && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            background: "oklch(from var(--destructive) l c h / 0.15)",
                            color: "var(--brand)",
                            border: "1px solid oklch(from var(--destructive) l c h / 0.3)",
                          }}
                        >
                          excluded · {exclusionTimeLeft(spunAtDate)}
                        </span>
                      )}
                      {entry.manuallyReenabled && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            background: "oklch(0.70 0.20 160 / 0.15)",
                            color: "oklch(0.70 0.20 160)",
                            border: "1px solid oklch(0.70 0.20 160 / 0.3)",
                          }}
                        >
                          re-enabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {timeAgo(spunAtDate)} · by {entry.spunByName ?? "Unknown"}
                    </p>
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 hover:brightness-125 flex-shrink-0 disabled:opacity-50"
                      style={{
                        background: "oklch(0.70 0.20 160 / 0.15)",
                        border: "1px solid oklch(0.70 0.20 160 / 0.4)",
                        color: "oklch(0.70 0.20 160)",
                      }}
                    >
                      {reenable.isPending
                        ? <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                        : <RefreshCw size={11} />}
                      {reenable.isPending ? "Enabling..." : "Re-enable"}
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
