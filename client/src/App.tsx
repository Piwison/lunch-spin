import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { observeLiquidGlass } from "./lib/liquidGlass";
import BrandLoader from "./components/BrandLoader";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import WheelApp from "./pages/WheelApp";

// WheelApp is imported STATICALLY, not lazily. It is the app — a signed-in user
// reloading /app is the hot path, and as a lazy chunk its ~220 KB could only start
// downloading after the entry bundle had been fetched AND parsed and the router had
// matched, adding a serial round trip to every reload. Static means it joins the
// entry's modulepreload graph and streams in parallel with the vendor chunks.
// The genuinely rare routes below stay lazy.
const JoinWheel = lazy(() => import("./pages/JoinWheel"));
const GuestWheel = lazy(() => import("./pages/GuestWheel"));
const NotFound = lazy(() => import("./pages/NotFound"));

/** Route-chunk fallback — same brand loader as the auth/wheel-loading phases so
 *  the first-load sequence is one continuous spinner, not a series of swaps. */
function RouteFallback() {
  return <BrandLoader fullscreen />;
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/app" component={WheelApp} />
        <Route path="/app/:wheelId" component={WheelApp} />
        <Route path="/w/:wheelId" component={GuestWheel} />
        <Route path="/join/:token" component={JoinWheel} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

/**
 * Toasts follow the active theme and use the same warm tokens as the app.
 *
 * They are glass, and they are the clearest case for it in the product: a toast
 * always appears OVER something — a list of places, a run of history — which is
 * the one condition the material needs. They used to be `--popover` with a 1px
 * border, i.e. a solid card, which is why the alert screen was the example given
 * of "this is not liquid glass".
 */
function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      closeButton
      toastOptions={{
        duration: 3000,
        className: "glass-card",
        // Sonner writes its own background/border inline unless they are cleared
        // here, and an opaque fill on top of the glass recipe would win.
        style: {
          background: "var(--glass-card-bg)",
          border: "0",
          color: "var(--popover-foreground)",
        },
      }}
    />
  );
}

// Shared/guest links (a public wheel, a team invite) should render the same
// for every visitor rather than following their OS/localStorage preference —
// forced light, no toggle. Keying the provider on this switch (instead of
// nesting a second one) means only one ThemeProvider ever touches the shared
// <html> classList, so there's no race between an outer and inner instance.
function isSharedRoute(path: string) {
  return path.startsWith("/w/") || path.startsWith("/join/");
}

function App() {
  const [location] = useLocation();
  const locked = isSharedRoute(location);

  // One observer for the whole document: every surface marked `data-lens` (or
  // `.lens`) gets a refracting edge sized to its own box, including the ones
  // that render through portals into a container the tree cannot reach.
  useEffect(() => observeLiquidGlass(), []);

  return (
    <ErrorBoundary>
      <ThemeProvider key={locked ? "locked-light" : "normal"} defaultTheme="light" switchable={!locked}>
        <TooltipProvider>
          <ThemedToaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
