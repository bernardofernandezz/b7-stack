# syntax=docker/dockerfile:1
# Targets: `migrate` applies Drizzle migrations and exits; `runtime` serves the app on :3000. See compose.yaml.

FROM node:26-alpine AS base
# Node 25+ no longer ships corepack. Keep in sync with package.json "packageManager".
RUN npm install -g pnpm@12.16.1
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The store lives in a cache mount, so the layer holds only node_modules.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --prod --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm run build

FROM build AS migrate
CMD ["pnpm", "run", "db:migrate"]

# No pnpm here: the image only needs node, production dependencies and the build output.
FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=12 CMD wget -qO /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "node_modules/srvx/bin/srvx.mjs", "serve", "--prod", "--entry", "dist/server/server.js", "--static", "../client", "--port", "3000"]
