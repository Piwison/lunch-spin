import { MapPin, RotateCw, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
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
  /** False while the wheel is spinning, a result is up, or another tab shows. */
  visible: boolean;
  /** The capsule's height while it is on screen, 0 while it is not, so the
   *  page under it can keep its last row clear of it. */
  onHeight?: (px: number) => void;
}

/** Decisions this viewer closed, by spin id. Per-device convenience only —
 *  a new decision has a new id, so it always shows. */
const DISMISSED_KEY = "lw.today.dismissed";

function readDismissed(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

/**
 * What the team is eating today, one row per decision (several groups can each
 * decide), read the moment the Wheel tab opens — nobody should have to spin or
 * ask to find out. Rows come from shared/lunch.ts `todaysLunches` on the server.
 *
 * A floating capsule above the dock (2026-11), not a card in the page. As a
 * card it took ~120px above the wheel, with an eyebrow line that made its top
 * padding read heavier than its bottom. Floating, it costs the wheel nothing,
 * says the same thing in one row, and can be closed. Glass, because it now
 * floats over the page (failure mode 29); its controls are outlined, because
 * the capsule is the material (failure mode 35).
 */
export default function TodayCard({
  entries,
  currentUserId,
  showWalk,
  onDirections,
  onRedecide,
  redecideDisabled,
  visible,
  onHeight,
}: TodayCardProps) {
  const { t } = useLang();
  const [dismissed, setDismissed] = useState<number[]>(readDismissed);
  const shown = entries.filter((e) => !dismissed.includes(e.spinId));
  const on = visible && shown.length > 0;

  const ref = useRef<HTMLElement>(null);
  const onHeightRef = useRef(onHeight);
  onHeightRef.current = onHeight;
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) {
      onHeightRef.current?.(0);
      return;
    }
    const report = () => onHeightRef.current?.(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      onHeightRef.current?.(0);
    };
  }, [on]);

  const dismiss = () => {
    const next = Array.from(new Set([...dismissed, ...shown.map((e) => e.spinId)])).slice(-30);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* private mode: closed for this visit only */
    }
  };

  if (!on) return null;

  return (
    <section
      ref={ref}
      aria-label={t("wheel.today.title")}
      className="today-float glass-card fixed inset-x-3 z-30 mx-auto max-w-md flex items-center gap-1 py-2 pl-4 pr-1.5"
    >
      <ul className="flex-1 min-w-0 flex flex-col gap-2">
        {shown.map((e) => {
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
            <li key={e.spinId} className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <p className="truncate font-semibold" style={{ color: "var(--ink-warm)", fontSize: 16, lineHeight: 1.3 }}>
                  {e.name}
                </p>
                {/* The eyebrow folded into the meta line: one row says what
                    the old card's title row and fact row said together. */}
                <p className="type-meta truncate" style={{ color: "var(--body)" }}>
                  <span style={{ color: "var(--brand-text)", fontWeight: 600 }}>{t("wheel.today.title")}</span>
                  {facts.map((f, i) => (
                    <Fragment key={i}>
                      {" · "}
                      {f}
                    </Fragment>
                  ))}
                </p>
              </div>
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
                variant="outline"
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
      <Button variant="ghost" size="icon" onClick={dismiss} aria-label={t("wheel.today.dismiss")} title={t("wheel.today.dismiss")}>
        <X />
      </Button>
    </section>
  );
}
