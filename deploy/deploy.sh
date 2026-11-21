#!/bin/sh
# 服务器一键部署：加载镜像并启动全部服务
#
# 支持两种上传布局：
#   A. ./deploy.sh + ./output/{maomao-clock.tar, postgres-16-alpine.tar, docker-compose.yml, deploy.env}
#   B. 全部文件平铺在同一目录（deploy.sh 与上述 4 个文件同级）
#
# 用法： sh deploy.sh      或  bash deploy.sh      或  chmod +x deploy.sh && ./deploy.sh
#       sh deploy.sh --reset-db   # 额外清空数据，只保留 huimin / 20001024
set -eu

BASE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$BASE/output/maomao-clock.tar" ]; then
  OUT="$BASE/output"
else
  OUT="$BASE"
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker 未运行，请先启动 Docker" >&2
  exit 1
fi

for f in "$OUT/maomao-clock.tar" "$OUT/postgres-16-alpine.tar" "$OUT/docker-compose.yml" "$OUT/deploy.env"; do
  if [ ! -f "$f" ]; then
    echo "缺少文件：$f" >&2
    echo "请把镜像与配置文件放在 deploy.sh 同目录，或同目录的 output/ 子目录中" >&2
    exit 1
  fi
done

COMPOSE_ENV_FILE="$OUT/deploy.env"
COMPOSE_FILE="$OUT/docker-compose.yml"

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "未找到 docker compose / docker-compose，请先安装：apt-get install -y docker-compose-plugin" >&2
  exit 1
fi

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose --project-name maomao-clock --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker-compose --project-name maomao-clock --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
  fi
}

echo "==> 加载镜像（无需联网构建）"
docker load -i "$OUT/maomao-clock.tar"
docker load -i "$OUT/postgres-16-alpine.tar"

echo "==> 启动服务"
compose up -d

echo "==> 等待健康检查"
status="starting"
i=0
while [ "$i" -lt 30 ]; do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' maomao-clock-server 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  sleep 2
  i=$((i + 1))
done
if [ "$status" != "healthy" ]; then
  echo "服务未就绪，请查看日志：docker logs maomao-clock-server" >&2
  exit 1
fi

if [ "${1:-}" = "--reset-db" ]; then
  echo "==> 清空业务数据，仅保留 huimin / 20001024"
  compose exec -T server node /app/deploy/reset-db.cjs
  compose restart server
fi

get_env() {
  key="$1"
  value="$(grep -E "^${key}=" "$COMPOSE_ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"\r' | tr -d "'" || true)"
  printf '%s' "$value"
}

port="$(get_env HOST_PORT)"; port="${port:-3000}"
ip="$(get_env SERVER_IP)"; ip="${ip:-<服务器公网IP>}"
user="$(get_env MAOMAO_ADMIN_USERNAME)"; user="${user:-huimin}"
pass="$(get_env MAOMAO_ADMIN_PASSWORD)"; pass="${pass:-20001024}"

echo ""
echo "部署完成："
echo "  管理后台:     http://${ip}:${port}/"
echo "  API 健康检查: http://${ip}:${port}/api/health"
echo "  登录账号:     ${user} / ${pass}"
echo "  运行日志:     docker logs -f maomao-clock-server"
