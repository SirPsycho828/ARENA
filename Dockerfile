FROM node:22-slim

WORKDIR /app

COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

COPY server/ ./server/
COPY shared/ ./shared/
COPY client/dist/ ./client/dist/

ENV NODE_ENV=production

CMD ["npx", "--prefix", "server", "tsx", "server/src/index.ts"]
