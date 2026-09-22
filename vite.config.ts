import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

/**
 * Canonical/OG URLs have to be ABSOLUTE, so index.html carries a
 * `__SITE_ORIGIN__` placeholder this resolves at build time, and robots.txt and
 * sitemap.xml are emitted from the same one resolved value.
 *
 * Deliberately NOT Vite's built-in `%VITE_FOO%` HTML substitution: that ships the
 * placeholder verbatim when the variable is unset. main.tsx records what that cost
 * last time — an un-substituted `%VITE_ANALYTICS_ENDPOINT%` fired a 404 at our own
 * origin on every page load. An un-substituted canonical URL is worse than a 404:
 * it points every crawler and every LINE preview at an address that does not exist.
 * So the origin resolves through a fallback here and the placeholder can never ship.
 */
function seoOriginPlugin(origin: string) {
  return {
    name: "lunch-wheel-seo-origin",
    transformIndexHtml(html: string) {
      return html.replaceAll("__SITE_ORIGIN__", origin);
    },
    generateBundle(this: { emitFile: (f: { type: "asset"; fileName: string; source: string }) => void }) {
      // `/join/:token` is a CAPABILITY URL — the token is a nanoid(16) bearer
      // credential and anyone holding it joins the wheel, so it must never be
      // indexed. `/app` is behind Google sign-in and renders nothing to a crawler.
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: [
          "User-agent: *",
          "Allow: /",
          "Disallow: /join/",
          "Disallow: /app",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n"),
      });
      // Only `/` is listed. A shared wheel at /w/:id is a real public page, but
      // until the crawler-facing meta is server-rendered every one of them serves
      // the same empty shell, so listing them would submit duplicates of one page.
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          "  <url>",
          `    <loc>${origin}/</loc>`,
          "    <changefreq>weekly</changefreq>",
          "    <priority>1.0</priority>",
          "  </url>",
          "</urlset>",
          "",
        ].join("\n"),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Trailing slash stripped so `${origin}/sitemap.xml` can never double up.
  const env = loadEnv(mode, path.resolve(import.meta.dirname), "");
  const siteOrigin = (env.VITE_SITE_ORIGIN || "https://lunch-spin-beige.vercel.app").replace(/\/+$/, "");

  return {
    // jsx-loc injects data-loc source attributes onto every JSX element for the
    // visual editor. That's a dev-only convenience — keep it out of the shipped
    // bundle and production DOM.
    plugins: [
      react(),
      tailwindcss(),
      seoOriginPlugin(siteOrigin),
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
