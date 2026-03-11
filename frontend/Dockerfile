# ==============================================================================
# Unified Frontend Dockerfile with Multi-Stage Build
# ==============================================================================
# This Dockerfile supports both development and production builds using targets:
#   - development: Hot reload, npm run dev, port 3000
#   - production: Optimized standalone build, port 3006
#
# Usage:
#   Development: docker build --target development -t frontend:dev .
#   Production:  docker build --target production -t frontend:prod .
# ==============================================================================

# ==============================================================================
# Base Stage - Common Setup
# ==============================================================================
FROM node:24-alpine AS base
WORKDIR /app

# ==============================================================================
# Development Target
# ==============================================================================
FROM base AS development

# Use the existing 'node' user which has UID 1000
# This matches the host user UID for proper file permissions in development

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies as root, then fix ownership
RUN npm install --legacy-peer-deps && \
    chown -R node:node /app

# Copy the rest of the application
COPY --chown=node:node . .

# Create .next directory
RUN mkdir -p .next && chown -R node:node .next

# Switch to node user for runtime
USER node

# Expose the port Next.js runs on
EXPOSE 3000

# Run Next.js in development mode
CMD ["npm", "run", "dev"]

# ==============================================================================
# Dependencies Stage - Production Dependencies Only
# ==============================================================================
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install dependencies fresh from package.json
# Using npm install (not ci) because this is a workspace sub-project without its own lockfile
# Use --no-cache in docker build to force completely fresh npm install
RUN npm cache clean --force && npm install --legacy-peer-deps

# ==============================================================================
# Builder Stage - Production Build
# ==============================================================================
FROM base AS builder

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application files
COPY . .

# Accept build arguments for Next.js public environment variables
# These are passed from docker-compose.yml and sourced from .env file
# Note: NEXT_PUBLIC_* vars must be available at BUILD TIME for Next.js
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

# Convert build args to environment variables for Next.js build process
# Next.js will inline these values into the client-side JavaScript bundle
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Build the application with optimizations
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ==============================================================================
# Production Target - Optimized Runtime
# ==============================================================================
FROM node:24-alpine AS production

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy only production dependencies (optimization)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy necessary files from builder stage
# Copy the standalone server files from the nested app directory
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/app/server.js ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/app/node_modules ./node_modules
# Copy static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy public files
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy runtime configuration scripts
# docker-entrypoint.sh generates public/env-config.js with runtime environment variables
# patch-env.js replaces empty build-time NEXT_PUBLIC_* values in the JS bundle
COPY --chown=nextjs:nodejs docker-entrypoint.sh patch-env.js ./
RUN chmod +x docker-entrypoint.sh

# Switch to non-root user for security
USER nextjs

# Expose the port the app runs on
EXPOSE 3006

# Start the application using the entrypoint script
# The entrypoint generates runtime config, then starts Next.js server
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
