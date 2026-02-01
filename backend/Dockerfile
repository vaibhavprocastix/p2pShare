FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Expose WebSocket port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8081', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Run as non-root user
USER node

# Start server
CMD ["node", "server.js"]