import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import SpinWheel, { WheelSegment } from "@/components/SpinWheel";
import RestaurantTab from "@/components/RestaurantTab";
import FilterBar from "@/components/FilterBar";
import BrandLoader from "@/components/BrandLoader";
import HistoryTab from "@/components/HistoryTab";
import WheelSelector from "@/components/WheelSelector";
import WheelMembers from "@/components/WheelMembers";
import RoundPanel from "@/components/RoundPanel";
import { toast } from "sonner";
import { X, AlertTriangle, MapPin, RotateCw, Check, Clock, RefreshCw, Plus, Utensils, History, ChevronDown, LogOut, Star, Sun, Moon, Footprints, Settings } from "lucide-react";
import { filterRestaurantsByDistance, filterRestaurantsByTags } from "@shared/filter";
import { formatExclusionTimeLeft } from "@shared/exclusion";
import { applyDietary, EMPTY_SESSION, excludedDietaryTagIds, vetoedIds, type SessionState } from "@shared/session";
import { isFirstRun } from "@shared/onboarding";
import { segmentColor } from "@/lib/palette";
import { primaryTag } from "@shared/primaryTag";
import { formatWalk } from "@shared/nearby";
import { ErrorChip } from "@/components/StatusChip";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tab = "wheel" | "restaurants" | "history";

const TAB_CONFIG: { id: Tab; label: string; icon: typeof Utensils }[] = [
  { id: "wheel", label: "Wheel", icon: RotateCw },
  { id: "restaurants", label: "Restaurants", icon: Utensils },
  { id: "history", label: "History", icon: History },
];

export default function WheelApp() {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const params = useParams<{ wheelId?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("wheel");
  const [selectedWheelId, setSelectedWheelId] = useState<number | null>(
    params.wheelId ? parseInt(params.wheelId) : null
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [maxWalkMinutes, setMaxWalkMinutes] = useState<number | null>(null);
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

  // Keep the selected wheel in sync with the URL so browser back/forward (and
  // direct links) actually switch wheels — state alone only captures the first
  // render's params.
  useEffect(() => {
    const parsed = params.wheelId ? parseInt(params.wheelId) : NaN;
    const fromUrl = Number.isFinite(parsed) ? parsed : null;
    setSelectedWheelId((current) => (current === fromUrl ? current : fromUrl));
  }, [params.wheelId]);

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
  const { data: wheelData, error: wheelError } = trpc.wheels.get.useQuery(
    { id: selectedWheelId! },
    {
      enabled: !!selectedWheelId,
      retry: (count, err) =>
        err.data?.code !== "NOT_FOUND" && err.data?.code !== "FORBIDDEN" && count < 2,
      // Membership (.members) lives on this same query and previously never
      // refreshed after the initial load — someone joining a shared wheel via
      // an invite link wouldn't show up in the roster (or the owner's "Team"
      // panel) until a manual page reload. Poll like the other shared-wheel
      // realtime queries (session.state, spins.latest) once we know it's shared.
      refetchInterval: (query) => (query.state.data?.isShared ? 3000 : false),
    }
  );

  // A wheel that definitively can't be loaded (deleted, or a stale/bad link)
  // would strand the app on erroring queries — fall back to the wheel picker.
  // Transient/network errors are retried above and don't eject the user.
  useEffect(() => {
    const code = wheelError?.data?.code;
    if (code !== "NOT_FOUND" && code !== "FORBIDDEN") return;
    toast.error("That wheel isn't available anymore.");
    setSelectedWheelId(null);
    navigate("/app", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelError]);

  const createSpin = trpc.spins.create.useMutation();
  const isShared = !!wheelData?.isShared;

  // Wheel count drives the first-run experience. Same query key as WheelSelector's
  // list, so React Query dedupes it — no extra request.
  const { data: wheels, isLoading: wheelsLoading } = trpc.wheels.list.useQuery();
  const firstRun = !wheelsLoading && isFirstRun(wheels?.length ?? 0);

  // On arriving without a wheel in the URL, open the user's chosen default wheel
  // (set via the star toggle in WheelSelector) if they have one, else their first
  // wheel — so a returning user lands straight on it instead of re-picking every
  // visit. First-run users (zero wheels) still get the guided create card.
  useEffect(() => {
    if (params.wheelId || selectedWheelId) return;
    if (wheelsLoading || !wheels || wheels.length === 0) return;
    const preferred = wheels.find((w) => w.id === user?.defaultWheelId) ?? wheels[0]!;
    setSelectedWheelId(preferred.id);
    navigate(`/app/${preferred.id}`, { replace: true });
  }, [params.wheelId, selectedWheelId, wheels, wheelsLoading, user?.defaultWheelId, navigate]);

  // WheelSelector registers its create-dialog opener here so the first-run card
  // can launch it (sample vs blank). Ref keeps the callback identity stable.
  // Relies on WheelSelector rendering (and registering) before the first-run card
  // becomes interactive — it's an always-mounted sibling above the tab content, so
  // the ref is populated by the time a button can be clicked. Keep that ordering if
  // WheelSelector ever becomes conditionally rendered.
  const createOpenerRef = useRef<((withStarter: boolean) => void) | null>(null);
  const registerCreateOpener = useCallback(
    (open: (withStarter: boolean) => void) => {
      createOpenerRef.current = open;
    },
    [],
  );

  // Same imperative-opener pattern, for the Wheel tab's settings gear icon —
  // reuses WheelSelector's settings dialog/state instead of a second copy.
  const settingsOpenerRef = useRef<((wheelId: number) => void) | null>(null);
  const registerSettingsOpener = useCallback(
    (open: (wheelId: number) => void) => {
      settingsOpenerRef.current = open;
    },
    [],
  );

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
    () => filterRestaurantsByDistance(filterRestaurantsByTags(restaurants ?? [], selectedTagIds), maxWalkMinutes),
    [restaurants, selectedTagIds, maxWalkMinutes]
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
      color: segmentColor(primaryTag(r)?.color, i),
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
    if (!selectedWheelId || createSpin.isPending || isSpinning) return;
    setShowResult(false);
    setSpinResult(null);
    setSpinError(null);
    // Start the wheel spinning immediately for instant feedback; it free-spins
    // while the server picks the winner, then decelerates onto it. This hides
    // the server round-trip (serverless cold start) instead of dead-waiting.
    setTargetId(null);
    setIsSpinning(true);
    try {
      const { restaurantId } = await createSpin.mutateAsync({
        wheelId: selectedWheelId,
        candidateIds: wheelSegments.map((s) => s.id),
      });
      setTargetId(restaurantId);
    } catch (e) {
      setIsSpinning(false);
      setTargetId(null);
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

  // Result overlay is a hand-rolled dialog (not a Radix primitive), so wire up
  // Escape-to-close ourselves to keep it keyboard-dismissable.
  useEffect(() => {
    if (!showResult) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowResult(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showResult]);

  // Only offer tags that at least one restaurant on the wheel actually carries —
  // the predefined catalog is large (15 cuisines + 16 food types), so showing
  // every one turns the filter into a wall of mostly-useless chips.
  const usedTagIds = useMemo(
    () => new Set((restaurants ?? []).flatMap((r) => r.tags.map((t) => t.id))),
    [restaurants],
  );
  const cuisineTags = (tags ?? []).filter((t) => t.category === "cuisine" && usedTagIds.has(t.id));
  const foodTypeTags = (tags ?? []).filter((t) => t.category === "food_type" && usedTagIds.has(t.id));
  const customTags = (tags ?? []).filter((t) => t.category === "custom" && usedTagIds.has(t.id));

  if (loading) {
    return <BrandLoader fullscreen />;
  }

  if (!user) return null;

  const isOwner = wheelData?.ownerId === user.id;
  const defaultWheel = wheels?.find((w) => w.id === user.defaultWheelId);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* ── HEADER ── */}
      <header
        className="border-b border-border/40 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30"
        style={{ background: "oklch(from var(--background) l c h / 0.85)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 orb-wheel flex-shrink-0 animate-orb-spin"
            style={{
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Account menu"
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-transform active:scale-90 hover:brightness-110"
                style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", color: "white" }}
              >
                {user.name?.charAt(0).toUpperCase() ?? "?"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass border-border/50 w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold truncate">{user.name || "-"}</span>
                <span className="text-xs text-muted-foreground font-normal truncate">{user.email || "-"}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {defaultWheel ? (
                <DropdownMenuItem onClick={() => { setSelectedWheelId(defaultWheel.id); navigate(`/app/${defaultWheel.id}`); }} className="gap-2.5">
                  <Star size={14} fill="var(--brand)" style={{ color: "var(--brand)" }} />
                  <span className="flex flex-col">
                    <span>Default wheel</span>
                    <span className="text-xs text-muted-foreground truncate max-w-40">{defaultWheel.name}</span>
                  </span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="gap-2.5">
                  <Star size={14} />
                  <span className="text-xs">No default wheel — star one in the sidebar</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggleTheme} className="gap-2.5">
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout().then(() => navigate("/"))}
                variant="destructive"
                className="gap-2.5"
              >
                <LogOut size={14} /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* ── WHEEL SWITCHER (desktop rail · mobile pill+sheet) ── */}
        <WheelSelector
          selectedWheelId={selectedWheelId}
          onSelect={(id: number) => { setSelectedWheelId(id); navigate(`/app/${id}`); }}
          registerCreateOpener={registerCreateOpener}
          registerSettingsOpener={registerSettingsOpener}
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

          {/* ── TAB CONTENT ── (pb clears the fixed mobile nav) */}
          <div className="flex-1 overflow-y-auto pb-28 md:pb-0">
            {!selectedWheelId ? (
              wheelsLoading ? (
                /* Hold a neutral state until we know if this is a first run —
                   avoids flashing "no wheel selected" at a brand-new user. */
                <div className="flex items-center justify-center h-full p-8">
                  <BrandLoader label="" size={64} />
                </div>
              ) : firstRun ? (
                /* First-run — the user has no wheels yet. Guide them in (decision 2b). */
                <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center max-w-md mx-auto">
                  <div
                    className="w-20 h-20 orb-wheel animate-orb-spin"
                    style={{ boxShadow: "0 0 40px oklch(from var(--brand) l c h / 0.4)" }}
                  />
                  <div>
                    <p className="text-2xl font-black mb-2" style={{ fontFamily: "var(--font-display)" }}>
                      Make your first wheel
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Start from a sample to spin right away, or build your own from scratch.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2.5 w-full max-w-xs">
                    <button
                      onClick={() => createOpenerRef.current?.(true)}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all active:scale-95 hover:-translate-y-0.5"
                      style={{
                        fontFamily: "var(--font-display)",
                        background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                        boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4)",
                        color: "white",
                      }}
                    >
                      <Utensils size={15} /> Start from a sample
                    </button>
                    <button
                      onClick={() => createOpenerRef.current?.(false)}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all active:scale-95 hover:bg-white/5"
                      style={{
                        fontFamily: "var(--font-display)",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        color: "var(--foreground)",
                      }}
                    >
                      <Plus size={15} /> Create a blank wheel
                    </button>
                  </div>
                </div>
              ) : (
                /* Empty state — has wheels, none selected */
                <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
                  <div className="w-20 h-20 orb-wheel opacity-20" />
                  <div>
                    <p className="font-semibold text-foreground/60 mb-1" style={{ fontFamily: "var(--font-display)" }}>
                      NO WHEEL SELECTED
                    </p>
                    <p className="text-sm text-muted-foreground">Pick a wheel from the menu or create a new one</p>
                  </div>
                </div>
              )
            ) : (
              <div key={activeTab} className="tab-enter">

                {/* ══ TAB 1: WHEEL ══ */}
                {activeTab === "wheel" && (
                  <div className="flex flex-col items-center gap-4 px-4 py-4 pb-8 max-w-2xl mx-auto">

                    {/* Settings shortcut — same dialog as the sidebar's kebab menu
                        (registerSettingsOpener), just faster once you're already
                        on the wheel. Owner-only, same gate as that menu item.
                        Desktop only: on mobile this would sit in its own empty
                        row above Team/Round, so the gear lives in the
                        wheel-picker pill row instead (WheelSelector.tsx). */}
                    {isOwner && selectedWheelId && (
                      <div className="hidden md:flex w-full justify-end -mb-2">
                        <button
                          onClick={() => settingsOpenerRef.current?.(selectedWheelId)}
                          aria-label="Wheel settings"
                          title="Wheel settings"
                          className="flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors active:scale-90"
                        >
                          <Settings size={16} />
                        </button>
                      </div>
                    )}

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

                    {/* ── FILTER BAR (compact, collapsible) — tags + distance ── */}
                    <FilterBar
                      open={showFilters}
                      onOpenChange={setShowFilters}
                      tagGroups={[
                        { label: "CUISINE", items: cuisineTags },
                        { label: "FOOD TYPE", items: foodTypeTags },
                        { label: "CUSTOM", items: customTags },
                      ]}
                      selectedTagIds={selectedTagIds}
                      onToggleTag={toggleTag}
                      distanceEnabled={!!wheelData?.distanceEnabled}
                      maxWalkMinutes={maxWalkMinutes}
                      onChangeMaxWalkMinutes={setMaxWalkMinutes}
                      matchCount={filteredRestaurants.length}
                      totalCount={restaurants?.length ?? 0}
                      emptyMessage="No restaurants match your filters. Try removing some."
                    />

                    {/* ── WHEEL + SPIN CTA ── */}
                    {restaurantsLoading ? (
                      /* A spinning brand orb sits where the wheel will land, so the
                         wait reads as "the wheel is coming" rather than a gray blob;
                         the pill below stands in for the SPIN button. */
                      <div className="flex flex-col items-center gap-6 py-8 w-full">
                        <div
                          className="orb-wheel animate-orb-spin"
                          style={{ width: "min(72vw, 18rem)", height: "min(72vw, 18rem)", animationDuration: "1.4s", boxShadow: "0 0 40px oklch(from var(--brand) l c h / 0.35)" }}
                        />
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
                    distanceEnabled={wheelData?.distanceEnabled}
                    originLabel={wheelData?.originLabel}
                  />
                )}

                {/* ══ TAB 3: HISTORY ══ */}
                {activeTab === "history" && (
                  <HistoryTab
                    wheelId={selectedWheelId}
                    onReenabled={refetchRestaurants}
                    isShared={isShared}
                    exclusionDays={wheelData?.exclusionDays}
                    currentUserId={user.id}
                    onGoToWheel={() => setActiveTab("wheel")}
                  />
                )}
              </div>
            )}
          </div>

          {/* ── MOBILE BOTTOM TAB BAR — docked Liquid Glass capsule, fixed to the
                viewport so it's reachable at any scroll position ── */}
          <nav
            className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex justify-center px-3 pt-3"
            style={{
              paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))",
              background: "linear-gradient(to top, var(--background) 55%, transparent)",
            }}
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
            role="dialog"
            aria-modal="true"
            aria-label={`Spin result: ${spinResult.label}`}
            className="animate-spin-result text-center p-8 rounded-3xl max-w-sm w-full relative overflow-hidden"
            style={{
              background: "var(--card)",
              border: `2px solid ${spinResult.color}`,
              boxShadow: `0 0 80px ${spinResult.color}55, 0 0 160px ${spinResult.color}22, 0 32px 64px rgba(0,0,0,0.6)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background glow blob — kept faint: heavy per-glyph shadows on the
                title used to stack into a muddy smear behind the winner name. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 50% 0%, ${spinResult.color}14 0%, transparent 65%)`,
              }}
            />
            <div className="relative">
              <div className="text-5xl mb-4 animate-float">🎉</div>
              <p
                className="text-xs mb-2 tracking-[0.2em] flex items-center justify-center gap-2"
                style={{ fontFamily: "var(--font-display)", color: "var(--muted-foreground)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: spinResult.color }} />
                TODAY'S LUNCH
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: spinResult.color }} />
              </p>
              {/* No text glow: cool-hued halos turn to mud on the warm card —
                  the segment color already speaks through border, dots, buttons. */}
              <h2
                className="text-3xl font-black leading-tight"
                style={{ fontFamily: "var(--font-display)", color: spinResult.color }}
              >
                {spinResult.label}
              </h2>
              <div className="mb-8">
                {wheelData?.distanceEnabled && (() => {
                  const walkSeconds = restaurants?.find((r) => r.id === spinResult.id)?.walkSeconds;
                  if (walkSeconds == null) return null;
                  return (
                    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-2">
                      <Footprints size={12} className="flex-shrink-0" />
                      {formatWalk(walkSeconds / 60)} from {wheelData.originLabel || "Office"}
                    </p>
                  );
                })()}
              </div>
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
                    autoFocus
                    onClick={() => setShowResult(false)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 hover:brightness-110"
                    style={{
                      background: "oklch(from var(--ok) l c h / 0.15)",
                      border: "1px solid oklch(from var(--ok) l c h / 0.45)",
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
