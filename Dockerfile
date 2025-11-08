# Multi-stage build for smaller production image
FROM node:18-alpine AS builder

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for TypeScript build)
RUN npm ci

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Create logs directory with proper permissions
# Note: Logs directory will be mounted as volume, so we just ensure it exists
RUN mkdir -p logs

# Switch to non-root user for security
USER node

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3006/health || exit 1

# Start application
CMD ["node", "dist/index.js"]

