# ----------- Stage 1: Dependencies -----------
FROM node:20-alpine AS deps

WORKDIR /app

# Copie uniquement les fichiers de dépendances pour tirer profit du cache
COPY package.json package-lock.json ./

# Installe toutes les dépendances (prod + dev)
RUN npm ci

# ----------- Stage 2: Build -----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copie les deps déjà installées
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json

# Copie le reste du code source
COPY . .

# Build NestJS (ts -> dist)
RUN npm run build

# ----------- Stage 3: Production Runner -----------
FROM node:20-alpine AS runner

WORKDIR /app

# Copie uniquement les fichiers nécessaires
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Réinstalle uniquement les dépendances de production
RUN npm ci --omit=dev

EXPOSE 3000

CMD ["node", "dist/main"]
