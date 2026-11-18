// Print the DATABASE_URL the dev server will use, and refuse anything that is not a local Postgres,
// so seeding can never touch a shared database.
// Usage: node local-db-url.cjs [env-file ...]   (default: .env .env.local; later files win)
// Paths are relative to the repository root.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { execSync } = require('node:child_process');

let root;
try {
  root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  console.error('Run this from inside a git repository.');
  process.exit(1);
}
const files = process.argv.slice(2);
if (files.length === 0) files.push('.env', '.env.local');
const env = {};
for (const file of files) {
  const full = path.resolve(root, file);
  if (fs.existsSync(full)) Object.assign(env, parseEnv(fs.readFileSync(full, 'utf8')));
}

let url;
try {
  url = new URL(env.DATABASE_URL);
} catch {
  console.error(`No valid DATABASE_URL in ${files.join(', ')}`);
  process.exit(1);
}
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
  console.error(`DATABASE_URL points at ${url.hostname}, not a local Postgres. Stop.`);
  process.exit(1);
}
process.stdout.write(url.href);
