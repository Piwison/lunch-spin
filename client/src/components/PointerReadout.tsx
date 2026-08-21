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
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            color: "var(--foreground)",
          }}
        >
          {name}
        </p>
      </div>
      {(meta || indexLabel) && (
        <div
          className="flex-none text-right type-meta flex flex-col items-end gap-0.5"
          style={{ color: "var(--body)" }}
        >
          {meta}
          {indexLabel && <span style={{ color: "var(--muted-foreground)" }}>{indexLabel}</span>}
        </div>
      )}
    </div>
  );
}
