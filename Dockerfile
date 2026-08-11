# Build stage - shared
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install all dependencies
RUN npm ci --ignore-scripts

# Build shared
FROM base AS build-shared
COPY packages/shared ./packages/shared
RUN npm run build -w packages/shared

# Build client
FROM build-shared AS build-client
COPY packages/client ./packages/client
RUN npm run build -w packages/client

# Build server
FROM build-shared AS build-server
COPY packages/server ./packages/server
RUN npm run build -w packages/server

# Production image
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV NODE_OPTIONS="--max-old-space-size=768"

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy only production deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

RUN npm ci --omit=dev --ignore-scripts

# Copy built artifacts
COPY --from=build-server /app/packages/server/dist ./packages/server/dist
COPY --from=build-client /app/packages/client/dist ./packages/client/dist
COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist

# Create audit directory
RUN mkdir -p /app/data/audit && chown nodejs:nodejs /app/data

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-vm-modules", "packages/server/dist/index.js"]
