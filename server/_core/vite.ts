import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  // Let Vite READ vite.config.ts rather than spreading its default export.
  // That export is `defineConfig(({ mode }) => ({ ... }))` — a FUNCTION — and
  // `{ ...aFunction }` is `{}`, because functions have no own enumerable
  // properties. So the old `{ ...viteConfig, configFile: false }` handed Vite
  // an empty object: no `root` (so it defaulted to the repo root instead of
  // `client/`), no `@`/`@shared`/`@assets` aliases, and none of the three
  // plugins — React, Tailwind, jsx-loc. `/src/main.tsx` resolved to nothing,
  // fell through to the SPA fallback below, and came back as index.html, which
  // the browser rejected with "Expected a JavaScript-or-Wasm module script but
  // the server responded with a MIME type of text/html".
  //
  // Pointing at the file also means the dev server and `vite build` can no
  // longer disagree: both now interpret the same config the same way, instead
  // of dev quietly running on defaults.
  const vite = await createViteServer({
    configFile: path.resolve(import.meta.dirname, "../..", "vite.config.ts"),
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "../..", "dist", "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
