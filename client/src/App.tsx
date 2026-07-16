import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import BrandLoader from "./components/BrandLoader";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Code-split the heavier, behind-the-action routes so the landing page ships a
// lean first-load bundle. Home stays eager — it's the entry paint.
const WheelApp = lazy(() => import("./pages/WheelApp"));
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

/** Toasts follow the active theme and use the same warm tokens as the app. */
function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      toastOptions={{
        duration: 3000,
        style: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
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
