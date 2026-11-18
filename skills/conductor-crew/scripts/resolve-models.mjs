#!/usr/bin/env node
// Resolve each crew role to the newest model ID in its family, plus its effort level.
// Run from this skill's directory (the install path differs per tool and config dir):
// Usage (cloud CLI):  conductor model --json | node scripts/resolve-models.mjs
// Usage (local MCP):  node scripts/resolve-models.mjs < <worktree>/.context/crew/models.json
//   where models.json is the saved result of the Conductor `ListModels` tool ({"items":[...]}).
// Prints {"planner":{"agent":"claude","model":"fable-5-1","effort":"xhigh"},...};
// exits 1 if a required role has no model or the effort is not supported.
// The screenshots role is optional: when it is unresolved, it is left out of the output with a
// stderr warning, so a "no visible change" run is not blocked. A capture plan then needs it.
// Warns on stderr about GPT tiers it does not know: they are skipped, so a new tier needs GPT_TIERS.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const GPT_TIERS = ['luna', 'terra', 'sol', 'astra'];

const ROLES = {
  // Newest Fable.
  planner: {
    agent: 'claude',
    effort: 'xhigh',
    match: (id) => parseClaude(id, 'fable'),
  },
  // Newest Opus, 1M-context variant when that version has one.
  implementer: {
    agent: 'claude',
    effort: 'high',
    match: (id) => parseClaude(id, 'opus'),
  },
  // Newest GPT, top tier (astra > sol > terra > luna) within that version.
  reviewer: { agent: 'codex', effort: 'xhigh', match: parseGpt },
  // Newest Sonnet: fastest role with correct captures in the Sep 2026 benchmark.
  // Optional: only a plan with a capture plan starts this role.
  screenshots: {
    agent: 'claude',
    effort: 'low',
    optional: true,
    match: (id) => parseClaude(id, 'sonnet'),
  },
};

// fable-5-1 -> [5, 1, 0, 0]; opus-5-5-1m -> [5, 5, 0, 1]. Version padded so the 1M flag compares last.
function parseClaude(id, family) {
  const m = id.match(new RegExp(`^${family}-(\\d+(?:-\\d+)*)(-1m)?$`));
  if (!m) return null;
  const version = m[1].split('-').map(Number);
  if (version.length > 3) return null;
  return [...version, ...Array(3 - version.length).fill(0), m[2] ? 1 : 0];
}

// gpt-6-astra -> [6, 0, 4]; gpt-5.6-sol -> [5, 6, 3]; gpt-5.5 -> [5, 5, 0]. Skips -codex, -spark, etc.
function parseGpt(id) {
  const m = id.match(/^gpt-(\d+)(?:\.(\d+))?(?:-([a-z]+))?$/);
  if (!m) return null;
  const tier = m[3] ? GPT_TIERS.indexOf(m[3]) + 1 : 0;
  if (tier === 0 && m[3]) return null;
  return [Number(m[1]), Number(m[2] ?? 0), tier];
}

function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Both catalog shapes become { <agent>: { models: [{ id, efforts }] } }.
// Cloud (`conductor model --json`): { agents: [{ agent, models: [id], efforts }] }, efforts per agent.
// Local (`ListModels` tool): { items: [{ agent, id, effortLevels }] }, efforts per model.
function normalize(catalog) {
  const agents = {};
  for (const a of catalog.agents ?? []) {
    agents[a.agent] = {
      models: (a.models ?? []).map((id) => ({ id, efforts: a.efforts ?? [] })),
    };
  }
  for (const m of catalog.items ?? []) {
    agents[m.agent] ??= { models: [] };
    agents[m.agent].models.push({ id: m.id, efforts: m.effortLevels ?? [] });
  }
  return agents;
}

export function resolveModels(catalog) {
  const agents = normalize(catalog);
  const result = {};
  const missing = [];
  const optionalMissing = [];
  for (const [role, { agent, effort, optional, match }] of Object.entries(ROLES)) {
    const unresolved = optional ? optionalMissing : missing;
    const entry = agents[agent];
    const ranked = (entry?.models ?? [])
      .map((m) => ({ ...m, key: match(m.id) }))
      .filter((m) => m.key)
      .sort((a, b) => compare(b.key, a.key));
    if (ranked.length === 0) unresolved.push(`${role} (${agent} model)`);
    else if (!ranked[0].efforts.includes(effort))
      unresolved.push(`${role} (${agent} effort ${effort})`);
    else result[role] = { agent, model: ranked[0].id, effort };
  }
  return { result, missing, optionalMissing, warnings: unknownGptTiers(agents) };
}

// gpt-7-nova is skipped by parseGpt. Say so, or a new tier silently loses to an older version.
function unknownGptTiers(agents) {
  const warnings = [];
  for (const { models } of Object.values(agents)) {
    for (const { id } of models) {
      const m = id.match(/^gpt-\d+(?:\.\d+)?-([a-z]+)$/);
      if (m && m[1] !== 'codex' && !GPT_TIERS.includes(m[1]))
        warnings.push(`${id}: unknown GPT tier "${m[1]}", skipped (add it to GPT_TIERS)`);
    }
  }
  return warnings;
}

// Compare real paths: Node resolves symlinks for import.meta.url but not for argv[1],
// and `npx skills add` installs skills as symlinks.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { result, missing, optionalMissing, warnings } = resolveModels(JSON.parse(input));
  for (const w of warnings) console.error(`Warning: ${w}`);
  for (const o of optionalMissing)
    console.error(`Warning: Optional role unresolved: ${o}; a capture plan cannot run without it`);
  if (missing.length) {
    console.error(`Cannot resolve: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}
