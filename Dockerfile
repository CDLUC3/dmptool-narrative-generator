# Stage 1: Builder
FROM public.ecr.aws/docker/library/node:lts-slim AS builder

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
FROM public.ecr.aws/docker/library/node:lts-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    nodejs \
    npm \
    ca-certificates \
    fonts-freefont-ttf \
    fonts-dejavu \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json & install only prod dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled dist code from builder
COPY --from=builder /app/dist ./dist

# Create non-root user and group in Debian slim
RUN groupadd -r pptrgroup && useradd -r -g pptrgroup -m pptruser \
    && chown -R pptruser:pptrgroup /app

USER pptruser

# Puppeteer-managed Chrome
RUN npx puppeteer browsers install chrome
ENV PUPPETEER_EXECUTABLE_PATH=/home/pptruser/.cache/puppeteer/chrome/linux_arm-*/chrome-linux64/chrome

# Expose API port
EXPOSE 4030

CMD ["node", "dist/server.js"]
