# --- Stage 1: Install dependencies ---
FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Stage 2: Build the application ---
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- Stage 3: Production runtime ---
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3030
ENV HOSTNAME=0.0.0.0

# Copy standalone server
COPY --from=builder /app/.next/standalone ./
# Copy static assets (not included in standalone)
COPY --from=builder /app/.next/static ./.next/static
# Copy public assets if they exist
COPY --from=builder /app/public ./public

# Create data directory for SQLite + LanceDB (will be volume-mounted)
RUN mkdir -p /app/data

EXPOSE 3030

CMD ["node", "server.js"]
