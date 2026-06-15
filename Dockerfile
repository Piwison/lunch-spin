# Portable production image (works on Fly.io, a VPS, Render-as-Docker, etc.).
# Build: docker build -t lunch-wheel .
# Run:   docker run -p 3000:3000 --env-file .env lunch-wheel
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
# Install deps from the lockfile (node_modules is .dockerignored, so this is clean).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/index.js"]
