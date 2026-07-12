#!/usr/bin/env sh
set -eu
SCENARIO="${1:-}"
if [ -z "$SCENARIO" ]; then
  echo "Usage: ./scripts/run-scenario.sh 03-wrong-db-host"
  exit 1
fi
FILE="scenarios/${SCENARIO}.yml"
if [ ! -f "$FILE" ]; then
  echo "Scenario file not found: $FILE"
  exit 1
fi

docker compose -f compose.base.yml -f "$FILE" down -v --remove-orphans >/dev/null 2>&1 || true
docker compose -f compose.base.yml -f "$FILE" up -d --build
printf '\nScenario started: %s\n' "$SCENARIO"
printf 'Inspect with: docker compose -f compose.base.yml -f %s ps\n' "$FILE"
