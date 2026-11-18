#!/usr/bin/env bash
# List the unresolved review threads of a PR, one block per thread.
# Usage: pr-threads.sh <pr-number> [--json]
# Each block: thread id (PRRT_…, for resolve/reply), first comment databaseId
# (the number in "#discussion_r<id>", for REST replies), author, path:line,
# outdated flag, the commit it was made on, and the first comment body.
set -euo pipefail
pr="${1:?Usage: pr-threads.sh <pr-number> [--json]}"
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

# shellcheck disable=SC2016
json="$(gh api graphql --paginate --slurp -F owner="${repo%/*}" -F name="${repo#*/}" -F pr="$pr" -f query='
query($owner:String!, $name:String!, $pr:Int!, $endCursor:String) {
  repository(owner:$owner, name:$name) { pullRequest(number:$pr) {
    headRefOid
    reviewThreads(first:100, after:$endCursor) { pageInfo { hasNextPage endCursor }
      nodes { id isResolved isOutdated path line
      comments(first:50) { nodes { databaseId author { login } body createdAt url commit { oid } } } } }
  } } }' | jq '[.[].data.repository.pullRequest] | {headRefOid: .[0].headRefOid, reviewThreads: {nodes: [.[].reviewThreads.nodes[]]}}')"

if [ "${2:-}" = --json ]; then
  printf '%s\n' "$json" | jq '{headRefOid, threads: [.reviewThreads.nodes[] | select(.isResolved | not)]}'
  exit 0
fi

printf '%s\n' "$json" | jq -r '
  .headRefOid as $head
  | [.reviewThreads.nodes[] | select(.isResolved | not)] as $open
  | "head \($head[0:10])  unresolved \($open | length)",
    ($open[] | .comments.nodes as $c | (
      "",
      "=== \(.id)  comment \($c[0].databaseId)  by \($c[0].author.login)",
      "    \(.path):\(.line // "outdated")\(if .isOutdated then "  [OUTDATED]" else "" end)  on \($c[0].commit.oid[0:10])\(if $c[0].commit.oid == $head then " (head)" else "" end)",
      "    replies: \($c | length - 1), last by \($c[-1].author.login)",
      "    \($c[0].url)",
      ($c[0].body | split("\n") | map("    | " + .) | .[0:25] | join("\n"))))'
