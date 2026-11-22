import { Fragment, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { lunchDiary, lunchStats, mondayWeek, taipeiClock, weeksSpanned, DAY_MS } from "@shared/lunch";
import { ComebackCard } from "./RestaurantStats";
import { TasteProfile } from "./TasteProfile";
import { RatingChip } from "@/components/StarRating";
import { useLang } from "@/i18n";
import { userError } from "@/lib/userError";
import { timeLeftLabel } from "@/lib/timeLabels";
import { Button } from "@/components/ui/button";

interface HistoryTabProps {
  wheelId: number;
  onReenabled: () => void;
  /** Jump to the Wheel tab — wired to the empty-state CTA. */
  onGoToWheel?: () => void;
}

/** "週二 9/15" / "Tue 9/15" for a Taipei day index — the team's calendar. */
function useDayLabel() {
  const { lang } = useLang();
  return useMemo(() => {
    const weekday = new Intl.DateTimeFormat(lang === "zh-TW" ? "zh-TW" : "en-US", {
      weekday: "short",
      timeZone: "UTC",
    });
    return (day: number) => {
      // A Taipei day index times a day is that date's midnight on the UTC wall
      // clock, so the UTC fields read back the Taipei calendar date.
      const d = new Date(day * DAY_MS);
      return `${weekday.format(d)} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    };
  }, [lang]);
}

/**
 * History as a lunch diary: what the team ate, day by day, newest first — the
 * thing people open History to find out. The statistics shrank to one line;
 * spin counts, "most picked" and "who's been picking" are gone, because they
 * counted spins, and a spin is not a lunch (shared/lunch.ts).
 */
export default function HistoryTab({ wheelId, onReenabled, onGoToWheel }: HistoryTabProps) {
  const { t } = useLang();
  const dayLabel = useDayLabel();
  const utils = trpc.useUtils();
  const { data: history, isLoading } = trpc.spins.history.useQuery({ wheelId });
  const { data: restaurants } = trpc.restaurants.list.useQuery({ wheelId });
  const { data: stats } = trpc.stats.getRestaurantStats.useQuery({ wheelId });
  const { data: ratingSummaries } = trpc.restaurants.ratings.useQuery({ wheelId });
  const averageOf = new Map((ratingSummaries ?? []).map((s) => [s.restaurantId, s.average]));

  const reenable = trpc.spins.reenable.useMutation({
    onSuccess: () => {
      utils.spins.history.invalidate({ wheelId });
      onReenabled();
      toast.success(t("history.reenabled"));
    },
    onError: (e) => toast.error(userError(e, t)),
  });

  // "Due for a comeback" → a vote for it in today's round. `on: true` only ever
  // adds, so a second tap can't quietly take the vote back.
  const vote = trpc.session.vote.useMutation({
    onSuccess: () => utils.wheels.realtime.invalidate({ wheelId }),
    onError: (e) => toast.error(userError(e, t)),
  });

  const rows = useMemo(
    () => (history ?? []).map((h) => ({ ...h, spunAt: new Date(h.spunAt) })),
    [history],
  );
  const diary = useMemo(() => lunchDiary(rows), [rows]);
  const lunchDays = useMemo(() => lunchStats(rows).lunchDays, [rows]);

  // restaurantId → server-computed exclusion expiry, and the newest spin of each
  // place: only that one can offer to put the place back.
  const excludedUntil = new Map<number, Date>(
    (restaurants ?? []).filter((r) => r.isExcluded && r.excludedUntil).map((r) => [r.id, new Date(r.excludedUntil!)]),
  );
  const latestSpinOf = new Map<number, number>();
  for (const r of rows) {
    const cur = latestSpinOf.get(r.restaurantId);
    if (cur === undefined || r.id > cur) latestSpinOf.set(r.restaurantId, r.id);
  }

  const placesEaten = (stats ?? []).filter((s) => s.pickCount > 0).length;
  const summary =
    diary.length > 0 && stats
      ? [
          (() => {
            const w = weeksSpanned(diary[diary.length - 1].day, diary[0].day);
            return t(w === 1 ? "history.summary.weeks.one" : "history.summary.weeks.other", { n: w });
          })(),
          t(lunchDays === 1 ? "history.summary.days.one" : "history.summary.days.other", { n: lunchDays }),
          t("history.summary.places", { p: placesEaten, n: stats.length }),
        ].join(" · ")
      : null;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-1">
        <h2 className="type-section" style={{ color: "var(--ink-warm)" }}>
          {t("history.title")}
        </h2>
        {summary && (
          <p className="type-meta" style={{ color: "var(--body)" }}>
            {summary}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse" style={{ borderRadius: "var(--radius-card)", background: "var(--muted)" }} />
          ))}
        </div>
      ) : diary.length === 0 ? (
        <div className="flex flex-col items-center text-center py-12 gap-4">
          <div className="text-4xl opacity-30">🎡</div>
          <div>
            <p className="type-section mb-1.5" style={{ color: "var(--ink-warm)" }}>
              {t("history.empty.title")}
            </p>
            <p className="text-sm text-muted-foreground">{t("history.empty.body")}</p>
          </div>
          {onGoToWheel && (
            <Button onClick={onGoToWheel}>
              <Clock size={15} /> {t("history.empty.action")}
            </Button>
          )}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {diary.map((d, i) => (
            <Fragment key={d.day}>
              {/* A new Monday-to-Sunday week starts below this line. */}
              {i > 0 && mondayWeek(diary[i - 1].day) !== mondayWeek(d.day) && (
                <li aria-hidden="true" className="my-1" style={{ borderTop: "1px solid var(--border)" }} />
              )}
              <li
                /* Solid paper, not glass: page content on the ground, and a
                   scrolling list of backdrop-filtered cards is the stacking the
                   perf budget warns about. */
                className="flex flex-col gap-2 px-4 py-3"
                style={{ borderRadius: "var(--radius-card)", background: "var(--paper)", border: "1px solid var(--border)" }}
              >
                <p className="type-eyebrow" style={{ color: "var(--ink-warm)" }}>
                  {dayLabel(d.day)}
                </p>
                {d.lunches.map((r) => {
                  const until = latestSpinOf.get(r.restaurantId) === r.id ? excludedUntil.get(r.restaurantId) : undefined;
                  const left = until ? timeLeftLabel(t, until) : null;
                  const avg = averageOf.get(r.restaurantId);
                  return (
                    <div key={r.id} className="flex flex-col gap-1">
                      <p className="font-semibold text-balance" style={{ color: "var(--ink-warm)", fontSize: 16 }}>
                        {r.restaurantName}
                      </p>
                      <p className="type-meta flex items-center gap-2 flex-wrap" style={{ color: "var(--body)" }}>
                        <span>
                          {t("history.row.by", { name: r.spunByName ?? t("history.unknown"), time: taipeiClock(r.spunAt) })}
                        </span>
                        {avg != null && <RatingChip average={avg} />}
                      </p>
                      {/* Its own line: beside the name, the button squeezed the
                          text column to two words a line at 390px. */}
                      {left && !r.manuallyReenabled && (
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="type-meta" style={{ color: "var(--body)" }}>
                            {t("history.excluded", { time: left })}
                          </span>
                          <Button
                            variant="positive"
                            size="md"
                            disabled={reenable.isPending}
                            onClick={() => reenable.mutate({ wheelId, restaurantId: r.restaurantId })}
                          >
                            <RefreshCw size={14} /> {t("history.reenable")}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {d.respun.length > 0 && (
                  <p className="type-meta" style={{ color: "var(--muted-foreground)" }}>
                    {t("history.respun", { names: d.respun.map((r) => r.restaurantName).join(t("history.listSep")) })}
                  </p>
                )}
                {d.skipped.length > 0 && (
                  <p className="type-meta" style={{ color: "var(--muted-foreground)" }}>
                    {t("history.skipped", { names: d.skipped.map((r) => r.restaurantName).join(t("history.listSep")) })}
                  </p>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      )}

      {stats && stats.length > 0 && (
        <ComebackCard
          stats={stats}
          disabled={vote.isPending}
          onVote={(id, name) =>
            vote.mutate(
              { wheelId, restaurantId: id, on: true },
              { onSuccess: () => toast.success(t("history.stats.voted", { name })) },
            )
          }
        />
      )}
      <TasteProfile wheelId={wheelId} />
    </div>
  );
}
