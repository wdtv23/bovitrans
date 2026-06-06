# =============================================================================
# BoviTrans — Dockerfile multi-stage para Next.js (App Router, output standalone)
# Requiere en next.config.js:  output: 'standalone'
# =============================================================================

# ---- 1. Dependencias --------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- 2. Build ---------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 3. Runtime (imagen final liviana) --------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Usuario sin privilegios por seguridad.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# El build standalone copia solo lo necesario para correr.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
