# Cloud transport: `conductor` CLI

Use this file when the coordinator runs in a Conductor cloud sandbox (`CONDUCTOR_IS_LOCAL=0`). The roles, stages, screenshot procedure, and PR rules in `SKILL.md` apply. Run the commands below from the skill directory (`<skill-dir>`, the directory that contains `SKILL.md`), or use absolute paths.

## Resolve models

```bash
conductor model --json | node <skill-dir>/scripts/resolve-models.mjs
```

`conductor model` lists efforts per agent, but some models accept fewer. If `session create` rejects an effort, report the accepted list. Do not guess another value.

## Automatic setup readiness

The cloud computer's setup script writes the development env files, so do not pass env files when you create a workspace. Follow the built-in Conductor skill and the target repository's setup configuration and readiness instructions. Do not assume a setup source or sequence. Do not launch a setup agent or rerun bootstrap commands as a crew stage.

Before you dispatch planning, poll `conductor workspace status <workspaceId> --json`. `status: ready` can appear while `lifecycleStep: setting_up` is still present, and an initial agent message can run in that interval. Wait for `status: ready` with no setup lifecycle step. On a failed setup, report the failure before you dispatch dependent work. Keep each polling wait at 60 seconds or less.

Do lightweight read-only checks for the prerequisites that the task and repository need: dependency and generated-output freshness, and local services when relevant. Get service endpoints from verified development configuration, not from fixed names or ports. Confirm that env files exist without printing them. Unknown env provenance is not permission to read or reuse credentials. The coordinator checks directly when it is in the target workspace. For a remote workspace, put these checks and the repository reference at the start of the planning prompt, and require the planner to report missing prerequisites before it plans.

Record the readiness evidence in `state.json` or the planning handoff. Existing workspaces can predate automatic setup or have stale outputs after a branch change. Report missing prerequisites or failed checks. Do not silently install, migrate, or invent a bootstrap. Use the computer-admin workflow when setup repair is part of the user's task.

## Session commands

Before each new role session, generate a session ID and an initial message ID (UUIDs) and save them in `state.json`. Load them into `CREW_ROLE_SESSION_ID` and `CREW_ROLE_MESSAGE_ID`. Load the resolved values into `CREW_<ROLE>_AGENT`, `CREW_<ROLE>_MODEL`, and `CREW_<ROLE>_EFFORT`. Never hardcode the agent. Create each session with an explicit workspace ID, one stage at a time (not as a batch):

```bash
conductor session create --workspace "$CREW_WORKSPACE_ID" \
  --session-id "$CREW_ROLE_SESSION_ID" --message-id "$CREW_ROLE_MESSAGE_ID" \
  --agent "$CREW_PLANNER_AGENT" --model "$CREW_PLANNER_MODEL" --effort "$CREW_PLANNER_EFFORT" \
  --name "Crew planner" --message-file .context/crew/planner-prompt.md --json
```

Use the same form for `Crew screenshots`, `Crew implementer`, and `Crew reviewer` with that role's variables and prompt file.

For a new workspace, use `conductor workspace create` as the built-in Conductor skill says. Pass `--agent "$CREW_PLANNER_AGENT" --model "$CREW_PLANNER_MODEL" --effort "$CREW_PLANNER_EFFORT"` without an initial message. Save the returned workspace and first session IDs, wait for the readiness gate, then send the planning prompt to that first session. Do not create a duplicate planner. A `--message-file` is read on the machine that runs the CLI, so keep prompts there and tell each role to write handoffs in its target checkout. If the target computer does not have this skill, put the readiness gate in the planning prompt.

Save each returned session ID and deep link. Send follow-ups to the same session:

```bash
conductor message create --session "$CREW_SESSION_ID" --message-id "$CREW_MESSAGE_ID" --message-file <prompt-file>
```

Save a new message ID and prompt for each new instruction. An unchanged retry uses the same ID. The [Conductor API contract](https://api.conductor.build/v0/openapi.json) documents session-create retries with the same IDs, and `conductor message create --help` documents message idempotency. Check the installed help before you rely on these flags in another environment.

## Monitor, retry, resume, cancel

- **Confirm the latest request completed.** Monitor `conductor session status` and read new output with `conductor session message <sessionId> --after <lastMessageId>`. Advance the saved cursor and paginate when needed. A queued message can leave a session `idle` before work starts. Wait for `working` followed by `idle`, or a completion reply for the latest prompt if a short run finishes between polls. Then verify the required artifacts and acceptance criteria.
- **Reconcile uncertain delivery.** If creation or sending times out, inspect the saved IDs before you retry. Retry a transient failure with the same IDs and the same prompt. Workspace creation has no ID flags in the current CLI: look for the attempted workspace before you repeat it.
- **Resume.** Reuse the recorded role sessions and check for active work before you send another instruction.
- **Cancel.** If the user stops the crew, run `conductor session cancel <sessionId>` for this run's active role sessions only, and check that they stopped before another role writes source files.

Keep each polling wait at 60 seconds or less, and update the user during long work.
