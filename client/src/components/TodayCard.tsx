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
 * decide), read the moment the Wheel tab opens — nobody should have to spin or
 * ask to find out. Rows come from shared/lunch.ts `todaysLunches` on the server.
 *
 * Solid paper, not glass: this sits on the bare ground above the wheel, where a
 * glass panel would only blur a flat colour (failure mode 29).
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
    <section
      aria-label={t("wheel.today.title")}
      className="w-full flex flex-col gap-3 px-4 py-3.5"
      style={{ borderRadius: "var(--radius-card)", background: "var(--paper)", border: "1px solid var(--border)" }}
    >
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
            <li key={e.spinId} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-balance" style={{ color: "var(--ink-warm)", fontSize: 17 }}>
                  {e.name}
                </p>
                {/* Each fact holds together; the line breaks between them. */}
                <p className="type-meta" style={{ color: "var(--body)" }}>
                  {facts.map((f, i) => (
                    <Fragment key={i}>
                      {i > 0 && " · "}
                      <span className="whitespace-nowrap">{f}</span>
                    </Fragment>
                  ))}
                </p>
              </div>
              {/* Icons, not labelled buttons: a full-width row of actions per
                  decision pushed the wheel and Spin below the fold at 390×844.
                  "Decide again" is also spelled out on the Spin button itself
                  whenever it applies. */}
              {mine && !e.accepted && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onRedecide}
                  disabled={redecideDisabled}
                  aria-label={t("wheel.today.redecide")}
                  title={t("wheel.today.redecide")}
                >
                  <RotateCw />
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon"
                onClick={() => onDirections(e)}
                aria-label={t("wheel.today.directionsTo", { name: e.name })}
                title={t("wheel.result.directions")}
              >
                <MapPin />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
