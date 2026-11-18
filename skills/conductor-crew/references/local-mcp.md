# Local transport: Conductor MCP control tools

Use this file when the coordinator runs on the user's Mac (`CONDUCTOR_IS_LOCAL=1`). Local workspaces are git worktrees on that Mac. The `conductor` CLI manages cloud workspaces only, so it cannot create or drive local sessions. Conductor's MCP server (`conductor`) does that with its control tools.

The roles, the brief, the six stages in "Run the crew", the screenshot procedure, and the PR rules in `SKILL.md` apply. This file gives the commands for them. For every path, use the repository root of the target worktree. `<skill-dir>` is the directory that contains `SKILL.md`.

## Preflight

1. Find the control tools. In Claude Code they are named `mcp__conductor__<Tool>` and can be deferred; load their schemas first. Required: `WhoAmI`, `ListModels`, `CreateSession`, `SendSessionMessage`, `WaitForSessions`, `GetSessions`, `ListSessionMessages`, `CancelSessions`. For a new workspace also `CreateWorkspace` and `GetWorkspaces`.
2. If the tools are absent, stop and tell the user that Conductor's local control tools are not enabled for this session. Do not fall back to the CLI (it would start cloud workspaces) and do not replace the roles with internal subagents.
3. Call `WhoAmI`. Save your own session ID, the workspace ID and `path`, the repository ID, and `permissionLevel` in `state.json`. Your session ID is the ownership key for every session this run starts.
4. The schema shown in the session is the contract. If it differs from this file, follow the schema.

## Tool map

| Step                        | Cloud CLI (`SKILL.md`)                       | Local MCP tool                                                     |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Identity and own workspace  | `conductor workspace get`                    | `WhoAmI`                                                           |
| Model catalog               | `conductor model --json`                     | `ListModels`                                                       |
| Start a role                | `conductor session create`                   | `CreateSession`                                                    |
| Follow-up to the same role  | `conductor message create`                   | `SendSessionMessage`                                               |
| Wait for a role             | poll `conductor session status`              | `WaitForSessions`                                                  |
| Read replies                | `conductor session message --after`          | `ListSessionMessages` with `filter.afterIndex`                     |
| Stop a role                 | `conductor session cancel`                   | `CancelSessions`                                                   |
| New isolated workspace      | `conductor workspace create` + status poll   | `CreateWorkspace`, then `WaitForSessions` / `GetWorkspaces`        |
| Links for the user          | deep link                                    | `appUrl` on every workspace and session                            |

## Resolve models

Call `ListModels` with `{ "limit": 200 }`. If `nextCursor` is not null, read the next pages and join the `items`. Write the result to `.context/crew/models.json` as `{ "items": [...] }` without changes, then run:

```bash
node <skill-dir>/scripts/resolve-models.mjs < .context/crew/models.json
```

The script accepts this shape and checks the effort against the picked model's own `effortLevels`. Save its output in `state.json`. A non-zero exit is a blocker to report, not a reason to pick another model. Agents are `claude`, `codex`, `cursor`, or `muse`; ACP agents cannot be started with these tools.

## Start a role session

The control tools take the prompt as a `message` string, not a file. Roles in one workspace share the worktree, so keep the same file handoff:

1. Write the complete prompt to `.context/crew/<role>-prompt.md` (role, task, target workspace path, handoff paths, allowed edits, validation, required output, no credentials or raw logs in replies).
2. Generate a `sessionId` and a `messageId` (UUIDs, for example `uuidgen | tr 'A-Z' 'a-z'`) and save them in `state.json` before the call.
3. Call `CreateSession`. `workspaceId` defaults to your own workspace; pass it when the target is another workspace.

```json
{
  "sessionId": "<saved uuid>",
  "messageId": "<saved uuid>",
  "agent": "claude",
  "model": "<resolved planner model>",
  "effort": "<resolved planner effort>",
  "title": "Crew planner",
  "message": "You are the crew planner. Read and follow <absolute path>/.context/crew/planner-prompt.md. Write the plan to <absolute path>/.context/crew/plan.md, then reply with the path and a short summary."
}
```

Use titles `Crew planner`, `Crew screenshots`, `Crew implementer`, and `Crew reviewer`. Start one role per stage, not all four at once. Save the returned `session.id` and `session.appUrl`.

If the result has `messageError`, the session exists but the prompt was not sent. Send it with `SendSessionMessage` and the same `messageId`; do not create a second session.

Follow-ups to the same role (review findings to the implementer, the new diff to the reviewer) use `SendSessionMessage` with `{ sessionId, messageId, message }`. Use a new saved `messageId` for each new instruction. The message is queued and runs after the session's current turn.

## Wait and read

- Call `WaitForSessions` with `{ "ids": [<sessionId>], "until": "allSettled" }`. One call waits at most 50 seconds (`timeoutMs` default 45000). While `timedOut` is true, call it again, and give the user a short status during long work.
- Settled states:
  - `idle`: the turn ended. Read the reply.
  - `waiting_for_user`: the role needs a permission or an answer. Tell the user and give the session `appUrl`. Do not answer for the user.
  - `error`: read the last messages, then report the error or retry the same instruction with the same `messageId`.
  - ID in `missingIds`: the session is gone. Reconcile with `ListSessions` before you start a replacement.
- Read replies with `ListSessionMessages`: `{ "sessionId": ..., "filter": { "afterIndex": <saved lastIndex> }, "sort": { "field": "index", "direction": "asc" } }`. Follow `nextCursor` until null. Save the returned `lastIndex` in `state.json` as the cursor for that role. On the first read, omit `afterIndex`.
- Long message text is truncated. A reply is a pointer only: read the handoff file the role wrote (`plan.md`, review findings, screenshot paths) and check the acceptance criteria. An `idle` state, an old reply, or an existing file does not prove that the latest instruction was done; require a reply with an `index` above the saved cursor.

## Retry, resume, cancel

- **Retry with the same IDs.** `CreateSession`, `SendSessionMessage`, and `CreateWorkspace` are idempotent on their IDs: a retry returns what the first call made. After a timeout or an unclear result, repeat the call with the saved IDs and the same prompt. Never generate new IDs because a response was lost.
- **Resume.** Read `state.json`, then call `GetSessions` with the saved role session IDs. Continue with those sessions when the task, branch, and handoffs still match. Do not replay completed stages. If another task uses `.context/crew/`, use a separate directory and change all prompt paths.
- **Resource limits.** On `insufficient_resources` for disk or memory, stop creating work and tell the user. For `concurrent_setups`, wait `retryAfterSeconds`, then retry with the same IDs.
- **Cancel.** `CancelSessions` can stop any session in the repository, including ones the user started. Cancel only sessions whose `createdBySessionId` is your own session ID from `WhoAmI`. After a cancel, confirm with `GetSessions` that the role is not `running` before another role writes source files. Do not archive role sessions unless the user asks; they are the record of the run.
- **Other sessions.** The tools can read and change every local session on the Mac. Do not message, cancel, or archive sessions this run did not start. Do not read old transcripts with `ListSessions` / `ListSessionMessages` to recover context: they can contain pasted credentials or raw logs. Work from the repository and the current brief.

## New local workspace

Use your own workspace unless the user asks for a new one or the work needs its own worktree and branch.

- Generate and save `workspaceId`, `sessionId`, and `messageId`, then call `CreateWorkspace` with `{ workspaceId, name, baseBranch?, repositoryId?, firstSession: { sessionId, messageId, agent, model, effort, title, message } }`. `repositoryId` defaults to your repository.
- `firstSession.message` is required and the new worktree has no `.context/crew/` yet. Put the complete planning prompt inline in that message, including the brief and the readiness checks below. The first session is the planner.
- The call returns while the workspace is `initializing`. Conductor creates the worktree, runs the setup script, and sends the message when the workspace is ready. There is no manual readiness poll: wait with `WaitForSessions`.
- If `GetWorkspaces` shows `failed` (read `failureReason`) or lists the ID in `missingIds`, creation failed. Report the reason, then create again with a new `workspaceId` only if the cause is fixed.
- After the workspace is `ready`, use `workspace.path` as the target checkout. Write later prompts and handoffs to `<workspace.path>/.context/crew/` and pass `workspaceId` to every `CreateSession`.

## Local readiness

Local setup is the repository's setup script plus Conductor's "Files to copy"; there is no cloud computer. Before planning (or in the planning prompt for a new workspace), do read-only checks only:

- Dependencies and generated outputs are present and fresh for the task.
- Env files exist. Do not print them. They must point at local data; never fetch or reuse production credentials.
- Local services the task needs are reachable. Derive endpoints from the development configuration.
- Each local workspace has its own ports (`CONDUCTOR_PORT` to `CONDUCTOR_PORT+9`), but all workspaces on the Mac share local services such as the database. Only one role runs a dev server in a workspace at a time, and a role must not reset or migrate shared local data unless the task requires it.

Report a missing prerequisite. Do not install, migrate, or invent a bootstrap silently. Record the evidence in `state.json` or the planning handoff.

## State file additions

In `.context/crew/state.json`, in addition to the fields in `SKILL.md`: `transport: "local-mcp"`, coordinator session ID from `WhoAmI`, each role's `sessionId`, `appUrl`, pending `messageId` and prompt path, and the last-read `lastIndex`.

## Final reply

Same content as `SKILL.md` requires. Link each role session and workspace with its `appUrl`, not with an ID.

