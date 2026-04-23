#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ALIYUN_APP_DIR:?ALIYUN_APP_DIR is required}"
BACKUP_ROOT="${ALIYUN_BACKUP_ROOT:-/opt/agentgram-backups}"
RETENTION_DAYS="${ALIYUN_BACKUP_RETENTION_DAYS:-30}"

case "$APP_DIR" in
  ""|"/"|"/root"|"/home"|"/opt")
    echo "Refusing unsafe ALIYUN_APP_DIR: $APP_DIR" >&2
    exit 1
    ;;
esac

DATA_DIR="$APP_DIR/apps/web/data"
if [ ! -d "$DATA_DIR" ]; then
  echo "Missing data directory: $DATA_DIR" >&2
  exit 1
fi

BACKUP_DIR="$BACKUP_ROOT/data"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_ROOT" "$BACKUP_DIR"

TARGET_SHA="unknown"
if [ -f "$APP_DIR/.deploy-meta/last-deploy" ]; then
  TARGET_SHA="$(awk -F= '$1 == "target_sha" { print $2; exit }' "$APP_DIR/.deploy-meta/last-deploy")"
  TARGET_SHA="${TARGET_SHA:-unknown}"
fi

SHORT_SHA="${TARGET_SHA:0:12}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/agentgram-data-${TIMESTAMP}-${SHORT_SHA}.tar.gz"
TMP_ARCHIVE="$ARCHIVE.tmp"
SHA_FILE="$ARCHIVE.sha256"

tar -czf "$TMP_ARCHIVE" -C "$APP_DIR/apps/web" data
mv "$TMP_ARCHIVE" "$ARCHIVE"
sha256sum "$ARCHIVE" > "$SHA_FILE"
chmod 600 "$ARCHIVE" "$SHA_FILE"

find "$BACKUP_DIR" -type f -name "agentgram-data-*.tar.gz" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name "agentgram-data-*.tar.gz.sha256" -mtime +"$RETENTION_DAYS" -delete

echo "backup_archive=$ARCHIVE"
echo "backup_sha256=$(cut -d' ' -f1 "$SHA_FILE")"
echo "backup_size=$(du -h "$ARCHIVE" | awk '{print $1}')"
echo "source_sha=$TARGET_SHA"
