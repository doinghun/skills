---
name: conductor-crew
description: 'Coordinate a Conductor coding crew, in cloud workspaces (conductor CLI) or local workspaces on the Mac (Conductor MCP control tools): Fable plans, Opus implements, GPT reviews, and Sonnet captures before/after screenshots for PRs. Use when asked to run conductor-crew or delegate a task through this crew workflow.'
---

# Conductor Crew

Run the requested task through separate Conductor sessions with shared files and explicit handoffs. The coordinator owns progress, verification, and PR preparation. Creating or editing this skill alone does not launch the crew.

## Transport

Check `CONDUCTOR_IS_LOCAL` first.

- `0` (cloud sandbox): use the `conductor` CLI as written in this file.
- `1` (the user's Mac): read [the local MCP transport](references/local-mcp.md) before anything else. Local workspaces are driven with Conductor's MCP control tools (`CreateSession`, `WaitForSessions`, and the rest), not with the CLI. That file replaces the readiness, session command, and monitoring sections below; the roles, stages, screenshot procedure, and PR rules here still apply.

## Roles

| Role        | Conductor agent | Model family                        | Effort  | Responsibility                                                          |
| ----------- | --------------- | ----------------------------------- | ------- | ----------------------------------------------------------------------- |
| Planner     | `claude`        | Newest Fable                        | `xhigh` | Read the code and write an executable plan; no implementation.          |
| Implementer | `claude`        | Newest Opus (1M variant if offered) | `high`  | Implement, test, and resolve review findings.                           |
| Reviewer    | `codex`         | Newest GPT, top tier (astra)        | `xhigh` | Independently review the actual diff and verify fixes; no source edits. |
| Screenshots | `claude`        | Newest Sonnet                       | `low`   | Capture and inspect real before/after PNGs; no feature edits.           |

Do not hardcode model IDs or efforts. Before launching, resolve them and save the result in `state.json`:

```bash
conductor model --json | node ~/.claude/skills/conductor-crew/scripts/resolve-models.mjs
```

On the local transport, feed it the saved `ListModels` result instead (see the local MCP transport file).

It prints `{ "<role>": { "agent", "model", "effort" } }` for `planner`, `implementer`, `reviewer`, and `screenshots`, and exits non-zero if a family has no model or an agent does not support the role's effort. The script is the single source for these values; change a role's family or effort there. Use the resolved values for every session in the run, including retries. Follow explicit user overrides. If a family or requested model is unavailable, report the blocker rather than silently substituting another provider or model. Always pass `--effort` explicitly. `conductor model` lists efforts per agent, but some models accept fewer; if `session create` rejects an effort, report the accepted list instead of guessing another value. Leave fast mode off unless the user requests it. Use `max` or `ultra` only when the user requests them for a run.

Use Conductor sessions for these roles: internal subagents do not necessarily expose the requested providers. A role agent performs its assigned work and returns to the coordinator; it must not recursively launch another crew.

## Workspace and context

- Use the current workspace unless the user requests a new one. Cloud workspace setup is automatic; follow the readiness gate below without creating a setup agent. For a new workspace, use Fable as the first session and send its planning prompt after automatic setup finishes. Never copy the feature diff into the coordinating workspace just to take screenshots.
- Read the repository's `AGENTS.md` or `CLAUDE.md` and applicable instructions. Keep production credentials and services untouched; use local data as required by this repo. Do not rename the branch unless asked.
- Record the target workspace ID, branch, and base commit before edits. The target is usually `origin/main`; record `git merge-base HEAD origin/main` as the screenshot baseline. Respect another explicitly requested base.
- Store working handoffs and PNGs in the target workspace's `.context/crew/`. Confirm that directory is ignored with `git check-ignore`; if necessary add `/.context/` to the local `.git/info/exclude`. These are working artifacts, not committed task summaries.
- Put the task, acceptance criteria, scope exclusions, user decisions, base commit, and role boundaries in `.context/crew/brief.md`. Include the exact plan path in every later prompt. Do not assume a new session inherits chat history.
- Keep resumable coordination state in `.context/crew/state.json`: task identity, workspace ID, branch, base commit, current stage, role session IDs/deep links, pending message IDs and prompt paths, last-read message cursors, and verified handoff paths. Update it at dispatch and completion. Record only coordination metadata, never credentials or raw transcripts. When resuming, reconcile it with current session status and files before dispatching work; an old handoff or review verdict alone does not establish completion for the current task.

When prior workspace context is relevant, list `conductor workspace list --mine --limit 100 --json`, paginate while `hasMore`, and select the relevant workspace IDs. Use `conductor sql --help` to discover the schema, then query only session metadata such as `session_id`, `workspace_id`, `agent_type`, `model`, and timestamps, scoped to those workspaces. Do not select `transcript` or use `SELECT *`, and do not fetch historical `conductor session message` output directly into model context: even concise transcripts may contain pasted production credentials or raw CI logs. Read only task-relevant summaries or excerpts sanitized before tool output reaches any agent; narrowing the query or redacting after reading is insufficient. If no verified sanitization path or already-sanitized handoff is available, continue from the repository and current brief; request sanitized context only if the missing history blocks the task. Do not ask another agent to read raw history as a workaround. Verify historical code claims locally and let the current user's instructions supersede old model choices, upload methods, and scope decisions. Do not relay private transcript contents into a PR.

## Run the crew

1. **Plan.** After the readiness gate below, give Fable the brief and ask for `.context/crew/plan.md`: verified file paths, proposed behavior, existing helpers to reuse, meaningful tests and exact check commands, a screenshot capture plan, and any open decisions with recommended defaults. Follow defaults for routine implementation choices; surface a missing decision only if it materially blocks the authorized work. The planner does not implement or publish.
2. **Capture before.** Give the screenshot role the plan, baseline commit, screens, and required states. Follow [the screenshot procedure](references/screenshots.md). Obtain and visually check baseline PNGs before changing the UI. If implementation already began, capture the recorded baseline from an isolated local worktree without resetting the feature checkout.
3. **Implement.** Give Opus the brief and plan. It owns feature edits and tests, follows repository testing rules, and reports exact commands/results plus deviations. Only one role writes source files at a time. It must not push, create a PR, merge, or upload screenshots on its own.
4. **Capture after and review.** Once the implementation is stable, have the screenshot role capture the matching after states and remove any temporary harness. Then give GPT the brief, plan, baseline, current diff, checks, and screenshot paths. Review the actual files and behavior rather than trusting the implementer's report. The reviewer checks correctness, relevant auth/tenant boundaries, regressions, test quality, scope, and whether the screenshots show the claimed result. Ask for actionable findings with file/line, severity, evidence, and a ready/not-ready verdict. Feedback stays in the session or Conductor DiffComment when available; GitHub review comments require an explicit request.
5. **Fix and re-review.** Send actionable findings to the same Opus session. Rerun affected checks, refresh screenshots when rendered behavior changes, and send the resulting diff back to the same GPT session. A previous verdict does not cover later source changes. Continue while progress is possible; if the same blocker persists without progress, report the concrete blocker and required input instead of endlessly relaunching agents.
6. **Prepare the PR.** Require the reviewer to have checked the final source, relevant checks to pass (or precisely identify pre-existing failures), and the screenshot pair to be inspected and uploaded by the coordinator using the `github-screenshot-upload` skill. Every crew PR includes the screenshot table from [the screenshot procedure](references/screenshots.md), immediately after the Summary section. This requirement also applies to non-UI work: capture a meaningful rendered before/after result, such as documentation output, and label it accurately. If no meaningful capture is possible or upload fails, finish all other work and report that PR publication is blocked; do not silently omit screenshots or invent visual evidence.

Create or update the PR when the user's task authorizes it; otherwise prepare the complete body locally. Do not ask for permission again when already authorized. Keep commits focused (one where practical), exclude `.context` and all capture harness files, and use the target base (usually `gh pr create --base main`). Put the exact multiline PR text in `.context/crew/pr-body.md` and pass `--body-file` to `gh pr create` or `gh pr edit`. Never merge without explicit user confirmation.

## Automatic setup readiness

The cloud computer's setup script writes the development env files, so do not pass env files when you create a workspace. Follow the built-in Conductor skill and the target repository's setup configuration; do not assume a particular setup source or sequence. Follow the target repository’s own instructions for configuration and readiness checks. Do not launch a setup agent or rerun bootstrap commands as a crew stage.

Before dispatching planning, poll `conductor workspace status <workspaceId> --json`. `status: ready` can appear while `lifecycleStep: setting_up` is still present, and an initial agent message can run during that interval. Wait for `status: ready` with no setup lifecycle step remaining; on a failed setup, report the failure before dispatching dependent work. Keep polling waits at most 60 seconds.

Use lightweight read-only checks for the prerequisites required by the task and repository, including dependency/generated-output freshness and local services when relevant. Derive service endpoints from verified development configuration rather than fixed names or ports. Confirm env-file presence separately without printing credentials; unknown env provenance is not permission to read or reuse credentials. The coordinator checks directly when in the target workspace; for a remote workspace, include these checks and the applicable repository reference at the start of Fable's planning prompt and require it to report missing prerequisites before planning.

Record the readiness evidence in `.context/crew/state.json` or the planning handoff; no separate setup handoff is required. Existing workspaces may have been created before automatic setup was configured, or may have stale outputs after branch changes. Report missing prerequisites or failed checks instead of silently installing, migrating, or inventing a replacement bootstrap. Use the computer-admin workflow when setup repair is part of the user's task.

## Session commands and handoffs

Write complete prompts to files to preserve quoting and newlines. Each prompt states the role, task, target workspace, paths to handoffs, allowed edits, validation, and required output. Tell roles to keep credentials and raw environment/CI logs out of replies and handoffs. Only the coordinator dispatches later stages.

Before each new role session, generate and save a session ID and initial message ID (for example UUIDs) in `state.json`, then load them into `CREW_ROLE_SESSION_ID` and `CREW_ROLE_MESSAGE_ID`. Use new IDs for each role; reuse the saved pair and unchanged prompt when retrying that same dispatch. Load the resolved values into `CREW_<ROLE>_AGENT`, `CREW_<ROLE>_MODEL`, and `CREW_<ROLE>_EFFORT` (for example `CREW_PLANNER_AGENT`, `CREW_PLANNER_MODEL`, and `CREW_PLANNER_EFFORT`); never hardcode the agent. In the target workspace, create sessions with an explicit workspace ID:

```bash
conductor session create --workspace "$CREW_WORKSPACE_ID" \
  --session-id "$CREW_ROLE_SESSION_ID" --message-id "$CREW_ROLE_MESSAGE_ID" \
  --agent "$CREW_PLANNER_AGENT" --model "$CREW_PLANNER_MODEL" --effort "$CREW_PLANNER_EFFORT" \
  --name "Crew planner" --message-file .context/crew/planner-prompt.md --json

conductor session create --workspace "$CREW_WORKSPACE_ID" \
  --session-id "$CREW_ROLE_SESSION_ID" --message-id "$CREW_ROLE_MESSAGE_ID" \
  --agent "$CREW_SCREENSHOTS_AGENT" --model "$CREW_SCREENSHOTS_MODEL" --effort "$CREW_SCREENSHOTS_EFFORT" \
  --name "Crew screenshots" --message-file .context/crew/screenshots-prompt.md --json

conductor session create --workspace "$CREW_WORKSPACE_ID" \
  --session-id "$CREW_ROLE_SESSION_ID" --message-id "$CREW_ROLE_MESSAGE_ID" \
  --agent "$CREW_IMPLEMENTER_AGENT" --model "$CREW_IMPLEMENTER_MODEL" --effort "$CREW_IMPLEMENTER_EFFORT" \
  --name "Crew implementer" --message-file .context/crew/implementer-prompt.md --json

conductor session create --workspace "$CREW_WORKSPACE_ID" \
  --session-id "$CREW_ROLE_SESSION_ID" --message-id "$CREW_ROLE_MESSAGE_ID" \
  --agent "$CREW_REVIEWER_AGENT" --model "$CREW_REVIEWER_MODEL" --effort "$CREW_REVIEWER_EFFORT" \
  --name "Crew reviewer" --message-file .context/crew/reviewer-prompt.md --json
```

These are individual commands for the stages above, not a batch to launch simultaneously. Create the workspace with `conductor workspace create`, following the built-in Conductor skill, and use the CLI for subsequent monitoring, sessions, and messages. Pass `--agent "$CREW_PLANNER_AGENT" --model "$CREW_PLANNER_MODEL" --effort "$CREW_PLANNER_EFFORT"` without an initial message. Save the returned workspace and first session IDs, wait for automatic setup using the readiness gate, then send the planning prompt to that first planner session instead of creating a duplicate. A `--message-file` is read on the machine running the CLI, so keep prompts locally available and tell each role to write handoffs in its target checkout. Include the readiness gate directly in the planning prompt if the target computer does not have this skill.

Save each returned session ID and deep link. Reuse sessions for follow-ups with `conductor message create --session "$CREW_SESSION_ID" --message-id "$CREW_MESSAGE_ID" --message-file <prompt-file>`. Save a new message ID and prompt for each new instruction; an unchanged retry uses the same ID. The [Conductor API contract](https://api.conductor.build/v0/openapi.json) documents session-create retries with the same session/message IDs, and `conductor message create --help` documents message idempotency. Check installed help before relying on these flags in another environment.

### Monitor, retry, and resume

- **Confirm the latest request completed.** Monitor `conductor session status` and read new output with `conductor session message <sessionId> --after <lastMessageId>`; advance the saved cursor and paginate when needed. A queued message can leave a session `idle` before work starts. Wait for `working` followed by `idle`, or a completion reply for the latest dispatched prompt if a short run finishes between polls. In either case, verify the required artifacts and acceptance criteria; an old reply, idle status, or existing file is insufficient.
- **Reconcile uncertain delivery.** If creation or sending times out, inspect the saved session/message IDs before retrying. Retry a transient failure with the same IDs and unchanged prompt; never generate fresh IDs just because the response was lost. Workspace creation has no equivalent ID flags in the current CLI: look for the attempted workspace before repeating it. Resolve persistent errors instead of repeatedly launching replacements.
- **Resume existing work.** Reuse the recorded role sessions and check for active work before sending another instruction. Verify that the task, target branch, and handoffs still match. If another task is using `.context/crew/`, use a separate task directory and update all prompt paths rather than overwriting its files. Revalidate checks and review evidence when source changes; do not replay already completed stages merely because the coordinator restarted.
- **Handle cancellation deliberately.** If the user stops the crew, cancel its active role sessions with `conductor session cancel <sessionId>` and check they have stopped before handing source ownership to another writer. Cancel only sessions owned by this run; leave unrelated sessions alone.

Poll at a reasonable interval, keep waits at most 60 seconds, and update the user during long work.

Finish with a self-contained reply: outcome, PR or workspace deep link, actual role/model choices and deviations, exact verification commands/results, screenshot images or links, and any unresolved blocker. Do not leave the user with only “the implementer is working.”
