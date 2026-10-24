#!/usr/bin/env node
/**
 * The bench against a host on this machine: the self-host in memory, seeded and grown to his size (`big-seed.mjs`),
 * read through this tree's command (`apps/cli/dist/braindog.mjs`) exactly as `run.mjs --host` reads brain.dog.
 *
 *   pnpm --filter braindog-cli build
 *   node tools/agent-bench/local-host.mjs [--small] [--runs 30] [--json]
 *
 * Nobody's record: it lives in memory and is gone when this exits. The seed's owner makes one agent key with the
 * server key, and the command is handed it in a home of its own under the system's temporary folder, which is removed
 * after. Everything after the `--` style flags goes to `run.mjs`.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startSeedHost } from '../door-check/seed-host.mjs';
import { growSeed } from './big-seed.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CLI = join(HERE, '..', '..', 'apps', 'cli', 'dist', 'braindog.mjs');

const argv = process.argv.slice(2);
const small = argv.includes('--small');
const rest = argv.filter((a) => a !== '--small');

const started = performance.now();
const host = await startSeedHost({ grow: small ? undefined : (kernel) => growSeed(kernel) });
console.error(`agent-bench: ${small ? 'seed' : 'big seed'} host at ${host.base} in ${Math.round(performance.now() - started)} ms`);
const home = mkdtempSync(join(tmpdir(), 'agent-bench-'));
let code = 0;
try {
  const res = await fetch(`${host.base}/api/createToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${host.key}` },
    body: JSON.stringify({ scope: 'write', label: 'Agent bench' }),
  });
  const made = await res.json();
  if (made?.ok !== true || typeof made.value?.bearer !== 'string') throw new Error(`no agent key: ${made?.refusal?.fix ?? res.status}`);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), BRAINDOG_TOKEN: made.value.bearer, BRAINDOG_HOST: host.base };
  const child = spawn(process.execPath, [join(HERE, 'run.mjs'), '--host', host.base, '--cli', CLI, ...rest], { stdio: 'inherit', env, cwd: home });
  code = await new Promise((done) => child.on('close', (c) => done(c ?? 1)));
} finally {
  await host.close();
  rmSync(home, { recursive: true, force: true });
}
process.exit(code);
