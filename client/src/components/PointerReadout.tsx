import type { ReactNode } from "react";

interface PointerReadoutProps {
  /** The name of the pane currently at the pointer. */
  name: string;
  /** Walk time, price — whatever the wheel actually knows. Right-aligned. */
  meta?: ReactNode;
  /** "#7" at the index tier, where the disc shows numbers instead of names. */
  indexLabel?: string | null;
}

/**
 * The name of whatever is at the pointer, permanently, at every place count.
 *
 * This card is why 24 places is fine. Past sixteen the disc stops carrying names
 * — there is no type size that is both legible and contained inside a 22° wedge
 * — so it carries indices and hands legibility here. The wheel must never depend
 * on its own labels to be usable.
 *
 * It is not a spin result: it names what the pointer is over right now, and it
 * updates as the wheel passes each pane.
 */
export default function PointerReadout({ name, meta, indexLabel }: PointerReadoutProps) {
  return (
    <div className="glass-card flex items-end justify-between gap-4 px-4 py-3.5 w-full">
      <div className="min-w-0">
        <p className="type-eyebrow mb-1.5" style={{ color: "var(--brand)" }}>
          At the pointer
        </p>
        <p
          className="truncate"
          style={{
            // 17/600 rather than 21/600: at 21px a Chinese name is heavier than
            // anything else on the screen and competes with the wheel itself.
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "0.01em",
            lineHeight: 1.3,
            color: "var(--ink-warm)",
          }}
        >
          {name}
        </p>
      </div>
      {(meta || indexLabel) && (
        <div
          className="flex-none text-right flex flex-col items-end gap-0.5"
          style={{ fontSize: 13, fontWeight: 400, color: "var(--body-warm)" }}
        >
          {meta}
          {indexLabel && <span style={{ color: "var(--body-warm)" }}>{indexLabel}</span>}
        </div>
      )}
    </div>
  );
}
