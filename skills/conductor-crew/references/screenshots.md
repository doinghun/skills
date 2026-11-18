# Before/after screenshots

The screenshot role is **Claude, newest Sonnet** (resolved by `scripts/resolve-models.mjs`). Include this entire procedure or its absolute path in that session's prompt. The role captures and inspects images; the coordinator owns uploads and the PR body.

This procedure runs only when the plan has a capture plan. A change with no visible result (backend, refactor, tooling) gets "no visible change" in the plan and the PR body, and no screenshot session.

## Pick the capture method

Use the method in the plan. The planner picks it from the platform and the repository's own instructions:

- **Web app:** the `visual-proof` skill (below).
- **Native app (iOS, Android, desktop):** the repository's simulator or emulator workflow from `AGENTS.md` / `CLAUDE.md`, for example XcodeBuildMCP or `xcrun simctl io booted screenshot` for iOS. Never use browser device emulation as a substitute for a native app.
- **Other rendered output** (docs site, CLI output, generated report): render it locally and capture the result.

If the plan names no method that works, report it as a blocker.

## Capture

- **Web: use the `visual-proof` skill** for the ground check, seed data, dev server, login, and `agent-browser` capture. Always capture the full page (`agent-browser screenshot --full`). If the skill is not installed, report that and follow the fallback below.
- Capture actual rendered components at the recorded base commit and final implementation. Match route, viewport, theme, locale, data, and interaction state so the change is visible. Use descriptive PNG names under `.context/crew/screenshots/`; never stage them. Show relevant mobile states for mobile UI; 1440×900 is the desktop default.
- Capture "before" in the implementation workspace before the implementer starts. If implementation already began, capture "before" from a separate worktree (`git worktree add --detach <path> <base commit>`) at the recorded base commit from `state.json`, not `origin/main`, so "before" is the baseline even after main moves. Never swap, reset, or check out files in a checkout another role uses. Remove the worktree after capture. Do not create or push screenshot branches.
- Follow the repository's production-safety rules. Never fetch production env, read/copy production credentials, or connect to live data to make screenshots work. If the database is not local, stop and report it.
- Fallback without `visual-proof`: follow `README.md` setup and use `agent-browser` with a logged-in local session. Wait for real text on the target screen, not a timer.

- Open every PNG and check the target state, legibility, overflow, translated labels, and layout. Return absolute paths plus the route/state, viewport, base/final revision, and any limitations. Generated mockups or HTML recreations do not count as screenshots of the implementation.
- Repository policy forbids mocks/fakes by default. Do not introduce fetch interception or simulated services merely because an old transcript did. If the current user explicitly authorizes a fixture preview, render the real components, label the images as fixture previews, and keep the harness temporary and uncommitted. Such images do not verify backend behavior.
- Remove only the harness/worktrees/processes created for this capture. Verify the source diff is unchanged by capture and no preview files or PNGs are staged before handing back to review.

## Upload

Every crew PR includes before/after screenshots using GitHub user-attachments. The coordinator reads and follows the `github-screenshot-upload` skill, passing the target repository and inspected PNG paths. Reuse its upload procedure and validated URLs; never use an external CDN or commit screenshots to a branch. If upload is blocked, finish the other deliverables and report the blocker before publishing the PR.

## PR body

Immediately after the `## Summary` section and its content, insert this exact structure, replacing the URL placeholders:

```markdown
## Screenshots

| Before                               | After                               |
| ------------------------------------ | ----------------------------------- |
| <img src="<before-url>" width="450"> | <img src="<after-url>" width="450"> |
```

Use additional labeled rows for additional states. For a new screen, the before image shows the real prior entry point, empty state, or lack of that feature; do not fabricate a previous screen. For work with no visible result, write "No visible change" and the reason in the PR body instead of the table. Never add unrelated images to fill the table.

Check the final body for actual user-attachments URLs and no placeholders, verify the uploaded images correspond to the inspected PNGs, and confirm rendering in GitHub's PR preview/body when available. Show the screenshots in the final chat response as well, using the same URLs.
