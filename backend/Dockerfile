# ADR-026 §1: the API image. Dev dependencies are installed on purpose: `npm start` runs tsx, and
# `prisma migrate deploy` runs from this image during deploys.
FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci && npm cache clean --force
COPY src ./src
COPY tsconfig.json ./
ENV NODE_ENV=production
# ADR-031 §6: mount point of the erasure-keys volume; a new named volume inherits this ownership.
RUN mkdir -p /var/lib/masyarakat/erasure-keys && chown node:node /var/lib/masyarakat/erasure-keys && chmod 700 /var/lib/masyarakat/erasure-keys
USER node
EXPOSE 3000
CMD ["npm", "start"]
