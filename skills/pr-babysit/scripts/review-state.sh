#!/usr/bin/env bash
# Wait until the Codex bot has finished reviewing the PR's current head.
# Usage: review-state.sh <pr> [--once] [--timeout <minutes>]   (default timeout 30)
# The bot keeps one "Codex Review Summary" comment and edits it after each push:
# a table with a Code Review and a Security Review row, each with a status and a commit.
# Exit codes, one status line on stdout:
#   0 done       both rows Completed on the head (thumbs_up=1 means no findings)
#   2 running    --once only: not finished yet
#   3 failed     a row on the head says failed, error, cancelled, or skipped
#   4 timeout    no finished review within the timeout (after one "@codex review" nudge)
#   5 moved      the head changed while waiting (someone pushed); re-sync, then wait again
#   6 query-failed  a GitHub call still failed after 3 tries
set -euo pipefail
pr="${1:?Usage: review-state.sh <pr> [--once] [--timeout <minutes>]}"; shift
# Status lines go to fd 3, so they reach stdout even from inside $(...).
exec 3>&1
# Retry a gh call 3 times: one 502 must not end a 30-minute wait.
retry() {
  local try
  for try in 1 2 3; do
    "$@" && return 0
    sleep $((try * 5))
  done
  echo "query-failed: $*" >&3
  exit 6
}
once=false; timeout=30
while [ $# -gt 0 ]; do
  case "$1" in --once) once=true ;; --timeout) timeout="$2"; shift ;; esac; shift
done
repo="$(retry gh repo view --json nameWithOwner --jq .nameWithOwner)"
pr_head() { retry gh pr view "$pr" --json headRefOid --jq .headRefOid; }
start_head="$(pr_head)"; short="${start_head:0:7}"
nudge_after=$((timeout * 2 / 3)); nudged=false
started=$(date +%s)

while :; do
  now_head="$(pr_head)"
  [ "$now_head" = "$start_head" ] || { echo "moved head=${now_head:0:7} was=$short"; exit 5; }

  summary="$(retry gh api "repos/$repo/issues/$pr/comments" --paginate \
    --jq '.[] | select(.body | contains("codex-pull-request-review-summary")) | .body')"
  rows="$(printf '%s\n' "$summary" | grep -E '\*\*(Code|Security) Review\*\*' | grep -F "\`$short\`" || true)"
  completed=$(printf '%s' "$rows" | grep -c '\*\*Completed\*\*' || true)
  if [ "$completed" -ge 2 ]; then
    thumbs="$(retry gh api "repos/$repo/issues/$pr/reactions" \
      --jq '[.[] | select((.user.login | test("codex")) and .content == "+1")] | length')"
    echo "done head=$short thumbs_up=$thumbs"; exit 0
  fi
  bad="$(printf '%s\n' "$rows" | grep -iE '\*\*[^*]*(fail|error|cancel|skip)[^*]*\*\*' |
    grep -oE '\*\*(Code|Security) Review\*\* \| [^|]*' | sed -E 's/<[^>]*>[^<]*<\/[^>]*>//' || true)"
  [ -z "$bad" ] || { echo "failed head=$short: $(echo $bad)"; exit 3; }

  $once && { echo "running head=$short completed=$completed/2"; exit 2; }
  elapsed=$(( ($(date +%s) - started) / 60 ))
  if ! $nudged && [ "$elapsed" -ge "$nudge_after" ] && [ -z "$rows" ]; then
    retry gh pr comment "$pr" --body "@codex review" >/dev/null; nudged=true
    echo "nudged head=$short after ${elapsed}m" >&2
  fi
  [ "$elapsed" -lt "$timeout" ] || { echo "timeout head=$short after ${timeout}m completed=$completed/2"; exit 4; }
  sleep 30
done
