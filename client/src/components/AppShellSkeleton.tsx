import { Skeleton } from "@/components/ui/skeleton";
import { RotateCw, Utensils, History } from "lucide-react";

/**
 * First-paint placeholder for the signed-in app.
 *
 * Shown only on a genuinely cold load (no persisted entry payload — see
 * lib/bootCache). Instead of a lone spinner on an empty page, this draws the real
 * chrome the app is about to fill: header, wheel picker, the wheel itself, and the
 * bottom tab bar in their final positions. The layout doesn't jump when data
 * lands, so the same wait reads as much shorter.
 *
 * Deliberately static — no spinner, no pulse beyond the Skeleton's own shimmer —
 * so it stays calm and can't imply progress it doesn't know about.
 */
export default function AppShellSkeleton() {
  return (
    <div className="min-h-dvh flex flex-col" aria-busy="true" aria-label="Loading your wheel">
      {/* Header */}
      <header className="glass-nav sticky top-0 z-30 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="orb-wheel h-8 w-8 flex-shrink-0" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </header>

      <div className="flex-1 px-4 pt-4 pb-28 flex flex-col items-center gap-4 w-full max-w-md mx-auto">
        {/* Wheel picker pill */}
        <Skeleton className="h-12 w-full rounded-2xl" />

        {/* The wheel — a real circle so the page doesn't reflow when it arrives */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full py-6">
          <Skeleton className="rounded-full aspect-square w-full max-w-[280px]" />
          <Skeleton className="h-12 w-40 rounded-full" />
        </div>
      </div>

      {/* Bottom tab bar, in its final place */}
      <nav className="glass-nav fixed bottom-3 left-3 right-3 z-30 rounded-2xl px-2 py-2">
        <div className="flex items-center justify-around">
          {[RotateCw, Utensils, History].map((Icon, i) => (
            <div key={i} className="flex flex-col items-center gap-1 px-4 py-1.5 text-muted-foreground/40">
              <Icon size={18} />
              <Skeleton className="h-2 w-12" />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
