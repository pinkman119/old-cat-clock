#!/bin/sh
set -eu
cd /app

# 首次部署自动建表，后续部署幂等跳过
./node_modules/.bin/prisma migrate deploy --schema apps/server/prisma/schema.prisma

exec node apps/server/dist/main.js
