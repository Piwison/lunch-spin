// Bold, saturated, well-spaced hues for wheel segments and restaurant dots.
// Used as a per-segment fallback so an untagged wheel is still vivid and
// readable rather than a single monochromatic blob.
export const SEGMENT_PALETTE = [
  "#f43f5e", // rose
  "#fb923c", // orange
  "#facc15", // amber
  "#4ade80", // green
  "#22d3ee", // cyan
  "#818cf8", // indigo
  "#e879f9", // fuchsia
  "#f87171", // red
  "#34d399", // emerald
  "#a78bfa", // violet
  "#fbbf24", // yellow
  "#2dd4bf", // teal
];

/** A restaurant's own tag colour if it has one, else a distinct palette hue. */
export function segmentColor(tagColor: string | null | undefined, index: number): string {
  return tagColor ?? SEGMENT_PALETTE[index % SEGMENT_PALETTE.length]!;
}
