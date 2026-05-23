#!/usr/bin/env bash
# Ensures the @something-chat/sdk workspace package is linked into apps/web,
# then starts the web dev server.
#
# Usage:  just dev-web
#         bash scripts/run-web.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "→ Linking workspace packages (pnpm install)..."
pnpm install --frozen-lockfile

# Verify the SDK is actually linked
SDK_ENTRY="$ROOT/apps/web/node_modules/@something-chat/sdk"
if [[ ! -e "$SDK_ENTRY" ]]; then
  echo "✗ @something-chat/sdk not found after install — adding it now..."
  pnpm --filter web add "@something-chat/sdk@workspace:*"
fi

echo "→ Starting web dev server..."
pnpm --filter web dev
