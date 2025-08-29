# Stage 1: Builder
FROM public.ecr.aws/docker/library/node:lts-alpine3.22 AS builder

WORKDIR /app

# Install all deps including devDependencies so we can compile TS
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build   # should output to dist/

# Remove all the unecessary test and mock files from the distribution
RUN rm -rf dist/__tests__ \
           dist/__mocks__ \
           dist/**/__tests__ \
           dist/**/__mocks__

# Stage 2: Production Image (Chromium)
FROM public.ecr.aws/z8o9m4l5/selenium/standalone-chrome:4.35.0 AS runner

# Install font helpers to support non-ascii characters
RUN apk add --no-cache \
    bash \
    freetype \
    ttf-freefont \
    ttf-dejavu \
    ttf-liberation \
    font-noto-cjk \
  && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package.json & install only prod dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled dist code from builder
COPY --from=builder /app/dist ./dist

# Run as non-root user for safety
# Create non-root user and group in Alpine
RUN addgroup -S pptrgroup && adduser -S pptruser -G pptrgroup \
    && chown -R pptruser:pptrgroup /app

USER pptruser

# Install Chrome
RUN npx puppeteer browsers install chrome

# Expose API port
EXPOSE 4030

CMD ["node", "dist/server.js"]
