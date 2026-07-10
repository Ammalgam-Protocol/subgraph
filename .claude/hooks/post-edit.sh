#!/usr/bin/env bash
# PostToolUse (Edit|Write): auto-format edited TypeScript with Biome, and
# regenerate Envio types when config.yaml / schema.graphql change.
set -uo pipefail

f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$f" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

case "$f" in
  *.ts) pnpm exec biome check --write "$f" >/dev/null 2>&1 ;;
esac

case "$(basename "$f")" in
  config.yaml|schema.graphql) pnpm codegen >/dev/null 2>&1 ;;
esac

exit 0
