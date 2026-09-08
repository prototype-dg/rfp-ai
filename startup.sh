#!/bin/bash
# startup.sh — Azure App Service Linux startup script
# Installs Chromium shared library dependencies before starting the Node.js app.
#
# chrome-headless-shell is a statically-linked binary for the Chrome engine,
# but it still requires these system .so files which are absent in the default
# Azure App Service Debian/Ubuntu container image.
#
# These packages are ~15MB total and install in ~10s on cold start.
# They are NOT included in the zip because they are OS-level dependencies.

set -e

echo "[startup] Installing Chromium shared library dependencies..."
apt-get update -qq && apt-get install -y -qq --no-install-recommends \
  libglib2.0-0 \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libcairo2 \
  2>/dev/null

echo "[startup] Dependencies installed. Starting Node.js server..."
exec node /home/site/wwwroot/dist-azure/server-azure.js
