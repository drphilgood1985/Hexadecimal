#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d "parse" ]]; then
  echo "Missing parse/ directory. Create parse/ and add .md/.txt/.js/.ts/.json/.sql files." >&2
  exit 1
fi

exec npm run ingest
