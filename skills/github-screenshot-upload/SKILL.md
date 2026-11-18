---
name: github-screenshot-upload
description: Upload existing PNG screenshots to GitHub user-attachments and return embeddable URLs for pull requests, issues, or comments. Use when asked to upload screenshots to GitHub or when another workflow requires GitHub-hosted screenshot links. Does not capture screenshots or run a coding crew.
---

# GitHub Screenshot Upload

Upload existing screenshots and return their GitHub attachment URLs. Use this skill independently or from another workflow, including `conductor-crew`.

## Inputs and scope

- Identify the target repository and local PNG paths from the request or calling workflow. Use the existing authenticated `gh` session for that repository.
- Inspect each image before uploading, or reuse an inspection already completed in the same workflow. Check that it is the intended screenshot and contains no credentials or private customer data.
- Keep screenshots uncommitted. Uploading does not by itself authorize creating or editing a PR, issue, or comment; follow the current task's scope.

## Upload

Use GitHub user-attachments for the requested screenshots. Never use an external CDN. Never commit screenshots to any branch, including an orphan or throwaway branch. Committed raw/blob URLs (`raw.githubusercontent`, `blob?raw=true`) fail to render on private repositories.

Upload the raw bytes to GitHub's user-attachments endpoint. Use `curl` until the installed `gh` supports `--attach`; any future CLI path must still produce GitHub user-attachments URLs.

Run from the target repository, with the inspected PNGs. Set `SCREENSHOT_PATH` to the actual PNG path before running the example. Do not run with shell tracing or print the authentication token. The following keeps the requested endpoint and field-independent URL extraction, retaining the raw response to diagnose failures:

```bash
R="$(gh repo view --json nameWithOwner --jq .nameWithOwner)" || exit 1
RID="$(gh api "repos/$R" --jq .id)" || exit 1

upload() {  # upload <file.png> -> prints the user-attachments URL
  local response url
  response="$(curl -sS --fail-with-body -X POST \
    "https://uploads.github.com/user-attachments/assets?name=$(basename "$1")&content_type=image/png&repository_id=$RID" \
    -H "Authorization: Bearer $(gh auth token)" \
    --data-binary @"$1")" || {
      printf '%s\n' "$response" >&2
      return 1
    }
  url="$(printf '%s\n' "$response" \
    | jq -r '.. | strings | select(test("user-attachments/assets/"))' \
    | head -1)"
  if [ -z "$url" ]; then
    printf '%s\n' "$response" >&2
    return 1
  fi
  printf '%s\n' "$url"
}

SCREENSHOT_URL="$(upload "$SCREENSHOT_PATH")" || exit 1
printf '%s\n' "$SCREENSHOT_URL"
```

Use simple filenames without spaces or URL-special characters, or URL-encode the basename when adapting the command. The `jq` filter finds the URL without assuming a response field name. If it finds nothing, read the printed raw response for the URL. Validate that each extracted URL is an HTTPS GitHub user-attachment URL, not an error message or arbitrary matching string. Do not fall back to a CDN, branch, or local file link in the PR.

If the endpoint rejects the request or the response has no usable URL, diagnose the returned error. Do not claim an upload succeeded. Finish the other deliverables and report the upload blocker; request only the missing access or a manual GitHub attachment if required. Do not repeatedly upload identical bytes after a confirmed success.

## Return the result

Return each local screenshot path with its validated GitHub attachment URL, preserving labels such as Before and After when supplied. Provide embeddable Markdown when useful:

```markdown
![Screenshot description](<github-attachment-url>)
```

Replace the placeholders with the actual label and returned URL. Verify that the links correspond to the inspected files and confirm image rendering in the destination preview when available. The calling workflow owns capture requirements, before/after tables, section placement, and publication.
