#!/usr/bin/env bash
# PreToolUse(Edit|Write): stop real-looking PII (Aadhaar, PAN, long account numbers) entering
# fixtures, tests, seeds and templates. Synthetic data must use obviously fake markers.
input="$(cat)"
path="$(jq -r '.tool_input.file_path // ""' <<<"$input")"

case "$path" in
  */fixtures/*|*/seed*|*test*|*/templates/*|*.sql|*.json|*.csv) ;;
  *) exit 0 ;;
esac

content="$(jq -r '[.tool_input.content, .tool_input.new_string] | map(select(. != null)) | join("\n")' <<<"$input")"
# UUIDs contain 12-digit runs that look like Aadhaar numbers; drop them before scanning.
content="$(sed -E 's/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}//g' <<<"$content")"

# Aadhaar: 12 digits, optionally grouped 4-4-4, not starting with 0/1.
if grep -Eq '(^|[^0-9])[2-9][0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)' <<<"$content"; then
  echo "Blocked by pii-scan: Aadhaar-like number in $path. Use synthetic markers (e.g. XXXX-XXXX-1234)." >&2
  exit 2
fi
# PAN: AAAAA9999A — allow the documented fake prefix 'FAKE'.
if grep -Eo '\b[A-Z]{5}[0-9]{4}[A-Z]\b' <<<"$content" | grep -vq '^FAKE'; then
  echo "Blocked by pii-scan: PAN-like value in $path. Synthetic PANs must start with FAKE (e.g. FAKEP1234Z)." >&2
  exit 2
fi
exit 0
