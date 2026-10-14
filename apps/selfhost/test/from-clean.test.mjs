/**
 * `from-clean.mjs` without running it: the README parser on today's README and on one with a line changed, and the steps
 * a run would take. Nothing is installed, built or started here; the run itself is `.github/workflows/selfhost.yml`'s.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DOES, OWNER, RECORD, dockerWords, kindOf, plan, readmeBlocks, restoreWords, scrub, words } from './from-clean.mjs';

const README = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8');
const ids = (steps) => steps.map((s) => s.id);

test("TODAY'S README: the self-host and container lines are read out of it, and every one is placed", () => {
  const { selfhost, container } = readmeBlocks(README);
  assert.ok(selfhost.some((l) => /^pnpm install\b/.test(l)), selfhost.join('\n'));
  assert.ok(selfhost.some((l) => /main\.ts init <record name>/.test(l)), selfhost.join('\n'));
  assert.ok(container.some((l) => /^docker build\b/.test(l)), container.join('\n'));
  for (const line of [...selfhost, ...container]) assert.notEqual(kindOf(line), 'other', `${line} is a README line this check does not know how to place`);
});

test('the plain run: the README lines in their order, then the real command against the host and its restored copy', () => {
  const steps = plan(readmeBlocks(README));
  assert.deepEqual(ids(steps), [
    'copy', 'install', 'build the app', 'build the command', 'init', 'start',
    'sign in', 'boot', 'write', 'read', 'export', 'verify', 'restore', 'start the copy', 'sign in there', 'read there',
  ]);
  /* THE CLONE AND THE cd ARE THE COPY, so neither is run as written. */
  assert.ok(!steps.some((s) => /^git clone|^cd /.test(s.line ?? '')));
  for (const s of steps) assert.ok(s.line !== undefined || DOES[s.id] !== undefined, `--dry has nothing to say for ${s.id}`);
});

test('the container run, and outbound blocked once the install and the image are in', () => {
  assert.deepEqual(ids(plan(readmeBlocks(README), { container: true, offline: true })), [
    'copy', 'install', 'build the command', 'image', 'offline', 'init', 'start', 'healthy',
    'sign in', 'boot', 'write', 'read', 'export', 'verify', 'restore', 'start the copy', 'healthy there', 'sign in there', 'read there',
  ]);
  const plain = ids(plan(readmeBlocks(README), { offline: true }));
  assert.equal(plain[plain.indexOf('install') + 1], 'offline');
});

test('A LINE CHANGED IN THE README IS THE LINE RUN, and a line taken out is refused before anything runs', () => {
  const changed = README.replace('pnpm --filter @braindog/web build', 'pnpm --filter @braindog/web build --mode selfhost');
  const built = plan(readmeBlocks(changed)).find((s) => s.id === 'build the app');
  assert.equal(built?.line, 'pnpm --filter @braindog/web build --mode selfhost');

  const noInit = README.replace(/^node apps\/selfhost\/src\/main\.ts init .*$/m, '');
  assert.throws(() => plan(readmeBlocks(noInit)), /no init line/);
  const noImage = README.replace(/^docker build .*$/m, '');
  assert.throws(() => plan(readmeBlocks(noImage), { container: true }), /container lines have no image line/);
  const extra = README.replace('pnpm install\n', 'pnpm install\nnode tools/seed.mjs\n');
  assert.ok(ids(plan(readmeBlocks(extra))).includes('readme line'), 'a new README line was dropped rather than run');
  assert.throws(() => readmeBlocks(README.replace('### The container', '### Containers')), /under ### The container/);
});

test('the placeholders are an invented record and owner, and the container is this run’s own', () => {
  const { selfhost, container } = readmeBlocks(README);
  const init = words(selfhost.find((l) => kindOf(l) === 'init'));
  assert.deepEqual(init.slice(-4), ['init', RECORD, '--owner', OWNER]);
  assert.deepEqual(restoreWords(init, '/copy/record.brainl').slice(-4), ['init', RECORD, '--from', '/copy/record.brainl']);
  const run = dockerWords(container.find((l) => kindOf(l) === 'start'), { tag: 'img', volume: 'vol-a', port: 41234, envFile: '/x/env' });
  assert.deepEqual(run, ['docker', 'run', '-d', '-v', 'vol-a:/data', '-p', '127.0.0.1:41234:8080', '--env-file', '/x/env', 'img']);
  assert.ok(!run.includes('braindog'), 'the README’s own volume or image name was kept, and a person’s real one could be touched');
});

test('a line said never carries the inbound email token', () => {
  assert.equal(scrub('record harbour-lane created · inbound email token at in_abc123'), 'record harbour-lane created · inbound email token at [hidden]');
});
