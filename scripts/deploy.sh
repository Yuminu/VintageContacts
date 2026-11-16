#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vintagecontacts}"

cd "$APP_DIR"
git pull --ff-only
npm ci --omit=dev
sudo systemctl restart vintagecontacts
sudo nginx -t
sudo systemctl reload nginx
curl -fsS http://127.0.0.1:4173/healthz >/dev/null
echo "deployment finished"
