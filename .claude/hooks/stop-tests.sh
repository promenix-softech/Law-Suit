#!/usr/bin/env bash
# Stop: don't end a turn with red unit tests. Only runs if code changed in the working tree.
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
input="$(cat)"
# Avoid infinite loops when Claude is already continuing because of this hook.
[[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]] && exit 0

if git -C "$root" status --porcelain -- packages apps | grep -q .; then
  if ! out="$(cd "$root" && pnpm -s test:unit 2>&1)"; then
    echo "Unit tests are failing — fix them before finishing:" >&2
    tail -40 <<<"$out" >&2
    exit 2
  fi
fi
exit 0
