import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  return {
    // jsx-loc injects data-loc source attributes onto every JSX element for the
    // visual editor. That's a dev-only convenience — keep it out of the shipped
    // bundle and production DOM.
    plugins: [
      react(),
      tailwindcss(),
      ...(mode === "development" ? [jsxLocPlugin()] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "client"),
    publicDir: path.resolve(import.meta.dirname, "client", "public"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Split stable vendor libs into their own long-cache chunks so ordinary
          // app-code redeploys don't invalidate them. Function form only buckets
          // modules actually present in the graph, so it's safe if a package isn't
          // imported.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react-vendor";
            if (id.includes("@radix-ui")) return "radix-vendor";
            if (id.includes("@tanstack") || id.includes("@trpc") || id.includes("superjson")) return "data-vendor";
          },
        },
      },
    },
    server: {
      host: true,
      allowedHosts: ["localhost", "127.0.0.1"],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
