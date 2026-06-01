FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY shared/ ./shared/
COPY .env* ./
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["npx", "--prefix", "server", "tsx", "src/index.ts"]
