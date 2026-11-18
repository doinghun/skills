# Before/after screenshots

The screenshot role is **Claude, newest Sonnet** (resolved by `scripts/resolve-models.mjs`). Include this entire procedure or its absolute path in that session's prompt. The role captures and inspects images; the coordinator owns uploads and the PR body.

## Capture

- **Use the `visual-proof` skill** for the ground check, seed data, dev server, login, and `agent-browser` capture. Always capture the full page (`agent-browser screenshot --full`). If the skill is not installed, report that and follow the fallback below.
- Capture actual rendered components at the recorded base commit and final implementation. Match route, viewport, theme, locale, data, and interaction state so the change is visible. Use descriptive PNG names under `.context/crew/screenshots/`; never stage them. Show relevant mobile states for mobile UI; 1440×900 is the desktop default.
- Keep the capture in the implementation workspace. Capture "before" before the implementer starts, or swap the changed files to the baseline under the running dev server only while no other agent edits the checkout. In that swap, use the recorded base commit from `state.json`, not `origin/main`, so "before" is the baseline even after main moves; never reset a checkout another agent is using. Do not create or push screenshot branches.
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

Use additional labeled rows for additional states. For a new screen, the before image shows the real prior entry point, empty state, or lack of that feature; do not fabricate a previous screen. For non-UI work, identify a meaningful rendered result in the plan. If none exists, report the screenshot blocker rather than adding unrelated images or omitting the table.

Check the final body for actual user-attachments URLs and no placeholders, verify the uploaded images correspond to the inspected PNGs, and confirm rendering in GitHub's PR preview/body when available. Show the screenshots in the final chat response as well, using the same URLs.
