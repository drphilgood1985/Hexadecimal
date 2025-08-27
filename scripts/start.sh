#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f ".env" ]]; then
  echo "Missing .env file. Copy .env.example to .env and fill values." >&2
  exit 1
fi

exec npm run start
