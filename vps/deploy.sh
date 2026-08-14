#!/usr/bin/env bash
# vps/deploy.sh — push updated VPS code from this repo to the live server
#
# Usage (run from project root):
#   bash vps/deploy.sh                        # uses default host
#   bash vps/deploy.sh root@api.cpc-rfp.website
#
# What it does:
#   1. Copies vps/pdf-render/server.js to /opt/pdf-service/server.js on VPS
#   2. Restarts the pdf-render systemd service
#   3. Verifies the health endpoint reports version 3

set -euo pipefail

REMOTE="${1:-vps-pdf}"          # uses ~/.ssh/config Host alias by default
PDF_RENDER_DIR="/opt/pdf-service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "▶ Deploying pdf-render service to ${REMOTE}"

# 1. Upload server.js
echo "  → Copying server.js..."
scp "${SCRIPT_DIR}/pdf-render/server.js" "${REMOTE}:${PDF_RENDER_DIR}/server.js"

# 2. Restart via systemd (the service manager on this VPS)
echo "  → Restarting pdf-render.service..."
ssh "${REMOTE}" "systemctl restart pdf-render.service && sleep 2 && systemctl is-active pdf-render.service"

# 3. Verify via internal endpoint
echo "  → Verifying service (internal)..."
INTERNAL=$(ssh "${REMOTE}" "curl -sf http://127.0.0.1:8001/" 2>/dev/null || echo '{}')
VERSION=$(echo "${INTERNAL}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "parse-error")
echo "  Internal health: ${INTERNAL}"

# 4. Verify via public HTTPS
echo "  → Verifying service (public HTTPS)..."
sleep 1
PUBLIC=$(curl -sf https://api.cpc-rfp.website/pdf/ 2>/dev/null || echo '{}')
echo "  Public health:   ${PUBLIC}"

if [ "${VERSION}" = "3" ]; then
  echo "✅ pdf-render is v3 — Puppeteer path active"
else
  echo "⚠️  Expected version 3, got '${VERSION}'"
  echo "    Check logs: ssh ${REMOTE} 'journalctl -u pdf-render.service -n 50'"
  exit 1
fi
