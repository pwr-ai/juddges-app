# Dependencies stage
FROM node:24-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies fresh from package.json
# Using npm install (not ci) because this is a workspace sub-project without its own lockfile
# Use --no-cache in docker build to force completely fresh npm install
RUN npm cache clean --force && npm install --legacy-peer-deps

# Build stage
FROM node:24-alpine AS builder
WORKDIR /app

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

# Production stage
FROM node:24-alpine AS runner

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

# Copy runtime configuration script
# This script generates public/env-config.js with runtime environment variables
# allowing configuration changes without rebuilding the Docker image
COPY --chown=nextjs:nodejs docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

# Switch to non-root user for security
USER nextjs

# Expose the port the app runs on
EXPOSE 3006

# Start the application using the entrypoint script
# The entrypoint generates runtime config, then starts Next.js server
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"] 