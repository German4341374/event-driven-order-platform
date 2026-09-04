# syntax=docker/dockerfile:1.19
FROM node:24.20.0-alpine3.23 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json eslint.config.js vitest.config.ts .prettierrc.json ./
COPY src ./src
RUN npm run build

FROM node:24.20.0-alpine3.23 AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24.20.0-alpine3.23 AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app -g 10001 && adduser -S app -u 10001 -G app
COPY --from=production-dependencies --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./
COPY --chown=app:app database ./database
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -q -O - http://127.0.0.1:8080/health/live || exit 1
CMD ["node", "dist/main.js"]
