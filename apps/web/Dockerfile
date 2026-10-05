# Build context: repository root (see docker-compose.yml).
FROM node:24-alpine
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --include-workspace-root --workspace @sd/shared --workspace @sd/web
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN npm run build -w @sd/shared && npm run build -w @sd/web
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@sd/web"]
