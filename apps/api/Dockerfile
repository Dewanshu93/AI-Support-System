# Build context: repository root (see docker-compose.yml).
FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --include-workspace-root --workspace @sd/shared --workspace @sd/api
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @sd/shared && npm run build -w @sd/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @sd/shared --workspace @sd/api
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY config config
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
