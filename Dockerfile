# ----------- Stage 1: Dependencies -----------
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only the dependency files to take advantage of the cache
COPY package.json package-lock.json ./

# Install all dependencies (prod + dev)
RUN npm ci

# ----------- Stage 2: Build -----------
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS runner

WORKDIR /app

# Copy only the files needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Reinstall only production dependencies
RUN npm ci --omit=dev
RUN apk add --no-cache netcat-openbsd bash

EXPOSE 3000

COPY entrypoint.sh ./entrypoint.sh
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
