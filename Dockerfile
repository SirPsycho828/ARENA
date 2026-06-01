FROM node:22-alpine
WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY shared/ ./shared/
COPY client/dist/ ./client/dist/

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["npx", "--prefix", "server", "tsx", "src/index.ts"]
