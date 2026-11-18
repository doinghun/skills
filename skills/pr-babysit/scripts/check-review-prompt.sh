#!/usr/bin/env bash
# Fail if the Conductor Review button sent a different prompt than review-prompt.md.
# Compares with every "Review request.md" the button attached in this workspace.
set -euo pipefail
ours="$(dirname "$0")/review-prompt.md"
[ -f "$ours" ] || { echo "Missing $ours: copy it from .context/attachments/Review request.md (see SKILL.md)" >&2; exit 2; }
status=0
while IFS= read -r -d '' sent; do
  cmp -s "$ours" "$sent" || { echo "Conductor review prompt changed: $sent" >&2; status=1; }
done < <(find "$(git rev-parse --show-toplevel)/.context/attachments" -name 'Review request*.md' -print0 2>/dev/null)
exit $status
