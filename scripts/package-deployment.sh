#!/usr/bin/env bash
set -euo pipefail
# This is the exact application archive used by Docker CI.
zip -qr "${1:-app.zip}" Dockerfile server/ client/ .dockerignore \
  -x '*/node_modules/*' '*/dist/*' '*/.git/*' '*/.env' '*/.env.*' 'server/tests/*' 'client/tests/*'
