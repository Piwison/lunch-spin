import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { cachedUserId, clearBootCache, readBootCache, saveBootCache } from "@/lib/bootCache";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import SpinWheel, { WheelSegment } from "@/components/SpinWheel";
import WinnerSurface from "@/components/WinnerSurface";
import { labelTier } from "@shared/wheelGeometry";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import RestaurantTab from "@/components/RestaurantTab";
import FilterBar from "@/components/FilterBar";
import BrandLoader from "@/components/BrandLoader";
import HistoryTab from "@/components/HistoryTab";
import OnboardingFlow from "@/components/OnboardingFlow";
import { StarRating } from "@/components/StarRating";
import WheelSelector from "@/components/WheelSelector";
import WheelMembers from "@/components/WheelMembers";
import { TabRail } from "@/components/TabRail";
import RoundPanel from "@/components/RoundPanel";
import { toast } from "sonner";
import { X, AlertTriangle, MapPin, RotateCw, Clock, Clock3, RefreshCw, Plus, Utensils, History, ChevronDown, LogOut, Star, Sun, Moon, Footprints, Settings, Bell, Trash2 } from "lucide-react";
import { filterRestaurantsByDistance, filterRestaurantsByTags } from "@shared/filter";
import { formatExclusionTimeLeft } from "@shared/exclusion";
import { applyDietary, EMPTY_SESSION, excludedDietaryTagIds, vetoedIds, type SessionState } from "@shared/session";
import { isFirstRun } from "@shared/onboarding";
import { nextWheelToOpen } from "@shared/bootstrap";
import { segmentColor } from "@/lib/palette";
import { primaryTag } from "@shared/primaryTag";
import { formatWalk } from "@shared/nearby";
import { ErrorChip } from "@/components/StatusChip";
import ConfirmDangerDialog from "@/components/ConfirmDangerDialog";
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

/** How many spins this browser has completed — drives the one-time exclusion tip. */
const SPINS_SEEN_KEY = "lw:spinsSeen";
/** Show the exclusion explainer on this many spins, then retire it. */
const EXPLAINER_SPINS = 2;

// Compact relative time for notification rows ("just now", "3m ago", "2d ago").
function formatTimeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TAB_CONFIG: { id: Tab; label: string; icon: typeof Utensils }[] = [
  { id: "wheel", label: "Wheel", icon: RotateCw },
  { id: "restaurants", label: "Restaurants", icon: Utensils },
  { id: "history", label: "History", icon: History },
];

/** The one-hop entry payload (server: wheels.bootstrap). */
type BootstrapPayload = RouterOutputs["wheels"]["bootstrap"];

/**
 * Fan a bootstrap payload out into the individual query caches every consumer
 * already reads (WheelSelector, RestaurantTab, HistoryTab), so they render warm
 * instead of re-fetching. Shared by the fresh response and the persisted cache so
 * the two paths can never seed different things.
 */
function seedFromBootstrap(utils: ReturnType<typeof trpc.useUtils>, data: BootstrapPayload) {
  // The user goes in FIRST, and it is the one that makes the persisted-cache
  // path actually fast. Everything below only warms data queries, but the
  // render gate waits on `useAuth().loading` — i.e. on auth.me — so seeding
  // every wheel query and not this one left a returning user staring at
  // "Warming up your wheel" for a full round trip anyway, cache or no cache.
  utils.auth.me.setData(undefined, data.user);
  utils.wheels.list.setData(undefined, data.wheels);
  if (data.wheel && data.wheelId != null) {
    utils.wheels.get.setData({ id: data.wheelId }, data.wheel);
    utils.restaurants.list.setData({ wheelId: data.wheelId }, data.restaurants);
    utils.tags.list.setData({ wheelId: data.wheelId }, data.tags);
    utils.restaurants.ratings.setData({ wheelId: data.wheelId }, data.ratings);
  }
}

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
  const prefersReducedMotion = useReducedMotion();
  const [spinId, setSpinId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [presentUserIds, setPresentUserIds] = useState<number[]>([]);
  const [sharedText, setSharedText] = useState<string | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  // Spins completed in this browser, read once. The exclusion explainer is for
  // people who have never seen it; after a couple of spins it's noise.
  const [spinsSeen, setSpinsSeen] = useState(() => {
    try {
      return Number(localStorage.getItem(SPINS_SEEN_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const isEarlySpin = spinsSeen <= EXPLAINER_SPINS;

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

  // ── One-hop entry load ────────────────────────────────────────────────────
  // Entering the app used to cost three serial round trips (auth.me →
  // wheels.list → the selected wheel's data), because deciding *which* wheel to
  // open required wheels.list first. wheels.bootstrap resolves that server-side
  // (it knows defaultWheelId) and returns the wheel list, the wheel, its
  // restaurants, tags and ratings together. We then seed each per-query cache so
  // every existing consumer reads warm data, and gate those queries until the
  // seeding has happened so they don't duplicate the same fetch.
  // Frozen to the wheel in the URL on first render: bootstrap serves *entry* only.
  // If its input tracked the URL, switching wheels would change the query key —
  // re-triggering the entry loader and racing the per-wheel queries that already
  // handle switching perfectly well.
  const [initialWheelId] = useState(() => {
    const parsed = params.wheelId ? parseInt(params.wheelId) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });

  // Issued immediately — NOT gated on auth resolving. bootstrap is a public
  // procedure that returns `user` itself, so this fires in the same tick as
  // useAuth's auth.me and httpBatchLink coalesces both into ONE request. Waiting
  // for auth first is what made a reload two serial serverless round trips.
  // Declared here (not further down) because the cache seeding below runs inside
  // a useState initializer, i.e. during the first render.
  const utils = trpc.useUtils();

  const bootstrapQuery = trpc.wheels.bootstrap.useQuery(
    { wheelId: initialWheelId },
    { staleTime: 30_000 },
  );

  // Seed the query caches from the persisted payload *during the first render*,
  // before paint — a reload then shows the real app immediately instead of a
  // spinner, while the request above revalidates in the background. useState's
  // initializer is the synchronous hook that runs early enough to do this.
  const [seeded, setSeeded] = useState(() => {
    // Two sources, checked in freshness order. The query cache wins: Home issues
    // this exact query on "/" (same key), so arriving via the landing-page
    // redirect brings the real payload with us — seeding from it here, during
    // the first render, is what stops the app flashing an empty state for a
    // frame before the effect below runs. Otherwise fall back to the payload
    // persisted from last session.
    const fresh = utils.wheels.bootstrap.getData({ wheelId: initialWheelId });
    const payload = fresh?.user ? fresh : readBootCache<BootstrapPayload>();
    if (!payload?.user) return false;
    seedFromBootstrap(utils, payload);
    return true;
  });

  useEffect(() => {
    const data = bootstrapQuery.data;
    if (!data) return;
    // An anonymous visitor gets user: null — seed nothing, drop any stale cache
    // (the effect above sends them to the landing page).
    if (!data.user) {
      clearBootCache();
      setSeeded(true);
      return;
    }
    // The persisted payload we seeded from may have belonged to a DIFFERENT
    // account (sign in as someone else on the same browser without signing out
    // first). Seeding auth.me from it means the app briefly renders as that
    // other user — wrong identity, and ownership checks like the settings gear
    // fail. The fresh payload is authoritative, so drop the stale copy the
    // moment the ids disagree; seedFromBootstrap below then overwrites every
    // seeded query with this user's real data.
    if (cachedUserId() !== data.user.id) clearBootCache();
    seedFromBootstrap(utils, data);
    saveBootCache(data);
    setSeeded(true);
    // utils is a stable tRPC helper; seeding must run once per bootstrap payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapQuery.data]);

  // A bootstrap failure must not strand the app: fall through to the individual
  // queries (the pre-bootstrap behaviour) instead of waiting forever.
  useEffect(() => {
    if (bootstrapQuery.isError) setSeeded(true);
  }, [bootstrapQuery.isError]);

  // The History tab's data isn't part of bootstrap (it's only needed once you go
  // there), which made the first visit to that tab pay a full cold round trip.
  // Warm it in the background as soon as we know the wheel, so switching tabs is
  // instant. Fire-and-forget: failures just mean the tab loads normally.
  useEffect(() => {
    if (!seeded || !user || !selectedWheelId) return;
    void utils.spins.history.prefetch({ wheelId: selectedWheelId });
    void utils.stats.getRestaurantStats.prefetch({ wheelId: selectedWheelId });
    void utils.stats.tasteProfile.prefetch({ wheelId: selectedWheelId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, user, selectedWheelId]);

  const { data: tags } = trpc.tags.list.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId && seeded && !!user }
  );
  const {
    data: restaurants,
    isLoading: restaurantsLoading,
    error: restaurantsError,
    refetch: refetchRestaurants,
  } = trpc.restaurants.list.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId && seeded && !!user }
  );
  const { data: wheelData, error: wheelError } = trpc.wheels.get.useQuery(
    { id: selectedWheelId! },
    {
      enabled: !!selectedWheelId && seeded && !!user,
      retry: (count, err) =>
        err.data?.code !== "NOT_FOUND" && err.data?.code !== "FORBIDDEN" && count < 2,
      // Loaded once for the wheel's config + owner. The live member roster (which
      // changes when someone joins) now rides on the consolidated wheels.realtime
      // poll below, so this query no longer polls every 3s.
    }
  );

  /** Wheels this session has proven are gone — deleted, or access revoked. Both
   *  the eject effect below and the auto-open effect further down read it, so
   *  they can't hold opposite opinions about the same wheel (see
   *  `nextWheelToOpen`). A ref, not state: it only ever gates an effect that a
   *  setState in the same tick already re-runs. */
  const unavailableWheelIds = useRef<Set<number>>(new Set());

  // A wheel that definitively can't be loaded (deleted, or a stale/bad link)
  // would strand the app on erroring queries — fall back to the wheel picker.
  // Transient/network errors are retried above and don't eject the user.
  useEffect(() => {
    const code = wheelError?.data?.code;
    if (code !== "NOT_FOUND" && code !== "FORBIDDEN") return;
    // Record it BEFORE dropping the selection: the entry payload still names
    // this wheel, and without this the auto-open effect hands it straight back.
    if (selectedWheelId != null) unavailableWheelIds.current.add(selectedWheelId);
    toast.error("That wheel isn't available anymore.");
    setSelectedWheelId(null);
    navigate("/app", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelError]);

  // Erasing the account invalidates this browser's session too — the server
  // clears the cookie in the same response — so wipe every local trace before
  // leaving. A hard navigation, not navigate(): the in-memory React Query caches
  // still hold the deleted user's wheels, and the persisted boot cache would
  // otherwise seed them straight back on the landing page.
  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: () => {
      clearBootCache();
      utils.auth.me.setData(undefined, null);
      setConfirmDeleteAccount(false);
      window.location.href = "/";
    },
    onError: (e) => toast.error(`Couldn't delete your account: ${e.message}`),
  });

  const createSpin = trpc.spins.create.useMutation();
  const acceptSpin = trpc.spins.accept.useMutation({
    onSuccess: () => {
      // Accepting flips this spin to the full-window exclusion tier, so the wheel
      // and history both need to refetch to drop the now-eaten restaurant.
      refetchRestaurants();
      utils.spins.history.invalidate();
    },
  });
  const isShared = !!wheelData?.isShared;

  // ── Notifications (team accepts, aggregated across all shared wheels) ──────
  // Polled for the header bell's red dot + panel. Opening the panel marks read.
  const notificationsQuery = trpc.notifications.list.useQuery(undefined, {
    // Deliberately NOT part of the entry batch. httpBatchLink coalesces whatever
    // is issued in the same tick, so firing this alongside bootstrap made the
    // entry response wait on the bell's queries too — and nothing on the first
    // screen depends on it. Gating on `seeded` lets the wheel paint first and the
    // bell fill in a moment later.
    enabled: seeded && !!user,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const notifications = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);
  const unreadCount = notifications.filter((n) => n.unread).length;
  const markNotificationsRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => notificationsQuery.refetch(),
  });

  // Open a notification's restaurant in Google Maps — mirrors the result modal's
  // DIRECTIONS: saved mapUrl if present, else a name search.
  const openNotificationMap = (n: { mapUrl: string | null; restaurantName: string }) => {
    const url = n.mapUrl?.trim() || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.restaurantName)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // On app entry, surface the single newest unread notification as a toast —
  // once per mount, and never re-toast the same one across reloads (localStorage
  // high-water mark). While the app stays open, new accepts only light the red
  // dot; they don't interrupt with a toast.
  const toastedNotifRef = useRef(false);
  useEffect(() => {
    if (toastedNotifRef.current || notifications.length === 0) return;
    toastedNotifRef.current = true;
    const latest = notifications[0]!; // newest first
    if (!latest.unread) return;
    const KEY = "lw:lastToastedNotifId";
    if (latest.id <= Number(localStorage.getItem(KEY) || 0)) return;
    localStorage.setItem(KEY, String(latest.id));
    toast(`${latest.actorName || "Someone"} chose ${latest.restaurantName}`, {
      description: `${latest.wheelName} · tap the bell to see more`,
      action: { label: "Directions", onClick: () => openNotificationMap(latest) },
    });
     
  }, [notifications]);

  // Wheel count drives the first-run experience. Same query key as WheelSelector's
  // list and seeded by bootstrap, so this is a cache read — no extra request.
  const { data: wheels, isLoading: wheelsLoading } = trpc.wheels.list.useQuery(undefined, {
    // `!!user` matters here: bootstrap now resolves for anonymous visitors too, so
    // without it this protected query would fire, throw UNAUTHORIZED, and trip the
    // global redirect-to-login instead of letting them land on "/".
    enabled: seeded && !!user,
  });
  const firstRun = seeded && !wheelsLoading && isFirstRun(wheels?.length ?? 0);

  // On arriving without a wheel in the URL, open the wheel bootstrap already
  // resolved for us (the user's starred default, else their first). The server
  // decided this in the same response that carried the wheel's data, so there's
  // no extra round trip to find out which wheel to show. First-run users (zero
  // wheels) still get the guided create card.
  // The payload is a snapshot, so it can still name a wheel that has since been
  // deleted — nextWheelToOpen drops those instead of re-opening a dead wheel the
  // eject effect above would immediately close again (React #185).
  useEffect(() => {
    if (params.wheelId || selectedWheelId) return;
    const resolved = nextWheelToOpen(bootstrapQuery.data?.wheelId, unavailableWheelIds.current);
    if (resolved == null) return;
    setSelectedWheelId(resolved);
    navigate(`/app/${resolved}`, { replace: true });
  }, [params.wheelId, selectedWheelId, bootstrapQuery.data?.wheelId, navigate]);

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

  // Consolidated shared-wheel realtime: one ~3s poll returns the live member
  // roster, the current round (veto/vote/dietary), and the latest spin — one
  // membership check + one round-trip, replacing three separate 3s polls.
  const realtimeQuery = trpc.wheels.realtime.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId && isShared, refetchInterval: 3000 }
  );
  const session: SessionState = realtimeQuery.data?.session ?? EMPTY_SESSION;

  // Latest spin: surface a teammate's spin (skip our own).
  const lastSpinIdRef = useRef<number | null>(null);
  useEffect(() => {
    lastSpinIdRef.current = null;
  }, [selectedWheelId]);
  useEffect(() => {
    const latest = realtimeQuery.data?.latestSpin;
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
  }, [realtimeQuery.data?.latestSpin, user]);

  // Refetch the round state right after my own action so it reflects instantly
  // (instead of waiting for the next ~3s poll).
  const refreshSession = () => {
    if (selectedWheelId) utils.wheels.realtime.invalidate({ wheelId: selectedWheelId });
  };

  // Post-spin rating capture: the result modal lets you star the winner right
  // there. Reads the viewer's current star so re-opening shows it pre-filled.
  const { data: ratingSummaries } = trpc.restaurants.ratings.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId && seeded && !!user },
  );
  const myStarsFor = (restaurantId: number) =>
    ratingSummaries?.find((s) => s.restaurantId === restaurantId)?.myStars ?? null;
  const rateRestaurant = trpc.restaurants.rate.useMutation({
    onSuccess: () => {
      if (selectedWheelId) utils.restaurants.ratings.invalidate({ wheelId: selectedWheelId });
    },
  });
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

  // Closed-right-now restaurants come off the wheel entirely (the server enforces
  // the same rule in spins.create — this just keeps the visual honest). Unknown
  // hours stay on: most wheels have hand-typed places with no provider hours.
  const roundCandidates = useMemo(
    () => filterRestaurantsByDistance(
      filterRestaurantsByTags(restaurants ?? [], selectedTagIds),
      maxWalkMinutes,
    ).filter((r) => r.openStatus !== "closed"),
    [restaurants, selectedTagIds, maxWalkMinutes]
  );

  // How many were hidden purely because they're shut — worth telling the user,
  // otherwise the wheel silently shrinks and looks broken.
  const closedCount = useMemo(
    () => filterRestaurantsByTags(restaurants ?? [], selectedTagIds)
      .filter((r) => r.openStatus === "closed").length,
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
      color: segmentColor(primaryTag(r)?.color, i),
    })),
    [filteredRestaurants]
  );

  const handleSpinEnd = (segment: WheelSegment) => {
    setIsSpinning(false);
    setSpinResult(segment);
    setShowResult(true);
    // The counter that retires the one-time exclusion explainer.
    setSpinsSeen((n) => {
      const next = n + 1;
      try {
        localStorage.setItem(SPINS_SEEN_KEY, String(next));
      } catch {
        // private mode — the tip just shows a couple more times
      }
      return next;
    });
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
    setSpinId(null);
    setSpinError(null);
    // Start the wheel spinning immediately for instant feedback; it free-spins
    // while the server picks the winner, then decelerates onto it. This hides
    // the server round-trip (serverless cold start) instead of dead-waiting.
    setTargetId(null);
    setIsSpinning(true);
    try {
      const { id, restaurantId } = await createSpin.mutateAsync({
        wheelId: selectedWheelId,
        candidateIds: wheelSegments.map((s) => s.id),
      });
      setSpinId(id);
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
    setSpinId(null);
    requestAnimationFrame(() => handleSpin());
  };

  // ACCEPT — "we're eating here". Records the accept (full-window exclusion +
  // team notification on shared wheels) then closes. [x] / backdrop / Esc skip
  // this: the spin was already recorded as a rejected (today-only) result, so
  // closing without accepting is the "skip this one today" path.
  const handleAccept = () => {
    if (selectedWheelId && spinId != null) {
      acceptSpin.mutate({ wheelId: selectedWheelId, spinId });
    }
    setShowResult(false);
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
  // The camera is in from the first frame of the spin until the result clears.
  // Reduced motion never pushes in, so the chrome never recedes either.
  const cameraIn = (isSpinning || showResult) && !prefersReducedMotion;
  /** Everything except the wheel recedes while the camera is pushed in. The
   *  header has carried this since item 7; on the tablet layout the supporting
   *  column sits *beside* the wheel, where a 1.9x disc overlaps it, so it
   *  recedes on the same curve rather than staying sharp under the zoom. */
  const recedeStyle: React.CSSProperties = {
    transform: cameraIn ? "translateY(-12px)" : "none",
    filter: cameraIn ? "blur(1.6px)" : "none",
    opacity: cameraIn ? 0.5 : 1,
    transition:
      "transform var(--dur-windup) var(--ease-standard), filter var(--dur-windup) var(--ease-standard), opacity var(--dur-windup) var(--ease-standard)",
    pointerEvents: cameraIn ? "none" : undefined,
  };

  const pointerTier = labelTier(Math.max(wheelSegments.length, 1));
  const spinDisabled = isSpinning || createSpin.isPending || wheelSegments.length === 0;

  const cuisineTags = (tags ?? []).filter((t) => t.category === "cuisine" && usedTagIds.has(t.id));
  const foodTypeTags = (tags ?? []).filter((t) => t.category === "food_type" && usedTagIds.has(t.id));
  const customTags = (tags ?? []).filter((t) => t.category === "custom" && usedTagIds.has(t.id));

  // Hold the same brand loader until the one-hop bootstrap has seeded the caches,
  // so the children (WheelSelector, RestaurantTab, HistoryTab) mount against warm
  // data rather than firing their own copies of the same queries. Gated on
  // `!seeded` so this only covers first entry — `seeded` latches true, so nothing
  // later can bounce the whole app back to a fullscreen loader. `isLoading` is
  // false while the query is disabled or errored, so this can't hang either.
  if (!seeded && (loading || bootstrapQuery.isLoading)) {
    // Only reached on a cold load. With a persisted payload `seeded` is already
    // true on the first render — and since seeding now includes auth.me,
    // `loading` is false there too — so the real app paints straight away.
    // `loading` must stay INSIDE the `!seeded` guard: gating on it separately is
    // what used to make the persisted cache worthless.
    return <BrandLoader fullscreen label="Warming up your wheel" />;
  }

  if (!user) return null;

  const isOwner = wheelData?.ownerId === user.id;
  const defaultWheel = wheels?.find((w) => w.id === user.defaultWheelId);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--ground)" }}>
      {/* ── HEADER ── */}
      <header
        className="glass-bar glass-bar--bottom px-4 py-2.5 flex items-center justify-between sticky top-0 z-30"
        style={{
          // Everything except the wheel recedes while the camera is pushed in.
          transform: cameraIn ? "translateY(-12px)" : "none",
          filter: cameraIn ? "blur(1.6px)" : "none",
          opacity: cameraIn ? 0.5 : 1,
          transition:
            "transform var(--dur-windup) var(--ease-standard), filter var(--dur-windup) var(--ease-standard), opacity var(--dur-windup) var(--ease-standard)",
          pointerEvents: cameraIn ? "none" : undefined,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 orb-wheel flex-shrink-0" style={{ animationDuration: "20s" }} />
          <span className="type-section" style={{ fontSize: 17, color: "var(--ink-warm)" }}>
            Lunch Wheel
          </span>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu
            open={notifOpen}
            onOpenChange={(open) => {
              setNotifOpen(open);
              // Opening the panel is "seen" — advance the read marker so the red
              // dot clears (only when there's something unread to mark).
              if (open && unreadCount > 0) markNotificationsRead.mutate();
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
                className="relative w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span
                    className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full"
                    style={{ background: "var(--brand)", boxShadow: "0 0 0 2px var(--background)" }}
                  />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-card w-80 p-0 overflow-hidden">
              <DropdownMenuLabel className="px-3 py-2.5 text-sm">Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator className="my-0" />
              <div className="max-h-[60vh] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-3 py-6 text-center type-meta text-muted-foreground">
                    No notifications yet — a teammate's accepted pick shows up here.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => openNotificationMap(n)}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors flex flex-col gap-0.5 border-b border-border/20 last:border-0"
                    >
                      <span className="text-sm leading-snug">
                        {n.unread && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: "var(--brand)" }} />
                        )}
                        <strong className="font-semibold">{n.actorName || "Someone"}</strong> accepted{" "}
                        <strong className="font-semibold">{n.restaurantName}</strong>
                      </span>
                      <span className="type-meta text-muted-foreground">
                        {n.wheelName} · {formatTimeAgo(new Date(n.createdAt))}
                      </span>
                      <span className="type-meta flex items-center gap-1 mt-0.5" style={{ color: "var(--brand-text)" }}>
                        <MapPin size={11} /> Open in Google Maps
                      </span>
                    </button>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Account menu"
                className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-transform active:scale-[var(--press-scale)] hover:brightness-105"
                style={{ background: "var(--brand-grad)", color: "var(--on-accent)" }}
              >
                {user.name?.charAt(0).toUpperCase() ?? "?"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-card w-56">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold truncate">{user.name || "-"}</span>
                <span className="type-meta text-muted-foreground font-normal truncate">{user.email || "-"}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {defaultWheel ? (
                <DropdownMenuItem onClick={() => { setSelectedWheelId(defaultWheel.id); navigate(`/app/${defaultWheel.id}`); }} className="gap-2.5">
                  <Star size={14} fill="var(--brand)" style={{ color: "var(--brand-text)" }} />
                  <span className="flex flex-col">
                    <span>Default wheel</span>
                    <span className="type-meta text-muted-foreground truncate max-w-40">{defaultWheel.name}</span>
                  </span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="gap-2.5">
                  <Star size={14} />
                  <span className="type-meta">No default wheel — star one in the sidebar</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggleTheme} className="gap-2.5">
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Neutral, not destructive. Signing out is routine and reversible;
                  painting it the same red as account deletion made the everyday
                  action look dangerous AND made the dangerous one look ordinary. */}
              <DropdownMenuItem
                onClick={() => logout().then(() => navigate("/"))}
                className="gap-2.5"
              >
                <LogOut size={14} /> Sign out
              </DropdownMenuItem>
              {/* Its own rule and an extra gap below Sign out: this is the only
                  action in the app with no undo, and on a phone it otherwise sits
                  a thumb-width under the button people press every day. Quiet by
                  design — smaller, dimmer, firming up only on hover/focus — so the
                  common actions stay the visual centre of the menu. */}
              <DropdownMenuSeparator className="mt-1.5" />
              <DropdownMenuItem
                onClick={() => setConfirmDeleteAccount(true)}
                variant="destructive"
                className="gap-2.5 mt-0.5 type-meta opacity-65 transition-opacity focus:opacity-100 [&_svg]:size-3.5"
              >
                <Trash2 /> Delete account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ConfirmDangerDialog
        open={confirmDeleteAccount}
        onOpenChange={(open) => { if (!open && !deleteAccount.isPending) setConfirmDeleteAccount(false); }}
        title="DELETE ACCOUNT"
        confirmWord="DELETE"
        confirmLabel="Delete my account"
        pending={deleteAccount.isPending}
        onConfirm={() => deleteAccount.mutate()}
        body={
          <>
            <p>
              This deletes <strong className="text-foreground">{user.email || user.name}</strong>, every wheel you
              created, and all of their restaurants and spin history.
            </p>
            <p>
              Wheels you were <em>invited</em> to stay with their owner — you're just removed from the team. Signing in
              again later creates a brand-new, empty account.
            </p>
            <p style={{ color: "var(--destructive)" }}>This cannot be undone.</p>
          </>
        }
      />

      <div className="flex flex-col xl:flex-row flex-1 overflow-hidden">
        {/* ── WHEEL SWITCHER (desktop rail · mobile pill+sheet) ── */}
        <WheelSelector
          selectedWheelId={selectedWheelId}
          onSelect={(id: number) => { setSelectedWheelId(id); navigate(`/app/${id}`); }}
          onDeleted={(id: number) => {
            // Mark it dead before releasing the selection: the refreshed entry
            // payload may not have landed yet, and the auto-open effect would
            // otherwise re-open the wheel that was just deleted.
            unavailableWheelIds.current.add(id);
            if (id !== selectedWheelId) return;
            setSelectedWheelId(null);
            navigate("/app", { replace: true });
          }}
          registerCreateOpener={registerCreateOpener}
          registerSettingsOpener={registerSettingsOpener}
          /* The Wheel tab spends this slot on the filter instead of the gear.
             Two rows come off the top of the most important screen: the filter
             stops being a full-width bar, and the duplicate wheel-name title
             below it is gone (the picker already says which wheel you are on).
             That is what gets Spin above the fold on a 390x844 phone. */
          trailing={
            activeTab === "wheel" && selectedWheelId ? (
              <FilterBar
                variant="sheet"
                open={showFilters}
                onOpenChange={setShowFilters}
                tagGroups={[
                  { label: "Cuisine", items: cuisineTags },
                  { label: "Food type", items: foodTypeTags },
                  { label: "Custom", items: customTags },
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
            ) : undefined
          }
        />

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── VIEW TABS (desktop) — floating glass segmented control ──
              Ember: one glass bar, solid persimmon on the active segment (no
              gradient, no glow — persimmon is the only saturated colour and it
              is flat), and 56px of height like every other control. */}
          <div className="hidden md:flex px-4 py-2.5 flex-shrink-0 md:justify-center xl:justify-start">
            <TabRail items={TAB_CONFIG} value={activeTab} onChange={setActiveTab} variant="rail" />
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
                className="px-4 flex items-center transition-colors active:scale-[var(--press-scale)] disabled:opacity-40 flex-shrink-0"
                style={{
                  minHeight: 44,
                  borderRadius: "var(--radius-chip)",
                  background: "var(--brand-grad)",
                  color: "var(--on-accent)",
                  fontSize: 15,
                  fontWeight: 500,
                  letterSpacing: "0.05em",
                }}
              >
                {addShared.isPending ? "Adding…" : "Add"}
              </button>
              <button onClick={() => setSharedText(null)} className="p-1 rounded text-muted-foreground hover:text-foreground flex-shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          {/* ── TAB CONTENT ── (pb clears the fixed mobile nav) */}
          <div className="flex-1 overflow-y-auto overflow-x-clip pb-28 md:pb-0">
            {!selectedWheelId ? (
              wheelsLoading ? (
                /* Hold a neutral state until we know if this is a first run —
                   avoids flashing "no wheel selected" at a brand-new user. */
                <div className="flex items-center justify-center h-full p-8">
                  <BrandLoader label="" size={64} />
                </div>
              ) : firstRun ? (
                /* First-run — no wheels yet. Nearby search IS the onboarding:
                   locate, pick real places, spin. The old card's two buttons both
                   opened the seven-field create dialog, and its "fast" path seeded
                   fictional restaurants — see OnboardingFlow. Anyone who declines
                   to share their location falls through to that same dialog. */
                <OnboardingFlow
                  onCreated={(wheelId) => {
                    utils.wheels.list.invalidate();
                    utils.wheels.bootstrap.invalidate();
                    setSelectedWheelId(wheelId);
                    setActiveTab("wheel");
                    navigate(`/app/${wheelId}`, { replace: true });
                  }}
                  onManualCreate={() => createOpenerRef.current?.(false)}
                />
              ) : (
                /* Empty state — has wheels, none selected */
                <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
                  <div className="w-20 h-20 orb-wheel opacity-20" />
                  <div>
                    <p className="type-section mb-1.5" style={{ color: "var(--ink-warm)" }}>
                      No wheel selected
                    </p>
                    <p className="text-sm text-muted-foreground">Pick a wheel from the menu or create a new one</p>
                  </div>
                </div>
              )
            ) : (
              <div key={activeTab} className="tab-enter">

                {/* ══ TAB 1: WHEEL ══ */}
                {activeTab === "wheel" && (
                  /* Ember item 14 — tablet (768–1279) is two columns: the wheel
                     holds the left column at its drawn size, everything that
                     supports it (settings, team, round, filter) stacks in a
                     fixed column on the right. Below 768 and at 1280+ this is
                     the single centred column it has always been, and the
                     children keep their DOM order either way, so the wheel is
                     mounted exactly once at every width. */
                  <div className="flex flex-col items-center gap-4 px-4 py-4 pb-8 max-w-2xl mx-auto md:grid md:max-w-4xl md:items-start md:gap-6 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px] xl:flex xl:max-w-2xl xl:items-center">

                    {/* Settings shortcut — same dialog as the sidebar's kebab menu
                        (registerSettingsOpener), just faster once you're already
                        on the wheel. Open to members too, same as that menu item:
                        the dialog itself is read-only for them.
                        Desktop only: on mobile this would sit in its own empty
                        row above Team/Round, so the gear lives in the
                        wheel-picker pill row instead (WheelSelector.tsx). */}
                    {selectedWheelId && (
                      <div className="hidden md:flex w-full justify-end -mb-2 md:col-start-2 xl:col-auto" style={recedeStyle}>
                        <button
                          onClick={() => settingsOpenerRef.current?.(selectedWheelId)}
                          aria-label="Wheel settings"
                          title={isOwner ? "Wheel settings" : "Wheel settings (view only)"}
                          className="flex items-center justify-center h-11 w-11 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors active:scale-90"
                        >
                          <Settings size={16} />
                        </button>
                      </div>
                    )}

                    {/* Team roster */}
                    {isShared && wheelData && (
                      <div className="w-full md:col-start-2 xl:col-auto" style={recedeStyle}>
                        <WheelMembers
                          ownerId={wheelData.ownerId}
                          owner={wheelData.owner}
                          members={realtimeQuery.data?.members ?? wheelData.members}
                          currentUserId={user.id}
                          presentUserIds={presentUserIds}
                          collapsible
                        />
                      </div>
                    )}

                    {/* Round panel (shared wheels) */}
                    {isShared && (
                      <div className="w-full md:col-start-2 xl:col-auto" style={recedeStyle}>
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

                    {/* ── WHEEL + SPIN CTA ── */}
                    {restaurantsLoading ? (
                      /* The same "Warming up your wheel" loader as the entry gate,
                         so a wheel switch reads as a continuation of that state
                         rather than a new one. It used to be a bare orb blown up
                         to 72vw with no label — at that size the brand mark stops
                         reading as a spinner and just looks like a broken wheel
                         that failed to draw its labels. The pill below stands in
                         for the SPIN button. */
                      <div className="flex flex-col items-center gap-8 py-16 w-full md:col-start-1 md:row-start-1 md:row-span-5 xl:col-auto xl:row-auto">
                        <BrandLoader label="Warming up your wheel" size={72} />
                        {/* Token background, not bg-white/5: on the light theme a
                            5%-white pill over a near-white page is invisible, so
                            the SPIN placeholder simply wasn't there. */}
                        <div className="h-14 w-48 rounded-full animate-pulse" style={{ background: "var(--muted)" }} />
                      </div>
                    ) : restaurantsError ? (
                      <div className="flex flex-col items-center gap-4 py-12 text-center">
                        <AlertTriangle size={32} className="text-amber-500/60" />
                        <p className="text-sm text-muted-foreground">Couldn't load restaurants: {restaurantsError.message}</p>
                        <button
                          onClick={() => refetchRestaurants()}
                          className="glass-chip flex items-center gap-2 px-6 transition-colors active:scale-[var(--press-scale)]"
                          style={{ minHeight: 56, color: "var(--ink-warm)", fontSize: 15, fontWeight: 500 }}
                        >
                          <RefreshCw size={15} /> Retry
                        </button>
                      </div>
                    ) : (
                      <div className="w-full flex flex-col items-center gap-5 md:col-start-1 md:row-start-1 md:row-span-5 xl:col-auto xl:row-auto">
                        {/* The wheel. The camera holds its zoom from the moment
                            the spin starts until Lock it in or Respin clears the
                            result — one owner for that fact, passed down, rather
                            than the wheel inferring it from its own state. */}
                        <SpinWheel
                          segments={wheelSegments}
                          onSpinEnd={handleSpinEnd}
                          isSpinning={isSpinning}
                          onSpinStart={handleSpin}
                          targetId={targetId}
                          zoomed={isSpinning || showResult}
                          winnerId={spinResult?.id ?? null}
                          receded={showResult}
                        />

                        {(restaurants?.length ?? 0) === 0 ? (
                          /* First run CTA */
                          <div className="flex flex-col items-center gap-3 text-center">
                            <button
                              onClick={() => setActiveTab("restaurants")}
                              className="group flex items-center gap-2.5 px-8 transition-colors duration-200 active:scale-[var(--press-scale)]"
                              style={{
                                minHeight: 56,
                                borderRadius: "var(--radius-control)",
                                background: "var(--brand-grad)",
                                color: "var(--on-accent)",
                                fontSize: 16,
                                fontWeight: 500,
                                letterSpacing: "0.05em",
                              }}
                            >
                              <Plus size={17} /> Add restaurants
                            </button>
                            <p className="type-meta text-muted-foreground">Add a few places, then spin to decide.</p>
                          </div>
                        ) : (
                          /* Gone while the camera is in, not merely receded.
                             The zoomed disc is 741px tall and now runs past
                             this stack instead of being clipped off above it,
                             so the wheel is what occupies this space — and a
                             half-faded Spin button showing through the middle
                             of it reads as a rendering fault, not a state. */
                          <div
                            className="w-full max-w-sm flex flex-col"
                            style={{
                              gap: 20,
                              ...recedeStyle,
                              opacity: cameraIn ? 0 : 1,
                              pointerEvents: cameraIn ? "none" : undefined,
                            }}
                          >
                            <ErrorChip error={spinError} onDismiss={() => setSpinError(null)} />

                            {/* Above 16 places the disc carries indices, so say
                                where the names are before the user looks for them. */}
                            {pointerTier.indexOnly && (
                              <p className="type-meta" style={{ color: "var(--muted-foreground)" }}>
                                Names arrive as the wheel passes the pointer, and in full when it lands.
                              </p>
                            )}

                            <button
                              onClick={handleSpin}
                              disabled={isSpinning || createSpin.isPending || wheelSegments.length === 0}
                              className="w-full flex items-center justify-center gap-2 font-semibold transition-transform active:scale-[var(--press-scale)] disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{
                                minHeight: 56,
                                borderRadius: "var(--radius-control)",
                                background: spinDisabled ? "var(--muted)" : "var(--brand-grad)",
                                color: spinDisabled ? "var(--muted-foreground)" : "var(--on-accent)",
                                fontSize: 16,
                                fontWeight: 500,
                                letterSpacing: "0.05em",
                                transitionDuration: "var(--dur-tap)",
                              }}
                            >
                              {isSpinning || createSpin.isPending ? "Spinning…" : "Spin the wheel"}
                            </button>

                            {/* The muted line under the stack: how many are on the
                                wheel, and why the count is lower than the list —
                                the closed count answers that, so it belongs here
                                rather than floating somewhere else on the tab. */}
                            {wheelSegments.length === 0 ? (
                              <div
                                className="glass-chip flex items-center gap-2 px-4 py-3 w-full"
                                style={{ color: "var(--destructive)" }}
                              >
                                <AlertTriangle size={14} className="flex-shrink-0" />
                                <span className="type-meta">
                                  Nothing to spin — every restaurant is
                                  {selectedTagIds.length > 0 ? " filtered out or " : " "}
                                  excluded or vetoed.
                                </span>
                              </div>
                            ) : (
                              <p className="type-meta text-center" style={{ color: "var(--muted-foreground)" }}>
                                <span className="font-semibold" style={{ color: "var(--brand-text)" }}>{filteredRestaurants.length}</span>
                                {" "}restaurant{filteredRestaurants.length !== 1 ? "s" : ""} on the wheel
                                {closedCount > 0 && (
                                  <>
                                    {" · "}
                                    <span className="inline-flex items-center gap-1">
                                      <Clock3 size={12} className="flex-shrink-0" />
                                      {closedCount} closed now
                                    </span>
                                  </>
                                )}
                              </p>
                            )}
                          </div>
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
                              className="w-full flex items-center justify-between gap-2 px-4 text-left transition-colors hover:bg-white/3"
                              style={{ minHeight: 56 }}
                            >
                              <div className="type-eyebrow flex items-center gap-2" style={{ color: "var(--brand-text)" }}>
                                <Clock size={12} /> Skipping (picked recently)
                                <span
                                  className="px-2 py-0.5 type-meta font-semibold"
                                  style={{ background: "var(--brand-grad)", color: "var(--on-accent)", borderRadius: "var(--radius-chip)" }}
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
                                  <li key={r.id} className="flex items-center justify-between gap-2 type-meta">
                                    <span className="truncate text-muted-foreground">{r.name}</span>
                                    {r.excludedUntil && (
                                      <span
                                        className="flex-shrink-0 px-2 py-0.5 rounded-full type-meta"
                                        style={{
                                          background: "oklch(from var(--destructive) l c h / 0.12)",
                                          color: "var(--brand-text)",
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
            }}
            aria-label="Views"
          >
            {/* No scrim. This wrapper used to paint
                `linear-gradient(to top, var(--background) 55%, transparent)` to
                fade content out under the dock — which put flat paper directly
                behind the glass and left it nothing to refract or blur. A
                blurred flat gradient is the same flat gradient, so the dock
                could only ever read as a slightly paler rectangle. The list
                running under it IS the material. */}
            <TabRail items={TAB_CONFIG} value={activeTab} onChange={setActiveTab} variant="dock" />
          </nav>
        </div>
      </div>

      {/* ── RESULT ──
          No modal and no card: the camera is still holding its zoom on the wheel
          behind this, and the winning pane unrolls in place into display type.
          Everything the old overlay carried survives — closing-soon from the real
          openStatus, the one-time exclusion explainer, the rating capture, and
          the quiet dismiss that means "not this one, not now" without respinning. */}
      {showResult && spinResult && (() => {
        const win = restaurants?.find((r) => r.id === spinResult.id);
        const walkSeconds = wheelData?.distanceEnabled ? win?.walkSeconds : null;
        return (
          <WinnerSurface
            name={spinResult.label}
            isClosingSoon={win?.openStatus === "closing_soon"}
            closingSoonMinutes={win?.minutesUntilClose ?? null}
            meta={
              walkSeconds != null ? (
                <span className="flex items-center gap-1.5">
                  <Footprints size={14} className="flex-shrink-0" />
                  {formatWalk(walkSeconds / 60)} from {wheelData?.originLabel || "Office"}
                </span>
              ) : null
            }
            onAccept={handleAccept}
            onRespin={handleReSpin}
            respinDisabled={wheelSegments.length === 0}
            onDirections={() => openDirections(spinResult)}
            onDismiss={() => setShowResult(false)}
          >
            {isEarlySpin && wheelData && wheelData.exclusionDays > 0 && (
              <div className="glass-chip flex items-start gap-2.5 px-4 py-3 w-full text-left">
                <Clock size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--brand-text)" }} />
                <span className="type-meta" style={{ color: "var(--body)" }}>
                  We&apos;ll skip{" "}
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                    {spinResult.label}
                  </span>{" "}
                  for the next {wheelData.exclusionDays}{" "}
                  {wheelData.exclusionDays === 1 ? "day" : "days"} so you don&apos;t get it twice.
                  Change that in wheel settings.
                </span>
              </div>
            )}
            <div className="flex items-center gap-3 w-full">
              <span className="type-eyebrow" style={{ color: "var(--muted-foreground)" }}>
                Rate it
              </span>
              <StarRating
                value={myStarsFor(spinResult.id)}
                size={26}
                disabled={rateRestaurant.isPending}
                onChange={(stars) =>
                  selectedWheelId &&
                  rateRestaurant.mutate({ wheelId: selectedWheelId, restaurantId: spinResult.id, stars })
                }
              />
            </div>
          </WinnerSurface>
        );
      })()}
    </div>
  );
}
