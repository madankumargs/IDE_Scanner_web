# syntax=docker/dockerfile:1
# Build context is the parent workspace directory (/home/akprajwal/VScode), e.g.:
#   docker build -f ide-scanner-web/Dockerfile -t ide-scanner-web .
# The app needs the sibling ./ide-scanner Python scanner at runtime (lib/pythonBridge.ts).

# ---------- deps: install node_modules (dev deps included; build needs them) ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /app/ide-scanner-web
COPY ide-scanner-web/package.json ide-scanner-web/package-lock.json ./
RUN npm ci

# ---------- build: compile Next.js standalone output ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app/ide-scanner-web
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/ide-scanner-web/node_modules ./node_modules
COPY ide-scanner-web ./
RUN npm run build

# ---------- runtime: slim image, non-root, standalone server ----------
FROM node:24-bookworm-slim AS runtime

# Python + yara are runtime dependencies of the scanner bridge, not the web app build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv yara ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/ide-scanner-venv \
  && /opt/ide-scanner-venv/bin/pip install --no-cache-dir semgrep==1.164.0

WORKDIR /app/ide-scanner-web

# Scanner sources (read-only for the app user is fine).
COPY ide-scanner /app/ide-scanner

# Standalone output: server.js lives at the root of .next/standalone because
# next.config.ts pins the tracing root to the app directory. Per Next.js docs,
# .next/static and public/ are not bundled and must be copied alongside it.
COPY --from=build --chown=node:node /app/ide-scanner-web/.next/standalone ./
COPY --from=build --chown=node:node /app/ide-scanner-web/.next/static ./.next/static
COPY --from=build --chown=node:node /app/ide-scanner-web/public ./public

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8765 \
    HOSTNAME=0.0.0.0 \
    IDE_SCANNER_ROOT=/app/ide-scanner \
    IDE_SCANNER_PYTHON=/opt/ide-scanner-venv/bin/python \
    IDE_SCANNER_REQUIRE_PROVIDERS=semgrep,yara \
    PATH="/opt/ide-scanner-venv/bin:${PATH}"

USER node

EXPOSE 8765

# /api/internal/launch-health requires a secret, so probe the public root instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8765/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
