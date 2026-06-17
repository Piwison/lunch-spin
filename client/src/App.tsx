import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Code-split the heavier, behind-the-action routes so the landing page ships a
// lean first-load bundle. Home stays eager — it's the entry paint.
const WheelApp = lazy(() => import("./pages/WheelApp"));
const JoinWheel = lazy(() => import("./pages/JoinWheel"));
const GuestWheel = lazy(() => import("./pages/GuestWheel"));
const NotFound = lazy(() => import("./pages/NotFound"));

/** Centered orb fallback while a route chunk loads — matches the app loaders. */
function RouteFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--background)" }}>
      <div
        className="w-12 h-12 rounded-full animate-orb-spin"
        style={{
          background: "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))",
          boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.4)",
        }}
      />
    </div>
  );
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
        style: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
          color: "var(--popover-foreground)",
        },
      }}
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <ThemedToaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
