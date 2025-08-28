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

# Stage 2: Production Image
FROM public.ecr.aws/docker/library/node:lts-alpine3.22 AS runner

# Install Chromium and its dependencies for Puppeteer to generate HTML and PDF
RUN apt-get update \
    && apt-get install -y \
      wget \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libexpat1 \
      libfontconfig1 \
      libgbm1 \
      libgcc1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json & install only prod dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled dist code from builder
COPY --from=builder /app/dist ./dist

# Run as non-root user for safety
RUN useradd -m pptruser \
    && chown -R pptruser /app
USER pptruser

# Expose API port
EXPOSE 4030

CMD ["node", "server.js"]
