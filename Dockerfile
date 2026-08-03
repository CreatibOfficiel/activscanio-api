# syntax=docker/dockerfile:1
#
# MushroomBet API production image.
#
# Base MUST stay node:20-slim (Debian/glibc). canvas@3 ships glibc-only
# prebuilds via prebuild-install; switching to Alpine (musl) would miss the
# prebuild and force a full node-gyp source compile of cairo bindings.
#
# Target platform is linux/amd64 (the VPS). Build on the VPS, not on an
# arm64 Mac, or the canvas prebuild will be the wrong architecture.

# ----------- Stage 1: Dependencies (prod + dev, for the build) -----------
FROM node:20-slim AS deps

WORKDIR /app

# Build toolchain + cairo/pango headers. Needed as a fallback: if
# prebuild-install cannot fetch a canvas binary it drops to `node-gyp rebuild`,
# which needs these headers present.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# All dependencies (prod + dev) — nest CLI and typescript live in devDeps.
RUN npm ci

# ----------- Stage 2: Production dependencies only -----------
# Separate stage so the runner does NOT have to re-run `npm ci --omit=dev`.
#
# Choice: we install prod deps once here (in an image that still has the
# cairo/pango headers and build-essential available as a node-gyp fallback),
# then COPY the resulting node_modules into the runner. The runner therefore
# needs no npm install, no compiler, and no dev headers.
#
# We deliberately do NOT copy stage 1's node_modules and prune it — `npm prune
# --omit=dev` leaves behind empty dirs and can strip transitive prod deps that
# were hoisted under a devDependency. A clean `npm ci --omit=dev` from the
# lockfile is the correctness-preserving option, and it reuses the same
# canvas prebuild download, so the cost is small.
FROM node:20-slim AS prod-deps

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# ----------- Stage 3: Build (ts -> dist) -----------
FROM node:20-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

COPY . .

# Produces dist/src/main.js (NOT dist/main.js — package.json's `start:prod`
# script is stale and points at the wrong path. Do not use it.)
RUN npm run build

# ----------- Stage 4: Production runner -----------
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Runtime shared libraries for canvas, plus:
#   netcat-openbsd -> entrypoint.sh waits on the DB with `nc -z`
#   curl           -> HEALTHCHECK below
#
# FONTS — DO NOT REMOVE fontconfig / fonts-liberation.
#
# This is about reproducibility, NOT about fixing broken text. Text rendering
# already works on the current base image, which happens to ship a handful of
# fonts and fontconfig.
#
# The reason we pin a font anyway: canvas-image.service.ts and
# share-image.service.ts set `ctx.font` at 30 call sites (11 + 19), and every
# single one names "Arial" — including `bold` and `italic` variants. Neither
# service ever calls registerFont(), so resolution goes through fontconfig.
# Arial is a Microsoft font that is not redistributable on Debian and is NOT
# present, so cairo silently substitutes whatever else it can find. The
# layouts were designed against Arial metrics, so an arbitrary substitute can
# wrap or overflow differently, and a fallback without a real italic face gets
# a synthesized oblique.
#
# fonts-liberation provides Liberation Sans, which is metric-compatible with
# Arial by design. Installing it makes the substitution deterministic and
# faithful instead of dependent on whatever the base image revision happens to
# carry — that set can change between node:20-slim rebuilds without warning.
# Installing fontconfig explicitly is likewise a pin, not a fix.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    fontconfig \
    fonts-liberation \
    netcat-openbsd \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

# Production node_modules, already built — no npm install in this stage.
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=builder /app/dist ./dist
COPY package.json package-lock.json ./
COPY data-source.prod.js ./
COPY entrypoint.sh ./entrypoint.sh

# Runtime-writable directories.
#   public/images/{profiles,proofs,celebrations} -> real user data, mounted as
#     a named volume in production. Created here so the app also works without
#     a mount, and chowned so the volume inherits node:node ownership on first
#     use (Docker seeds an empty named volume from the image path).
#   uploads/ -> transient multer staging (files are copied out then unlinked).
RUN mkdir -p public/images/profiles public/images/proofs public/images/celebrations uploads \
    && chmod +x entrypoint.sh \
    && chown -R node:node /app

# Drop root. The `node` user (uid 1000) ships with the base image.
USER node

EXPOSE 3000

# /api/ready returns HTTP 200 even when the database is unreachable — it
# reports the failure in the body as {"ready":false}. `curl -f` would treat
# that as healthy, so we must grep the body instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT:-3000}/api/ready" | grep -q '"ready":true' || exit 1

# entrypoint.sh waits for Postgres, runs `typeorm migration:run -d
# data-source.prod.js`, then execs `node dist/src/main.js`. Migrations run
# HERE, not on boot (migrationsRun is false). Never override this with a
# compose-level `command:`.
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
