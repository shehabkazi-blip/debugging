#!/usr/bin/env sh
set -eu
docker compose -f compose.base.yml down -v --remove-orphans || true
for file in scenarios/*.yml; do
  docker compose -f compose.base.yml -f "$file" down -v --remove-orphans >/dev/null 2>&1 || true
done
echo "Lab reset complete."
