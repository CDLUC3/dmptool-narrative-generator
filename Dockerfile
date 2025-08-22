# Use an official Node image with Debian/Ubuntu (needed for Chrome deps)
FROM node:20-slim

# Install dependencies for Chromium
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

# Set working directory
WORKDIR /app

# Install deps first
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Run as non-root user for safety
RUN useradd -m pptruser \
    && chown -R pptruser /app
USER pptruser

# Expose API port
EXPOSE 3000

CMD ["node", "server.js"]
