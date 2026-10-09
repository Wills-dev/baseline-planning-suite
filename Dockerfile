# Build from source and lockfile; host node_modules/dist are excluded by .dockerignore.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/persistence/package.json ./packages/persistence/package.json
COPY apps/shell/package.json ./apps/shell/package.json
COPY apps/people/package.json ./apps/people/package.json
COPY apps/delivery/package.json ./apps/delivery/package.json
RUN npm ci

COPY . .
RUN npm run build:packages \
    && npm run build --workspace @baseline/shell \
    && BASELINE_PUBLIC_BASE=/people/ npm run build --workspace @baseline/people \
    && BASELINE_PUBLIC_BASE=/delivery/ npm run build --workspace @baseline/delivery \
    && test -s apps/people/dist/remoteEntry.js \
    && test -s apps/delivery/dist/remoteEntry.js

FROM nginx:1.28-alpine AS runtime
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY deployment/runtime/ /etc/baseline-runtime/
COPY --from=builder /app/apps/shell/dist/ /usr/share/nginx/html/
COPY --from=builder /app/apps/people/dist/ /usr/share/nginx/html/people/
COPY --from=builder /app/apps/delivery/dist/ /usr/share/nginx/html/delivery/
EXPOSE 80
