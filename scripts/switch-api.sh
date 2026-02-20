#!/bin/bash
# Switch the active API source (URL + key) in .env and restart nanoclaw.
#
# Usage:
#   ./scripts/switch-api.sh          — list available sources
#   ./scripts/switch-api.sh <name>   — switch to named source (case-insensitive)
#
# To add a new source, add two lines to .env:
#   API_SOURCE_<NAME>_URL=https://...
#   API_SOURCE_<NAME>_KEY=sk-...

set -euo pipefail

ENV_FILE="$HOME/Documents/nanoclaw/.env"
PLIST="$HOME/Library/LaunchAgents/com.nanoclaw.plist"

# ── helpers ──────────────────────────────────────────────────────────────────

current_url() {
  grep '^ANTHROPIC_BASE_URL=' "$ENV_FILE" | cut -d'=' -f2-
}

list_sources() {
  echo "Available sources:"
  local current
  current=$(current_url)
  grep '^API_SOURCE_.*_URL=' "$ENV_FILE" | while IFS='=' read -r key url; do
    local name="${key#API_SOURCE_}"
    name="${name%_URL}"
    local key_var="API_SOURCE_${name}_KEY"
    local key_status=""
    grep -q "^${key_var}=." "$ENV_FILE" 2>/dev/null || key_status="  ⚠️  key not set"
    if [ "$url" = "$current" ]; then
      echo "  * $name  →  $url  (active)${key_status}"
    else
      echo "    $name  →  $url${key_status}"
    fi
  done
}

# ── main ─────────────────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  list_sources
  exit 0
fi

NAME=$(echo "$1" | tr '[:lower:]' '[:upper:]')
URL_VAR="API_SOURCE_${NAME}_URL"
KEY_VAR="API_SOURCE_${NAME}_KEY"

URL=$(grep "^${URL_VAR}=" "$ENV_FILE" | cut -d'=' -f2-)
API_KEY=$(grep "^${KEY_VAR}=" "$ENV_FILE" | cut -d'=' -f2-)

if [ -z "$URL" ]; then
  echo "Error: ${URL_VAR} not found in .env"
  echo ""
  list_sources
  exit 1
fi

if [ -z "$API_KEY" ]; then
  echo "Error: ${KEY_VAR} is empty in .env — set the API key first"
  exit 1
fi

CURRENT=$(current_url)
if [ "$URL" = "$CURRENT" ]; then
  echo "Already on ${NAME} (${URL}), nothing to do."
  exit 0
fi

# Update both ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY in-place
sed -i '' "s|^ANTHROPIC_BASE_URL=.*|ANTHROPIC_BASE_URL=${URL}|" "$ENV_FILE"
sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${API_KEY}|" "$ENV_FILE"

echo "✓ Switched: ${CURRENT} → ${URL}"

# Restart service
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "✓ nanoclaw restarted"
