import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Static-ish lists (wheels, restaurants, tags, history) were refetching on
      // every mount and every window focus (React Query's default staleTime is 0).
      // Give them a short freshness window and stop the focus refetch. Realtime
      // queries set their own refetchInterval, which is independent of staleTime,
      // so shared-wheel polling is unaffected; the notifications query keeps its
      // explicit refetchOnWindowFocus:true override.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Register the PWA service worker (production only — avoids stale caches in dev).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Analytics, injected only when configured. This used to be a literal
// <script src="%VITE_ANALYTICS_ENDPOINT%/umami"> in index.html, which shipped
// un-substituted when the env vars were unset — firing a 404 request at our own
// origin on every page load. Appended after load so it never delays first paint.
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
if (analyticsEndpoint?.startsWith("http") && analyticsWebsiteId) {
  window.addEventListener("load", () => {
    const s = document.createElement("script");
    s.defer = true;
    s.src = `${analyticsEndpoint.replace(/\/$/, "")}/umami`;
    s.dataset.websiteId = analyticsWebsiteId;
    document.body.appendChild(s);
  });
}
