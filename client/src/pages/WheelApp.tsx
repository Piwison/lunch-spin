import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import SpinWheel, { WheelSegment } from "@/components/SpinWheel";
import RestaurantTab from "@/components/RestaurantTab";
import HistoryTab from "@/components/HistoryTab";
import WheelSelector from "@/components/WheelSelector";
import WheelMembers from "@/components/WheelMembers";
import RoundPanel from "@/components/RoundPanel";
import { toast } from "sonner";
import { X, AlertTriangle, MapPin, RotateCw, Check, Clock, RefreshCw, Plus, SlidersHorizontal, Utensils, History, ChevronDown, LogOut, Sparkles } from "lucide-react";
import { filterRestaurantsByTags } from "@shared/filter";
import { formatExclusionTimeLeft } from "@shared/exclusion";
import { applyDietary, EMPTY_SESSION, excludedDietaryTagIds, vetoedIds, type SessionState } from "@shared/session";
import { segmentColor } from "@/lib/palette";
import { ErrorChip } from "@/components/StatusChip";

type Tab = "wheel" | "restaurants" | "history";

const TAB_CONFIG: { id: Tab; label: string; icon: typeof Utensils }[] = [
  { id: "wheel", label: "Wheel", icon: RotateCw },
  { id: "restaurants", label: "Restaurants", icon: Utensils },
  { id: "history", label: "History", icon: History },
];

// Quick mood presets for Smart Pick (free-text also supported).
const MOOD_CHIPS = ["Light", "Spicy", "Quick", "Healthy", "Comfort", "Veg"];

export default function WheelApp() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ wheelId?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("wheel");
  const [selectedWheelId, setSelectedWheelId] = useState<number | null>(
    params.wheelId ? parseInt(params.wheelId) : null
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<WheelSegment | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [presentUserIds, setPresentUserIds] = useState<number[]>([]);
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const [sharedText, setSharedText] = useState<string | null>(null);
  const tabIndicatorRef = useRef<HTMLSpanElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [aiReason, setAiReason] = useState<string | null>(null);
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodChips, setMoodChips] = useState<string[]>([]);
  const [moodText, setMoodText] = useState("");

  // PWA share-target
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const shared = (p.get("text") || p.get("title") || p.get("url") || "").trim();
    if (shared) {
      setSharedText(shared);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [user, loading, navigate]);

  const { data: tags } = trpc.tags.list.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId }
  );
  const {
    data: restaurants,
    isLoading: restaurantsLoading,
    error: restaurantsError,
    refetch: refetchRestaurants,
  } = trpc.restaurants.list.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId }
  );
  const { data: wheelData } = trpc.wheels.get.useQuery(
    { id: selectedWheelId! },
    { enabled: !!selectedWheelId }
  );

  const createSpin = trpc.spins.create.useMutation();
  const smartPick = trpc.smart.pick.useMutation();
  const isShared = !!wheelData?.isShared;

  // Live shared wheels SSE
  trpc.spins.onSpin.useSubscription(
    { wheelId: selectedWheelId! },
    {
      enabled: !!selectedWheelId && isShared,
      onData: (event) => {
        if (!user || event.spunBy === user.id) return;
        toast(`${event.spunByName ?? "A teammate"} spun ${event.restaurantName}`, { icon: "🎡" });
        refetchRestaurants();
      },
    }
  );

  trpc.presence.onPresence.useSubscription(
    { wheelId: selectedWheelId! },
    {
      enabled: !!selectedWheelId && isShared,
      onData: (list) => setPresentUserIds(list.map((u) => u.userId)),
      onError: () => setPresentUserIds([]),
    }
  );

  trpc.session.onSession.useSubscription(
    { wheelId: selectedWheelId! },
    {
      enabled: !!selectedWheelId && isShared,
      onData: (state) => setSession(state),
      onError: () => setSession(EMPTY_SESSION),
    }
  );

  const vetoMutation = trpc.session.veto.useMutation();
  const voteMutation = trpc.session.vote.useMutation();
  const dietaryMutation = trpc.session.dietary.useMutation();
  const clearRound = trpc.session.clear.useMutation();

  const addShared = trpc.restaurants.addBulk.useMutation({
    onSuccess: (res) => {
      setSharedText(null);
      refetchRestaurants();
      toast.success(`Added ${res.added} restaurant${res.added !== 1 ? "s" : ""} to the wheel`);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!isShared) {
      setPresentUserIds([]);
      setSession(EMPTY_SESSION);
    }
  }, [isShared, selectedWheelId]);

  const roundCandidates = useMemo(
    () => filterRestaurantsByTags(restaurants ?? [], selectedTagIds),
    [restaurants, selectedTagIds]
  );

  const filteredRestaurants = useMemo(() => {
    const vetoed = new Set(vetoedIds(session));
    const notVetoed = roundCandidates.filter((r) => !vetoed.has(r.id));
    return applyDietary(notVetoed, excludedDietaryTagIds(session));
  }, [roundCandidates, session]);

  const wheelSegments: WheelSegment[] = useMemo(() =>
    filteredRestaurants.map((r, i) => ({
      id: r.id,
      label: r.name,
      color: segmentColor(r.tags[0]?.color, i),
    })),
    [filteredRestaurants]
  );

  const handleSpinEnd = (segment: WheelSegment) => {
    setIsSpinning(false);
    setSpinResult(segment);
    setShowResult(true);
    setTargetId(null);
    refetchRestaurants();
  };

  const handleSpin = async () => {
    if (wheelSegments.length === 0) {
      setSpinError("No restaurants available. Add some or adjust your filters.");
      return;
    }
    if (!selectedWheelId || createSpin.isPending) return;
    setShowResult(false);
    setSpinResult(null);
    setSpinError(null);
    setAiReason(null);
    try {
      const { restaurantId } = await createSpin.mutateAsync({
        wheelId: selectedWheelId,
        candidateIds: wheelSegments.map((s) => s.id),
      });
      setTargetId(restaurantId);
      setIsSpinning(true);
    } catch (e) {
      setSpinError(e instanceof Error ? e.message : "Couldn't start the spin. Try again.");
    }
  };

  // "Smart Pick" — the server applies the wheel's weighting + an optional mood
  // boost, records and broadcasts the pick (no client choice), and returns a
  // short reason. We reuse the spin animation to land on it.
  const aiPending = smartPick.isPending;
  const handleSmartPick = async () => {
    if (wheelSegments.length === 0) {
      setSpinError("No restaurants available. Add some or adjust your filters.");
      return;
    }
    if (!selectedWheelId || aiPending || createSpin.isPending || isSpinning) return;
    setShowResult(false);
    setSpinResult(null);
    setSpinError(null);
    setAiReason(null);
    try {
      const picked = await smartPick.mutateAsync({
        wheelId: selectedWheelId,
        candidateIds: wheelSegments.map((s) => s.id),
        moodChips: moodChips.length ? moodChips : undefined,
        moodText: moodText.trim() ? moodText.trim() : undefined,
      });
      setAiReason(picked.reason);
      setTargetId(picked.restaurantId);
      setIsSpinning(true);
    } catch (e) {
      setSpinError(e instanceof Error ? e.message : "Couldn't pick right now. Try again.");
    }
  };

  const handleReSpin = () => {
    setShowResult(false);
    setSpinResult(null);
    requestAnimationFrame(() => handleSpin());
  };

  const openDirections = (name: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`, "_blank", "noopener,noreferrer");
  };

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const cuisineTags = tags?.filter((t) => t.category === "cuisine") ?? [];
  const foodTypeTags = tags?.filter((t) => t.category === "food_type") ?? [];
  const customTags = tags?.filter((t) => t.category === "custom") ?? [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.09 0.02 260)" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full animate-orb-spin"
            style={{
              background: "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6, #ef4444)",
              boxShadow: "0 0 30px oklch(0.72 0.22 30 / 0.4)",
            }}
          />
          <p className="text-sm text-muted-foreground tracking-widest" style={{ fontFamily: "var(--font-display)" }}>
            LOADING...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isOwner = wheelData?.ownerId === user.id;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "oklch(0.09 0.02 260)" }}>
      {/* ── HEADER ── */}
      <header
        className="border-b border-border/40 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30"
        style={{ background: "oklch(0.09 0.02 260 / 0.85)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-full flex-shrink-0 animate-orb-spin"
            style={{
              background: "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6, #ec4899, #ef4444)",
              boxShadow: "0 0 12px oklch(0.72 0.22 30 / 0.5)",
              animationDuration: "20s",
            }}
          />
          <span
            className="font-black text-base tracking-tight gradient-text"
            style={{ fontFamily: "var(--font-display)" }}
          >
            LUNCH WHEEL
          </span>
        </div>

        <div className="flex items-center gap-2">
          {user.name && (
            <span
              className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 rounded-full"
              style={{ background: "oklch(0.14 0.025 260)", border: "1px solid oklch(0.20 0.025 260)" }}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))", color: "white" }}
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              {user.name}
            </span>
          )}
          <button
            onClick={() => logout().then(() => navigate("/"))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground transition-all duration-200 hover:bg-white/5 active:scale-95"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.05em" }}
          >
            <LogOut size={12} />
            <span className="hidden sm:block">SIGN OUT</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── SIDEBAR ── */}
        <WheelSelector
          selectedWheelId={selectedWheelId}
          onSelect={(id: number) => { setSelectedWheelId(id); navigate(`/app/${id}`); }}
        />

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── TABS ── */}
          <div
            className="border-b border-border/40 px-4 flex gap-0 pt-1 flex-shrink-0"
            ref={tabsRef}
            style={{ background: "oklch(0.09 0.02 260 / 0.6)", backdropFilter: "blur(12px)" }}
          >
            {TAB_CONFIG.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="relative flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-all duration-200"
                  style={{
                    fontFamily: "var(--font-display)",
                    letterSpacing: "0.08em",
                    color: isActive ? "oklch(0.95 0.01 260)" : "oklch(0.45 0.02 260)",
                  }}
                >
                  <Icon
                    size={13}
                    style={{
                      color: isActive ? "oklch(0.72 0.22 30)" : "oklch(0.45 0.02 260)",
                      transition: "color 0.2s",
                    }}
                  />
                  {label.toUpperCase()}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                      style={{
                        background: "linear-gradient(90deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
                        boxShadow: "0 0 8px oklch(0.72 0.22 30 / 0.6)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── SHARED TEXT BANNER ── */}
          {sharedText && (
            <div
              className="px-4 py-2.5 flex items-center gap-3 border-b flex-shrink-0"
              style={{ background: "oklch(0.65 0.25 280 / 0.10)", borderColor: "oklch(0.65 0.25 280 / 0.25)" }}
            >
              <MapPin size={14} className="flex-shrink-0" style={{ color: "oklch(0.75 0.2 285)" }} />
              <span className="text-sm flex-1 min-w-0 truncate">
                Add <strong>{sharedText}</strong>{selectedWheelId ? "" : " — pick a wheel first"}
              </span>
              <button
                onClick={() => selectedWheelId && addShared.mutate({ wheelId: selectedWheelId, text: sharedText })}
                disabled={!selectedWheelId || addShared.isPending}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
                style={{ background: "oklch(0.65 0.25 280)", color: "white", fontFamily: "var(--font-display)" }}
              >
                {addShared.isPending ? "Adding…" : "Add"}
              </button>
              <button onClick={() => setSharedText(null)} className="p-1 rounded text-muted-foreground hover:text-foreground flex-shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          {/* ── TAB CONTENT ── */}
          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}>
            {!selectedWheelId ? (
              /* Empty state — no wheel selected */
              <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
                <div
                  className="w-20 h-20 rounded-full opacity-20"
                  style={{ background: "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6, #ef4444)" }}
                />
                <div>
                  <p className="font-semibold text-foreground/60 mb-1" style={{ fontFamily: "var(--font-display)" }}>
                    NO WHEEL SELECTED
                  </p>
                  <p className="text-sm text-muted-foreground">Select a wheel from the sidebar or create a new one</p>
                </div>
              </div>
            ) : (
              <div key={activeTab} className="tab-enter">

                {/* ══ TAB 1: WHEEL ══ */}
                {activeTab === "wheel" && (
                  <div className="flex flex-col items-center gap-5 px-4 py-5 pb-28 max-w-2xl mx-auto">

                    {/* Team roster */}
                    {isShared && wheelData && (
                      <div className="w-full">
                        <WheelMembers
                          ownerId={wheelData.ownerId}
                          owner={wheelData.owner}
                          members={wheelData.members}
                          currentUserId={user.id}
                          presentUserIds={presentUserIds}
                        />
                      </div>
                    )}

                    {/* Round panel (shared wheels) */}
                    {isShared && (
                      <div className="w-full">
                        <RoundPanel
                          restaurants={roundCandidates.map((r) => ({ id: r.id, name: r.name }))}
                          tags={(tags ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color }))}
                          session={session}
                          currentUserId={user.id}
                          onVote={(id) => selectedWheelId && voteMutation.mutate({ wheelId: selectedWheelId, restaurantId: id })}
                          onVeto={(id) => selectedWheelId && vetoMutation.mutate({ wheelId: selectedWheelId, restaurantId: id })}
                          onDietary={(tagId) => selectedWheelId && dietaryMutation.mutate({ wheelId: selectedWheelId, tagId })}
                          onClear={() => selectedWheelId && clearRound.mutate({ wheelId: selectedWheelId })}
                        />
                      </div>
                    )}

                    {/* ── FILTER BAR (compact, collapsible) ── */}
                    {(restaurants?.length ?? 0) > 0 && (
                      <div
                        className="w-full rounded-xl overflow-hidden transition-all duration-300"
                        style={{
                          background: "oklch(0.12 0.025 260 / 0.6)",
                          border: `1px solid ${selectedTagIds.length > 0 ? "oklch(0.65 0.25 280 / 0.4)" : "oklch(0.20 0.025 260)"}`,
                          backdropFilter: "blur(12px)",
                        }}
                      >
                        {/* Filter header */}
                        <button
                          onClick={() => setShowFilters((s) => !s)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/3"
                        >
                          <div className="flex items-center gap-2.5">
                            <SlidersHorizontal
                              size={14}
                              style={{ color: selectedTagIds.length > 0 ? "oklch(0.72 0.22 30)" : "oklch(0.50 0.02 260)" }}
                            />
                            <span
                              className="text-xs font-semibold tracking-widest"
                              style={{
                                fontFamily: "var(--font-display)",
                                color: selectedTagIds.length > 0 ? "oklch(0.85 0.01 260)" : "oklch(0.50 0.02 260)",
                              }}
                            >
                              FILTER BY TAGS
                            </span>
                            {selectedTagIds.length > 0 && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                  background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
                                  color: "white",
                                }}
                              >
                                {selectedTagIds.length} active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {selectedTagIds.length > 0 && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {filteredRestaurants.length}/{restaurants?.length ?? 0}
                              </span>
                            )}
                            <ChevronDown
                              size={14}
                              className="text-muted-foreground transition-transform duration-200"
                              style={{ transform: showFilters ? "rotate(180deg)" : "none" }}
                            />
                          </div>
                        </button>

                        {/* Filter tags */}
                        {showFilters && (
                          <div className="px-4 pb-4 border-t border-border/30">
                            {cuisineTags.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[10px] tracking-widest text-muted-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>CUISINE</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {cuisineTags.map((tag) => {
                                    const isActive = selectedTagIds.includes(tag.id);
                                    return (
                                      <button
                                        key={tag.id}
                                        onClick={() => toggleTag(tag.id)}
                                        className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 active:scale-95"
                                        style={{
                                          background: isActive ? tag.color + "25" : "oklch(0.15 0.02 260)",
                                          border: `1px solid ${isActive ? tag.color + "80" : "oklch(0.22 0.025 260)"}`,
                                          color: isActive ? tag.color : "oklch(0.60 0.02 260)",
                                          boxShadow: isActive ? `0 0 10px ${tag.color}30` : "none",
                                        }}
                                      >
                                        {tag.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {foodTypeTags.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[10px] tracking-widest text-muted-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>FOOD TYPE</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {foodTypeTags.map((tag) => {
                                    const isActive = selectedTagIds.includes(tag.id);
                                    return (
                                      <button
                                        key={tag.id}
                                        onClick={() => toggleTag(tag.id)}
                                        className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 active:scale-95"
                                        style={{
                                          background: isActive ? tag.color + "25" : "oklch(0.15 0.02 260)",
                                          border: `1px solid ${isActive ? tag.color + "80" : "oklch(0.22 0.025 260)"}`,
                                          color: isActive ? tag.color : "oklch(0.60 0.02 260)",
                                          boxShadow: isActive ? `0 0 10px ${tag.color}30` : "none",
                                        }}
                                      >
                                        {tag.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {customTags.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[10px] tracking-widest text-muted-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>CUSTOM</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {customTags.map((tag) => {
                                    const isActive = selectedTagIds.includes(tag.id);
                                    return (
                                      <button
                                        key={tag.id}
                                        onClick={() => toggleTag(tag.id)}
                                        className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 active:scale-95"
                                        style={{
                                          background: isActive ? tag.color + "25" : "oklch(0.15 0.02 260)",
                                          border: `1px solid ${isActive ? tag.color + "80" : "oklch(0.22 0.025 260)"}`,
                                          color: isActive ? tag.color : "oklch(0.60 0.02 260)",
                                          boxShadow: isActive ? `0 0 10px ${tag.color}30` : "none",
                                        }}
                                      >
                                        {tag.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
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

                        {/* Empty filter warning */}
                        {selectedTagIds.length > 0 && filteredRestaurants.length === 0 && (
                          <div
                            className="mx-4 mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
                            style={{
                              background: "oklch(0.60 0.22 25 / 0.12)",
                              border: "1px solid oklch(0.60 0.22 25 / 0.35)",
                              color: "oklch(0.80 0.15 40)",
                            }}
                          >
                            <AlertTriangle size={13} className="flex-shrink-0" />
                            No restaurants match all selected tags. Try removing some filters.
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── WHEEL + SPIN CTA ── */}
                    {restaurantsLoading ? (
                      <div className="flex flex-col items-center gap-6 py-8 w-full">
                        <div className="w-72 h-72 rounded-full bg-white/5 animate-pulse" />
                        <div className="h-14 w-48 rounded-full bg-white/5 animate-pulse" />
                      </div>
                    ) : restaurantsError ? (
                      <div className="flex flex-col items-center gap-4 py-12 text-center">
                        <AlertTriangle size={32} className="text-amber-500/60" />
                        <p className="text-sm text-muted-foreground">Couldn't load restaurants: {restaurantsError.message}</p>
                        <button
                          onClick={() => refetchRestaurants()}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                          style={{
                            background: "oklch(0.16 0.025 260)",
                            border: "1px solid oklch(0.25 0.03 260)",
                            color: "oklch(0.85 0.02 260)",
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          <RefreshCw size={14} /> RETRY
                        </button>
                      </div>
                    ) : (
                      <div className="w-full flex flex-col items-center gap-5">
                        {/* Wheel canvas */}
                        <SpinWheel
                          segments={wheelSegments}
                          onSpinEnd={handleSpinEnd}
                          isSpinning={isSpinning}
                          onSpinStart={handleSpin}
                          targetId={targetId}
                        />

                        {(restaurants?.length ?? 0) === 0 ? (
                          /* First run CTA */
                          <div className="flex flex-col items-center gap-3 text-center">
                            <button
                              onClick={() => setActiveTab("restaurants")}
                              className="group flex items-center gap-2.5 px-8 py-4 rounded-full font-bold text-sm tracking-widest transition-all duration-200 active:scale-95 hover:-translate-y-0.5 cta-pulse"
                              style={{
                                fontFamily: "var(--font-display)",
                                background: "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
                                boxShadow: "0 0 30px oklch(0.72 0.22 30 / 0.4), 0 8px 24px rgba(0,0,0,0.4)",
                                color: "white",
                              }}
                            >
                              <Plus size={16} /> ADD RESTAURANTS
                            </button>
                            <p className="text-xs text-muted-foreground">Add a few places, then spin to decide.</p>
                          </div>
                        ) : (
                          <>
                            {/* Spin error chip */}
                            <ErrorChip error={spinError} onDismiss={() => setSpinError(null)} />
                            {/* SPIN button */}
                            <button
                              onClick={handleSpin}
                              disabled={isSpinning || createSpin.isPending || wheelSegments.length === 0}
                              className={`relative overflow-hidden px-12 py-4 rounded-full font-black text-base tracking-[0.15em] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                                !(isSpinning || createSpin.isPending || wheelSegments.length === 0)
                                  ? "cta-pulse hover:-translate-y-1 hover:brightness-110"
                                  : ""
                              }`}
                              style={{
                                fontFamily: "var(--font-display)",
                                background: isSpinning || createSpin.isPending || wheelSegments.length === 0
                                  ? "oklch(0.16 0.025 260)"
                                  : "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
                                boxShadow: isSpinning || createSpin.isPending || wheelSegments.length === 0
                                  ? "none"
                                  : "0 0 40px oklch(0.72 0.22 30 / 0.5), 0 0 80px oklch(0.65 0.25 280 / 0.2), 0 8px 32px rgba(0,0,0,0.5)",
                                color: "white",
                                minWidth: "180px",
                              }}
                            >
                              {/* Shimmer */}
                              {!(isSpinning || createSpin.isPending) && (
                                <span
                                  className="absolute inset-0 rounded-full"
                                  style={{
                                    background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)",
                                    backgroundSize: "200% 100%",
                                    animation: "shimmer 3s linear infinite",
                                  }}
                                />
                              )}
                              <span className="relative">
                                {isSpinning || createSpin.isPending ? "SPINNING..." : "SPIN"}
                              </span>
                            </button>

                            {/* "Smart Pick" — heuristic pick, optional mood */}
                            <div className="flex flex-col items-center gap-2.5 w-full max-w-xs">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={handleSmartPick}
                                  disabled={isSpinning || aiPending || createSpin.isPending || wheelSegments.length === 0}
                                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold tracking-[0.08em] transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-0.5 hover:bg-white/8"
                                  style={{
                                    fontFamily: "var(--font-display)",
                                    background: "oklch(0.16 0.03 280 / 0.6)",
                                    border: "1px solid oklch(0.65 0.25 280 / 0.45)",
                                    color: "oklch(0.80 0.12 290)",
                                  }}
                                >
                                  <Sparkles size={14} />
                                  {aiPending ? "PICKING…" : "SMART PICK"}
                                </button>
                                <button
                                  onClick={() => setMoodOpen((v) => !v)}
                                  title="Set a mood"
                                  className="flex items-center gap-1 px-3 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 hover:bg-white/8"
                                  style={{
                                    fontFamily: "var(--font-display)",
                                    background: moodChips.length || moodText.trim() ? "oklch(0.65 0.25 280 / 0.18)" : "oklch(0.16 0.025 260)",
                                    border: "1px solid oklch(0.25 0.03 260)",
                                    color: "oklch(0.75 0.08 290)",
                                  }}
                                >
                                  Mood
                                  {(moodChips.length > 0 || moodText.trim().length > 0) && (
                                    <span className="ml-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.70 0.22 300)" }} />
                                  )}
                                  <ChevronDown size={12} className={`transition-transform ${moodOpen ? "rotate-180" : ""}`} />
                                </button>
                              </div>

                              {moodOpen && (
                                <div
                                  className="w-full flex flex-col gap-2.5 p-3 rounded-2xl tab-enter"
                                  style={{ background: "oklch(0.12 0.025 260 / 0.7)", border: "1px solid oklch(0.22 0.03 260)" }}
                                >
                                  <div className="flex flex-wrap gap-1.5 justify-center">
                                    {MOOD_CHIPS.map((m) => {
                                      const on = moodChips.includes(m);
                                      return (
                                        <button
                                          key={m}
                                          onClick={() => setMoodChips((prev) => (on ? prev.filter((x) => x !== m) : [...prev, m]))}
                                          className="px-3 py-1 rounded-full text-[11px] font-medium transition-all active:scale-95"
                                          style={{
                                            background: on ? "oklch(0.65 0.25 280 / 0.30)" : "oklch(0.16 0.025 260)",
                                            border: `1px solid ${on ? "oklch(0.65 0.25 280 / 0.6)" : "oklch(0.25 0.03 260)"}`,
                                            color: on ? "oklch(0.90 0.08 290)" : "oklch(0.65 0.02 260)",
                                          }}
                                        >
                                          {m}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <input
                                    value={moodText}
                                    onChange={(e) => setMoodText(e.target.value)}
                                    maxLength={200}
                                    placeholder="or describe a vibe — e.g. something light"
                                    className="w-full px-3 py-2 rounded-xl text-xs bg-transparent outline-none"
                                    style={{ border: "1px solid oklch(0.25 0.03 260)", color: "oklch(0.85 0.02 260)" }}
                                  />
                                  {(moodChips.length > 0 || moodText.trim().length > 0) && (
                                    <button
                                      onClick={() => { setMoodChips([]); setMoodText(""); }}
                                      className="text-[11px] self-end text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      Clear mood
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Status line */}
                            {wheelSegments.length === 0 ? (
                              <div
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs max-w-sm text-center"
                                style={{
                                  background: "oklch(0.60 0.22 25 / 0.10)",
                                  border: "1px solid oklch(0.60 0.22 25 / 0.30)",
                                  color: "oklch(0.80 0.15 40)",
                                }}
                              >
                                <AlertTriangle size={13} className="flex-shrink-0" />
                                <span>
                                  Nothing to spin — every restaurant is
                                  {selectedTagIds.length > 0 ? " filtered out or " : " "}
                                  excluded or vetoed.
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-semibold" style={{ color: "oklch(0.72 0.22 30)" }}>{filteredRestaurants.length}</span>
                                {" "}restaurant{filteredRestaurants.length !== 1 ? "s" : ""} on the wheel
                              </p>
                            )}
                          </>
                        )}

                        {/* Excluded restaurants */}
                        {restaurants && restaurants.some((r) => r.isExcluded) && (
                          <div
                            className="w-full rounded-xl px-4 py-3"
                            style={{
                              background: "oklch(0.11 0.02 260)",
                              border: "1px solid oklch(0.18 0.025 260)",
                            }}
                          >
                            <div
                              className="flex items-center gap-2 text-xs font-semibold tracking-widest mb-2"
                              style={{ fontFamily: "var(--font-display)", color: "oklch(0.60 0.15 40)" }}
                            >
                              <Clock size={11} /> SKIPPING (PICKED RECENTLY)
                            </div>
                            <ul className="flex flex-col gap-1.5">
                              {restaurants.filter((r) => r.isExcluded).map((r) => (
                                <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate text-muted-foreground">{r.name}</span>
                                  {r.excludedUntil && (
                                    <span
                                      className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px]"
                                      style={{
                                        background: "oklch(0.60 0.22 25 / 0.12)",
                                        color: "oklch(0.70 0.15 40)",
                                      }}
                                    >
                                      back in {formatExclusionTimeLeft(new Date(r.excludedUntil))}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ══ TAB 2: RESTAURANTS ══ */}
                {activeTab === "restaurants" && (
                  <RestaurantTab
                    wheelId={selectedWheelId}
                    isOwner={isOwner}
                    onRestaurantsChange={refetchRestaurants}
                  />
                )}

                {/* ══ TAB 3: HISTORY ══ */}
                {activeTab === "history" && (
                  <HistoryTab
                    wheelId={selectedWheelId}
                    onReenabled={refetchRestaurants}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RESULT OVERLAY ── */}
      {showResult && spinResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in"
          style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(12px)" }}
          onClick={() => setShowResult(false)}
        >
          <div
            className="animate-spin-result text-center p-8 rounded-3xl max-w-sm w-full relative overflow-hidden"
            style={{
              background: "oklch(0.11 0.025 260)",
              border: `2px solid ${spinResult.color}`,
              boxShadow: `0 0 80px ${spinResult.color}55, 0 0 160px ${spinResult.color}22, 0 32px 64px rgba(0,0,0,0.6)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background glow blob */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 50% 0%, ${spinResult.color}22 0%, transparent 70%)`,
              }}
            />
            <div className="relative">
              <div className="text-5xl mb-4 animate-float">🎉</div>
              <p
                className="text-xs mb-2 tracking-[0.2em]"
                style={{ fontFamily: "var(--font-display)", color: "oklch(0.55 0.02 260)" }}
              >
                TODAY'S LUNCH
              </p>
              <h2
                className="text-3xl font-black mb-8 leading-tight"
                style={{
                  fontFamily: "var(--font-display)",
                  color: spinResult.color,
                  textShadow: `0 0 30px ${spinResult.color}88, 0 0 60px ${spinResult.color}44`,
                }}
              >
                {spinResult.label}
              </h2>
              {aiReason && (
                <div
                  className="flex items-start gap-2 mb-6 -mt-3 px-4 py-2.5 rounded-xl text-xs text-left max-w-xs mx-auto"
                  style={{
                    background: "oklch(0.65 0.25 280 / 0.10)",
                    border: "1px solid oklch(0.65 0.25 280 / 0.30)",
                    color: "oklch(0.82 0.10 290)",
                  }}
                >
                  <Sparkles size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{aiReason}</span>
                </div>
              )}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => openDirections(spinResult.label)}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
                  style={{
                    background: spinResult.color + "20",
                    border: `1px solid ${spinResult.color}60`,
                    color: spinResult.color,
                    fontFamily: "var(--font-display)",
                    letterSpacing: "0.06em",
                  }}
                >
                  <MapPin size={14} /> DIRECTIONS
                </button>
                <div className="flex gap-2.5">
                  <button
                    onClick={handleReSpin}
                    disabled={wheelSegments.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 hover:bg-white/8"
                    style={{
                      background: "oklch(0.16 0.025 260)",
                      border: "1px solid oklch(0.25 0.03 260)",
                      color: "oklch(0.80 0.02 260)",
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <RotateCw size={12} /> RE-SPIN
                  </button>
                  <button
                    onClick={() => setShowResult(false)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 hover:brightness-110"
                    style={{
                      background: "oklch(0.70 0.18 150 / 0.15)",
                      border: "1px solid oklch(0.70 0.18 150 / 0.45)",
                      color: "oklch(0.80 0.16 155)",
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <Check size={12} /> ACCEPT
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
