import { trpc } from "@/lib/trpc";
import ConfirmDangerDialog from "@/components/ConfirmDangerDialog";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, Tag, MapPin, Navigation, Footprints, RefreshCw, ArrowDownWideNarrow, MoreVertical, Star, Clock3, Search, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StarRating, RatingChip } from "@/components/StarRating";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { segmentColor } from "@/lib/palette";
import { primaryTag } from "@shared/primaryTag";
import { providerAlert } from "@/lib/placesError";
import { GeoError, requestCoords } from "@/lib/geo";
import { matchCuisineTag } from "@shared/cuisineTag";
import { filterRestaurantsByDistance } from "@shared/filter";
import FilterBar from "@/components/FilterBar";
import { toast } from "sonner";
import { ErrorChip } from "@/components/StatusChip";
import NearbyDialog from "@/components/NearbyDialog";
import { useLang } from "@/i18n";
import { originLabelText, tagLabel } from "@/lib/tagLabel";
import { walkLabel } from "@/lib/timeLabels";
import { userError } from "@/lib/userError";

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
const TAG_CATEGORY_OPTIONS: TagCategory[] = ["cuisine", "food_type", "custom"];

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
  /** Set when "Look up" resolved a Maps link — carried through to the add
   *  mutation so the row keeps its provider identity (and can get hours). */
  placeId: string | null;
}

const EMPTY_FORM: RestaurantForm = { name: "", notes: "", tagIds: [], mapUrl: "", placeId: null };

/** The subset of a places.searchNearby row the add-form's name search shows. */
type SearchedPlace = {
  placeId: string;
  name: string;
  walkMinutes: number;
  walkSource: "route" | "estimate";
  cuisine: string | null;
  address: string | null;
};

/** Deep link stored on a searched place, so "DIRECTIONS" works after a spin. */
function placeSearchMapUrl(placeId: string, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${placeId}`;
}

export default function RestaurantTab({ wheelId, isOwner, onRestaurantsChange, distanceEnabled, originLabel }: RestaurantTabProps) {
  const { t, lang } = useLang();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<RestaurantForm>(EMPTY_FORM);
  const [newTagName, setNewTagName] = useState("");
  const [newTagCategory, setNewTagCategory] = useState<TagCategory>("custom");
  const [showTagCreate, setShowTagCreate] = useState(false);
  const [showAllCuisine, setShowAllCuisine] = useState(false);
  const [showAllFoodType, setShowAllFoodType] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortNearest, setSortNearest] = useState(false);
  const [sortByRating, setSortByRating] = useState(false);
  const [maxWalkMinutes, setMaxWalkMinutes] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: restaurants, isLoading } = trpc.restaurants.list.useQuery({ wheelId });
  const { data: tags } = trpc.tags.list.useQuery({ wheelId });

  // Per-restaurant star ratings (team average + count + the viewer's own).
  const { data: ratingSummaries } = trpc.restaurants.ratings.useQuery({ wheelId });
  const ratingByRestaurant = useMemo(
    () => new Map((ratingSummaries ?? []).map((s) => [s.restaurantId, s])),
    [ratingSummaries],
  );
  // The restaurant whose detail sheet is open (null = closed).
  const [detailId, setDetailId] = useState<number | null>(null);
  /** The place the owner is being asked to confirm removing, held by id+name so
   *  the dialog still has something to name after the detail sheet closes. */
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const invalidate = () => {
    utils.restaurants.list.invalidate({ wheelId });
    onRestaurantsChange();
  };

  const addRestaurant = trpc.restaurants.add.useMutation({
    onSuccess: () => { invalidate(); setShowAdd(false); setForm(EMPTY_FORM); setFormError(null); toast.success(t("places.added")); },
    onError: (e) => setFormError(userError(e, t)),
  });
  const updateRestaurant = trpc.restaurants.update.useMutation({
    onSuccess: () => { invalidate(); setEditId(null); setForm(EMPTY_FORM); setFormError(null); toast.success(t("places.updated")); },
    onError: (e) => setFormError(userError(e, t)),
  });
  // Pull weekly opening hours for provider-sourced places. Reports the
  // misconfigured-key case explicitly instead of a silent success (the trap that
  // hid the Distance Matrix failure for a whole round).
  const refreshHours = trpc.restaurants.refreshHours.useMutation({
    onSuccess: (res) => {
      invalidate();
      if (!res.configured) {
        toast.error(t("places.hours.config"));
      } else if (res.providerFailed) {
        toast.error(t("places.hours.provider"));
      } else if (res.updated === 0) {
        toast.success(t("places.hours.current"));
      } else {
        toast.success(t(res.updated === 1 ? "places.hours.updated.one" : "places.hours.updated.other", { n: res.updated }));
      }
    },
    onError: (e) => toast.error(userError(e, t)),
  });
  const rateRestaurant = trpc.restaurants.rate.useMutation({
    onSuccess: () => utils.restaurants.ratings.invalidate({ wheelId }),
    onError: () => toast.error(t("places.ratingError")),
  });
  const deleteRestaurant = trpc.restaurants.delete.useMutation({
    onSuccess: () => { invalidate(); toast.success(t("places.removed")); },
    onError: (e) => toast.error(userError(e, t)),
  });
  const createTag = trpc.tags.createCustom.useMutation({
    onSuccess: () => { utils.tags.list.invalidate({ wheelId }); setNewTagName(""); setNewTagCategory("custom"); setShowTagCreate(false); setTagError(null); toast.success(t("places.tagCreated")); },
    onError: (e) => setTagError(userError(e, t)),
  });
  const recomputeDistances = trpc.wheels.recomputeDistances.useMutation({
    onSuccess: (res) => {
      invalidate();
      // matrixFailed means the Distance Matrix API call itself errored (most
      // often: Distance Matrix API isn't enabled on GOOGLE_MAPS_API_KEY — a
      // separate toggle from the Places API that powers "Look up"/nearby
      // search). Surface it clearly instead of a blanket success toast that
      // would otherwise look identical to "nothing needed updating".
      if (res.matrixFailed) {
        toast.error(t("places.distance.error"));
        return;
      }
      toast.success(res.unlocatable
        ? t("places.distance.updatedSkipped", { computed: res.computed, skipped: res.unlocatable })
        : t("places.distance.updated", { computed: res.computed }));
    },
    onError: (e) => toast.error(userError(e, t)),
  });

  // Paste a Google Maps link → look the place up → prefill the name (and a
  // matching cuisine tag). The write still goes through restaurants.add.
  // ── Find a restaurant by name, from inside the add form ───────────────────
  // Same places.searchNearby the ADD NEARBY dialog uses, with the typed name as
  // the keyword: one Nearby Search request, only ever on an explicit tap.
  const [nameGeoError, setNameGeoError] = useState<string | null>(null);
  const [locatingForName, setLocatingForName] = useState(false);
  const nameSearch = trpc.places.searchNearby.useMutation();
  const nameResults = (nameSearch.data?.places ?? []) as SearchedPlace[];
  const nameAlert = providerAlert(nameSearch.error);
  const nameSearchBusy = locatingForName || nameSearch.isPending;

  const searchByName = async () => {
    const keyword = form.name.trim();
    if (!keyword) return;
    setNameGeoError(null);
    setFormError(null);
    setLocatingForName(true);
    try {
      // Reuses this session's fix (lib/geo) — no second permission prompt if
      // ADD NEARBY or first-run already asked.
      const at = await requestCoords();
      nameSearch.mutate({ wheelId, lat: at.lat, lng: at.lng, keyword, language: lang });
    } catch (err) {
      const kind = err instanceof GeoError ? err.kind : "failed";
      setNameGeoError(
        kind === "unsupported"
          ? t("places.geo.unsupported")
          : kind === "denied"
            ? t("places.geo.denied")
            : t("places.geo.failed"),
      );
    } finally {
      setLocatingForName(false);
    }
  };

  /** Fill the form from a searched place, the way "Look up" does for a link. */
  const pickSearchedPlace = (p: SearchedPlace) => {
    const tag = matchCuisineTag(p.cuisine, tags ?? []);
    setForm((f) => ({
      ...f,
      name: p.name,
      // The place id is what lets the saved row fetch opening hours later.
      placeId: p.placeId,
      mapUrl: f.mapUrl.trim() || placeSearchMapUrl(p.placeId, p.name),
      tagIds: tag && !f.tagIds.includes(tag.id) ? [...f.tagIds, tag.id] : f.tagIds,
    }));
    nameSearch.reset();
    setNameGeoError(null);
  };

  const resolveLink = trpc.places.resolveLink.useMutation({
    onSuccess: ({ place }) => {
      setForm((f) => {
        const tag = matchCuisineTag(place.cuisine, tags ?? []);
        return {
          ...f,
          name: place.name,
          // Keep the resolved place id so the saved row can fetch opening hours.
          placeId: place.placeId ?? f.placeId,
          tagIds: tag && !f.tagIds.includes(tag.id) ? [...f.tagIds, tag.id] : f.tagIds,
        };
      });
      setFormError(null);
      toast.success(t("places.found", { name: place.name }));
    },
    onError: (e) => setFormError(t(providerAlert(e, "link")?.messageKey ?? "err.generic")),
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
    const byTags = selectedTagIds.length === 0
      ? (restaurants ?? [])
      : (restaurants ?? []).filter((r) => selectedTagIds.every((id) => r.tags.some((t) => t.id === id)));
    const filtered = filterRestaurantsByDistance(byTags, maxWalkMinutes);
    if (sortByRating) {
      // Highest team average first; unrated places sink to the bottom, name-stable.
      return [...filtered].sort((a, b) => {
        const ra = ratingByRestaurant.get(a.id)?.average ?? null;
        const rb = ratingByRestaurant.get(b.id)?.average ?? null;
        if (ra == null && rb == null) return a.name.localeCompare(b.name);
        if (ra == null) return 1;
        if (rb == null) return -1;
        return rb - ra || a.name.localeCompare(b.name);
      });
    }
    if (!distanceEnabled || !sortNearest) return filtered;
    // Located restaurants first (nearest first), unlocated ones after, name-stable.
    return [...filtered].sort((a, b) => {
      if (a.walkSeconds == null && b.walkSeconds == null) return a.name.localeCompare(b.name);
      if (a.walkSeconds == null) return 1;
      if (b.walkSeconds == null) return -1;
      return a.walkSeconds - b.walkSeconds;
    });
  }, [restaurants, selectedTagIds, maxWalkMinutes, distanceEnabled, sortNearest, sortByRating, ratingByRestaurant]);

  const toggleFormTag = (tagId: number) => {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(tagId) ? f.tagIds.filter((id) => id !== tagId) : [...f.tagIds, tagId],
    }));
  };

  const openEdit = (r: NonNullable<typeof restaurants>[number]) => {
    // Carry the existing placeId through an edit so we don't discard the row's
    // provider identity (and its ability to refresh hours).
    setForm({ name: r.name, notes: r.notes ?? "", tagIds: r.tags.map((t) => t.id), mapUrl: r.mapUrl ?? "", placeId: r.placeId ?? null });
    setEditId(r.id);
  };

  const submitForm = () => {
    if (!form.name.trim()) return;
    const mapUrl = form.mapUrl.trim() || null;
    if (editId !== null) {
      updateRestaurant.mutate({ id: editId, name: form.name.trim(), notes: form.notes || null, tagIds: form.tagIds, mapUrl });
    } else {
      addRestaurant.mutate({ wheelId, name: form.name.trim(), notes: form.notes || null, tagIds: form.tagIds, mapUrl, placeId: form.placeId });
    }
  };

  const TagChip = ({ tag }: { tag: { id: number; name: string; color: string; category?: string | null } }) => {
    const isActive = form.tagIds.includes(tag.id);
    return (
      <button
        type="button"
        onClick={() => toggleFormTag(tag.id)}
        className="px-3 py-1.5 transition-colors duration-150"
        style={{
          borderRadius: "var(--radius-chip)",
          background: isActive ? tag.color + "33" : "var(--muted)",
          border: `1px solid ${isActive ? tag.color : "var(--border)"}`,
          color: isActive ? tag.color : "var(--body-warm)",
          fontSize: 15,
          fontWeight: 500,
        }}
      >
        {tagLabel(tag.name, t, tag.category)}
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
      { label: t("places.tag.cuisine"), ...cuisineSplit, showAll: showAllCuisine, setShowAll: setShowAllCuisine },
      { label: t("places.tag.foodType"), ...foodTypeSplit, showAll: showAllFoodType, setShowAll: setShowAllFoodType },
      { label: t("places.tag.custom"), curated: customTags, rest: [], showAll: false, setShowAll: () => {} },
    ];
    return (
      <div className="flex flex-col gap-2">
        {groups.map(({ label, curated, rest, showAll, setShowAll }) =>
          curated.length > 0 || rest.length > 0 ? (
            <div key={label}>
              <p className="type-eyebrow mb-2" style={{ color: "var(--body-warm)" }}>{label}</p>
              <div className="flex flex-wrap gap-1.5">
                {curated.map((tag) => <TagChip key={tag.id} tag={tag} />)}
                {showAll && rest.map((tag) => <TagChip key={tag.id} tag={tag} />)}
                {rest.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors duration-150"
                    style={{ borderRadius: "var(--radius-chip)", border: "1px dashed var(--border)", fontSize: 15, fontWeight: 500 }}
                  >
                    {showAll ? t("places.tag.showLess") : t("places.tag.more", { n: rest.length })}
                  </button>
                )}
              </div>
            </div>
          ) : null
        )}
        <button
          type="button"
          onClick={() => setShowTagCreate(true)}
          className="self-start flex items-center gap-1 type-meta text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <Plus size={12} /> {t("places.tag.create")}
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="type-section" style={{ color: "var(--ink-warm)" }}>{t("places.title")}</h2>
          {restaurants && restaurants.length > 0 && (
            <p className="type-meta text-muted-foreground mt-0.5">{t(restaurants.length === 1 ? "places.count.one" : "places.count.other", { n: restaurants.length })}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* NEARBY is the primary action and ADD is the ghost, not the other
              way round: one tap here yields ten real places sorted by walking
              time, while typing a restaurant's name by hand is the rare case.
              The label stays visible on mobile — an unlabelled 40px icon is
              what kept the best thing in the app hidden. */}
          {/* The meta-rung label: it shares a header row with Add on a 360px phone. */}
          <Button
            onClick={() => setShowNearby(true)}
            title={t("places.nearby.title")}
            className="px-5 text-(length:--control-label-md)"
          >
            <Navigation size={16} /> {t("places.nearby.action")}
          </Button>
          {/* IMPORT (paste a list of names) was removed: ADD NEARBY and the
              name search in the add form cover the same ground with real place
              data attached. The server's restaurants.addBulk stays — the
              starter pack still uses it. */}
          <Button
            variant="secondary"
            onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}
            title={t("places.add.title")}
            className="min-w-(--control-lg) px-4 text-body-warm"
          >
            <Plus size={16} /> <span className="hidden sm:inline">{t("places.add.action")}</span>
          </Button>
        </div>
      </div>

      {/* Permissions note */}
      {!isOwner && (
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 type-meta"
          style={{
            borderRadius: "var(--radius-chip)",
            background: "oklch(from var(--info) l c h / 0.08)",
            border: "1px solid oklch(from var(--info) l c h / 0.20)",
            color: "var(--info)",
          }}
        >
          <Tag size={12} className="flex-shrink-0" />
          {t("places.memberNote")}
        </div>
      )}

      {/* ── Meta line ──────────────────────────────────────────────────────────
          One readable line of state (count · distance origin · hours needing a
          fetch) plus a single ⋮ for the occasional actions. This replaced three
          stacked control bars — a distance bar, an hours bar whose sentence wrapped
          mid-phrase, and a lone "Top rated" pill — which together pushed the actual
          list far down the screen on mobile. */}
      {(restaurants?.length ?? 0) > 0 && (() => {
        const closedCount = restaurants?.filter((r) => r.openStatus === "closed").length ?? 0;
        const noHoursCount = restaurants?.filter((r) => r.openStatus === "unknown").length ?? 0;
        const canFetchHours = restaurants?.some((r) => r.placeId || r.mapUrl) ?? false;
        const hasRatings = (ratingSummaries?.length ?? 0) > 0;
        const sortable = (restaurants?.length ?? 0) > 1;
        return (
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap type-meta text-muted-foreground">
            {distanceEnabled && (
              <span className="flex items-center gap-1">
                <Footprints size={12} className="flex-shrink-0" />
                {t("places.meta.from", { name: originLabelText(originLabel, t) })}
              </span>
            )}
            {/* Only surface hours when they say something actionable. */}
            {closedCount > 0 && (
              <>
                {distanceEnabled && <span className="opacity-40">·</span>}
                <span className="flex items-center gap-1">
                  <Clock3 size={12} className="flex-shrink-0" />
                  {t("places.meta.closed", { n: closedCount })}
                </span>
              </>
            )}
            {closedCount === 0 && noHoursCount > 0 && canFetchHours && (
              <>
                {distanceEnabled && <span className="opacity-40">·</span>}
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: "oklch(from var(--brand) l c h / 0.12)",
                    color: "var(--brand-text)",
                  }}
                >
                  <Clock3 size={11} className="flex-shrink-0" />
                  {t("places.meta.needHours", { n: noHoursCount })}
                </span>
              </>
            )}

            {/* Tools — sorting and the two refreshes, out of the layout's way. */}
            <div className="ml-auto flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("places.tools.label")}
                    className="flex items-center justify-center h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                  >
                    {refreshHours.isPending || recomputeDistances.isPending ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <MoreVertical size={16} />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {sortable && hasRatings && (
                    <DropdownMenuItem
                      onClick={() => { setSortNearest(false); setSortByRating((s) => !s); }}
                      className="gap-2.5"
                    >
                      <Star size={14} style={{ fill: sortByRating ? "var(--star)" : "none", color: "var(--star-edge)" }} />
                      {t("places.tools.topRated")}
                      {sortByRating && <Check size={13} className="ml-auto" />}
                    </DropdownMenuItem>
                  )}
                  {sortable && distanceEnabled && (
                    <DropdownMenuItem
                      onClick={() => { setSortByRating(false); setSortNearest((s) => !s); }}
                      className="gap-2.5"
                    >
                      <ArrowDownWideNarrow size={14} />
                      {t("places.tools.nearest")}
                      {sortNearest && <Check size={13} className="ml-auto" />}
                    </DropdownMenuItem>
                  )}
                  {sortable && (hasRatings || distanceEnabled) && <DropdownMenuSeparator />}
                  {canFetchHours && (
                    <DropdownMenuItem
                      onClick={() => refreshHours.mutate({ wheelId })}
                      disabled={refreshHours.isPending}
                      className="gap-2.5"
                    >
                      <Clock3 size={14} />
                      {t("places.tools.refreshHours")}
                    </DropdownMenuItem>
                  )}
                  {distanceEnabled && (
                    <DropdownMenuItem
                      onClick={() => recomputeDistances.mutate({ id: wheelId })}
                      disabled={recomputeDistances.isPending}
                      className="gap-2.5"
                    >
                      <RefreshCw size={14} />
                      {t("places.tools.refreshDistance")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })()}

      {/* Filter by tags + distance — mirrors the Wheel tab so the list can be narrowed too */}
      <FilterBar
        open={showFilters}
        onOpenChange={setShowFilters}
        tagGroups={[
          { label: t("places.filter.cuisine"), items: usedCuisineTags },
          { label: t("places.filter.foodType"), items: usedFoodTypeTags },
          { label: t("places.filter.custom"), items: usedCustomTags },
        ]}
        selectedTagIds={selectedTagIds}
        onToggleTag={toggleFilterTag}
        distanceEnabled={!!distanceEnabled}
        maxWalkMinutes={maxWalkMinutes}
        onChangeMaxWalkMinutes={setMaxWalkMinutes}
        matchCount={visibleRestaurants.length}
        totalCount={restaurants?.length ?? 0}
        emptyMessage={t("places.filter.empty")}
      />

      {/* Restaurant list */}
      {isLoading ? (
        <div className="flex flex-col gap-2.5">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-[72px] animate-pulse" style={{ borderRadius: "var(--radius-card)", background: "var(--muted)", animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : restaurants?.length === 0 ? (
        /* Empty state leads with nearby search, not the manual form. Filling a
           wheel one typed name at a time is the slowest path we offer, and it
           was the only one this state suggested. */
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
          <div
            className="w-16 h-16 flex items-center justify-center"
            style={{ borderRadius: "var(--radius-card)", background: "oklch(from var(--brand) l c h / 0.12)" }}
          >
            <MapPin size={26} style={{ color: "var(--brand-text)" }} />
          </div>
          <div>
            <p className="type-section mb-1.5" style={{ color: "var(--ink-warm)" }}>{t("places.empty.title")}</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {t("places.empty.body")}
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs mt-1">
            <Button onClick={() => setShowNearby(true)}>
              <Navigation size={16} /> {t("places.empty.nearby")}
            </Button>
            <Button variant="secondary" onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}>
              <Plus size={15} /> {t("places.empty.manual")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleRestaurants.map((r, i) => {
            const primary = primaryTag(r);
            const dotColor = segmentColor(primary?.color, i);
            return (
            <div
              key={r.id}
              /* Paper, not glass: item 10's rows are page content, and a
                 scrolling list of backdrop-filtered surfaces is exactly the
                 stacking the perf budget calls out. The dark-theme drop shadow
                 came from the old palette and reads as grime on warm paper. */
              className="group flex items-start gap-3 px-4 py-3.5 transition-colors duration-200"
              style={{
                borderRadius: "var(--radius-card)",
                background: "var(--paper)",
                border: "1px solid var(--border)",
                opacity: r.isExcluded ? 0.55 : 1,
              }}
            >
              {/* Color swatch — matches wheel segment */}
              <div
                className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 transition-all duration-200"
                title={primary?.name ? t("places.row.tagged", { name: tagLabel(primary.name, t, primary.category) }) : t("places.row.color")}
                style={{ background: dotColor }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-warm)" }}>{r.name}</span>
                  {r.isExcluded && (
                    <span
                      className="type-meta px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                      style={{
                        background: "oklch(from var(--destructive) l c h / 0.15)",
                        color: "var(--brand-text)",
                        border: "1px solid oklch(from var(--destructive) l c h / 0.25)",
                      }}
                    >
                      {t("places.row.excluded")}
                    </span>
                  )}
                  {distanceEnabled && (
                    <span className="flex items-center gap-1 type-meta px-2 py-0.5 rounded-full flex-shrink-0 font-medium text-muted-foreground" style={{ background: "var(--muted)" }}>
                      <Footprints size={10} className="flex-shrink-0" />
                      {r.walkSeconds != null ? walkLabel(t, r.walkSeconds / 60) : t("places.row.noLocation")}
                    </span>
                  )}
                  {/* Opening hours. "unknown" shows nothing — those places stay on
                      the wheel, so a chip would just be noise. */}
                  {r.openStatus === "closed" && (
                    <span
                      className="flex items-center gap-1 type-meta px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                      style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                      title={t("places.row.closedTitle")}
                    >
                      <Clock3 size={10} className="flex-shrink-0" /> {t("places.row.closed")}
                    </span>
                  )}
                  {r.openStatus === "closing_soon" && (
                    <span
                      className="flex items-center gap-1 type-meta px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                      style={{
                        background: "oklch(from var(--destructive) l c h / 0.12)",
                        color: "var(--destructive)",
                        border: "1px solid oklch(from var(--destructive) l c h / 0.25)",
                      }}
                      title={t("places.row.closingTitle")}
                    >
                      <Clock3 size={10} className="flex-shrink-0" />
                      {r.minutesUntilClose != null ? t("places.row.closesIn", { n: r.minutesUntilClose }) : t("places.row.closing")}
                    </span>
                  )}
                </div>
                {r.notes && <p className="type-meta text-muted-foreground mt-0.5 line-clamp-1">{r.notes}</p>}
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="type-meta px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: tag.color + "18",
                          color: tag.color,
                          border: `1px solid ${tag.color}35`,
                        }}
                      >
                        {tagLabel(tag.name, t, tag.category)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Glanceable team rating + a ⋮ that opens the detail sheet
                  (rate, team breakdown, edit / owner-delete all live there). */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <RatingChip average={ratingByRestaurant.get(r.id)?.average ?? null} />
                <button
                  onClick={() => setDetailId(r.id)}
                  className="flex items-center justify-center h-11 w-11 rounded-xl hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors duration-150 active:scale-[var(--press-scale)]"
                  aria-label={t("places.row.openDetails", { name: r.name })}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Restaurant detail sheet — glance chip on the row opens this. Holds the
          team rating, the member's own star control, and (owner) Edit/Delete. */}
      <Drawer open={detailId !== null} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DrawerContent>
          {(() => {
            const r = (restaurants ?? []).find((x) => x.id === detailId);
            if (!r) return null;
            const summary = ratingByRestaurant.get(r.id);
            const avg = summary?.average ?? null;
            const count = summary?.count ?? 0;
            const mine = summary?.myStars ?? null;
            return (
              <div className="mx-auto w-full max-w-md px-5 pb-8 pt-1">
                {/* Detail card title — 17px/600 per the CJK type pass; the old
                    20px display face set Chinese names far heavier than Latin. */}
                <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-warm)" }}>{r.name}</h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {r.tags.map((tag) => (
                    <span key={tag.id} className="px-2.5 py-1" style={{ borderRadius: "var(--radius-chip)", background: tag.color + "18", color: tag.color, border: `1px solid ${tag.color}35`, fontSize: 15, fontWeight: 500 }}>{tagLabel(tag.name, t, tag.category)}</span>
                  ))}
                  {distanceEnabled && r.walkSeconds != null && (
                    <span
                      className="flex items-center gap-1.5 px-2.5 py-1"
                      style={{ borderRadius: "var(--radius-chip)", background: "var(--muted)", color: "var(--body-warm)", fontSize: 15, fontWeight: 400 }}
                    >
                      <Footprints size={12} />{walkLabel(t, r.walkSeconds / 60)}
                    </span>
                  )}
                  {r.mapUrl && (
                    <a href={r.mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-1" style={{ color: "var(--brand-text)", fontSize: 15, fontWeight: 500 }}>
                      <Navigation size={12} />{t("places.detail.directions")}
                    </a>
                  )}
                </div>
                {r.notes && <p className="type-meta text-muted-foreground mt-2">{r.notes}</p>}

                {/* Opening hours — states mirror shared/openHours.ts. "unknown" is
                    stated plainly so nobody thinks the place was dropped. */}
                <div className="mt-5 flex items-center gap-2 type-meta">
                  <Clock3 size={13} className="flex-shrink-0 text-muted-foreground" />
                  {r.openStatus === "closed" ? (
                    <span className="text-muted-foreground">{t("places.detail.closed")}</span>
                  ) : r.openStatus === "closing_soon" ? (
                    <span style={{ color: "var(--destructive)" }} className="font-semibold">
                      {r.minutesUntilClose != null ? t("places.detail.closingIn", { n: r.minutesUntilClose }) : t("places.detail.closing")}
                    </span>
                  ) : r.openStatus === "open" ? (
                    <span style={{ color: "var(--ok)" }} className="font-semibold">{t("places.detail.open")}</span>
                  ) : (
                    <span className="text-muted-foreground">{t("places.detail.hoursUnknown")}</span>
                  )}
                </div>

                <div className="mt-6">
                  <div className="type-eyebrow mb-2" style={{ color: "var(--ink-warm)" }}>{t("places.detail.teamRating")}</div>
                  {avg == null ? (
                    <p className="text-sm text-muted-foreground">{t("places.detail.noRatings")}</p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="type-section tabular-nums" style={{ fontSize: 34, color: "var(--ink-warm)" }}>{avg.toFixed(1)}</span>
                      <div>
                        <StarRating value={avg} size={18} />
                        <div className="type-meta text-muted-foreground mt-0.5">{t(count === 1 ? "places.detail.rating.one" : "places.detail.rating.other", { n: count })}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <div className="type-eyebrow mb-2" style={{ color: "var(--ink-warm)" }}>{t("places.detail.yourRating")}</div>
                  <StarRating
                    value={mine}
                    size={30}
                    disabled={rateRestaurant.isPending}
                    onChange={(stars) => rateRestaurant.mutate({ wheelId, restaurantId: r.id, stars })}
                  />
                </div>

                <div className="mt-7 pt-4 flex gap-2.5" style={{ borderTop: "1px solid var(--border)" }}>
                  <Button
                    variant="outline"
                    onClick={() => { const target = r; setDetailId(null); openEdit(target); }}
                    className="flex-1"
                  >
                    <Pencil size={16} /> {t("places.detail.edit")}
                  </Button>
                  {isOwner && (
                    <Button
                      variant="destructive-outline"
                      /* The app's own dialog, not window.confirm. This was the
                         last native confirm left, and it sat in the worst place
                         for one: it blocks the main thread from inside the click
                         handler of a button in a sheet that the same handler then
                         unmounts — exactly the tear-down-under-your-own-click
                         hazard ConfirmDangerDialog was written for. A native
                         confirm is also suppressible (iOS standalone, some
                         in-app browsers), and a suppressed one returns false, so
                         Delete would silently do nothing. */
                      onClick={() => { setPendingDelete({ id: r.id, name: r.name }); setDetailId(null); }}
                      className="flex-1"
                    >
                      <Trash2 size={16} /> {t("places.detail.delete")}
                    </Button>
                  )}
                </div>
                {!isOwner && <p className="type-meta text-muted-foreground text-center mt-2">{t("places.detail.ownerDelete")}</p>}
              </div>
            );
          })()}
        </DrawerContent>
      </Drawer>

      {/* Add/Edit dialog */}
      <Dialog open={showAdd || editId !== null} onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="glass-sheet max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="type-section" style={{ color: "var(--ink-warm)" }}>
              {editId !== null ? t("places.form.editTitle") : t("places.form.addTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            {/* Name + search. Typing a name and tapping search runs the same
                nearby lookup ADD NEARBY uses, so you can find a place from here
                instead of pasting a Maps link — picking one fills in the name,
                its place id (which is what makes opening hours work) and its
                cuisine tag. */}
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <Input
                  placeholder={t("places.form.name")}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && form.name.trim()) {
                      e.preventDefault();
                      searchByName();
                    }
                  }}
                  className="bg-secondary/50 border-border/50 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={searchByName}
                  disabled={!form.name.trim() || nameSearchBusy}
                  title={t("places.form.searchTitle")}
                >
                  {nameSearchBusy
                    ? <Loader2 size={15} className="animate-spin" />
                    : <Search size={15} />}
                </Button>
              </div>

              {nameGeoError && (
                <p className="type-meta px-1" style={{ color: "var(--destructive)" }}>{nameGeoError}</p>
              )}
              {nameAlert && (
                <p
                  className="type-meta px-1 leading-relaxed"
                  style={{ color: nameAlert.quota ? "var(--brand-text)" : "var(--destructive)" }}
                >
                  {t(nameAlert.messageKey)}
                </p>
              )}
              {nameSearch.data && nameResults.length === 0 && !nameSearchBusy && (
                <p className="type-meta text-muted-foreground px-1">
                  {t("places.form.noMatch")}
                </p>
              )}

              {nameResults.length > 0 && (
                <div
                  className="flex flex-col gap-1 max-h-56 overflow-y-auto rounded-xl p-1"
                  style={{ borderRadius: "var(--radius-control)", background: "var(--paper)", border: "1px solid var(--border)" }}
                >
                  {nameResults.map((p) => (
                    <button
                      key={p.placeId}
                      type="button"
                      onClick={() => pickSearchedPlace(p)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                    >
                      <MapPin size={13} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />
                      <span className="flex-1 min-w-0">
                        <span className="block type-meta font-semibold truncate">{p.name}</span>
                        <span className="block type-meta text-muted-foreground truncate">
                          {walkLabel(t, p.walkMinutes, p.walkSource !== "route")}
                          {p.cuisine ? ` · ${tagLabel(p.cuisine, t)}` : ""}
                          {p.address ? ` · ${p.address}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Textarea
              placeholder={t("places.form.notes")}
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
                    placeholder={t("places.form.mapLink")}
                    value={form.mapUrl}
                    onChange={(e) => setForm((f) => ({ ...f, mapUrl: e.target.value }))}
                    className="bg-secondary/50 border-border/50 pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => { setFormError(null); resolveLink.mutate({ wheelId, url: form.mapUrl.trim(), language: lang }); }}
                  disabled={!looksLikeMapLink(form.mapUrl) || resolveLink.isPending}
                  title={t("places.form.lookupTitle")}
                >
                  {resolveLink.isPending
                    ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : t("places.form.lookup")}
                </Button>
              </div>
              <p className="type-meta text-muted-foreground px-1">
                {t("places.form.mapHelp")}
              </p>
            </div>
            <TagSelector />
            <ErrorChip error={formError} onDismiss={() => setFormError(null)} />
            <Button
              onClick={() => { setFormError(null); submitForm(); }}
              disabled={!form.name.trim() || addRestaurant.isPending || updateRestaurant.isPending}
            >
              {addRestaurant.isPending || updateRestaurant.isPending ? (
                <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />{editId !== null ? t("places.form.saving") : t("places.form.adding")}</span>
              ) : editId !== null ? t("places.form.save") : t("places.form.add")}
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
        <DialogContent className="glass-sheet max-w-sm">
          <DialogHeader>
            <DialogTitle className="type-section" style={{ color: "var(--ink-warm)" }}>{t("places.tagDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex gap-1.5">
              {TAG_CATEGORY_OPTIONS.map((value) => (
                <Chip
                  key={value}
                  pressed={newTagCategory === value}
                  onClick={() => setNewTagCategory(value)}
                  className="flex-1 px-3"
                >
                  {t(value === "cuisine" ? "places.tag.cuisine" : value === "food_type" ? "places.tag.foodType" : "places.tag.custom")}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={t("places.tagDialog.name")}
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
              >
                {createTag.isPending ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <Check size={16} />}
              </Button>
            </div>
            <ErrorChip error={tagError} onDismiss={() => setTagError(null)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Removing a place is permanent — there is no trash and no undo — and it
          takes its ratings and its spin history off the team's wheel with it. */}
      <ConfirmDangerDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open && !deleteRestaurant.isPending) setPendingDelete(null); }}
        title={t("places.delete.title")}
        confirmLabel={t("places.delete.confirm")}
        pending={deleteRestaurant.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteRestaurant.mutate({ id: pendingDelete.id });
          setPendingDelete(null);
        }}
        body={
          <>
            <p>{t("places.delete.body", { name: pendingDelete?.name ?? "" })}</p>
            <p>{t("places.delete.irreversible")}</p>
          </>
        }
      />
    </div>
  );
}
