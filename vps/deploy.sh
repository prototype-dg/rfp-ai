#!/usr/bin/env bash
# deploy.sh — push updated VPS code from the git repo to the live server
# Usage (run from project root):
#   bash vps/deploy.sh [user@host]
#
# Default host: deploy@api.cpc-rfp.website
# The script:
#   1. SCPs server.js and package.json to /opt/pdf-service/ on the VPS
#   2. npm-installs if package.json changed
#   3. pm2 reloads the service (zero-downtime)
#   4. Verifies the health endpoint reports version 3

set -euo pipefail

REMOTE="${1:-deploy@api.cpc-rfp.website}"
REMOTE_DIR="/opt/pdf-service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "▶ Deploying VPS PDF service to ${REMOTE}:${REMOTE_DIR}"

# 1. Upload files
echo "  → Copying server.js and package.json..."
scp "${SCRIPT_DIR}/server.js"         "${REMOTE}:${REMOTE_DIR}/server.js"
scp "${SCRIPT_DIR}/package.json"      "${REMOTE}:${REMOTE_DIR}/package.json"
scp "${SCRIPT_DIR}/ecosystem.config.cjs" "${REMOTE}:${REMOTE_DIR}/ecosystem.config.cjs"

# 2. npm install (only installs if lockfile/deps changed; fast if nothing changed)
echo "  → Running npm install..."
ssh "${REMOTE}" "cd ${REMOTE_DIR} && npm install --production --no-audit 2>&1 | tail -3"

# 3. Reload via PM2 (graceful — no dropped requests)
echo "  → Reloading PM2 process..."
ssh "${REMOTE}" "pm2 reload pdf-service || pm2 start ${REMOTE_DIR}/ecosystem.config.cjs"
ssh "${REMOTE}" "pm2 save"

# 4. Verify version
echo "  → Verifying service..."
sleep 2
VERSION=$(curl -sf https://api.cpc-rfp.website/pdf/ | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "unreachable")
echo "  Service reports version: ${VERSION}"

if [ "${VERSION}" = "3" ]; then
  echo "✅ Deployment successful — render service is v3"
else
  echo "⚠️  Expected version 3, got '${VERSION}' — check VPS logs: ssh ${REMOTE} 'pm2 logs pdf-service --nostream'"
  exit 1
fi
