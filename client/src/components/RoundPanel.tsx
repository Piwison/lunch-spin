import { ThumbsUp, Ban, RotateCcw, Salad, ChevronDown } from "lucide-react";
import { useState } from "react";
import { excludedDietaryTagIds, voteCounts, type SessionState } from "@shared/session";

interface RoundRestaurant {
  id: number;
  name: string;
}

interface RoundTag {
  id: number;
  name: string;
  color: string;
}

interface RoundPanelProps {
  // Tag-filtered, non-excluded restaurants for this round (including vetoed ones
  // so they can be un-vetoed).
  restaurants: RoundRestaurant[];
  tags: RoundTag[];
  session: SessionState;
  currentUserId: number;
  onVote: (restaurantId: number) => void;
  onVeto: (restaurantId: number) => void;
  onDietary: (tagId: number) => void;
  onClear: () => void;
  /** When true, the round body collapses behind its header (collapsed by default). */
  collapsible?: boolean;
}

export default function RoundPanel({ restaurants, tags, session, currentUserId, onVote, onVeto, onDietary, onClear, collapsible = false }: RoundPanelProps) {
  const [open, setOpen] = useState(false);
  if (restaurants.length === 0) return null;

  const counts = voteCounts(session);
  const avoidedTags = new Set(excludedDietaryTagIds(session));
  const myDietary = new Set(session.dietary.find((m) => m.userId === currentUserId)?.tagIds ?? []);
  const myVotes = new Set(
    session.votes.filter((m) => m.userIds.includes(currentUserId)).map((m) => m.restaurantId),
  );
  const vetoedBy = new Map(session.vetoes.filter((m) => m.userIds.length > 0).map((m) => [m.restaurantId, m.userIds]));
  const hasMarks = counts.size > 0 || vetoedBy.size > 0 || avoidedTags.size > 0;

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
          className={`flex items-center gap-1.5 ${collapsible ? "cursor-pointer" : "cursor-default"}`}
        >
          <span className="text-xs font-semibold text-muted-foreground tracking-widest" style={{ fontFamily: "var(--font-display)" }}>
            THIS ROUND
          </span>
          <span className="text-[10px] font-normal text-muted-foreground/70">· {restaurants.length}</span>
          {hasMarks && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.70 0.18 150)" }} title="Votes or vetoes in this round" />
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
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RotateCcw size={12} /> Clear round
          </button>
        )}
      </div>

      {/* Dietary constraints — avoid tags for the round */}
      {showBody && tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Salad size={12} /> Avoid today:
          </span>
          {tags.map((tag) => {
            const avoided = avoidedTags.has(tag.id);
            const mine = myDietary.has(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => onDietary(tag.id)}
                title={mine ? "You're avoiding this — tap to allow" : "Avoid this today"}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium transition-all active:scale-95"
                style={{
                  background: avoided ? "oklch(0.60 0.22 25 / 0.2)" : "oklch(0.16 0.025 260)",
                  border: `1px solid ${avoided ? "oklch(0.60 0.22 25 / 0.5)" : "oklch(0.25 0.03 260)"}`,
                  color: avoided ? "oklch(0.75 0.15 40)" : "oklch(0.6 0.02 260)",
                  textDecoration: avoided ? "line-through" : "none",
                }}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      {showBody && (
      <div className="flex flex-col gap-1.5">
        {ordered.map((r) => {
          const votes = counts.get(r.id) ?? 0;
          const isVetoed = vetoedBy.has(r.id);
          const iVetoed = (vetoedBy.get(r.id) ?? []).includes(currentUserId);
          const iVoted = myVotes.has(r.id);
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{
                background: "oklch(0.13 0.025 260)",
                border: "1px solid oklch(0.20 0.025 260)",
                opacity: isVetoed ? 0.5 : 1,
              }}
            >
              <span className={`flex-1 min-w-0 truncate text-sm ${isVetoed ? "line-through" : ""}`}>
                {r.name}
              </span>

              {/* Vote */}
              <button
                onClick={() => onVote(r.id)}
                disabled={isVetoed}
                title={iVoted ? "Remove your vote" : "Vote for this"}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: iVoted ? "oklch(0.70 0.18 150 / 0.2)" : "oklch(0.16 0.025 260)",
                  border: `1px solid ${iVoted ? "oklch(0.70 0.18 150 / 0.5)" : "oklch(0.25 0.03 260)"}`,
                  color: iVoted ? "oklch(0.80 0.16 155)" : "oklch(0.65 0.02 260)",
                }}
              >
                <ThumbsUp size={12} />
                {votes > 0 && <span>{votes}</span>}
              </button>

              {/* Veto */}
              <button
                onClick={() => onVeto(r.id)}
                title={iVetoed ? "Take back your veto" : "Veto — not today"}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all active:scale-95"
                style={{
                  background: iVetoed ? "oklch(0.60 0.22 25 / 0.2)" : "oklch(0.16 0.025 260)",
                  border: `1px solid ${iVetoed ? "oklch(0.60 0.22 25 / 0.5)" : "oklch(0.25 0.03 260)"}`,
                  color: iVetoed ? "oklch(0.75 0.15 40)" : "oklch(0.65 0.02 260)",
                }}
              >
                <Ban size={12} />
              </button>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
