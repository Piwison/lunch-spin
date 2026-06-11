/**
 * Pure winner selection for a spin.
 *
 * The server (not the browser) decides which restaurant wins, so a shared wheel
 * can't be tampered with from the client and every member sees the same result.
 * `rng` is injectable so the choice is deterministic under test.
 */
export function pickWinner(candidateIds: number[], rng: () => number = Math.random): number {
  if (candidateIds.length === 0) throw new Error("pickWinner requires at least one candidate");
  const idx = Math.min(candidateIds.length - 1, Math.floor(rng() * candidateIds.length));
  return candidateIds[idx]!;
}
