# Stage 1: Builder
FROM public.ecr.aws/docker/library/node:lts-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    nodejs \
    npm \
    chromium \
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

# Install all deps
COPY package*.json ./
RUN npm ci

# Expose API port
EXPOSE 4030

CMD ["npm", "run", "dev"]
