import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the user has asked for reduced motion.
 *
 * CSS handles the declarative half of this (see the `prefers-reduced-motion`
 * block in index.css), but the spin is driven from JavaScript: the wheel's
 * camera, its per-label blur and the winner's unroll are all computed in a rAF
 * loop, and a media query cannot reach any of them. Under reduced motion the
 * spin resolves in 400ms with no zoom, no blur and no unroll — the result is
 * identical, only the theatre is dropped.
 *
 * Reads the match synchronously on first render so nothing animates for one
 * frame before the preference is noticed, and subscribes so a user changing the
 * setting mid-session is honoured without a reload.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    setReduced(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export default useReducedMotion;
