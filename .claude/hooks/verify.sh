#!/usr/bin/env bash
# Stop gate: Ensure Biome lint and tsc pass before finishing file edits in the session.
set -uo pipefail

input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# True when any of the given paths have unstaged or staged changes.
changed() { ! git diff --quiet -- "$@" 2>/dev/null || ! git diff --cached --quiet -- "$@" 2>/dev/null; }

# Nothing related to indexer/test/codegen-input changed.
changed src test schema.graphql config.yaml || exit 0

# tsc needs fresh types; regenerate only when codegen inputs have changed.
if changed schema.graphql config.yaml; then
  if ! out=$(pnpm codegen 2>&1); then
    printf 'Stop gate: pnpm codegen failed —\n%s\n' "$out" | tail -40 >&2
    exit 2
  fi
fi

if ! out=$(pnpm exec ast-grep scan 2>&1); then
  printf 'Stop gate: ast-grep rule violation —\n%s\n' "$out" | tail -40 >&2
  exit 2
fi

if ! out=$(pnpm check 2>&1); then
  printf 'Stop gate: Biome failing (run pnpm check:fix) —\n%s\n' "$out" | tail -40 >&2
  exit 2
fi

if ! out=$(pnpm exec tsc --noEmit 2>&1); then
  printf 'Stop gate: tsc --noEmit failing —\n%s\n' "$out" | tail -40 >&2
  exit 2
fi

exit 0
