---
name: conductor-crew
description: 'Coordinate a Conductor coding crew, in cloud workspaces (conductor CLI) or local workspaces on the Mac (Conductor MCP control tools): Fable plans, Opus implements, GPT reviews, and Sonnet captures before/after screenshots when the change is visible. Use when asked to run conductor-crew or delegate a task through this crew workflow.'
---

# Conductor Crew

Run the requested task through separate Conductor sessions with shared files and explicit handoffs. The coordinator owns progress, verification, and PR preparation. Creating or editing this skill alone does not launch the crew.

In this file, `<skill-dir>` is the directory that contains this `SKILL.md`. The install path differs per tool and config directory, so never assume `~/.claude/skills`.

## Transport

Check `CONDUCTOR_IS_LOCAL`, then read one transport file before anything else:

- `0` (cloud sandbox): [the cloud CLI transport](references/cloud-cli.md).
- `1` (the user's Mac): [the local MCP transport](references/local-mcp.md). Local workspaces are driven with Conductor's MCP control tools, not with the CLI.

The transport file gives the commands for model resolution, readiness, sessions, and monitoring. Everything in this file applies to both.

## Roles

| Role        | Conductor agent | Model family                        | Effort  | Responsibility                                                          |
| ----------- | --------------- | ----------------------------------- | ------- | ----------------------------------------------------------------------- |
| Coordinator | (this session)  | (as started)                        | —       | Dispatch stages, verify handoffs, own the PR.                           |
| Planner     | `claude`        | Newest Fable                        | `xhigh` | Read the code and write an executable plan; no implementation.          |
| Implementer | `claude`        | Newest Opus (1M variant if offered) | `high`  | Implement, test, and resolve review findings.                           |
| Reviewer    | `codex`         | Newest GPT, top tier                | `xhigh` | Independently review the actual diff and verify fixes; no source edits. |
| Screenshots | `claude`        | Newest Sonnet                       | `low`   | Capture and inspect real before/after PNGs; no feature edits.           |

Do not hardcode model IDs or efforts. Resolve them with `<skill-dir>/scripts/resolve-models.mjs` as the transport file says, and save the result in `state.json`. The script prints `{ "<role>": { "agent", "model", "effort" } }` and exits non-zero if a family has no model or the effort is not supported. It is the single source for these values; change a role's family or effort there. If it prints a warning about an unknown GPT tier, tell the user: that model was skipped.

Use the resolved values for every session in the run, including retries. Follow explicit user overrides. If a family or requested model is unavailable, report the blocker. Do not substitute another provider or model. Always pass the effort explicitly. Leave fast mode off unless the user requests it. Use `max` or `ultra` only when the user requests them.

Use Conductor sessions for these roles: internal subagents do not necessarily expose the requested providers. A role agent does its assigned work and returns to the coordinator. It must not launch another crew.

## Workspace and context

- Use the current workspace unless the user requests a new one. Never copy the feature diff into the coordinating workspace just to take screenshots.
- Read the repository's `AGENTS.md` or `CLAUDE.md` and applicable instructions. Keep production credentials and services untouched. Do not rename the branch unless asked.
- Record the target workspace ID, branch, and base commit before edits. The target is usually `origin/main`; record `git merge-base HEAD origin/main` as the screenshot baseline. Respect another base if the user asks for it.
- Store working handoffs and PNGs in the target workspace's `.context/crew/`. Confirm that directory is ignored with `git check-ignore`; if necessary, add `/.context/` to `.git/info/exclude`. These are working artifacts, not committed files.
- Put the task, acceptance criteria, scope exclusions, user decisions, base commit, and role boundaries in `.context/crew/brief.md`. Include the exact plan path in every later prompt. A new session does not inherit chat history.
- Keep resumable state in `.context/crew/state.json`: task identity, workspace ID, branch, base commit, current stage, role session IDs and links, pending message IDs and prompt paths, last-read cursors, and verified handoff paths. Update it at dispatch and completion. Record only coordination metadata, never credentials or raw transcripts. When you resume, reconcile it with current session status and files before you dispatch work. An old handoff or review verdict does not prove completion of the current task.
- Do not read old session transcripts to recover context: they can contain pasted credentials or raw CI logs. Work from the repository and the current brief, and verify any historical claim against the code.

## Run the crew

1. **Plan.** After the readiness gate in the transport file, give the planner the brief and ask for `.context/crew/plan.md`: verified file paths, proposed behavior, existing helpers to reuse, meaningful tests and exact check commands, open decisions with recommended defaults, and a screenshot decision. The screenshot decision is either a capture plan (screens, states, and capture method for this platform) or "no visible change" with the reason. Follow defaults for routine choices; surface a decision only if it blocks the authorized work. The planner does not implement or publish.
2. **Capture before.** Skip this stage if the plan says "no visible change". Otherwise give the screenshot role the plan, baseline commit, screens, and states, and follow [the screenshot procedure](references/screenshots.md). Get and visually check the baseline PNGs before the UI changes.
3. **Implement.** Give the implementer the brief and plan. It owns feature edits and tests, follows the repository's testing rules, and reports exact commands, results, and deviations. Only one role writes source files at a time. It must not push, create a PR, merge, or upload screenshots.
4. **Capture after and review.** When the implementation is stable and screenshots are in scope, have the screenshot role capture the matching after states and remove any temporary harness. Then give the reviewer the brief, plan, baseline, current diff, checks, and screenshot paths (if any). The reviewer checks the actual files and behavior, not the implementer's report: correctness, auth and tenant boundaries where relevant, regressions, test quality, scope, and whether the screenshots show the claimed result. Ask for findings with file/line, severity, and evidence, and a ready/not-ready verdict. Feedback stays in the session, or in Conductor DiffComment when available. GitHub review comments need an explicit request.
5. **Fix and re-review.** Send findings to the same implementer session. Rerun affected checks, refresh screenshots when rendered behavior changes, and send the new diff to the same reviewer session. A previous verdict does not cover later source changes. If the same blocker stays without progress, report it and the input you need. Do not keep launching agents.
6. **Prepare the PR.** The reviewer must have checked the final source, and the relevant checks must pass (or the pre-existing failures must be identified). If screenshots are in scope, the coordinator inspects the pair and uploads it with the `github-screenshot-upload` skill, and the PR has the screenshot table from [the screenshot procedure](references/screenshots.md) right after the Summary section. If the plan says "no visible change", state that in the PR body instead. If a capture or upload that is in scope fails, finish all other work and report that PR publication is blocked. Do not silently omit screenshots or invent visual evidence.

Create or update the PR when the user's task authorizes it; otherwise prepare the complete body locally. Do not ask for permission again when already authorized. Keep commits focused, exclude `.context` and all capture harness files, and use the target base (usually `gh pr create --base main`). Write the PR text to `.context/crew/pr-body.md` and pass `--body-file`. Never merge without explicit user confirmation.

## Prompts and handoffs

Write complete prompts to `.context/crew/<role>-prompt.md` to keep quoting and newlines. Each prompt states the role, task, target workspace, handoff paths, allowed edits, validation, and required output. Tell roles to keep credentials and raw environment or CI logs out of replies and handoffs. Only the coordinator dispatches later stages.

Generate and save new session and message IDs before each dispatch, and reuse the same IDs and unchanged prompt when you retry that dispatch. If another task already uses `.context/crew/`, use a separate task directory and update all prompt paths. If the user stops the crew, cancel only the sessions this run started, and confirm they stopped before another role writes source files.

## Final reply

Finish with a self-contained reply: outcome, PR or workspace link, actual role/model choices and deviations, exact verification commands and results, screenshot images or links (or "no visible change"), and any unresolved blocker. Do not leave the user with only "the implementer is working."
