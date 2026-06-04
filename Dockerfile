FROM node:22-slim

# Install Chromium for Puppeteer + ffmpeg
RUN apt-get update && apt-get install -y \
  chromium fonts-liberation libnss3 libatk-bridge2.0-0 \
  libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 \
  ffmpeg python3 make g++ \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

COPY server/ ./server/
COPY shared/ ./shared/
COPY client/dist/ ./client/dist/

ENV NODE_ENV=production

CMD ["npx", "--prefix", "server", "tsx", "server/src/index.ts"]
