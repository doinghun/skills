# skills

Agent skills I use every day with Claude Code and Codex, mostly inside [Conductor](https://conductor.build).

| Skill | What it does | Needs |
| --- | --- | --- |
| [pr-babysit](skills/pr-babysit) | Owns a PR from local change to a clean review: local Codex review, push, wait for the Codex bot on GitHub, fix, reply, resolve, repeat. Never merges. | `gh`, `jq`, Conductor CLI, Codex GitHub review bot |
| [github-screenshot-upload](skills/github-screenshot-upload) | Uploads PNG screenshots to GitHub user-attachments and returns embeddable URLs. Works on private repositories. | `gh`, `jq`, `curl` |
| [visual-proof](skills/visual-proof) | Real before/after screenshots of a UI change from the local app, with a self-contained HTML report. | `agent-browser`, Node.js, a local Postgres |
| [conductor-crew](skills/conductor-crew) | Runs a task through a crew of Conductor sessions: Fable plans, Opus implements, GPT reviews, Sonnet captures before/after screenshots. Works in cloud workspaces (Conductor CLI) and in local workspaces on a Mac (Conductor MCP control tools). | Conductor, Node.js |

## Install

```bash
npx skills add doinghun/skills                      # all skills
npx skills add doinghun/skills --skill pr-babysit   # one skill
```

Or copy a folder from `skills/` into `~/.claude/skills/` (Claude Code) or `~/.codex/skills/` (Codex).

Each skill finds its scripts relative to its own directory, so any install location works.
