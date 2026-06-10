import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import WheelApp from "./pages/WheelApp";
import JoinWheel from "./pages/JoinWheel";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/app" component={WheelApp} />
      <Route path="/app/:wheelId" component={WheelApp} />
      <Route path="/join/:token" component={JoinWheel} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.12 0.025 260)",
                border: "1px solid oklch(0.25 0.03 260)",
                color: "oklch(0.95 0.01 260)",
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
