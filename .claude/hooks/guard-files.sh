#!/usr/bin/env bash
# PreToolUse(Edit|Write): protect secrets and already-committed migrations.
path="$(jq -r '.tool_input.file_path // ""')"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
rel="${path#"$root"/}"

case "$(basename "$rel")" in
  .env.example) ;;
  .env|.env.*) echo "Blocked: never edit env files ($rel). Ask the user to set secrets." >&2; exit 2 ;;
esac
[[ "$rel" == secrets/* || "$rel" == */secrets/* ]] && { echo "Blocked: secrets directory" >&2; exit 2; }

# Migrations already committed to git are immutable — add a new migration instead.
if [[ "$rel" == supabase/migrations/*.sql ]] && git -C "$root" cat-file -e "HEAD:$rel" 2>/dev/null; then
  echo "Blocked: $rel is committed. Create a new migration instead of editing it." >&2
  exit 2
fi
exit 0
