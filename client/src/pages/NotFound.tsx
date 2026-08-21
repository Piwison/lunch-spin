import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

/**
 * 404. Was the stock template screen — slate gradient, white card, blue button,
 * not a single token — so it was the one page in the app that ignored the theme
 * entirely and rendered a bright white card in dark mode.
 */
export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6" style={{ background: "var(--ground)" }}>
      <div
        className="w-full max-w-lg p-10 text-center"
        style={{ borderRadius: "var(--radius-sheet)", background: "var(--paper)", border: "1px solid var(--border)" }}
      >
        <div className="flex justify-center mb-6">
          <div
            className="w-16 h-16 flex items-center justify-center"
            style={{
              borderRadius: "var(--radius-card)",
              background: "oklch(from var(--brand) l c h / 0.10)",
              border: "1px solid oklch(from var(--brand) l c h / 0.22)",
            }}
          >
            <AlertCircle className="h-7 w-7" style={{ color: "var(--brand-text)" }} />
          </div>
        </div>

        <p className="type-eyebrow mb-2" style={{ color: "var(--brand-text)" }}>404</p>
        <h1 className="type-title mb-4" style={{ color: "var(--ink-warm)" }}>Page not found</h1>
        <p className="type-body mb-8" style={{ color: "var(--body)" }}>
          Sorry, the page you are looking for doesn&apos;t exist. It may have been moved or deleted.
        </p>

        <button
          onClick={() => setLocation("/")}
          className="inline-flex items-center justify-center gap-2 px-8 transition-colors active:scale-[var(--press-scale)]"
          style={{
            minHeight: 56,
            borderRadius: "var(--radius-control)",
            background: "var(--brand-solid)",
            color: "var(--on-accent)",
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "0.05em",
          }}
        >
          <Home className="w-4 h-4" />
          Go home
        </button>
      </div>
    </div>
  );
}
