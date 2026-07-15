import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Tag, ClipboardList, MapPin, SlidersHorizontal, ChevronDown, AlertTriangle, Navigation, Footprints, RefreshCw, ArrowDownWideNarrow } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { segmentColor } from "@/lib/palette";
import { primaryTag } from "@shared/primaryTag";
import { matchCuisineTag } from "@shared/cuisineTag";
import { formatWalk } from "@shared/nearby";
import { toast } from "sonner";
import { ErrorChip } from "@/components/StatusChip";
import NearbyDialog from "@/components/NearbyDialog";

/** Loose check: does this string look like a Google Maps link worth resolving? */
const looksLikeMapLink = (s: string) =>
  /(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/)/i.test(s.trim());

// The predefined catalog is large (15 cuisines, 16 food types) — the add form
// shows only these curated 5 per category up front, with a "More" expander for
// the rest, so it doesn't read as a wall of chips. Custom tags a wheel has
// actually created stay uncapped (there are usually few).
const CURATED_CUISINE = ["Japanese", "Chinese", "Italian", "Thai", "Korean"];
const CURATED_FOOD_TYPE = ["Pizza", "Burgers", "Noodles", "Salad", "Sandwiches"];

type TagCategory = "cuisine" | "food_type" | "custom";
const TAG_CATEGORY_OPTIONS: { value: TagCategory; label: string }[] = [
  { value: "cuisine", label: "Cuisine" },
  { value: "food_type", label: "Food Type" },
  { value: "custom", label: "Custom" },
];

/** Curated-first ordering: named presets in their given order, then whatever's left. */
function splitCurated<T extends { name: string }>(items: T[], curatedNames: string[]) {
  const byName = new Map(items.map((t) => [t.name, t]));
  const curated = curatedNames.map((n) => byName.get(n)).filter((t): t is T => !!t);
  const curatedIds = new Set(curated.map((t) => t.name));
  const rest = items.filter((t) => !curatedIds.has(t.name));
  return { curated, rest };
}

interface RestaurantTabProps {
  wheelId: number;
  isOwner: boolean;
  onRestaurantsChange: () => void;
  distanceEnabled?: boolean;
  originLabel?: string | null;
}

interface RestaurantForm {
  name: string;
  notes: string;
  tagIds: number[];
  mapUrl: string;
}

const EMPTY_FORM: RestaurantForm = { name: "", notes: "", tagIds: [], mapUrl: "" };

export default function RestaurantTab({ wheelId, isOwner, onRestaurantsChange, distanceEnabled, originLabel }: RestaurantTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<RestaurantForm>(EMPTY_FORM);
  const [newTagName, setNewTagName] = useState("");
  const [newTagCategory, setNewTagCategory] = useState<TagCategory>("custom");
  const [showTagCreate, setShowTagCreate] = useState(false);
  const [showAllCuisine, setShowAllCuisine] = useState(false);
  const [showAllFoodType, setShowAllFoodType] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [importText, setImportText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortNearest, setSortNearest] = useState(false);

  const utils = trpc.useUtils();
  const { data: restaurants, isLoading } = trpc.restaurants.list.useQuery({ wheelId });
  const { data: tags } = trpc.tags.list.useQuery({ wheelId });

  const invalidate = () => {
    utils.restaurants.list.invalidate({ wheelId });
    onRestaurantsChange();
  };

  const addRestaurant = trpc.restaurants.add.useMutation({
    onSuccess: () => { invalidate(); setShowAdd(false); setForm(EMPTY_FORM); setFormError(null); toast.success("Restaurant added!"); },
    onError: (e) => setFormError(e.message),
  });
  const updateRestaurant = trpc.restaurants.update.useMutation({
    onSuccess: () => { invalidate(); setEditId(null); setForm(EMPTY_FORM); setFormError(null); toast.success("Restaurant updated!"); },
    onError: (e) => setFormError(e.message),
  });
  const deleteRestaurant = trpc.restaurants.delete.useMutation({
    onSuccess: () => { invalidate(); toast.success("Restaurant removed"); },
    onError: (e) => toast.error(e.message),
  });
  const importRestaurants = trpc.restaurants.addBulk.useMutation({
    onSuccess: (res) => {
      invalidate();
      setShowImport(false);
      setImportText("");
      const extras: string[] = [];
      if (res.skipped.duplicates) extras.push(`${res.skipped.duplicates} duplicate${res.skipped.duplicates > 1 ? "s" : ""} skipped`);
      if (res.skipped.tooLong) extras.push(`${res.skipped.tooLong} too long`);
      toast.success(`Added ${res.added} restaurant${res.added !== 1 ? "s" : ""}${extras.length ? ` (${extras.join(", ")})` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const createTag = trpc.tags.createCustom.useMutation({
    onSuccess: () => { utils.tags.list.invalidate({ wheelId }); setNewTagName(""); setNewTagCategory("custom"); setShowTagCreate(false); setTagError(null); toast.success("Tag created!"); },
    onError: (e) => setTagError(e.message),
  });
  const recomputeDistances = trpc.wheels.recomputeDistances.useMutation({
    onSuccess: (res) => {
      invalidate();
      toast.success(`Distances updated — ${res.computed} located${res.unlocatable ? `, ${res.unlocatable} skipped` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Paste a Google Maps link → look the place up → prefill the name (and a
  // matching cuisine tag). The write still goes through restaurants.add.
  const resolveLink = trpc.places.resolveLink.useMutation({
    onSuccess: ({ place }) => {
      setForm((f) => {
        const tag = matchCuisineTag(place.cuisine, tags ?? []);
        return {
          ...f,
          name: place.name,
          tagIds: tag && !f.tagIds.includes(tag.id) ? [...f.tagIds, tag.id] : f.tagIds,
        };
      });
      setFormError(null);
      toast.success(`Found: ${place.name}`);
    },
    onError: (e) => setFormError(e.message),
  });

  // Full catalog — for the add/edit form, where you can assign any tag.
  const cuisineTags = tags?.filter((t) => t.category === "cuisine") ?? [];
  const foodTypeTags = tags?.filter((t) => t.category === "food_type") ?? [];
  const customTags = tags?.filter((t) => t.category === "custom") ?? [];

  // Tags actually present on this wheel — for the FILTER, so it doesn't list the
  // whole predefined catalog when only a few tags are in use.
  const usedTagIds = useMemo(
    () => new Set((restaurants ?? []).flatMap((r) => r.tags.map((t) => t.id))),
    [restaurants],
  );
  const usedCuisineTags = cuisineTags.filter((t) => usedTagIds.has(t.id));
  const usedFoodTypeTags = foodTypeTags.filter((t) => usedTagIds.has(t.id));
  const usedCustomTags = customTags.filter((t) => usedTagIds.has(t.id));

  const toggleFilterTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // AND-logic tag intersection — but, unlike the wheel, keep excluded
  // restaurants visible (they're shown with an "excluded" badge here).
  const visibleRestaurants = useMemo(() => {
    const filtered = selectedTagIds.length === 0
      ? (restaurants ?? [])
      : (restaurants ?? []).filter((r) => selectedTagIds.every((id) => r.tags.some((t) => t.id === id)));
    if (!distanceEnabled || !sortNearest) return filtered;
    // Located restaurants first (nearest first), unlocated ones after, name-stable.
    return [...filtered].sort((a, b) => {
      if (a.walkSeconds == null && b.walkSeconds == null) return a.name.localeCompare(b.name);
      if (a.walkSeconds == null) return 1;
      if (b.walkSeconds == null) return -1;
      return a.walkSeconds - b.walkSeconds;
    });
  }, [restaurants, selectedTagIds, distanceEnabled, sortNearest]);

  const toggleFormTag = (tagId: number) => {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(tagId) ? f.tagIds.filter((id) => id !== tagId) : [...f.tagIds, tagId],
    }));
  };

  const openEdit = (r: NonNullable<typeof restaurants>[number]) => {
    setForm({ name: r.name, notes: r.notes ?? "", tagIds: r.tags.map((t) => t.id), mapUrl: r.mapUrl ?? "" });
    setEditId(r.id);
  };

  const submitForm = () => {
    if (!form.name.trim()) return;
    const mapUrl = form.mapUrl.trim() || null;
    if (editId !== null) {
      updateRestaurant.mutate({ id: editId, name: form.name.trim(), notes: form.notes || null, tagIds: form.tagIds, mapUrl });
    } else {
      addRestaurant.mutate({ wheelId, name: form.name.trim(), notes: form.notes || null, tagIds: form.tagIds, mapUrl });
    }
  };

  const TagChip = ({ tag }: { tag: { id: number; name: string; color: string } }) => {
    const isActive = form.tagIds.includes(tag.id);
    return (
      <button
        type="button"
        onClick={() => toggleFormTag(tag.id)}
        className="px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150"
        style={{
          background: isActive ? tag.color + "33" : "var(--muted)",
          border: `1px solid ${isActive ? tag.color : "var(--border)"}`,
          color: isActive ? tag.color : "var(--muted-foreground)",
        }}
      >
        {tag.name}
      </button>
    );
  };

  const TagSelector = () => {
    const cuisineSplit = splitCurated(cuisineTags, CURATED_CUISINE);
    const foodTypeSplit = splitCurated(foodTypeTags, CURATED_FOOD_TYPE);
    const groups: {
      label: string;
      curated: typeof cuisineTags;
      rest: typeof cuisineTags;
      showAll: boolean;
      setShowAll: (v: boolean) => void;
    }[] = [
      { label: "Cuisine", ...cuisineSplit, showAll: showAllCuisine, setShowAll: setShowAllCuisine },
      { label: "Food Type", ...foodTypeSplit, showAll: showAllFoodType, setShowAll: setShowAllFoodType },
      { label: "Custom", curated: customTags, rest: [], showAll: false, setShowAll: () => {} },
    ];
    return (
      <div className="flex flex-col gap-2">
        {groups.map(({ label, curated, rest, showAll, setShowAll }) =>
          curated.length > 0 || rest.length > 0 ? (
            <div key={label}>
              <p className="text-xs text-muted-foreground mb-1.5 tracking-widest" style={{ fontFamily: "var(--font-display)" }}>{label.toUpperCase()}</p>
              <div className="flex flex-wrap gap-1.5">
                {curated.map((tag) => <TagChip key={tag.id} tag={tag} />)}
                {showAll && rest.map((tag) => <TagChip key={tag.id} tag={tag} />)}
                {rest.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-150"
                    style={{ border: "1px dashed var(--border)" }}
                  >
                    {showAll ? "Show less" : `+${rest.length} more`}
                  </button>
                )}
              </div>
            </div>
          ) : null
        )}
        <button
          type="button"
          onClick={() => setShowTagCreate(true)}
          className="self-start flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <Plus size={12} /> Create tag
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight" style={{ fontFamily: "var(--font-display)" }}>RESTAURANTS</h2>
          {restaurants && restaurants.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{restaurants.length} place{restaurants.length !== 1 ? "s" : ""} on this wheel</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShowNearby(true)}
            title="Add nearby restaurants"
            className="flex items-center justify-center gap-2 h-10 min-w-10 px-3 sm:px-3.5 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 hover:bg-white/5"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--muted-foreground)",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.06em",
            }}
          >
            <Navigation size={14} /> <span className="hidden sm:inline">NEARBY</span>
          </button>
          <button
            onClick={() => { setImportText(""); setShowImport(true); }}
            title="Import"
            className="flex items-center justify-center gap-2 h-10 min-w-10 px-3 sm:px-3.5 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 hover:bg-white/5"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--muted-foreground)",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.06em",
            }}
          >
            <ClipboardList size={14} /> <span className="hidden sm:inline">IMPORT</span>
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}
            title="Add restaurant"
            className="flex items-center justify-center gap-2 h-10 min-w-10 px-3 sm:px-4 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 hover:brightness-110"
            style={{
              background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
              color: "white",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.06em",
              boxShadow: "0 0 16px oklch(from var(--brand) l c h / 0.35)",
            }}
          >
            <Plus size={14} /> <span className="hidden sm:inline">ADD</span>
          </button>
        </div>
      </div>

      {/* Permissions note */}
      {!isOwner && (
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs"
          style={{
            background: "oklch(from var(--info) l c h / 0.08)",
            border: "1px solid oklch(from var(--info) l c h / 0.20)",
            color: "var(--info)",
          }}
        >
          <Tag size={12} className="flex-shrink-0" />
          You can add restaurants. Only the wheel creator can edit or delete.
        </div>
      )}

      {/* Distance mode — walking time from the wheel's single origin */}
      {distanceEnabled && (restaurants?.length ?? 0) > 0 && (
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-xs"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Footprints size={13} className="flex-shrink-0" />
            Distances from <strong className="text-foreground">{originLabel || "Office"}</strong>
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setSortNearest((s) => !s)}
              title="Sort nearest first"
              aria-pressed={sortNearest}
              className="flex items-center justify-center h-8 w-8 rounded-lg transition-colors"
              style={{
                background: sortNearest ? "oklch(from var(--brand) l c h / 0.15)" : "transparent",
                color: sortNearest ? "var(--brand)" : "var(--muted-foreground)",
              }}
            >
              <ArrowDownWideNarrow size={14} />
            </button>
            <button
              onClick={() => recomputeDistances.mutate({ id: wheelId })}
              disabled={recomputeDistances.isPending}
              title="Recompute distances"
              className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={recomputeDistances.isPending ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      )}

      {/* Filter by tags — mirrors the Wheel tab so the list can be narrowed too */}
      {(restaurants?.length ?? 0) > 0 && usedTagIds.size > 0 && (
        <div
          className="w-full rounded-xl overflow-hidden transition-all duration-300"
          style={{
            background: "oklch(from var(--card) l c h / 0.6)",
            border: `1px solid ${selectedTagIds.length > 0 ? "oklch(from var(--brand-2) l c h / 0.4)" : "var(--border)"}`,
            backdropFilter: "blur(12px)",
          }}
        >
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/3"
          >
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal size={14} style={{ color: selectedTagIds.length > 0 ? "var(--brand)" : "var(--muted-foreground)" }} />
              <span
                className="text-xs font-semibold tracking-widest"
                style={{ fontFamily: "var(--font-display)", color: selectedTagIds.length > 0 ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                FILTER BY TAGS
              </span>
              {selectedTagIds.length > 0 && (
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
                >
                  {selectedTagIds.length} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {selectedTagIds.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {visibleRestaurants.length}/{restaurants?.length ?? 0}
                </span>
              )}
              <ChevronDown
                size={14}
                className="text-muted-foreground transition-transform duration-200"
                style={{ transform: showFilters ? "rotate(180deg)" : "none" }}
              />
            </div>
          </button>

          {showFilters && (
            <div className="px-4 pb-4 border-t border-border/30">
              {[{ label: "CUISINE", items: usedCuisineTags }, { label: "FOOD TYPE", items: usedFoodTypeTags }, { label: "CUSTOM", items: usedCustomTags }].map(({ label, items }) =>
                items.length > 0 ? (
                  <div key={label} className="mt-3">
                    <p className="text-[10px] tracking-widest text-muted-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>{label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((tag) => {
                        const isActive = selectedTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleFilterTag(tag.id)}
                            className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 active:scale-95"
                            style={{
                              background: isActive ? tag.color + "25" : "var(--muted)",
                              border: `1px solid ${isActive ? tag.color + "80" : "var(--border)"}`,
                              color: isActive ? tag.color : "var(--muted-foreground)",
                              boxShadow: isActive ? `0 0 10px ${tag.color}30` : "none",
                            }}
                          >
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null
              )}
              {selectedTagIds.length > 0 && (
                <button
                  onClick={() => setSelectedTagIds([])}
                  className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={11} /> Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Restaurant list */}
      {isLoading ? (
        <div className="flex flex-col gap-2.5">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-[72px] rounded-2xl animate-pulse" style={{ background: "var(--card)", animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : restaurants?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            🍜
          </div>
          <div>
            <p className="font-semibold text-foreground/60 mb-1" style={{ fontFamily: "var(--font-display)" }}>NO RESTAURANTS YET</p>
            <p className="text-sm text-muted-foreground">Add your first place to get started</p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 hover:brightness-110 mt-1"
            style={{
              background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
              color: "white",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.06em",
            }}
          >
            <Plus size={14} /> ADD FIRST RESTAURANT
          </button>
        </div>
      ) : visibleRestaurants.length === 0 ? (
        <div
          className="flex items-center gap-2.5 px-4 py-6 rounded-2xl text-sm justify-center text-center"
          style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
        >
          <AlertTriangle size={15} className="flex-shrink-0" style={{ color: "var(--brand)" }} />
          No restaurants match all selected tags.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleRestaurants.map((r, i) => {
            const primary = primaryTag(r);
            const dotColor = segmentColor(primary?.color, i);
            return (
            <div
              key={r.id}
              className="group flex items-start gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 hover:scale-[1.005] hover:-translate-y-0.5"
              style={{
                background: r.isExcluded ? "var(--card)" : "var(--card)",
                border: r.isExcluded ? "1px solid var(--border)" : "1px solid var(--border)",
                opacity: r.isExcluded ? 0.55 : 1,
                boxShadow: r.isExcluded ? "none" : "0 2px 12px rgba(0,0,0,0.2)",
              }}
            >
              {/* Color swatch — matches wheel segment */}
              <div
                className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 transition-all duration-200"
                title={primary?.name ? `Tagged "${primary.name}"` : "Wheel color"}
                style={{
                  background: dotColor,
                  boxShadow: `0 0 8px ${dotColor}99`,
                }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{r.name}</span>
                  {r.isExcluded && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                      style={{
                        background: "oklch(from var(--destructive) l c h / 0.15)",
                        color: "var(--brand)",
                        border: "1px solid oklch(from var(--destructive) l c h / 0.25)",
                      }}
                    >
                      excluded
                    </span>
                  )}
                  {distanceEnabled && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium text-muted-foreground" style={{ background: "var(--muted)" }}>
                      <Footprints size={10} className="flex-shrink-0" />
                      {r.walkSeconds != null ? formatWalk(r.walkSeconds / 60) : "no location"}
                    </span>
                  )}
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.notes}</p>}
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.tags.map((t) => (
                      <span
                        key={t.id}
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: t.color + "18",
                          color: t.color,
                          border: `1px solid ${t.color}35`,
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions — always visible on mobile, hover-reveal on desktop */}
              {isOwner && (
                <div className="flex items-center gap-1 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={() => openEdit(r)}
                    className="flex items-center justify-center h-10 w-10 rounded-xl hover:bg-white/8 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-90"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remove "${r.name}"?`)) deleteRestaurant.mutate({ id: r.id }); }}
                    className="flex items-center justify-center h-10 w-10 rounded-xl hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all duration-150 active:scale-90"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={showAdd || editId !== null} onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="glass border-border/50 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>
              {editId !== null ? "EDIT RESTAURANT" : "ADD RESTAURANT"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <Input
              placeholder="Restaurant name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-secondary/50 border-border/50"
            />
            <Textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="bg-secondary/50 border-border/50 resize-none"
              rows={2}
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="Paste a Google Maps link"
                    value={form.mapUrl}
                    onChange={(e) => setForm((f) => ({ ...f, mapUrl: e.target.value }))}
                    className="bg-secondary/50 border-border/50 pl-9"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => { setFormError(null); resolveLink.mutate({ wheelId, url: form.mapUrl.trim() }); }}
                  disabled={!looksLikeMapLink(form.mapUrl) || resolveLink.isPending}
                  title="Look up the place name from this Google Maps link"
                  className="flex-shrink-0"
                  style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                >
                  {resolveLink.isPending
                    ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : "Look up"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground px-1">
                Paste a Google Maps link and tap <span className="font-medium">Look up</span> to fill the name automatically — the link also powers "DIRECTIONS" after a spin.
              </p>
            </div>
            <TagSelector />
            <ErrorChip error={formError} onDismiss={() => setFormError(null)} />
            <Button
              onClick={() => { setFormError(null); submitForm(); }}
              disabled={!form.name.trim() || addRestaurant.isPending || updateRestaurant.isPending}
              className="transition-all duration-200 active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
            >
              {addRestaurant.isPending || updateRestaurant.isPending ? (
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{editId !== null ? "Saving..." : "Adding..."}</span>
              ) : editId !== null ? "Save Changes" : "Add Restaurant"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk import dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) { setShowImport(false); setImportText(""); } }}>
        <DialogContent className="glass border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>IMPORT RESTAURANTS</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Paste a list — one name per line (or comma-separated). Duplicates are skipped. You can add tags afterward.
            </p>
            <Textarea
              placeholder={"Ramen House\nSushi Bar\nPho Corner"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="bg-secondary/50 border-border/50 resize-none font-mono text-sm"
              rows={8}
              autoFocus
            />
            <Button
              onClick={() => importText.trim() && importRestaurants.mutate({ wheelId, text: importText })}
              disabled={!importText.trim() || importRestaurants.isPending}
              style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
            >
              {importRestaurants.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nearby search dialog */}
      <NearbyDialog
        wheelId={wheelId}
        open={showNearby}
        onOpenChange={setShowNearby}
        onAdded={invalidate}
      />

      {/* Tag creation dialog — user picks which category the new tag joins */}
      <Dialog open={showTagCreate} onOpenChange={setShowTagCreate}>
        <DialogContent className="glass border-border/50 max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>CREATE TAG</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex gap-1.5">
              {TAG_CATEGORY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNewTagCategory(value)}
                  className="flex-1 px-2 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
                  style={{
                    background: newTagCategory === value ? "var(--brand)" : "var(--muted)",
                    color: newTagCategory === value ? "white" : "var(--muted-foreground)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => { setNewTagName(e.target.value); setTagError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && newTagName.trim()) { setTagError(null); createTag.mutate({ name: newTagName.trim(), wheelId, category: newTagCategory }); } }}
                className="bg-secondary/50 border-border/50"
                autoFocus
              />
              <Button
                onClick={() => { setTagError(null); newTagName.trim() && createTag.mutate({ name: newTagName.trim(), wheelId, category: newTagCategory }); }}
                disabled={!newTagName.trim() || createTag.isPending}
                size="icon"
                className="transition-all duration-200 active:scale-90 flex-shrink-0"
                style={{ background: "var(--brand)", color: "white" }}
              >
                {createTag.isPending ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
              </Button>
            </div>
            <ErrorChip error={tagError} onDismiss={() => setTagError(null)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
