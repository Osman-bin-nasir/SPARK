# Multi-stage Dockerfile for SPARK full-stack application

# ============================================================================
# Stage 1: Build Client
# ============================================================================
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copy package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY client/ ./

# Build the React app with Vite
RUN npm run build

# ============================================================================
# Stage 2: Production Server
# ============================================================================
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy server package files
COPY server/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy server source code
COPY server/src ./src

# Copy built client from stage 1
COPY --from=client-builder /app/client/dist ./public

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Apply pending migrations before starting the server. This keeps a fresh
# Compose database from failing the application's startup readiness check.
CMD ["sh", "-c", "npm run migrate && exec node src/server.js"]
