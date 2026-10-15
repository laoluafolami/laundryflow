# ---- Stage 1: build the React frontend ----
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: install only production API dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev

# ---- Stage 3: small final image (runs as non-root user) ----
FROM node:20-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
COPY --from=web /web/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "src/index.js"]
