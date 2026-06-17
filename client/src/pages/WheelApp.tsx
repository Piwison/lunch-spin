import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import SpinWheel, { WheelSegment } from "@/components/SpinWheel";
import ThemeToggle from "@/components/ThemeToggle";
import RestaurantTab from "@/components/RestaurantTab";
import HistoryTab from "@/components/HistoryTab";
import WheelSelector from "@/components/WheelSelector";
import WheelMembers from "@/components/WheelMembers";
import RoundPanel from "@/components/RoundPanel";
import { toast } from "sonner";
import { X, AlertTriangle, MapPin, RotateCw, Check, Clock, RefreshCw, Plus, SlidersHorizontal, Utensils, History, ChevronDown, LogOut } from "lucide-react";
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
  const [showExcluded, setShowExcluded] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<WheelSegment | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [presentUserIds, setPresentUserIds] = useState<number[]>([]);
  const [sharedText, setSharedText] = useState<string | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);

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
  const isShared = !!wheelData?.isShared;

  // ── Shared-wheel realtime via polling (serverless-friendly) ───────────────
  // Presence: heartbeat + roster ~10s, paused when the tab is hidden.
  const presencePing = trpc.presence.ping.useMutation();
  useEffect(() => {
    if (!selectedWheelId || !isShared) {
      setPresentUserIds([]);
      return;
    }
    let active = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const list = await presencePing.mutateAsync({ wheelId: selectedWheelId });
        if (active) setPresentUserIds(list.map((u) => u.userId));
      } catch {
        if (active) setPresentUserIds([]);
      }
    };
    tick();
    const iv = setInterval(tick, 10_000);
    return () => {
      active = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWheelId, isShared]);

  // Round state (veto/vote/dietary): poll ~3s; derive session straight from it.
  const sessionStateQuery = trpc.session.state.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId && isShared, refetchInterval: 3000 }
  );
  const session: SessionState = sessionStateQuery.data ?? EMPTY_SESSION;

  // Latest spin: poll ~3s and surface a teammate's spin (skip our own).
  const lastSpinIdRef = useRef<number | null>(null);
  useEffect(() => {
    lastSpinIdRef.current = null;
  }, [selectedWheelId]);
  const latestSpinQuery = trpc.spins.latest.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId && isShared, refetchInterval: 3000 }
  );
  useEffect(() => {
    const latest = latestSpinQuery.data;
    if (!latest) return;
    if (lastSpinIdRef.current === null) {
      lastSpinIdRef.current = latest.id; // baseline on first load — don't toast history
      return;
    }
    if (latest.id !== lastSpinIdRef.current) {
      lastSpinIdRef.current = latest.id;
      if (user && latest.spunBy !== user.id) {
        toast(`${latest.spunByName ?? "A teammate"} spun ${latest.restaurantName}`, { icon: "🎡" });
        refetchRestaurants();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestSpinQuery.data, user]);

  // Refetch the round state right after my own action so it reflects instantly
  // (instead of waiting for the next ~3s poll).
  const utils = trpc.useUtils();
  const refreshSession = () => {
    if (selectedWheelId) utils.session.state.invalidate({ wheelId: selectedWheelId });
  };
  const vetoMutation = trpc.session.veto.useMutation({ onSuccess: refreshSession });
  const voteMutation = trpc.session.vote.useMutation({ onSuccess: refreshSession });
  const dietaryMutation = trpc.session.dietary.useMutation({ onSuccess: refreshSession });
  const clearRound = trpc.session.clear.useMutation({ onSuccess: refreshSession });

  const addShared = trpc.restaurants.addBulk.useMutation({
    onSuccess: (res) => {
      setSharedText(null);
      refetchRestaurants();
      toast.success(`Added ${res.added} restaurant${res.added !== 1 ? "s" : ""} to the wheel`);
    },
    onError: (e) => toast.error(e.message),
  });

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

  const handleReSpin = () => {
    setShowResult(false);
    setSpinResult(null);
    requestAnimationFrame(() => handleSpin());
  };

  const openDirections = (segment: WheelSegment) => {
    // Prefer the restaurant's saved Google Maps link; fall back to a name search.
    const saved = restaurants?.find((r) => r.id === segment.id)?.mapUrl?.trim();
    const url = saved || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(segment.label)}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full animate-orb-spin"
            style={{
              background: "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))",
              boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4)",
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
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* ── HEADER ── */}
      <header
        className="border-b border-border/40 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30"
        style={{ background: "oklch(from var(--background) l c h / 0.85)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-full flex-shrink-0 animate-orb-spin"
            style={{
              background: "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))",
              boxShadow: "0 0 12px oklch(from var(--brand) l c h / 0.5)",
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
          <ThemeToggle />
          {user.name && (
            <span
              className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 rounded-full"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
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

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* ── WHEEL SWITCHER (desktop rail · mobile pill+sheet) ── */}
        <WheelSelector
          selectedWheelId={selectedWheelId}
          onSelect={(id: number) => { setSelectedWheelId(id); navigate(`/app/${id}`); }}
        />

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── VIEW TABS (desktop) — floating glass segmented control ── */}
          <div className="hidden md:flex px-4 py-2.5 flex-shrink-0">
            <div className="inline-flex items-center gap-1 p-1 rounded-full glass-nav">
              {TAB_CONFIG.map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className="relative flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95"
                    style={{
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.08em",
                      color: isActive ? "white" : "var(--muted-foreground)",
                      background: isActive
                        ? "linear-gradient(135deg, var(--brand), var(--brand-2))"
                        : "transparent",
                      boxShadow: isActive ? "0 0 16px oklch(from var(--brand) l c h / 0.45)" : "none",
                    }}
                  >
                    <Icon size={13} />
                    {label.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── SHARED TEXT BANNER ── */}
          {sharedText && (
            <div
              className="px-4 py-2.5 flex items-center gap-3 border-b flex-shrink-0"
              style={{ background: "oklch(from var(--brand-2) l c h / 0.10)", borderColor: "oklch(from var(--brand-2) l c h / 0.25)" }}
            >
              <MapPin size={14} className="flex-shrink-0" style={{ color: "var(--brand-2)" }} />
              <span className="text-sm flex-1 min-w-0 truncate">
                Add <strong>{sharedText}</strong>{selectedWheelId ? "" : " — pick a wheel first"}
              </span>
              <button
                onClick={() => selectedWheelId && addShared.mutate({ wheelId: selectedWheelId, text: sharedText })}
                disabled={!selectedWheelId || addShared.isPending}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
                style={{ background: "var(--brand)", color: "white", fontFamily: "var(--font-display)" }}
              >
                {addShared.isPending ? "Adding…" : "Add"}
              </button>
              <button onClick={() => setSharedText(null)} className="p-1 rounded text-muted-foreground hover:text-foreground flex-shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          {/* ── TAB CONTENT ── */}
          <div className="flex-1 overflow-y-auto">
            {!selectedWheelId ? (
              /* Empty state — no wheel selected */
              <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
                <div
                  className="w-20 h-20 rounded-full opacity-20"
                  style={{ background: "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))" }}
                />
                <div>
                  <p className="font-semibold text-foreground/60 mb-1" style={{ fontFamily: "var(--font-display)" }}>
                    NO WHEEL SELECTED
                  </p>
                  <p className="text-sm text-muted-foreground">Pick a wheel from the menu or create a new one</p>
                </div>
              </div>
            ) : (
              <div key={activeTab} className="tab-enter">

                {/* ══ TAB 1: WHEEL ══ */}
                {activeTab === "wheel" && (
                  <div className="flex flex-col items-center gap-4 px-4 py-4 pb-8 max-w-2xl mx-auto">

                    {/* Team roster */}
                    {isShared && wheelData && (
                      <div className="w-full">
                        <WheelMembers
                          ownerId={wheelData.ownerId}
                          owner={wheelData.owner}
                          members={wheelData.members}
                          currentUserId={user.id}
                          presentUserIds={presentUserIds}
                          collapsible
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
                          collapsible
                        />
                      </div>
                    )}

                    {/* ── FILTER BAR (compact, collapsible) ── */}
                    {(restaurants?.length ?? 0) > 0 && (
                      <div
                        className="w-full rounded-xl overflow-hidden transition-all duration-300"
                        style={{
                          background: "oklch(from var(--card) l c h / 0.6)",
                          border: `1px solid ${selectedTagIds.length > 0 ? "oklch(from var(--brand-2) l c h / 0.4)" : "var(--border)"}`,
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
                              style={{ color: selectedTagIds.length > 0 ? "var(--brand)" : "var(--muted-foreground)" }}
                            />
                            <span
                              className="text-xs font-semibold tracking-widest"
                              style={{
                                fontFamily: "var(--font-display)",
                                color: selectedTagIds.length > 0 ? "var(--foreground)" : "var(--muted-foreground)",
                              }}
                            >
                              FILTER BY TAGS
                            </span>
                            {selectedTagIds.length > 0 && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                  background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
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
                              background: "oklch(from var(--destructive) l c h / 0.12)",
                              border: "1px solid oklch(from var(--destructive) l c h / 0.35)",
                              color: "var(--brand)",
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
                            background: "var(--muted)",
                            border: "1px solid var(--border)",
                            color: "var(--foreground)",
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
                                background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                                boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4), 0 8px 24px rgba(0,0,0,0.4)",
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
                                  ? "var(--muted)"
                                  : "linear-gradient(135deg, var(--brand), var(--brand-2))",
                                boxShadow: isSpinning || createSpin.isPending || wheelSegments.length === 0
                                  ? "none"
                                  : "0 0 40px oklch(from var(--brand) l c h / 0.5), 0 0 80px oklch(from var(--brand-2) l c h / 0.2), 0 8px 32px rgba(0,0,0,0.5)",
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

                            {/* Status line */}
                            {wheelSegments.length === 0 ? (
                              <div
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs max-w-sm text-center"
                                style={{
                                  background: "oklch(from var(--destructive) l c h / 0.10)",
                                  border: "1px solid oklch(from var(--destructive) l c h / 0.30)",
                                  color: "var(--brand)",
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
                                <span className="font-semibold" style={{ color: "var(--brand)" }}>{filteredRestaurants.length}</span>
                                {" "}restaurant{filteredRestaurants.length !== 1 ? "s" : ""} on the wheel
                              </p>
                            )}
                          </>
                        )}

                        {/* Excluded restaurants — collapsed by default to keep the wheel the focus */}
                        {restaurants && restaurants.some((r) => r.isExcluded) && (
                          <div
                            className="w-full rounded-xl overflow-hidden"
                            style={{
                              background: "var(--card)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <button
                              onClick={() => setShowExcluded((s) => !s)}
                              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-white/3"
                            >
                              <div
                                className="flex items-center gap-2 text-xs font-semibold tracking-widest"
                                style={{ fontFamily: "var(--font-display)", color: "var(--brand)" }}
                              >
                                <Clock size={11} /> SKIPPING (PICKED RECENTLY)
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px]"
                                  style={{ background: "oklch(from var(--destructive) l c h / 0.12)", color: "var(--brand)" }}
                                >
                                  {restaurants.filter((r) => r.isExcluded).length}
                                </span>
                              </div>
                              <ChevronDown
                                size={14}
                                className="text-muted-foreground transition-transform duration-200"
                                style={{ transform: showExcluded ? "rotate(180deg)" : "none" }}
                              />
                            </button>
                            {showExcluded && (
                              <ul className="flex flex-col gap-1.5 px-4 pb-3 border-t border-border/30 pt-2.5">
                                {restaurants.filter((r) => r.isExcluded).map((r) => (
                                  <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="truncate text-muted-foreground">{r.name}</span>
                                    {r.excludedUntil && (
                                      <span
                                        className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px]"
                                        style={{
                                          background: "oklch(from var(--destructive) l c h / 0.12)",
                                          color: "var(--brand)",
                                        }}
                                      >
                                        back in {formatExclusionTimeLeft(new Date(r.excludedUntil))}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
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

          {/* ── MOBILE BOTTOM TAB BAR — docked Liquid Glass capsule ── */}
          <nav
            className="md:hidden flex-shrink-0 flex justify-center px-3 pt-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
            aria-label="Views"
          >
            <div className="w-full max-w-md flex items-center gap-1 p-1.5 rounded-[1.75rem] glass-nav">
              {TAB_CONFIG.map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    aria-current={isActive ? "page" : undefined}
                    className="flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-[1.4rem] text-[11px] font-semibold transition-all duration-200 active:scale-95"
                    style={{
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.04em",
                      color: isActive ? "white" : "var(--muted-foreground)",
                      background: isActive
                        ? "linear-gradient(135deg, var(--brand), var(--brand-2))"
                        : "transparent",
                      boxShadow: isActive ? "0 0 16px oklch(from var(--brand) l c h / 0.45)" : "none",
                    }}
                  >
                    <Icon size={20} />
                    {label.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </nav>
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
              background: "var(--card)",
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
                style={{ fontFamily: "var(--font-display)", color: "var(--muted-foreground)" }}
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
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => openDirections(spinResult)}
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
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
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
                      color: "var(--ok)",
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
