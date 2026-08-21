import { AlertTriangle, ChevronDown, Footprints, SlidersHorizontal, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface FilterTag {
  id: number;
  name: string;
  color: string;
}

interface TagGroup {
  label: string;
  items: FilterTag[];
}

export const MIN_WALK_MINUTES = 3;
export const MAX_WALK_MINUTES = 20;

interface FilterBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagGroups: TagGroup[];
  selectedTagIds: number[];
  onToggleTag: (id: number) => void;
  /** Wheel-level flag — the distance section only renders when this wheel has it on. */
  distanceEnabled: boolean;
  /** null = filter off (matches the tag filter's "nothing selected" default). */
  maxWalkMinutes: number | null;
  onChangeMaxWalkMinutes: (minutes: number | null) => void;
  matchCount: number;
  totalCount: number;
  /** Wording differs slightly between the Wheel tab ("spin") and Restaurants tab ("selected tags"). */
  emptyMessage: string;
}

/**
 * Collapsible filter bar shared by the Wheel and Restaurants tabs — was
 * duplicated near-verbatim (tag chips only) until the distance slider gave it
 * enough real, stateful logic that a third copy wasn't worth it. Each caller
 * keeps its own selectedTagIds/maxWalkMinutes state (matches how the tag
 * filter already behaves: two independent selections, not synced between
 * tabs) and passes callbacks in.
 */
export default function FilterBar({
  open,
  onOpenChange,
  tagGroups,
  selectedTagIds,
  onToggleTag,
  distanceEnabled,
  maxWalkMinutes,
  onChangeMaxWalkMinutes,
  matchCount,
  totalCount,
  emptyMessage,
}: FilterBarProps) {
  const hasTags = tagGroups.some((g) => g.items.length > 0);
  if (totalCount === 0 || (!hasTags && !distanceEnabled)) return null;

  const distanceActive = maxWalkMinutes != null;
  const activeCount = selectedTagIds.length + (distanceActive ? 1 : 0);

  const clearAll = () => {
    selectedTagIds.forEach((id) => onToggleTag(id));
    onChangeMaxWalkMinutes(null);
  };

  return (
    // Ember glass: the recipe comes from index.css, so this no longer hand-rolls
    // its own backdrop-filter or its own radius.
    <div
      className="glass-card w-full overflow-hidden"
      style={{
        borderColor: activeCount > 0 ? "oklch(from var(--brand) l c h / 0.45)" : undefined,
      }}
    >
      <button
        onClick={() => onOpenChange(!open)}
        className="w-full flex items-center justify-between px-4 text-left transition-colors hover:bg-white/3"
        style={{ minHeight: 56 }}
      >
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal size={16} style={{ color: activeCount > 0 ? "var(--brand)" : "var(--body-warm)" }} />
          <span
            className="type-eyebrow"
            style={{ color: activeCount > 0 ? "var(--ink-warm)" : "var(--body-warm)" }}
          >
            Filter
          </span>
          {activeCount > 0 && (
            <span
              className="px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "var(--brand-solid)", color: "var(--on-accent)", borderRadius: "var(--radius-chip)" }}
            >
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <span className="tabular-nums" style={{ fontSize: 13, color: "var(--body-warm)" }}>
              {matchCount}/{totalCount}
            </span>
          )}
          <ChevronDown
            size={14}
            className="text-muted-foreground transition-transform duration-200"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border/30">
          {tagGroups.map(({ label, items }) =>
            items.length > 0 ? (
              <div key={label} className="mt-3">
                <p className="text-[10px] tracking-widest text-muted-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>{label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((tag) => {
                    const isActive = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => onToggleTag(tag.id)}
                        className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 active:scale-95"
                        style={{
                          background: isActive ? "var(--brand-solid)" : "var(--glass-chip-bg)",
                          border: `1px solid ${isActive ? "var(--brand-solid)" : "var(--glass-chip-border)"}`,
                          color: isActive ? "var(--on-accent)" : "var(--body-warm)",
                          borderRadius: "var(--radius-chip)",
                        }}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null,
          )}

          {distanceEnabled && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] tracking-widest text-muted-foreground flex items-center gap-1.5" style={{ fontFamily: "var(--font-display)" }}>
                  <Footprints size={11} className="flex-shrink-0" /> DISTANCE
                </p>
                {distanceActive ? (
                  <span className="text-xs font-medium" style={{ color: "var(--brand-text)" }}>
                    Within {maxWalkMinutes} min
                  </span>
                ) : (
                  <button
                    onClick={() => onChangeMaxWalkMinutes(MAX_WALK_MINUTES)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Set a limit
                  </button>
                )}
              </div>
              {distanceActive && (
                <div className="flex items-center gap-3 px-1">
                  <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{MIN_WALK_MINUTES}m</span>
                  <Slider
                    value={[maxWalkMinutes]}
                    onValueChange={([v]) => onChangeMaxWalkMinutes(v ?? MAX_WALK_MINUTES)}
                    min={MIN_WALK_MINUTES}
                    max={MAX_WALK_MINUTES}
                    step={1}
                  />
                  <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{MAX_WALK_MINUTES}m</span>
                </div>
              )}
            </div>
          )}

          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={11} /> Clear all filters
            </button>
          )}
        </div>
      )}

      {activeCount > 0 && matchCount === 0 && (
        <div
          className="mx-4 mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
          style={{
            background: "oklch(from var(--destructive) l c h / 0.12)",
            border: "1px solid oklch(from var(--destructive) l c h / 0.35)",
            color: "var(--brand-text)",
          }}
        >
          <AlertTriangle size={13} className="flex-shrink-0" />
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
