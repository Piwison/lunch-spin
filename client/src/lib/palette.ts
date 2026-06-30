// A cohesive "designed spectrum" for wheel segments and restaurant dots.
// Slices still need to be distinguishable, so we keep hue separation — but
// every hue sits at a similar (moderate) saturation and lightness so the wheel
// reads as ONE intentional palette instead of a clashing neon rainbow. Ordered
// around the hue wheel and biased toward the brand's warm→cool (orange→purple)
// identity.
export const SEGMENT_PALETTE = [
  "#e2674f", // coral
  "#e3893e", // orange (brand-adjacent)
  "#dcab4a", // amber
  "#8fb46b", // sage
  "#5aa6a0", // teal
  "#5f8fd4", // blue
  "#8b7fd6", // periwinkle
  "#b072c9", // orchid
  "#d56fa3", // mauve
  "#dd6f73", // dusty rose
];

/** A restaurant's own tag colour if it has one, else a distinct palette hue. */
export function segmentColor(tagColor: string | null | undefined, index: number): string {
  return tagColor ?? SEGMENT_PALETTE[index % SEGMENT_PALETTE.length]!;
}
