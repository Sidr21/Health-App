#!/usr/bin/env bash
# One-time setup of the Health backend on a fresh Debian 12 VM (Google Cloud e2-micro).
#   curl -fsSL https://raw.githubusercontent.com/Sidr21/Health-App/claude/design-gameplan/deploy/gcp/setup-vm.sh | sudo bash
# Safe to re-run: existing settings and data are kept.
set -euo pipefail

REPO=${REPO:-https://github.com/Sidr21/Health-App.git}
BRANCH=${BRANCH:-claude/design-gameplan}
APP=/opt/health-app
ENV_FILE=/etc/health/backend.env
DATA=/var/lib/health

[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

echo "== swap (1 GB: the e2-micro has 1 GB of RAM and the image build needs a bit more)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== packages, Docker, Tailscale"
apt-get update -qq
apt-get install -y -qq git sqlite3 ca-certificates curl >/dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh

echo "== code ($BRANCH)"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$BRANCH" && git -C "$APP" checkout -q "$BRANCH" && git -C "$APP" pull -q
else
  git clone -q --branch "$BRANCH" "$REPO" "$APP"
fi

echo "== settings ($ENV_FILE)"
mkdir -p /etc/health "$DATA/backups"
if [ ! -f "$ENV_FILE" ]; then
  TOKEN=${HEALTH_API_TOKEN:-}
  if [ -z "$TOKEN" ]; then
    read -rsp "HEALTH_API_TOKEN (same as in app/.env): " TOKEN </dev/tty; echo
  fi
  [ -n "$TOKEN" ] || { echo "a token is required"; exit 1; }
  umask 077
  cat > "$ENV_FILE" <<CONF
HEALTH_API_TOKEN=$TOKEN
HEALTH_TIMEZONE=America/New_York
HEALTH_SYNC_INTERVAL_MIN=15
HEALTH_DOCS=false
CONF
fi

echo "== nightly database backup (kept 14 days in $DATA/backups)"
install -m 755 "$APP/deploy/gcp/backup.sh" /etc/cron.daily/health-backup

echo "== build and start (first build takes a few minutes)"
docker compose -f "$APP/deploy/gcp/compose.yml" up -d --build
for _ in $(seq 1 30); do
  curl -fs http://127.0.0.1:8000/health >/dev/null && break
  sleep 2
done
curl -fs http://127.0.0.1:8000/health && echo

cat <<NEXT

Backend is running on this VM (localhost:8000). Next:
  1. sudo tailscale up --hostname=health      # open the link it prints, log in
  2. sudo tailscale serve --bg 8000           # HTTPS for the phone; enable HTTPS if it asks
  3. copy the COROS login from your Mac (docs/SETUP.md §3)
NEXT
