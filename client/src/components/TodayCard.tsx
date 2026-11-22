import { MapPin, RotateCw } from "lucide-react";
import { Fragment } from "react";
import { taipeiClock } from "@shared/lunch";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { walkLabel } from "@/lib/timeLabels";

export interface TodayEntry {
  spinId: number;
  restaurantId: number;
  name: string;
  spunBy: number;
  spunByName: string | null;
  spunAt: Date;
  accepted: boolean;
  walkSeconds: number | null;
  openStatus: string;
  closesAt: string | null;
  mapUrl: string | null;
}

interface TodayCardProps {
  entries: TodayEntry[];
  currentUserId: number;
  /** Walk times only mean something when the wheel has an origin. */
  showWalk: boolean;
  onDirections: (entry: TodayEntry) => void;
  /** Spin again. Offered on your own row only, and only while that row would
   *  actually be replaced (shared/lunch.ts: an accepted lunch stays). */
  onRedecide: () => void;
  redecideDisabled: boolean;
}

/**
 * What the team is eating today, one row per decision (several groups can each
 * decide). Rows come from shared/lunch.ts `todaysLunches` on the server.
 *
 * Lives at the top of the notifications panel (2026-11). It was a card above
 * the wheel, then a capsule floating over it; both put "Decide again" on screen
 * after every spin, and the owner found the wheel screen too busy for it. The
 * wheel screen now says one thing — Spin — and the decision, with its way to
 * redo it, is one tap away under the bell, next to the teammates' decisions it
 * belongs with. Sits on the panel's glass, so its controls are outlined
 * (failure mode 35).
 */
export default function TodayCard({
  entries,
  currentUserId,
  showWalk,
  onDirections,
  onRedecide,
  redecideDisabled,
}: TodayCardProps) {
  const { t } = useLang();
  if (entries.length === 0) return null;

  return (
    <section aria-label={t("wheel.today.title")} className="flex flex-col gap-2 px-3 py-3">
      <p className="type-eyebrow" style={{ color: "var(--ink-warm)" }}>
        {t("wheel.today.title")}
      </p>
      <ul className="flex flex-col gap-3">
        {entries.map((e) => {
          const mine = e.spunBy === currentUserId;
          const who = mine ? t("wheel.members.you") : e.spunByName?.trim() || t("app.teammate");
          const facts = [
            t("wheel.today.by", { name: who, time: taipeiClock(new Date(e.spunAt)) }),
            showWalk && e.walkSeconds != null ? walkLabel(t, e.walkSeconds / 60) : null,
            e.openStatus === "closed"
              ? t("wheel.today.closed")
              : e.closesAt
                ? t("wheel.today.openTill", { time: e.closesAt })
                : null,
          ].filter(Boolean);
          return (
            <li key={e.spinId} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold" style={{ color: "var(--ink-warm)", fontSize: 16, lineHeight: 1.3 }}>
                    {e.name}
                  </p>
                  <p className="type-meta" style={{ color: "var(--body)" }}>
                    {facts.map((f, i) => (
                      <Fragment key={i}>
                        {i > 0 && " · "}
                        <span className="whitespace-nowrap">{f}</span>
                      </Fragment>
                    ))}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onDirections(e)}
                  aria-label={t("wheel.today.directionsTo", { name: e.name })}
                  title={t("wheel.result.directions")}
                >
                  <MapPin />
                </Button>
              </div>
              {/* Spelled out here, not an icon: this is now the ONLY place it
                  is offered, so it has to say what it does. */}
              {mine && !e.accepted && (
                <Button variant="outline" size="md" className="w-full" onClick={onRedecide} disabled={redecideDisabled}>
                  <RotateCw /> {t("wheel.today.redecide")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
