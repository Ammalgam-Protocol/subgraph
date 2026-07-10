#!/usr/bin/env bash
# PreToolUse (Edit|Write): block edits to Envio-generated output.
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

case "$f" in
  */generated/*|*/.envio/*)
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"generated/ and .envio/ are Envio-generated output — do not edit them. Change schema.graphql/config.yaml and run pnpm codegen instead."}}'
    ;;
esac

exit 0
