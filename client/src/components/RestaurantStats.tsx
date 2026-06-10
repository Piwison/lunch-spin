import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  averagePicks as computeAveragePicks,
  rankStats,
  type RestaurantStat,
  topRestaurants as computeTopRestaurants,
  totalPicks as computeTotalPicks,
} from "@shared/stats";

interface RestaurantStatsProps {
  stats: RestaurantStat[];
  isLoading?: boolean;
}

const COLORS = [
  "oklch(0.72 0.22 30)",    // Orange
  "oklch(0.65 0.25 280)",   // Purple
  "oklch(0.70 0.20 160)",   // Cyan
  "oklch(0.75 0.18 60)",    // Yellow
  "oklch(0.68 0.22 340)",   // Red
];

export function RestaurantStats({ stats, isLoading }: RestaurantStatsProps) {
  // Sort by pick count and take top 5
  const topRestaurants = useMemo(() => computeTopRestaurants(stats, 5), [stats]);

  // Prepare data for bar chart (all restaurants)
  const barData = useMemo(() => {
    return rankStats(stats).map((r) => ({
      name: r.name.length > 20 ? r.name.substring(0, 17) + "..." : r.name,
      picks: r.pickCount,
      fullName: r.name,
    }));
  }, [stats]);

  // Prepare data for pie chart (top 5)
  const pieData = useMemo(() => {
    return topRestaurants.map((r) => ({
      name: r.name,
      value: r.pickCount,
    }));
  }, [topRestaurants]);

  const totalPicks = useMemo(() => computeTotalPicks(stats), [stats]);

  const averagePicks = useMemo(() => {
    return stats.length > 0 ? computeAveragePicks(stats).toFixed(1) : 0;
  }, [stats]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground">No spin data yet. Start spinning to see statistics!</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium text-muted-foreground">Total Spins</div>
          <div className="text-2xl font-bold text-primary mt-1">{totalPicks}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium text-muted-foreground">Restaurants</div>
          <div className="text-2xl font-bold text-accent mt-1">{stats.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium text-muted-foreground">Avg Picks</div>
          <div className="text-2xl font-bold text-accent-foreground mt-1">{averagePicks}</div>
        </Card>
      </div>

      {/* Pick Frequency Bar Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Pick Frequency</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.025 260)" />
            <XAxis dataKey="name" stroke="oklch(0.55 0.02 260)" />
            <YAxis stroke="oklch(0.55 0.02 260)" />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.12 0.025 260)",
                border: "1px solid oklch(0.25 0.03 260)",
                borderRadius: "0.5rem",
              }}
              labelStyle={{ color: "oklch(0.95 0.01 260)" }}
            />
            <Bar dataKey="picks" fill="oklch(0.72 0.22 30)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Top 5 Pie Chart */}
      {topRestaurants.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Top {Math.min(5, topRestaurants.length)} Restaurants</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.12 0.025 260)",
                  border: "1px solid oklch(0.25 0.03 260)",
                  borderRadius: "0.5rem",
                }}
                labelStyle={{ color: "oklch(0.95 0.01 260)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Top Restaurants List */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Most Popular</h3>
        <div className="space-y-3">
          {topRestaurants.map((r, idx) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-card/50">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <div>
                  <p className="font-medium">{r.name}</p>
                  {r.lastPickedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last picked {new Date(r.lastPickedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-primary">{r.pickCount}</p>
                <p className="text-xs text-muted-foreground">picks</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
