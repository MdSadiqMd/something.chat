# Build context: repo root (something.chat/)
FROM node:22-slim

RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests for layer-cached install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/examples/package.json ./packages/examples/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy all source needed at runtime
COPY packages/sdk/src ./packages/sdk/src
COPY apps/web ./apps/web

WORKDIR /app/apps/web

EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
