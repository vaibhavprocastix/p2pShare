# ---- p2pShare signaling server image ----
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy application source
COPY server.js ./
COPY config.js ./
COPY api.js ./
COPY turn.js ./
COPY .env ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Basic container-level healthcheck hitting the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

USER node
CMD ["node", "server.js"]
