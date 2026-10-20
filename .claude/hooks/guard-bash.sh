#!/usr/bin/env bash
# PreToolUse(Bash): block destructive commands. Exit 2 = block, stderr goes to Claude.
cmd="$(jq -r '.tool_input.command // ""')"

block() {
  echo "Blocked by guard-bash: $1" >&2
  exit 2
}

[[ "$cmd" =~ rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f[[:space:]]+(/|~|\.|\*)([[:space:]]|$) ]] && block "rm -rf on a root/home/cwd path"
[[ "$cmd" =~ supabase[[:space:]]+db[[:space:]]+reset.*--linked ]] && block "supabase db reset --linked (remote DB)"
[[ "$cmd" =~ supabase[[:space:]]+db[[:space:]]+push ]] && block "supabase db push — ask the user first"
[[ "$cmd" =~ git[[:space:]]+push.*(--force|-f([[:space:]]|$)) ]] && [[ ! "$cmd" =~ --force-with-lease ]] && block "git push --force"
[[ "$cmd" =~ psql.*(supabase\.co|pooler\.supabase\.com) ]] && block "psql to a hosted Supabase database"
[[ "$cmd" =~ (drop|truncate)[[:space:]]+(table|schema|database) ]] && [[ "$cmd" =~ supabase\.co ]] && block "destructive SQL on hosted DB"
exit 0
