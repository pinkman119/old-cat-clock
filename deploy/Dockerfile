# syntax=docker/dockerfile:1
# 构建上下文为仓库根目录：docker build -f deploy/Dockerfile .

FROM node:20-alpine AS builder
ARG NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates
COPY . .
# 跳过 Electron 二进制下载（镜像内只构建服务端与后台），其余 postinstall 正常执行
RUN npm config set registry "$NPM_REGISTRY" \
 && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
RUN npm run build:shared \
 && npm run build -w @maomao/server \
 && npm run build -w @maomao/admin \
 && npx prisma generate --schema apps/server/prisma/schema.prisma

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    MAOMAO_SERVER_PORT=3000 \
    MAOMAO_ADMIN_DIST=/app/admin-dist \
    MAOMAO_ADMIN_USERNAME=huimin \
    MAOMAO_ADMIN_PASSWORD=20001024
RUN apk add --no-cache openssl ca-certificates
COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/admin/dist ./admin-dist
COPY deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
COPY deploy/reset-db.cjs /app/deploy/reset-db.cjs
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
