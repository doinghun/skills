#!/usr/bin/env node
// Resolve each crew role to the newest model ID in its family, plus its effort level.
// Usage (cloud CLI):  conductor model --json | node resolve-models.mjs
// Usage (local MCP):  node resolve-models.mjs < .context/crew/models.json
//   where models.json is the saved result of the Conductor `ListModels` tool ({"items":[...]}).
// Prints {"planner":{"agent":"claude","model":"fable-5-1","effort":"xhigh"},...};
// exits 1 if a role has no model, its agent has no credentials, or the effort is not supported.

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
  screenshots: {
    agent: 'claude',
    effort: 'low',
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

// Both catalog shapes become { <agent>: { configured, models: [{ id, efforts }] } }.
// Cloud (`conductor model --json`): { agents: [{ agent, models: [id], efforts, configured? }] }.
// Local (`ListModels` tool): { items: [{ agent, id, effortLevels }] }, efforts per model.
function normalize(catalog) {
  const agents = {};
  for (const a of catalog.agents ?? []) {
    agents[a.agent] = {
      configured: a.configured !== false,
      models: (a.models ?? []).map((id) => ({ id, efforts: a.efforts ?? [] })),
    };
  }
  for (const m of catalog.items ?? []) {
    agents[m.agent] ??= { configured: true, models: [] };
    agents[m.agent].models.push({ id: m.id, efforts: m.effortLevels ?? [] });
  }
  return agents;
}

export function resolveModels(catalog) {
  const agents = normalize(catalog);
  const result = {};
  const missing = [];
  for (const [role, { agent, effort, match }] of Object.entries(ROLES)) {
    const entry = agents[agent];
    const ranked = (entry?.models ?? [])
      .map((m) => ({ ...m, key: match(m.id) }))
      .filter((m) => m.key)
      .sort((a, b) => compare(b.key, a.key));
    if (ranked.length === 0) missing.push(`${role} (${agent} model)`);
    else if (!entry.configured) missing.push(`${role} (${agent} not configured)`);
    else if (!ranked[0].efforts.includes(effort))
      missing.push(`${role} (${agent} effort ${effort})`);
    else result[role] = { agent, model: ranked[0].id, effort };
  }
  return { result, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { result, missing } = resolveModels(JSON.parse(input));
  if (missing.length) {
    console.error(`Cannot resolve: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}
