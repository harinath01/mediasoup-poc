# syntax=docker/dockerfile:1

FROM node:22-bookworm AS build

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

COPY server/package.json server/pnpm-lock.yaml ./server/
RUN pnpm --dir server install --frozen-lockfile

COPY client/package.json client/pnpm-lock.yaml ./client/
RUN pnpm --dir client install --frozen-lockfile

COPY server ./server
COPY client ./client

RUN pnpm --dir client build && pnpm --dir server build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001

WORKDIR /app

# mediasoup's worker needs the shared libraries supplied by Debian.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home app

COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

USER app
EXPOSE 3001
CMD ["node", "server/dist/server.js"]
