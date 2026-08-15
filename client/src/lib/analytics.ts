/**
 * Product events, for questions the codebase can't answer on its own — chiefly
 * "does anyone actually finish onboarding?". Without this the first-run
 * redesign is an opinion.
 *
 * Rides on the umami script main.tsx already injects when
 * VITE_ANALYTICS_ENDPOINT / VITE_ANALYTICS_WEBSITE_ID are set. When they aren't
 * — local dev, and any deploy that hasn't configured them — `window.umami` is
 * simply absent and every call here is a no-op. Never throws: a broken or
 * blocked analytics script must not take a user flow down with it.
 */

type Props = Record<string, string | number | boolean>;

interface UmamiGlobal {
  track?: (event: string, props?: Props) => void;
}

/**
 * Record a product event. Fire-and-forget by design — callers never await it
 * and never branch on it.
 *
 * The events that matter for first-run, in order:
 *   onboarding_started        — "Use my location" tapped
 *   onboarding_places_found   — the search came back (with a count)
 *   onboarding_wheel_created  — a real wheel now exists
 *   first_spin_completed      — THE activation metric
 */
export function track(event: string, props?: Props): void {
  try {
    const umami = (window as unknown as { umami?: UmamiGlobal }).umami;
    umami?.track?.(event, props);
  } catch {
    // Analytics is never load-bearing.
  }
}
