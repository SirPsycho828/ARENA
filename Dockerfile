FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
ENV NODE_OPTIONS="--max-old-space-size=384"
RUN npm ci --maxsockets 2
COPY client/ ./
COPY shared/ ../shared/
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
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["npx", "--prefix", "server", "tsx", "src/index.ts"]
