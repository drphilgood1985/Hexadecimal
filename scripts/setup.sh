#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing dependencies"
npm install

echo "==> Initializing database schema"
npm run init:db

echo "==> Setup complete"
