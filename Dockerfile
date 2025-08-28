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

# Stage 2: Production Image
FROM public.ecr.aws/docker/library/node:lts-alpine3.22 AS runner

# Install Chromium and its dependencies for Puppeteer to generate HTML and PDF
RUN apk add --no-cache \
    bash \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    ttf-dejavu \
    ttf-liberation \
    font-noto-cjk \
    alsa-lib \
    cups-libs \
    dbus-libs \
    expat \
    fontconfig \
    mesa-gbm \
    glib \
    pango \
    libx11 \
    libxcomposite \
    libxcursor \
    libxdamage \
    libxext \
    libxfixes \
    libxi \
    libxrandr \
    libxrender \
    libxscrnsaver \
    libxtst \
    xdg-utils \
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

# Expose API port
EXPOSE 4030

CMD ["node", "server.js"]
