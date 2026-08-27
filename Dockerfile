FROM node:24-alpine AS build

WORKDIR /app

COPY package.json ./
COPY scripts ./scripts
COPY index.html styles.css app.js free-text-parser.js ./

RUN npm run build:pages

FROM caddy:2.10.2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80 443 443/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

