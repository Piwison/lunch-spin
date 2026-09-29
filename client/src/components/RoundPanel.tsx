import { RotateCcw, Salad, ChevronDown } from "lucide-react";
import { useState } from "react";
import { excludedDietaryTagIds, voteCounts, type SessionState } from "@shared/session";
import { useLang } from "@/i18n";
import { tagLabel } from "@/lib/tagLabel";
import { initials } from "@/lib/initials";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";

interface RoundRestaurant {
  id: number;
  name: string;
  /** The place's tags — which cuisines are on the wheel at all. */
  tagIds: number[];
}

interface RoundTag {
  id: number;
  name: string;
  color: string;
  category?: string | null;
}

interface RoundPerson {
  userId: number;
  name: string | null;
  email: string | null;
}

interface RoundPanelProps {
  // Tag-filtered, open restaurants for today (including vetoed ones so they can
  // be un-vetoed, and ones a cuisine avoid has taken off, so it can be undone).
  restaurants: RoundRestaurant[];
  tags: RoundTag[];
  session: SessionState;
  currentUserId: number;
  /** Everyone on the wheel, owner included — to put initials on a vote. */
  people: RoundPerson[];
  onVote: (restaurantId: number) => void;
  onVeto: (restaurantId: number) => void;
  onDietary: (tagId: number) => void;
  onClear: () => void;
  /** Where "tag places with a cuisine" goes — the Places tab. */
  onAddCuisines?: () => void;
  /** When true, the body collapses behind its header (collapsed by default). */
  collapsible?: boolean;
}

/**
 * Today's votes: "want it" and "not today" per place, and the cuisines nobody
 * is in the mood for. Both are text buttons at the 44px control height — the
 * old thumb and ban glyphs were 24px pills whose meaning you had to hover for.
 * Only cuisines some place on the wheel actually carries are offered: the full
 * 31-tag catalogue offered "Korean" on wheels with no Korean place, where
 * tapping it did nothing.
 */
export default function RoundPanel({
  restaurants,
  tags,
  session,
  currentUserId,
  people,
  onVote,
  onVeto,
  onDietary,
  onClear,
  onAddCuisines,
  collapsible = false,
}: RoundPanelProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  if (restaurants.length === 0) return null;

  const who = new Map(people.map((p) => [p.userId, p]));
  const monogram = (userId: number) => {
    const p = who.get(userId);
    return initials(p?.name ?? null, p?.email ?? null);
  };
  const fullName = (userId: number) => {
    if (userId === currentUserId) return t("wheel.members.you");
    const p = who.get(userId);
    return p?.name?.trim() || p?.email?.split("@")[0] || t("app.teammate");
  };

  const counts = voteCounts(session);
  const avoidedTags = new Set(excludedDietaryTagIds(session));
  const avoidersOf = new Map<number, number[]>();
  for (const m of session.dietary) for (const id of m.tagIds) avoidersOf.set(id, [...(avoidersOf.get(id) ?? []), m.userId]);
  const votersOf = new Map(session.votes.filter((m) => m.userIds.length > 0).map((m) => [m.restaurantId, m.userIds]));
  const vetoersOf = new Map(session.vetoes.filter((m) => m.userIds.length > 0).map((m) => [m.restaurantId, m.userIds]));
  const hasMarks = counts.size > 0 || vetoersOf.size > 0 || avoidedTags.size > 0;

  // Cuisines on the wheel today, plus any already avoided (its places left the
  // list above, and the chip has to stay to be undone).
  const onWheel = new Set(restaurants.flatMap((r) => r.tagIds));
  const cuisineTags = tags.filter((tag) => onWheel.has(tag.id) || avoidedTags.has(tag.id));

  // Most-voted first, then alphabetical, so the group's lean is visible at a glance.
  const ordered = [...restaurants].sort((a, b) => {
    const va = counts.get(a.id) ?? 0;
    const vb = counts.get(b.id) ?? 0;
    if (vb !== va) return vb - va;
    return a.name.localeCompare(b.name);
  });

  const showBody = !collapsible || open;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => collapsible && setOpen((o) => !o)}
          aria-expanded={collapsible ? open : undefined}
          className={`flex items-center gap-1.5 min-h-11 ${collapsible ? "cursor-pointer" : "cursor-default"}`}
        >
          <span className="type-eyebrow" style={{ color: "var(--ink-warm)" }}>
            {t("wheel.round.title")}
          </span>
          {hasMarks && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--ok)" }} title={t("wheel.round.marks")} />
          )}
          {collapsible && (
            <ChevronDown
              size={14}
              className="text-muted-foreground transition-transform duration-200"
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          )}
        </button>
        {hasMarks && showBody && (
          <Button variant="ghost" size="md" onClick={onClear}>
            <RotateCcw size={14} /> {t("wheel.round.clear")}
          </Button>
        )}
      </div>

      {/* Cuisines nobody is in the mood for today. */}
      {showBody &&
        (cuisineTags.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="type-meta text-muted-foreground flex items-center gap-1">
              <Salad size={13} /> {t("wheel.round.avoid")}
            </span>
            {cuisineTags.map((tag) => {
              const avoiders = avoidersOf.get(tag.id) ?? [];
              const mine = avoiders.includes(currentUserId);
              const others = avoiders.filter((id) => id !== currentUserId);
              return (
                <Chip
                  key={tag.id}
                  pressed={mine}
                  onClick={() => onDietary(tag.id)}
                  title={mine ? t("wheel.round.allow") : t("wheel.round.avoidTitle")}
                >
                  {tagLabel(tag.name, t, tag.category)}
                  {others.length > 0 && (
                    <span className="type-meta" aria-label={t("wheel.round.by", { names: others.map(fullName).join(t("wheel.round.listSep")) })}>
                      {others.map(monogram).join(" ")}
                    </span>
                  )}
                </Chip>
              );
            })}
          </div>
        ) : (
          onAddCuisines && (
            <Button variant="link" size="md" className="self-start px-0" onClick={onAddCuisines}>
              <Salad size={14} /> {t("wheel.round.addCuisines")}
            </Button>
          )
        ))}

      {showBody && (
        <div className="flex flex-col gap-1.5">
          {ordered.map((r) => {
            const voters = votersOf.get(r.id) ?? [];
            const vetoers = vetoersOf.get(r.id) ?? [];
            const isVetoed = vetoers.length > 0;
            const iVetoed = vetoers.includes(currentUserId);
            const iVoted = voters.includes(currentUserId);
            // Off the wheel because nobody's in the mood for its cuisine — say
            // which, or the row looks spinnable while the wheel lacks it.
            const skippedCuisine = tags.find((tag) => avoidedTags.has(tag.id) && r.tagIds.includes(tag.id));
            const isOff = isVetoed || !!skippedCuisine;
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 px-3 py-2"
                style={{
                  borderRadius: "var(--radius-card)",
                  background: "var(--paper)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex-1 min-w-0" style={{ opacity: isOff ? 0.55 : 1 }}>
                  <p className={`text-sm font-medium break-words ${isOff ? "line-through" : ""}`} style={{ color: "var(--ink-warm)" }}>
                    {r.name}
                  </p>
                  {skippedCuisine && (
                    <p className="type-meta" style={{ color: "var(--body)" }}>
                      {t("wheel.round.offByCuisine", { name: tagLabel(skippedCuisine.name, t, skippedCuisine.category) })}
                    </p>
                  )}
                  {(voters.length > 0 || vetoers.length > 0) && (
                    <p className="type-meta" style={{ color: "var(--body)" }}>
                      {voters.length > 0 && (
                        <span title={voters.map(fullName).join(t("wheel.round.listSep"))}>
                          {t("wheel.round.wantBy", { names: voters.map(monogram).join(" ") })}
                        </span>
                      )}
                      {voters.length > 0 && vetoers.length > 0 && " · "}
                      {vetoers.length > 0 && (
                        <span title={vetoers.map(fullName).join(t("wheel.round.listSep"))}>
                          {t("wheel.round.vetoBy", { names: vetoers.map(monogram).join(" ") })}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <Chip
                  pressed={iVoted}
                  disabled={isOff}
                  onClick={() => onVote(r.id)}
                  aria-label={t(iVoted ? "wheel.round.removeVote" : "wheel.round.vote", { name: r.name })}
                >
                  {t("wheel.round.want")}
                </Chip>
                <Chip
                  pressed={iVetoed}
                  onClick={() => onVeto(r.id)}
                  aria-label={t(iVetoed ? "wheel.round.undoVeto" : "wheel.round.veto", { name: r.name })}
                >
                  {t("wheel.round.notToday")}
                </Chip>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
