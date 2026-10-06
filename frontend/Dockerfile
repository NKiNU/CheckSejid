# ADR-026 §1: the built frontend, served by Caddy (which also routes the API paths, see ops/Caddyfile).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2
COPY --from=build /app/dist /srv
