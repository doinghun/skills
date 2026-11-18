// Run from this skill's directory: node --test scripts/resolve-models.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveModels } from './resolve-models.mjs';

const SCRIPT = fileURLToPath(new URL('./resolve-models.mjs', import.meta.url));

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

function catalog({ claude, codex, codexEfforts = EFFORTS }) {
  return {
    agents: [
      { agent: 'claude', models: claude, efforts: EFFORTS },
      { agent: 'codex', models: codex, efforts: codexEfforts },
    ],
  };
}

const models = (c) =>
  Object.fromEntries(
    Object.entries(resolveModels(c).result).map(([r, v]) => [r, v.model])
  );

test('picks the newest version in each family, whatever the list order', () => {
  const picked = models(
    catalog({
      claude: [
        'fable-5',
        'fable-5-1',
        'opus-4-8-1m',
        'opus-5-5-1m',
        'sonnet-4-6',
        'sonnet-5-5-1m',
      ],
      codex: ['gpt-5.5', 'gpt-5.6-sol', 'gpt-6-astra', 'gpt-6-luna'],
    })
  );
  assert.deepEqual(picked, {
    planner: 'fable-5-1',
    implementer: 'opus-5-5-1m',
    reviewer: 'gpt-6-astra',
    screenshots: 'sonnet-5-5-1m',
  });
});

test('prefers the 1M variant only within the same version', () => {
  // opus-5-1m is Opus 5 (1M), older than Opus 5.1.
  const picked = models(
    catalog({
      claude: [
        'fable-5',
        'opus-5-5',
        'opus-5-5-1m',
        'opus-5-1m',
        'opus-6',
        'sonnet-5',
      ],
      codex: ['gpt-6-sol'],
    })
  );
  assert.equal(picked.implementer, 'opus-6');
  const sameVersion = models(
    catalog({
      claude: ['fable-5', 'opus-5-5', 'opus-5-5-1m', 'sonnet-5'],
      codex: ['gpt-6-sol'],
    })
  );
  assert.equal(sameVersion.implementer, 'opus-5-5-1m');
});

test('reviewer takes the newest GPT, then the highest tier, and skips non-tier variants', () => {
  const picked = models(
    catalog({
      claude: ['fable-5', 'opus-5', 'sonnet-5'],
      codex: [
        'gpt-6-astra',
        'gpt-7-luna',
        'gpt-7-sol',
        'gpt-7.1-codex',
        'gpt-7-nova',
      ],
    })
  );
  assert.equal(picked.reviewer, 'gpt-7-sol');
});

test('reports a role it cannot resolve instead of substituting another model', () => {
  const noFable = resolveModels(
    catalog({ claude: ['opus-5', 'sonnet-5'], codex: ['gpt-6-astra'] })
  );
  assert.deepEqual(noFable.missing, ['planner (claude model)']);
  assert.equal(noFable.result.planner, undefined);

  const noXhigh = resolveModels(
    catalog({
      claude: ['fable-5', 'opus-5', 'sonnet-5'],
      codex: ['gpt-6-astra'],
      codexEfforts: ['high'],
    })
  );
  assert.deepEqual(noXhigh.missing, ['reviewer (codex effort xhigh)']);
});

test('an unresolved screenshots role does not block the run', () => {
  // A backend task with "no visible change" never starts the screenshot session.
  const noSonnet = resolveModels(
    catalog({ claude: ['fable-5', 'opus-5'], codex: ['gpt-6-astra'] })
  );
  assert.deepEqual(noSonnet.missing, []);
  assert.deepEqual(noSonnet.optionalMissing, ['screenshots (claude model)']);
  assert.equal(noSonnet.result.screenshots, undefined);
  assert.equal(noSonnet.result.planner.model, 'fable-5');

  const run = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(catalog({ claude: ['fable-5', 'opus-5'], codex: ['gpt-6-astra'] })),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0);
  assert.match(run.stderr, /Optional role unresolved: screenshots/);
  assert.equal(JSON.parse(run.stdout).screenshots, undefined);
});

// The local Conductor MCP `ListModels` tool returns one item per model, each with its own effort levels.
const localItem = (agent, id, effortLevels = EFFORTS) => ({
  agent,
  id,
  label: id,
  effortLevels,
  defaultEffortLevel: 'high',
});

test('resolves the local ListModels shape with the same newest-in-family rule', () => {
  const { result, missing } = resolveModels({
    items: [
      localItem('claude', 'fable-5-1'),
      localItem('claude', 'fable-5-2'),
      localItem('claude', 'opus-5-5-1m'),
      localItem('claude', 'sonnet-5-5-1m'),
      localItem('codex', 'gpt-6-astra'),
      localItem('codex', 'gpt-6.2-astra'),
      localItem('cursor', 'auto'),
    ],
    nextCursor: null,
  });
  assert.deepEqual(missing, []);
  assert.deepEqual(result, {
    planner: { agent: 'claude', model: 'fable-5-2', effort: 'xhigh' },
    implementer: { agent: 'claude', model: 'opus-5-5-1m', effort: 'high' },
    reviewer: { agent: 'codex', model: 'gpt-6.2-astra', effort: 'xhigh' },
    screenshots: { agent: 'claude', model: 'sonnet-5-5-1m', effort: 'low' },
  });
});

test('local shape checks the effort of the picked model, not of the agent', () => {
  const { result, missing } = resolveModels({
    items: [
      localItem('claude', 'fable-5-2', ['low', 'high']),
      localItem('claude', 'fable-5-1'),
      localItem('claude', 'opus-5'),
      localItem('claude', 'sonnet-5'),
      localItem('codex', 'gpt-6-astra'),
    ],
  });
  // Newest Fable has no xhigh: report it, do not fall back to the older Fable.
  assert.deepEqual(missing, ['planner (claude effort xhigh)']);
  assert.equal(result.planner, undefined);
});

test('warns about a GPT tier it does not know', () => {
  const { warnings } = resolveModels(
    catalog({
      claude: ['fable-5', 'opus-5', 'sonnet-5'],
      codex: ['gpt-6-astra', 'gpt-7-nova', 'gpt-7.1-codex', 'gpt-5.5'],
    })
  );
  assert.deepEqual(warnings, [
    'gpt-7-nova: unknown GPT tier "nova", skipped (add it to GPT_TIERS)',
  ]);
});

// The CLI must fail loudly from any install path. An empty catalog resolves nothing,
// so a working CLI exits 1; a broken main guard prints nothing and exits 0.
function runCli(path) {
  return spawnSync(process.execPath, [path], { input: '{"items":[]}', encoding: 'utf8' });
}

test('CLI runs through a symlinked install and a path with a space', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crew resolve '));
  try {
    const copy = join(dir, 'resolve-models.mjs');
    copyFileSync(SCRIPT, copy);
    const link = join(dir, 'linked.mjs');
    symlinkSync(SCRIPT, link);
    for (const path of [SCRIPT, copy, link]) {
      const run = runCli(path);
      assert.equal(run.status, 1, path);
      assert.match(run.stderr, /Cannot resolve: planner/, path);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
