# ---------- build stage ----------
FROM node:20-alpine AS builder
WORKDIR /usr/src/app

# Install build deps needed for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /usr/src/app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN apk add --no-cache curl

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY workers ./workers
COPY migrations ./migrations
COPY scripts ./scripts
COPY views ./views
COPY public ./public
COPY swagger.yaml ./

RUN chown -R appuser:appgroup /usr/src/app
USER appuser

EXPOSE 3000

# Default command; the worker service overrides this in docker-compose
CMD ["node", "src/server.js"]
