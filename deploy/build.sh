#!/usr/bin/env bash
# 本地一键构建 Docker 镜像，并生成完整部署包到 deploy/output
# 用法： bash deploy/build.sh
# Windows 可用 Git Bash / WSL 执行；无 bash 时可用等价的 .\deploy\build.ps1
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
OUT="$DEPLOY_DIR/output"

if ! docker info >/dev/null 2>&1; then
  echo "Docker 未运行，请先启动 Docker" >&2
  exit 1
fi

get_env() {
  local key="$1" file="$DEPLOY_DIR/.env" value=""
  [ -f "$file" ] || file="$DEPLOY_DIR/.env.example"
  if [ -f "$file" ]; then
    value="$(grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2- | tr -d '"\r' | tr -d "'" || true)"
  fi
  printf '%s' "$value"
}

IMAGE_NAME="$(get_env IMAGE_NAME)"
IMAGE_NAME="${IMAGE_NAME:-maomao-clock:0.1.0}"
APP_TAR="maomao-clock.tar"
DB_TAR="postgres-16-alpine.tar"

echo "==> 构建应用镜像 ${IMAGE_NAME}"
NPM_REGISTRY="$(get_env NPM_REGISTRY)"
if [ -n "$NPM_REGISTRY" ]; then
  docker build --build-arg "NPM_REGISTRY=$NPM_REGISTRY" -f "$ROOT/deploy/Dockerfile" --target runtime -t "$IMAGE_NAME" "$ROOT"
else
  docker build -f "$ROOT/deploy/Dockerfile" --target runtime -t "$IMAGE_NAME" "$ROOT"
fi

echo "==> 准备数据库镜像 postgres:16-alpine"
if ! docker image inspect postgres:16-alpine >/dev/null 2>&1; then
  docker pull postgres:16-alpine
fi

mkdir -p "$OUT"
rm -f "$OUT/$APP_TAR" "$OUT/$DB_TAR" "$OUT/docker-compose.yml" "$OUT/deploy.env" "$OUT/.env"

echo "==> 导出镜像与编排配置到 output/"
docker save -o "$OUT/$APP_TAR" "$IMAGE_NAME"
docker save -o "$OUT/$DB_TAR" postgres:16-alpine
cp "$DEPLOY_DIR/docker-compose.yml" "$OUT/docker-compose.yml"
if [ -f "$DEPLOY_DIR/.env" ]; then
  cp "$DEPLOY_DIR/.env" "$OUT/deploy.env"
else
  cp "$DEPLOY_DIR/.env.example" "$OUT/deploy.env"
  echo "提示：未找到 deploy/.env，已用 .env.example 生成 output/deploy.env，请在上传前修改密钥与 SERVER_IP。"
fi

echo ""
echo "==> 部署包已生成：$OUT"
ls -lh "$OUT"
echo ""
echo "下一步：把 deploy/deploy.sh 与 deploy/output/ 整个目录上传到服务器同一层级，"
echo "       编辑 output/deploy.env（SERVER_IP、MAOMAO_JWT_SECRET、HOST_PORT），执行 ./deploy.sh"
