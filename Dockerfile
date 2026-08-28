FROM node:24-alpine

ARG APP_VERSION=dev

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    APP_VERSION=${APP_VERSION}

COPY package.json ./
COPY index.html styles.css app.js free-text-parser.js ./
COPY server ./server

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4173/api/health || exit 1

CMD ["node", "server/index.js"]
