import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { AlertTriangle, ChevronDown, Footprints, SlidersHorizontal, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
  /**
   * "inline" — a collapsible card in the page flow. Right for the Places tab,
   * which has room and where filtering is part of the task.
   *
   * "sheet" — a 56px icon button that opens the same controls in a bottom
   * sheet. Right for the Wheel tab, where the filter is a thing you reach for
   * occasionally and the wheel is the thing you came for: as a card it cost a
   * whole row at rest and pushed Spin below the fold when opened.
   */
  variant?: "inline" | "sheet";
}

/**
 * Collapsible filter bar shared by the Wheel and Restaurants tabs — was
 * duplicated near-verbatim (tag chips only) until the distance slider gave it
 * enough real, stateful logic that a third copy wasn't worth it. Each caller
 * keeps its own selectedTagIds/maxWalkMinutes state (matches how the tag
 * filter already behaves: two independent selections, not synced between
 * tabs) and passes callbacks in.
 */
/**
 * The 56px filter button, on its own.
 *
 * Split out of the sheet variant because the sheet lives in ONE place (the
 * mobile wheel-picker row) while the button has to appear in two: that row
 * below xl, and the desktop column at xl and up, where the picker collapses to
 * a rail and the row is display:none. Mounting a second `FilterBar` for the
 * desktop case would mount a second Radix Sheet on the same controlled `open`
 * state, and both would portal an overlay to the body.
 *
 * So the desktop copy is a plain button that flips the same state. The one
 * mounted sheet still opens, because Radix portals its content to the body and
 * a hidden ancestor cannot hide it.
 */
export const FilterTrigger = forwardRef<
  HTMLButtonElement,
  { activeCount: number } & ComponentPropsWithoutRef<"button">
>(function FilterTrigger({ activeCount, ...rest }, ref) {
  return (
    <button
      ref={ref}
      aria-label={activeCount > 0 ? `Filter (${activeCount} active)` : "Filter"}
      className="relative flex-shrink-0 flex items-center justify-center glass-bar transition-transform active:scale-[var(--press-scale)]"
      style={{
        minHeight: 56,
        minWidth: 56,
        borderRadius: "var(--radius-control)",
        color: activeCount > 0 ? "var(--brand-text)" : "var(--body-warm)",
      }}
      {...rest}
    >
      <SlidersHorizontal size={19} />
      {/* The count is the whole point of collapsing the bar: with the controls
          out of sight, this badge is the only thing telling you the wheel is
          filtered. */}
      {activeCount > 0 && (
        <span
          className="absolute flex items-center justify-center tabular-nums"
          style={{
            top: 8,
            right: 8,
            minWidth: 18,
            height: 18,
            paddingInline: 5,
            borderRadius: 9,
            background: "var(--brand-grad)",
            color: "var(--on-accent)",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {activeCount}
        </span>
      )}
    </button>
  );
});

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
  variant = "inline",
}: FilterBarProps) {
  const hasTags = tagGroups.some((g) => g.items.length > 0);
  if (totalCount === 0 || (!hasTags && !distanceEnabled)) return null;

  const distanceActive = maxWalkMinutes != null;
  const activeCount = selectedTagIds.length + (distanceActive ? 1 : 0);

  const clearAll = () => {
    selectedTagIds.forEach((id) => onToggleTag(id));
    onChangeMaxWalkMinutes(null);
  };

  const panel = (
        <div className="px-4 pb-4 border-t border-border/30">
          {tagGroups.map(({ label, items }) =>
            items.length > 0 ? (
              <div key={label} className="mt-3">
                <p className="type-eyebrow mb-2" style={{ color: "var(--body-warm)" }}>{label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((tag) => {
                    const isActive = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => onToggleTag(tag.id)}
                        className="px-4 flex items-center rounded-full type-meta font-medium transition-all duration-150 active:scale-95"
                        style={{
                          // OUTLINED, not filled. These chips sit on a glass
                          // sheet, and a translucent white fill on translucent
                          // white glass has nothing behind it to refract — it
                          // reads as a second flat panel with an invisible
                          // border. The sheet is the material; controls on it
                          // are drawn with a line.
                          minHeight: 44,
                          background: isActive ? "var(--brand-grad)" : "transparent",
                          border: `1px solid ${isActive ? "var(--brand-solid)" : "var(--border)"}`,
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
                <p className="type-eyebrow flex items-center gap-1.5" style={{ color: "var(--body-warm)" }}>
                  <Footprints size={12} className="flex-shrink-0" /> Distance
                </p>
                {distanceActive ? (
                  <span className="type-meta font-medium" style={{ color: "var(--brand-text)" }}>
                    Within {maxWalkMinutes} min
                  </span>
                ) : (
                  <button
                    onClick={() => onChangeMaxWalkMinutes(MAX_WALK_MINUTES)}
                    className="type-meta text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Set a limit
                  </button>
                )}
              </div>
              {distanceActive && (
                <div className="flex items-center gap-3 px-1">
                  <span className="type-meta text-muted-foreground tabular-nums flex-shrink-0">{MIN_WALK_MINUTES}m</span>
                  <Slider
                    value={[maxWalkMinutes]}
                    onValueChange={([v]) => onChangeMaxWalkMinutes(v ?? MAX_WALK_MINUTES)}
                    min={MIN_WALK_MINUTES}
                    max={MAX_WALK_MINUTES}
                    step={1}
                  />
                  <span className="type-meta text-muted-foreground tabular-nums flex-shrink-0">{MAX_WALK_MINUTES}m</span>
                </div>
              )}
            </div>
          )}

          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="mt-3 flex items-center gap-1.5 type-meta text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={11} /> Clear all filters
            </button>
          )}
        </div>
  );

  const notice = (
    <div
      className="mx-4 mb-4 flex items-start gap-2 px-3.5 py-2.5 type-meta"
      style={{
        borderRadius: "var(--radius-chip)",
        background: "oklch(from var(--destructive) l c h / 0.12)",
        border: "1px solid oklch(from var(--destructive) l c h / 0.35)",
        color: "var(--destructive)",
      }}
    >
      <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
      {emptyMessage}
    </div>
  );

  if (variant === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <FilterTrigger activeCount={activeCount} />
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="glass-sheet max-h-[80vh] gap-0 overflow-y-auto"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          }}
        >
          <SheetHeader className="flex-row items-center gap-2.5 pl-2 pr-12 pb-1">
            <SlidersHorizontal size={17} style={{ color: "var(--brand-text)" }} />
            <SheetTitle className="type-eyebrow" style={{ color: "var(--brand-text)" }}>
              Filter
            </SheetTitle>
            {activeCount > 0 && (
              <span className="type-meta tabular-nums" style={{ color: "var(--body-warm)" }}>
                {matchCount}/{totalCount} on the wheel
              </span>
            )}
          </SheetHeader>
          {panel}
          {activeCount > 0 && matchCount === 0 && notice}
        </SheetContent>
      </Sheet>
    );
  }

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
          <SlidersHorizontal size={17} style={{ color: activeCount > 0 ? "var(--brand-text)" : "var(--body-warm)" }} />
          <span className="type-eyebrow" style={{ color: activeCount > 0 ? "var(--ink-warm)" : "var(--body-warm)" }}>
            Filter
          </span>
          {activeCount > 0 && (
            <span
              className="px-2 py-0.5 tabular-nums"
              style={{
                background: "var(--brand-grad)",
                color: "var(--on-accent)",
                borderRadius: "var(--radius-chip)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <span className="type-meta tabular-nums" style={{ color: "var(--body-warm)" }}>
              {matchCount}/{totalCount}
            </span>
          )}
          <ChevronDown
            size={16}
            className="text-muted-foreground transition-transform duration-200"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        </div>
      </button>

      {open && panel}
      {activeCount > 0 && matchCount === 0 && notice}
    </div>
  );
}
