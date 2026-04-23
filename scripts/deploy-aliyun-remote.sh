#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ALIYUN_APP_DIR:?ALIYUN_APP_DIR is required}"
PM2_NAME="${ALIYUN_PM2_NAME:-agentgram}"
TARGET_SHA="${TARGET_SHA:-unknown}"
PORT="${ALIYUN_APP_PORT:-80}"
HOSTNAME="${ALIYUN_APP_HOSTNAME:-0.0.0.0}"

case "$APP_DIR" in
  ""|"/"|"/root"|"/home"|"/opt")
    echo "Refusing unsafe ALIYUN_APP_DIR: $APP_DIR" >&2
    exit 1
    ;;
esac

cd "$APP_DIR"

echo "Deploy directory: $(pwd)"
echo "Target SHA: $TARGET_SHA"
echo "PM2 process: $PM2_NAME"

if [ ! -f .env.local ]; then
  echo "Missing .env.local in $APP_DIR; refusing to start without production env" >&2
  exit 1
fi

STANDALONE_SERVER="apps/web/.next/standalone/apps/web/server.js"
if [ ! -f "$STANDALONE_SERVER" ]; then
  echo "Missing standalone server artifact: $STANDALONE_SERVER" >&2
  exit 1
fi

STANDALONE_STATIC="apps/web/.next/standalone/apps/web/.next/static"
if [ ! -d "$STANDALONE_STATIC" ]; then
  echo "Missing standalone static assets: $STANDALONE_STATIC" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed on the remote host" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed on the remote host" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env.local"
set +a

export PORT
export HOSTNAME
export NODE_ENV=production

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  echo "Restarting existing PM2 process: $PM2_NAME"
  pm2 restart "$PM2_NAME" --update-env
else
  echo "Starting new PM2 process: $PM2_NAME"
  (
    cd apps/web/.next/standalone/apps/web
    pm2 start server.js --name "$PM2_NAME" --update-env
  )
fi

pm2 save
pm2 describe "$PM2_NAME" | sed -n '1,120p'

mkdir -p .deploy-meta
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ -f .deploy-meta/last-deploy ]; then
  cp -f .deploy-meta/last-deploy .deploy-meta/previous-deploy
fi
{
  echo "target_sha=$TARGET_SHA"
  echo "deployed_at=$DEPLOYED_AT"
  echo "pm2_name=$PM2_NAME"
  echo "build_host=github-actions"
} > .deploy-meta/last-deploy
printf "%s\t%s\t%s\n" "$DEPLOYED_AT" "$TARGET_SHA" "$PM2_NAME" >> .deploy-meta/deploy-history.tsv
tail -n 50 .deploy-meta/deploy-history.tsv > .deploy-meta/deploy-history.tsv.tmp
mv .deploy-meta/deploy-history.tsv.tmp .deploy-meta/deploy-history.tsv

echo "Deployed target: $TARGET_SHA"
