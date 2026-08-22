import { useLayoutEffect, useRef, useState, type ComponentType } from "react";

/**
 * The view switcher, in both of its shapes — the phone's bottom dock and the
 * desktop's segmented rail.
 *
 * The selection SLIDES. Both rows used to paint the persimmon fill on whichever
 * button was active, so switching tabs was two fills swapping in the same frame;
 * on a glass surface that reads as a rectangle blinking on and off rather than as
 * a control with a moving part. One indicator that travels — with the settle
 * token's overshoot, so it arrives like something with mass — is most of what
 * makes the reference tab bar feel liquid.
 *
 * The indicator is MEASURED rather than computed, because the two rows disagree
 * about widths: the dock's buttons are equal thirds, the rail's are as wide as
 * their labels. One measurement covers both, and covers a font swap or a
 * translated label changing a button's width after first paint.
 */

export type TabRailItem<Id extends string> = {
  id: Id;
  label: string;
  icon: ComponentType<{ size?: number }>;
};

type Props<Id extends string> = {
  items: TabRailItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  /** `dock` — the phone's fixed bottom bar. `rail` — the desktop segmented control. */
  variant: "dock" | "rail";
  className?: string;
};

export function TabRail<Id extends string>({
  items,
  value,
  onChange,
  variant,
  className,
}: Props<Id>) {
  const dock = variant === "dock";
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const button = track.querySelectorAll<HTMLButtonElement>("[data-tab]")[activeIndex];
      if (!button) return;
      setBox({ left: button.offsetLeft, width: button.offsetWidth });
    };

    measure();
    // The rail's buttons are label-width, so anything that reflows them — a
    // window resize, the display font arriving — moves the indicator's target.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [activeIndex, items]);

  /* The gutter around the pills is also the width of the surface's refracting
     band — index.css sizes the lens ring to it, because a ring wider than the
     padding paints over the pills. At the old 6px the bend was there and
     measurable and you could not see it; 8px is the point where the dock's rim
     reads as glass rather than as a hairline. */
  const PAD = 8;
  const radius = dock ? "calc(var(--radius-sheet) - 8px)" : "calc(var(--radius-control) - 6px)";

  return (
    <div
      ref={trackRef}
      className={`relative ${dock ? "w-full max-w-md flex" : "inline-flex"} items-center gap-1 glass-bar ${className ?? ""}`}
      style={{ borderRadius: dock ? "var(--radius-sheet)" : "var(--radius-control)", padding: PAD }}
    >
      {box && (
        <div
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            top: PAD,
            bottom: PAD,
            left: 0,
            width: box.width,
            transform: `translateX(${box.left}px)`,
            transition:
              "transform var(--dur-view) var(--ease-settle), width var(--dur-view) var(--ease-settle)",
            borderRadius: radius,
            background: "var(--brand-grad)",
            boxShadow: "0 2px 10px rgb(222 92 31 / 0.28)",
          }}
        />
      )}

      {items.map(({ id, label, icon: Icon }) => {
        const isActive = id === value;
        return (
          <button
            key={id}
            data-tab
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex items-center justify-center transition-colors duration-200 active:scale-[var(--press-scale)] ${
              dock ? "flex-1 flex-col gap-1" : "gap-2 px-5"
            }`}
            style={{
              minHeight: 56,
              borderRadius: radius,
              fontSize: dock ? 11 : 15,
              fontWeight: 500,
              letterSpacing: "0.05em",
              color: isActive ? "var(--on-accent)" : "var(--body-warm)",
            }}
          >
            <Icon size={dock ? 20 : 15} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
