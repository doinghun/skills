---
name: visual-proof
description: Show a UI change with real screenshots from the local app. Seeds a logged-in test user, starts the dev server, captures before/after PNGs with agent-browser, builds a local HTML report, and can attach the images to the PR. Use when asked to "show me screenshots", "run browser/e2e test with an HTML report", "add screenshots to the PR", or to check that a UI change renders correctly.
---

# Visual Proof

Capture real, full-page screenshots of the running app, before and after a change. Everything this skill makes (seed, harness, PNGs, report) stays in `.context/visual-proof/` and is never committed. Check that the directory is ignored (`git check-ignore .context`); if not, add `/.context/` to `.git/info/exclude`.

Scripts live in `~/.claude/skills/visual-proof/scripts/` (below: `$VP`). Run them from the repository root.

This skill is a procedure, not a project setup. The seed, the dev-server command, and the login cookie are different in each repository. If the repository has `.context/visual-proof/project.md` or a section for this skill in `AGENTS.md` / `CLAUDE.md`, use those values. If not, find them in the README and the code, and write them to `.context/visual-proof/project.md` for the next run.

## What the user expects

- **Before and after**, same route, data, viewport, and steps. For a new screen, "before" is the real entry point or empty state as it was, not a blank image.
- **Whole real pages.** Not a component preview, not a mock, not HTML recreations. Desktop 1440×900 and mobile 390×844 unless the task says otherwise.
- **Every scenario the change touches**: with and without data, error and empty states.
- **Images in the chat**, as `![Label](</abs/path.png>)` with absolute paths.
- **No harness code in the repo**: no seed files, specs, or configs in the diff. A visual-check task allows no source edits at all unless the user says so.

## 1. Check the ground

```bash
VP=$HOME/.claude/skills/visual-proof/scripts
node $VP/local-db-url.cjs <env files> >/dev/null   # for example: apps/web/.env apps/web/.env.local; refuses a non-local DATABASE_URL
pg_isready -h localhost -p 5432                    # if down: start it and check again
```

Also check that dependencies and generated outputs (database client, built packages) are present. If the env files point at a non-local database, stop and tell the user. Never print env values. Never use production data or credentials.

## 2. Seed a test user

Create a user, the account or tenant it owns, and a session row with a known token, as plain SQL in `.context/visual-proof/seed.sql`. Make it re-runnable (delete, then insert) and prefix every id with `vp_`.

```bash
psql "$(node $VP/local-db-url.cjs <env files>)" -q -f .context/visual-proof/seed.sql
```

- Use the same `DATABASE_URL` as the dev server. A mismatch is the usual cause of a logged-out page.
- Plain SQL avoids the import traps of the app's ORM and server-only modules.
- Add the rows your scenario needs (products, orders, and so on) in `.context/visual-proof/extra.sql`, also with `vp_` ids.
- If the session cookie is signed, you cannot set it by hand. Go through the real sign-in screen and read the one-time code from the local database.

## 3. Start the dev server

Start it on a free port, in its own process group, with a log and a PID file. Example for Next.js:

```bash
OUT="$PWD/.context/visual-proof"; mkdir -p "$OUT"; PORT=3100
BASE="http://localhost:$PORT"
( cd <app dir> && <auth URL vars>="$BASE" <email provider key>=disabled \
  setsid nohup pnpm exec next dev -p "$PORT" >"$OUT/web-$PORT.log" 2>&1 </dev/null & echo $! >"$OUT/web-$PORT.pid" )
until curl -s -o /dev/null "$BASE"; do kill -0 "$(cat "$OUT/web-$PORT.pid")" || break; sleep 2; done
```

- Force every auth base-URL variable (`NEXTAUTH_URL`, `BETTER_AUTH_URL`, the public base URL) to `http://localhost:<port>`. A local env file can point them at an https tunnel, which renames the cookie to `__Secure-…` and breaks the login.
- Disable the email and SMS providers, so a local sign-in can never send a real message.
- Stop it with `kill "$(cat .context/visual-proof/web-<port>.pid)"`. Do not use `pkill -f "next dev"`: it matches your own shell.

Check the login before you open a browser:

```bash
curl -s -b <session cookie name>=<seeded token> "$BASE/api/auth/session"   # must show the seeded user; {} = logged out
```

## 4. Capture

```bash
export AGENT_BROWSER_SESSION=vp AGENT_BROWSER_ARGS="--no-sandbox,--disable-dev-shm-usage"
OUT="$PWD/.context/visual-proof/shots"; mkdir -p "$OUT"
agent-browser cookies set <session cookie name> <seeded token> --url "$BASE"
agent-browser set viewport 1440 900
agent-browser open "$BASE/<route>"                    # may print "CDP command timed out" on a cold route; continue
agent-browser wait --text "<text on the target screen>" --timeout 240000
agent-browser wait --load networkidle --timeout 120000
agent-browser eval "document.head.insertAdjacentHTML('beforeend','<style>nextjs-portal{display:none!important}</style>')"
agent-browser screenshot --full "$OUT/01-dashboard-desktop-after.png"
```

- `/dev/shm` is small on a container or cloud VM; without `--disable-dev-shm-usage` Chrome can crash mid-run. Launch args apply only when the browser starts, so run `agent-browser close` first if a browser is already open.
- If the browser relaunches (`launched browser` in the output), the cookie is gone: set it again.
- The first request to each route compiles and can take minutes. Wait for real text on the target screen, not a timer.
- The style line hides the Next.js dev button that otherwise sits on top of the content. Run it again after every navigation.
- Always pass an absolute screenshot path.
- Use `agent-browser snapshot -i` to find refs, then `click`/`fill` to reach each state.
- **Open every PNG and look at it.** Take it again if it shows grey loading placeholders, a sign-in page, an error overlay, or the wrong state.
- A React Native app can be captured through Expo web at a 390×844 viewport. Native-only APIs (for example `Alert.alert`) do nothing there; report what you could not capture.
- For a change to cart, checkout, pricing, or order creation, a screenshot is not enough: also place a real order in the local app and check the stored rows.

## 5. Before and after

Use the same dev server and swap the source under it; hot reload rebuilds the page. Only do this when no other agent is editing this checkout.

- **Uncommitted change:** `git stash push -u -m visual-proof-before`, capture "before", then `git stash pop` and check `git status` matches what it was.
- **Committed change** (working tree must be clean first):
  ```bash
  git diff --name-only --diff-filter=M origin/main...HEAD > .context/visual-proof/changed.txt
  xargs git checkout origin/main -- < .context/visual-proof/changed.txt    # capture "before" now
  xargs git checkout HEAD -- < .context/visual-proof/changed.txt          # back to the branch
  git status --short                                                      # must be empty again
  ```
  Files added on the branch stay but nothing imports them in the "before" state. If the branch deletes or renames files, handle those by hand.

Wait for the page to rebuild and show the expected state before each capture. Name files `NN-<screen>-<viewport>-before.png` / `-after.png`. Avoid a second worktree with symlinked `node_modules`: Turbopack rejects it.

## 6. Report

Write `.context/visual-proof/manifest.json`:

```json
{ "title": "Checkout address step", "summary": "What changed, in one or two lines.",
  "rows": [ { "label": "Address step, desktop", "before": "shots/01-address-desktop-before.png",
              "after": "shots/01-address-desktop-after.png", "note": "Empty cart" } ] }
```

```bash
node $VP/build-report.mjs .context/visual-proof/manifest.json     # writes .context/visual-proof/report.html
```

The report is one file with the images inlined, so it opens anywhere. Tell the user its absolute path and show the key images in the chat.

## 7. PR (only when asked)

Upload the inspected PNGs with the `github-screenshot-upload` skill, then add a `## Screenshots` table (Before | After, `<img src="…" width="450">`) right after the PR's Summary section with `gh pr edit --body-file`. When the code changes again, capture again and replace the images.

## 8. Clean up

Stop the dev server, run `agent-browser close`, and restore any stash. Leave the seed rows (they are local and re-runnable). Check `git status` shows only the task's own changes.

## Report back

Say what you captured (routes, states, viewports), show the images, give the report path, and list anything you could not capture and why.
