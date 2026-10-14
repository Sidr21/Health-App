#!/usr/bin/env bash
# Pull the latest code and rebuild: sudo /opt/health-app/deploy/gcp/update.sh
set -euo pipefail
APP=/opt/health-app
git -C "$APP" pull -q
docker compose -f "$APP/deploy/gcp/compose.yml" up -d --build
docker image prune -f >/dev/null
curl -fs http://127.0.0.1:8000/health && echo
