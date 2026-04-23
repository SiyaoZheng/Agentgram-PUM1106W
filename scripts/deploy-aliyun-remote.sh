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

if [ ! -f package.json ] || [ ! -f pnpm-lock.yaml ]; then
  echo "Missing package.json or pnpm-lock.yaml in $APP_DIR" >&2
  exit 1
fi

if [ ! -f apps/web/package.json ]; then
  echo "Missing apps/web/package.json in $APP_DIR" >&2
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "Missing .env.local in $APP_DIR; refusing to build without production env" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed on the remote host" >&2
  exit 1
fi

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is not installed on the remote host" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed on the remote host" >&2
  exit 1
fi

echo "Node: $(node --version)"
corepack enable
corepack prepare --activate
echo "pnpm: $(pnpm --version)"

echo "Removing stale build artifacts"
rm -rf apps/web/.next .turbo

echo "Installing dependencies"
pnpm install --frozen-lockfile

echo "Building production app"
pnpm turbo build

STANDALONE_SERVER="apps/web/.next/standalone/apps/web/server.js"
if [ ! -f "$STANDALONE_SERVER" ]; then
  echo "Missing standalone server after build: $STANDALONE_SERVER" >&2
  exit 1
fi

mkdir -p .deploy-meta
{
  echo "target_sha=$TARGET_SHA"
  echo "deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "pm2_name=$PM2_NAME"
} > .deploy-meta/last-deploy

export PORT
export HOSTNAME
export NODE_ENV=production

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  echo "Reloading existing PM2 process: $PM2_NAME"
  pm2 reload "$PM2_NAME" --update-env
else
  echo "Starting new PM2 process: $PM2_NAME"
  (
    cd apps/web/.next/standalone/apps/web
    pm2 start server.js --name "$PM2_NAME" --update-env
  )
fi

pm2 save
pm2 describe "$PM2_NAME" | sed -n '1,120p'

echo "Deployed target: $TARGET_SHA"
