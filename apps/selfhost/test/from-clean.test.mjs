/**
 * `from-clean.mjs` without running it: the README parser on today's README and on one with a line changed, and the steps
 * a run would take. Nothing is installed, built or started here; the run itself is `.github/workflows/selfhost.yml`'s.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEADLINE, DOES, IMAGE, OVERRIDE, OWNER, RECORD, composeEnv, kindOf, plan, readmeBlocks, restoreWords, scrub, words } from './from-clean.mjs';

const README = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8');
const WORKFLOW = readFileSync(fileURLToPath(new URL('../../../.github/workflows/selfhost.yml', import.meta.url)), 'utf8');
const ids = (steps) => steps.map((s) => s.id);

test("TODAY'S README: the self-host and container lines are read out of it, and every one is placed", () => {
  const { selfhost, container } = readmeBlocks(README);
  assert.ok(selfhost.some((l) => /^pnpm install\b/.test(l)), selfhost.join('\n'));
  assert.ok(selfhost.some((l) => /main\.ts init <record name>/.test(l)), selfhost.join('\n'));
  assert.ok(container.some((l) => /^docker compose up -d\b/.test(l)), container.join('\n'));
  /* A COMMENT AFTER A LINE IS NEVER A WORD OF IT. */
  assert.ok(container.every((l) => !l.includes('#')), container.join('\n'));
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
  const steps = plan(readmeBlocks(README), { container: true, offline: true });
  assert.deepEqual(ids(steps), [
    'copy', 'install', 'build the command', 'env', 'up', 'offline', 'healthy', 'logs', 'claim',
    'sign in', 'boot', 'write', 'read', 'export', 'verify', 'restore', 'start the copy', 'healthy there', 'sign in there', 'read there',
  ]);
  /* THE RESTORE IS THE README'S OWN init LINE, with --from in place of the owner. */
  assert.match(steps.find((s) => s.id === 'restore')?.line ?? '', /main\.ts init <record name>/);
  const plain = ids(plan(readmeBlocks(README), { offline: true }));
  assert.equal(plain[plain.indexOf('install') + 1], 'offline');
});

test('A LINE CHANGED IN THE README IS THE LINE RUN, and a line taken out is refused before anything runs', () => {
  const changed = README.replace('pnpm --filter @braindog/web build', 'pnpm --filter @braindog/web build --mode selfhost');
  const built = plan(readmeBlocks(changed)).find((s) => s.id === 'build the app');
  assert.equal(built?.line, 'pnpm --filter @braindog/web build --mode selfhost');

  const noInit = README.replace(/^node apps\/selfhost\/src\/main\.ts init .*$/m, '');
  assert.throws(() => plan(readmeBlocks(noInit)), /no init line/);
  const noUp = README.replace(/^docker compose up .*$/m, '');
  assert.throws(() => plan(readmeBlocks(noUp), { container: true }), /container lines have no up line/);
  const extra = README.replace('pnpm install\n', 'pnpm install\nnode tools/seed.mjs\n');
  assert.ok(ids(plan(readmeBlocks(extra))).includes('readme line'), 'a new README line was dropped rather than run');
  assert.throws(() => readmeBlocks(README.replace('### Run it yourself', '### Containers')), /under ### Run it yourself/);
  assert.throws(() => readmeBlocks(README.replace('Without Docker', 'Without a container')), /after "Without Docker"/);
});

test('the placeholders are an invented record and owner, and the container is this run’s own', () => {
  const { selfhost } = readmeBlocks(README);
  const init = words(selfhost.find((l) => kindOf(l) === 'init'));
  assert.deepEqual(init.slice(-4), ['init', RECORD, '--owner', OWNER]);
  assert.deepEqual(restoreWords(init, '/copy/record.brainl').slice(-4), ['init', RECORD, '--from', '/copy/record.brainl']);
  const env = composeEnv({ PATH: '/bin' }, { repo: '/r', override: '/x/over.yml', project: 'braindog-from-clean-ab12', port: 41234 });
  assert.equal(env.COMPOSE_PROJECT_NAME, 'braindog-from-clean-ab12', 'the README’s own project, and so a person’s braindog volume, could be touched');
  assert.equal(env.BRAINDOG_PORT, '127.0.0.1:41234');
  assert.deepEqual(env.COMPOSE_FILE.split(/[:;]/), ['/r/docker-compose.yml', '/x/over.yml']);
  assert.equal(env.PATH, '/bin');
  assert.notEqual(IMAGE, 'braindog');
  assert.match(OVERRIDE, new RegExp(`^ {4}image: ${IMAGE}$`, 'm'), 'the image built would replace a person’s own braindog image');
  /* THE DEFAULT BRIDGE IS docker0, the one the workflow's outbound block names. */
  assert.match(OVERRIDE, /^ {4}network_mode: bridge$/m);
  /* AND THE README'S COMPOSE FILE STILL PUBLISHES THROUGH BRAINDOG_PORT, or the port above is never used, on this machine alone unless BRAINDOG_PUBLISH says otherwise. */
  const compose = readFileSync(fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url)), 'utf8');
  assert.match(compose, /"\$\{BRAINDOG_PUBLISH:-127\.0\.0\.1\}:\$\{BRAINDOG_PORT:-8080\}:8080"/);
  assert.match(compose, /^ {2}braindog:$/m);
});

test('a line said never carries the inbound email token', () => {
  assert.equal(scrub('record harbour-lane created · inbound email token at in_abc123'), 'record harbour-lane created · inbound email token at [hidden]');
});

/** Each job of the workflow: its `timeout-minutes` and its text up to the next job. */
function jobs(text) {
  const out = {};
  const at = [...text.matchAll(/^ {2}([a-z-]+):\n/gm)];
  at.forEach((m, i) => {
    const body = text.slice(m.index, at[i + 1]?.index ?? text.length);
    out[m[1]] = { body, minutes: Number(/timeout-minutes: (\d+)/.exec(body)?.[1]) };
  });
  return out;
}

test('THE OUTBOUND BLOCK CUTS THE RUN ONLY, NEVER THE RUNNER: every OUTPUT rule matches the run’s group, and the run is that group', () => {
  const { plain, container } = jobs(WORKFLOW);
  for (const [name, job] of [['plain', plain], ['container', container]]) {
    assert.ok(job, `selfhost.yml has no ${name} job`);
    const rules = job.body.split('\n').filter((l) => /"\$t" -A OUTPUT/.test(l));
    assert.ok(rules.length >= 4, `${name}: the outbound block has no OUTPUT rules`);
    for (const r of rules) assert.match(r, /-m owner --gid-owner "\$g"/, `${name}: an OUTPUT rule for everybody cuts the runner off GitHub too: ${r.trim()}`);
    assert.match(job.body, /-m owner --gid-owner "\$g" -j REJECT/, `${name}: the group's last OUTPUT rule refuses`);
    assert.match(job.body, /g=braindog-offline/);
    assert.match(job.body, /if \[ "\$\(id -gn\)" != "\$g" \]; then .*exit 1; fi/, `${name}: offline.sh must refuse outside the group, or its rules block nothing`);
    assert.match(job.body, /sudo groupadd braindog-offline/);
    assert.match(job.body, /sg braindog-offline -c '[^]*node apps\/selfhost\/test\/from-clean\.mjs[^']*--after-install "\$RUNNER_TEMP\/offline\.sh"'/, `${name}: the run is not made as the group`);
  }
  assert.match(container.body, /-o docker0 -j ACCEPT/);
  assert.match(container.body, /DOCKER-USER 1 -i docker0 ! -o docker0 -j REJECT/, 'the containers’ own calls are no longer blocked');
  assert.match(container.body, /docker info >\/dev\/null \|\|/, 'a docker the group cannot reach would let the container run skip and pass');
});

test('EVERY DEADLINE ENDS INSIDE ITS JOB’S CEILING, so a hang says its step before the job is cancelled', () => {
  const { plain, container } = jobs(WORKFLOW);
  const ms = (job) => job.minutes * 60_000;
  /* THE LONGEST A PLAIN RUN WAITS ON ONE HANG: the install, or a build after a normal install. */
  assert.ok(DEADLINE.install < ms(plain) && DEADLINE.build < ms(plain), `${JSON.stringify(DEADLINE)} against ${String(plain.minutes)} minutes`);
  assert.ok(DEADLINE.image < ms(container), `${JSON.stringify(DEADLINE)} against ${String(container.minutes)} minutes`);
  for (const k of ['step', 'docker', 'inspect', 'healthz', 'boxHealthy', 'fetch', 'rpc', 'exit']) assert.ok(DEADLINE[k] > 0 && DEADLINE[k] <= 180_000, `${k}: once outbound is blocked a wait is seconds, not ${String(DEADLINE[k])} ms`);
});
