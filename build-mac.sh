#!/bin/bash
set -e

echo "=========================================="
echo "  WApp Manager Leads Pro - Mac Build Script"
echo "=========================================="

echo "[1/4] Installing dependencies..."
npm install

echo "[2/4] Patching WhatsApp Web.js..."
node patch-wwebjs.js

echo "[3/4] Building Next.js application..."
next build
node fix-paths.js

echo "[4/4] Packaging macOS Application (.dmg & .zip)..."
npx electron-builder --mac

echo "=========================================="
echo "  Build completed successfully!"
echo "  Check the 'release' directory for your .dmg and .zip files."
echo "=========================================="
