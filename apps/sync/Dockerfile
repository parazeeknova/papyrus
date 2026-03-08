FROM oven/bun:1.3.10 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock turbo.json ./
COPY apps/sync/package.json apps/sync/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/logs/package.json packages/logs/package.json
RUN bun install --frozen-lockfile --ignore-scripts

FROM install AS builder
COPY apps/sync apps/sync
COPY packages/core packages/core
COPY packages/logs packages/logs
RUN bun run --cwd apps/sync build

FROM oven/bun:1.3.10 AS runner
WORKDIR /app/apps/sync
ENV NODE_ENV=production
COPY --from=builder /app/apps/sync/dist ./dist
EXPOSE 3001
CMD ["bun", "./dist/index.js"]
