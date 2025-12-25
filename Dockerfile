# ----------- Stage 1: Dependencies -----------
FROM node:20-slim AS deps

WORKDIR /app

# Install build dependencies for canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only the dependency files to take advantage of the cache
COPY package.json package-lock.json ./

# Install all dependencies (prod + dev)
RUN npm ci

# ----------- Stage 2: Build -----------
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependencies already installed
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json

# Copy the rest of the source code
COPY . .

# Build NestJS (ts -> dist)
RUN npm run build

# ----------- Stage 3: Production Runner -----------
FROM node:20-slim AS runner

WORKDIR /app

# Install runtime dependencies for canvas and netcat
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Copy only the files needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY data-source.prod.js ./

# Reinstall only production dependencies
RUN npm ci --omit=dev

EXPOSE 3000

COPY entrypoint.sh ./entrypoint.sh
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
