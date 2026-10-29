#!/usr/bin/env bash
set -euo pipefail
# This is the exact build context used by both Elastic Beanstalk and Docker CI.
zip -qr "${1:-app.zip}" Dockerfile server/ client/ .dockerignore \
  -x '*/node_modules/*' '*/dist/*' '*/.git/*' '*/.env' '*/.env.*' 'server/tests/*' 'client/tests/*'
