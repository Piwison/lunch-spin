import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import SpinWheel, { WheelSegment } from "@/components/SpinWheel";
import RestaurantTab from "@/components/RestaurantTab";
import HistoryTab from "@/components/HistoryTab";
import WheelSelector from "@/components/WheelSelector";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle } from "lucide-react";
import { filterRestaurantsByTags } from "@shared/filter";

type Tab = "wheel" | "restaurants" | "history";

export default function WheelApp() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ wheelId?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("wheel");
  const [selectedWheelId, setSelectedWheelId] = useState<number | null>(
    params.wheelId ? parseInt(params.wheelId) : null
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<WheelSegment | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [user, loading, navigate]);

  const { data: tags } = trpc.tags.list.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId }
  );
  const { data: restaurants, refetch: refetchRestaurants } = trpc.restaurants.list.useQuery(
    { wheelId: selectedWheelId! },
    { enabled: !!selectedWheelId }
  );
  const { data: wheelData } = trpc.wheels.get.useQuery(
    { id: selectedWheelId! },
    { enabled: !!selectedWheelId }
  );

  const recordSpin = trpc.spins.record.useMutation({
    onSuccess: () => refetchRestaurants(),
  });

  // Filter restaurants: AND logic on selected tags, exclude auto-excluded
  const filteredRestaurants = useMemo(
    () => filterRestaurantsByTags(restaurants ?? [], selectedTagIds),
    [restaurants, selectedTagIds]
  );

  const wheelSegments: WheelSegment[] = useMemo(() =>
    filteredRestaurants.map((r) => ({
      id: r.id,
      label: r.name,
      color: r.tags[0]?.color ?? "#6366f1",
    })),
    [filteredRestaurants]
  );

  const handleSpinEnd = (segment: WheelSegment) => {
    setIsSpinning(false);
    setSpinResult(segment);
    setShowResult(true);
    if (selectedWheelId) {
      recordSpin.mutate({ wheelId: selectedWheelId, restaurantId: segment.id });
    }
  };

  const handleSpin = () => {
    if (wheelSegments.length === 0) {
      toast.error("No restaurants available. Add some or adjust your filters.");
      return;
    }
    setShowResult(false);
    setSpinResult(null);
    setIsSpinning(true);
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const isOwner = wheelData?.ownerId === user.id;

  const tabs: { id: Tab; label: string }[] = [
    { id: "wheel", label: "Wheel" },
    { id: "restaurants", label: "Restaurants" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "oklch(0.09 0.02 260)" }}>
      {/* Header */}
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between glass sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex-shrink-0"
            style={{
              background: "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6, #ec4899, #ef4444)",
              boxShadow: "0 0 12px oklch(0.72 0.22 30 / 0.5)",
            }}
          />
          <span className="font-bold text-lg tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            LUNCH WHEEL
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{user.name}</span>
          <button
            onClick={() => navigate("/")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Wheel Selector Sidebar */}
        <WheelSelector
          selectedWheelId={selectedWheelId}
          onSelect={(id: number) => { setSelectedWheelId(id); navigate(`/app/${id}`); }}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-border/50 px-4 flex gap-1 pt-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative px-4 py-2 text-sm font-medium transition-colors duration-150"
                style={{
                  fontFamily: "var(--font-display)",
                  letterSpacing: "0.05em",
                  color: activeTab === tab.id ? "oklch(0.95 0.01 260)" : "oklch(0.55 0.02 260)",
                }}
              >
                {tab.label.toUpperCase()}
                {activeTab === tab.id && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ background: "linear-gradient(90deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {!selectedWheelId ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <div className="text-5xl opacity-20">🎡</div>
                <p className="text-muted-foreground">Select or create a wheel to get started</p>
              </div>
            ) : (
              <>
                {/* ── TAB 1: WHEEL ── */}
                {activeTab === "wheel" && (
                  <div className="p-4 md:p-6 flex flex-col items-center gap-6">
                    {/* Tag filter bar */}
                    <div className="w-full max-w-2xl">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground tracking-widest" style={{ fontFamily: "var(--font-display)" }}>
                          FILTER BY TAGS
                        </span>
                        {selectedTagIds.length > 0 && (
                          <button
                            onClick={() => setSelectedTagIds([])}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            <X size={12} /> Clear all
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[...cuisineTags, ...foodTypeTags, ...customTags].map((tag) => {
                          const isActive = selectedTagIds.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              onClick={() => toggleTag(tag.id)}
                              className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 active:scale-95"
                              style={{
                                background: isActive ? tag.color + "33" : "oklch(0.16 0.025 260)",
                                border: `1px solid ${isActive ? tag.color : "oklch(0.25 0.03 260)"}`,
                                color: isActive ? tag.color : "oklch(0.65 0.02 260)",
                                boxShadow: isActive ? `0 0 8px ${tag.color}44` : "none",
                              }}
                            >
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>

                      {/* Empty state warning */}
                      {selectedTagIds.length > 0 && filteredRestaurants.length === 0 && (
                        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                          style={{ background: "oklch(0.60 0.22 25 / 0.15)", border: "1px solid oklch(0.60 0.22 25 / 0.4)", color: "oklch(0.80 0.15 40)" }}>
                          <AlertTriangle size={14} />
                          No restaurants match all selected tags. Try removing some filters.
                        </div>
                      )}
                    </div>

                    {/* Wheel */}
                    <div className="w-full max-w-md flex flex-col items-center gap-6">
                      <SpinWheel
                        segments={wheelSegments}
                        onSpinEnd={handleSpinEnd}
                        isSpinning={isSpinning}
                        onSpinStart={handleSpin}
                      />

                      {/* Spin button */}
                      <button
                        onClick={handleSpin}
                        disabled={isSpinning || wheelSegments.length === 0}
                        className="px-10 py-3 rounded-full font-bold text-base tracking-widest transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                        style={{
                          fontFamily: "var(--font-display)",
                          background: isSpinning
                            ? "oklch(0.16 0.025 260)"
                            : "linear-gradient(135deg, oklch(0.72 0.22 30), oklch(0.65 0.25 280))",
                          boxShadow: isSpinning ? "none" : "0 0 30px oklch(0.72 0.22 30 / 0.5), 0 4px 20px rgba(0,0,0,0.4)",
                          color: "white",
                        }}
                      >
                        {isSpinning ? "SPINNING..." : "SPIN"}
                      </button>

                      {/* Segment count */}
                      <p className="text-xs text-muted-foreground">
                        {filteredRestaurants.length} restaurant{filteredRestaurants.length !== 1 ? "s" : ""} on the wheel
                        {restaurants && restaurants.filter(r => r.isExcluded).length > 0 && (
                          <span className="ml-2 text-amber-500/70">
                            · {restaurants.filter(r => r.isExcluded).length} excluded
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Result overlay */}
                    {showResult && spinResult && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
                        onClick={() => setShowResult(false)}
                      >
                        <div
                          className="animate-spin-result text-center p-8 rounded-2xl max-w-sm w-full"
                          style={{
                            background: "oklch(0.12 0.025 260)",
                            border: `2px solid ${spinResult.color}`,
                            boxShadow: `0 0 60px ${spinResult.color}44, 0 0 120px ${spinResult.color}22`,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-5xl mb-4">🎉</div>
                          <p className="text-sm text-muted-foreground mb-2 tracking-widest" style={{ fontFamily: "var(--font-display)" }}>
                            TODAY'S LUNCH
                          </p>
                          <h2
                            className="text-3xl font-bold mb-6"
                            style={{ fontFamily: "var(--font-display)", color: spinResult.color, textShadow: `0 0 20px ${spinResult.color}88` }}
                          >
                            {spinResult.label}
                          </h2>
                          <button
                            onClick={() => setShowResult(false)}
                            className="px-6 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
                            style={{
                              background: spinResult.color + "22",
                              border: `1px solid ${spinResult.color}66`,
                              color: spinResult.color,
                              fontFamily: "var(--font-display)",
                            }}
                          >
                            CLOSE
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB 2: RESTAURANTS ── */}
                {activeTab === "restaurants" && (
                  <RestaurantTab
                    wheelId={selectedWheelId}
                    isOwner={isOwner}
                    onRestaurantsChange={refetchRestaurants}
                  />
                )}

                {/* ── TAB 3: HISTORY ── */}
                {activeTab === "history" && (
                  <HistoryTab
                    wheelId={selectedWheelId}
                    onReenabled={refetchRestaurants}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
