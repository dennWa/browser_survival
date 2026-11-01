#!/usr/bin/env sh
# Startet das Browser Survival Studio (Linux/macOS). Erster Start installiert Electron.
cd "$(dirname "$0")/.."
[ -d node_modules/electron ] || npm install
exec npm run studio
