#!/usr/bin/env bash
# Say whether a PR is ready to merge, as one line on stdout.
# Usage: merge-state.sh <pr>
# A clean review and green checks are not enough: a conflict, a person's
# "Request changes", or a draft still block the merge.
# Exit codes:
#   0 clean
#   2 unknown            GitHub is still computing mergeability; ask again in a minute
#   3 conflicting        rebase onto origin/main
#   4 changes-requested  a person asked for changes (their latest review)
#   5 draft              the PR is a draft
set -euo pipefail
pr="${1:?Usage: merge-state.sh <pr>}"

state="$(gh pr view "$pr" --json mergeable,isDraft,latestReviews --jq '
  [.mergeable, (.isDraft | tostring),
   ([.latestReviews[] | select(.state == "CHANGES_REQUESTED") | .author.login] | join(","))] | join(" ")')"
read -r mergeable draft requesters <<<"$state"

if [ "$mergeable" = CONFLICTING ]; then echo "conflicting"; exit 3; fi
if [ -n "${requesters:-}" ]; then echo "changes-requested by $requesters"; exit 4; fi
if [ "$draft" = true ]; then echo "draft"; exit 5; fi
if [ "$mergeable" != MERGEABLE ]; then echo "unknown ($mergeable)"; exit 2; fi
echo "clean"
