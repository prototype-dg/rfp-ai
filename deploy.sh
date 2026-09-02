#!/bin/bash
# deploy.sh — custom Kudu deployment script for Azure App Service
# Skips the Vite build (dist-azure/ is pre-compiled) and only installs production deps

set -e

echo "[deploy] Starting custom deployment script"
echo "[deploy] Node: $(node --version)"
echo "[deploy] npm: $(npm --version)"

# Install production dependencies only
echo "[deploy] Installing production dependencies..."
npm install --production --no-optional

echo "[deploy] Deployment complete. Start command: node dist-azure/server-azure.js"
