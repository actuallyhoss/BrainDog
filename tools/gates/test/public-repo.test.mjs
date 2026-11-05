/**
 * `public-repo`: the real tree is green, the planted tree is red for every rule, and each rule fires on its own.
 *
 *   node --test tools/gates/test/public-repo.test.mjs
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDS, RUNTIME, forkReachable, lockFindings, manifestFindings, workflowFindings, workspaceFindings } from '../public-repo.mjs';

const gates = join(import.meta.dirname, '..');
const run = (root) => spawnSync(process.execPath, [join(gates, 'public-repo.mjs'), ...(root ? [root] : [])], { encoding: 'utf8' });
const SHA = 'a'.repeat(40);
const flow = (over = {}) => ({
  on: { pull_request: {} },
  permissions: { contents: 'read' },
  jobs: { test: { 'runs-on': 'ubuntu-24.04', steps: [{ uses: `actions/checkout@${SHA}`, with: { 'persist-credentials': false } }] } },
  ...over,
});
const job = (over) => ({ jobs: { test: { 'runs-on': 'ubuntu-24.04', steps: [], ...over } } });

test('the tree as committed has no finding', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 finding\(s\)/u);
});

test('the planted tree is red for each of its fifteen', () => {
  const r = run(join(gates, 'negative', 'public-repo'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /15 finding\(s\)/u);
});

test('a clean workflow a fork can start has no finding', () => {
  assert.deepEqual(workflowFindings('w.yml', flow(), true), []);
});

test('each privileged trigger is refused, wherever it is written', () => {
  for (const t of ['pull_request_target', 'workflow_run', 'issue_comment']) {
    assert.equal(workflowFindings('w.yml', flow({ on: { [t]: {} } }), false).length, 1, t);
    assert.equal(workflowFindings('w.yml', flow({ on: t }), false).length, 1, t);
    assert.equal(workflowFindings('w.yml', flow({ on: [t] }), false).length, 1, t);
  }
});

test('no permissions and write-all are refused, and a fork may write only code-scanning results', () => {
  const { permissions: _gone, ...bare } = flow();
  assert.match(workflowFindings('w.yml', bare, false).join(), /no top-level permissions/u);
  assert.match(workflowFindings('w.yml', flow({ permissions: 'write-all' }), false).join(), /write-all/u);
  assert.match(workflowFindings('w.yml', flow({ permissions: { contents: 'write' } }), true).join(), /asks to write contents/u);
  assert.deepEqual(workflowFindings('w.yml', flow({ permissions: { contents: 'write' } }), false), []);
  assert.deepEqual(workflowFindings('w.yml', flow({ permissions: { 'security-events': 'write' } }), true), []);
});

test('a fork reaches no secret and no environment; a workflow it cannot start may', () => {
  const secret = flow(job({ env: { T: '${{ secrets.DEPLOY }}' } }));
  assert.match(workflowFindings('w.yml', secret, true).join(), /names a secret/u);
  assert.deepEqual(workflowFindings('w.yml', secret, false), []);
  assert.deepEqual(workflowFindings('w.yml', flow(job({ env: { T: '${{ secrets.GITHUB_TOKEN }}' } })), true), []);
  assert.match(workflowFindings('w.yml', flow(job({ environment: 'production' })), true).join(), /names an environment/u);
  assert.deepEqual(workflowFindings('w.yml', flow(job({ environment: 'production' })), false), []);
});

test('self-hosted is refused everywhere, and a fork cannot have its runner chosen by a variable', () => {
  for (const on of ['self-hosted', ['self-hosted', 'macos'], '${{ vars.X || \'self-hosted\' }}']) {
    assert.match(workflowFindings('w.yml', flow(job({ 'runs-on': on })), false).join(), /self-hosted runner/u);
  }
  const chosen = flow(job({ 'runs-on': "${{ vars.RUNNER || 'macos-latest' }}" }));
  assert.match(workflowFindings('w.yml', chosen, true).join(), /chosen by an expression/u);
  assert.deepEqual(workflowFindings('w.yml', chosen, false), []);
});

test('an action from outside is pinned to a whole commit, and a local one needs no pin', () => {
  for (const uses of ['docker/login-action@v3', `x/y@${SHA.slice(0, 7)}`, 'docker://node:24']) {
    assert.match(workflowFindings('w.yml', flow(job({ steps: [{ uses }] })), false).join(), /not pinned/u, uses);
  }
  assert.deepEqual(workflowFindings('w.yml', flow(job({ steps: [{ uses: `x/y@${SHA}` }, { uses: './.github/actions/setup' }] })), false), []);
  assert.deepEqual(workflowFindings('w.yml', flow(job({ steps: [{ uses: `docker://node@sha256:${'b'.repeat(64)}` }] })), false), []);
});

test('a checkout that leaves the token behind is refused', () => {
  assert.match(workflowFindings('w.yml', flow(job({ steps: [{ uses: `actions/checkout@${SHA}` }] })), false).join(), /persist-credentials/u);
});

test('a script takes matrix and strategy, and anything else goes through env', () => {
  for (const said of ['github.event.pull_request.title', 'github.head_ref', 'inputs.host', 'steps.a.outputs.b', 'github.ref_name']) {
    const step = { run: `echo "\${{ ${said} }}"` };
    assert.match(workflowFindings('w.yml', flow(job({ steps: [step] })), false).join(), /spliced into a script/u, said);
    assert.match(workflowFindings('w.yml', flow(job({ steps: [{ uses: `actions/github-script@${SHA}`, with: { script: step.run } }] })), false).join(), /spliced/u, said);
  }
  assert.deepEqual(workflowFindings('w.yml', flow(job({ steps: [{ run: 'echo ${{ matrix.leg }} ${{ strategy.job-total }}' }] })), false), []);
});

test('a workflow a fork-started one calls is one a fork can start', () => {
  const docs = {
    '.github/workflows/ci.yml': { on: { pull_request: {} }, jobs: { w: { uses: './.github/workflows/win.yml' } } },
    '.github/workflows/win.yml': { on: { workflow_call: {} }, jobs: {} },
    '.github/workflows/deploy.yml': { on: { workflow_dispatch: {} }, jobs: {} },
  };
  assert.deepEqual([...forkReachable(docs)].sort(), ['.github/workflows/ci.yml', '.github/workflows/win.yml']);
});

test('a range is refused, a dependency that ships is on the list, and a published package names this repository', () => {
  assert.deepEqual(manifestFindings('p.json', { private: true, devDependencies: { x: '1.2.3', y: 'workspace:*' } }), []);
  assert.equal(manifestFindings('p.json', { private: true, devDependencies: { x: '^1.2.3' } }).length, 1);
  assert.equal(manifestFindings('p.json', { private: true, dependencies: { x: '1.2.3' } }).length, 1);
  assert.deepEqual(manifestFindings('p.json', { private: true, dependencies: { [RUNTIME[0]]: '1.2.3' } }), []);
  const url = 'git+https://github.com/actuallyhoss/BrainDog.git';
  assert.deepEqual(manifestFindings('p.json', { name: 'x', repository: { url } }), []);
  assert.equal(manifestFindings('p.json', { name: 'x', repository: { url: url.toLowerCase() } }).length, 1);
});

test('a package with no sha512, or from anywhere but the registry, is refused', () => {
  const lock = (body) => `lockfileVersion: '9.0'\n\npackages:\n\n  a@1.0.0:\n    resolution: ${body}\n\nsnapshots:\n\n  a@1.0.0: {}\n`;
  assert.deepEqual(lockFindings(lock('{integrity: sha512-abc}')), []);
  assert.equal(lockFindings(lock('{integrity: sha1-abc}')).length, 1);
  assert.equal(lockFindings(lock('{integrity: sha512-abc, tarball: https://x.example/a.tgz}')).length, 1);
  assert.equal(lockFindings(lock('{repo: https://x.example/a.git, type: git, commit: abc}')).length, 2);
  assert.equal(lockFindings('no sections').length, 1);
});

test('a fourth build script and a release age under a day are refused', () => {
  const allowBuilds = Object.fromEntries(BUILDS.map((b) => [b, true]));
  assert.deepEqual(workspaceFindings({ minimumReleaseAge: 1440, allowBuilds }), []);
  assert.equal(workspaceFindings({ minimumReleaseAge: 60, allowBuilds }).length, 1);
  assert.equal(workspaceFindings({ allowBuilds }).length, 1);
  assert.equal(workspaceFindings({ minimumReleaseAge: 1440, allowBuilds: { ...allowBuilds, other: true } }).length, 1);
  assert.deepEqual(workspaceFindings({ minimumReleaseAge: 1440, allowBuilds: { ...allowBuilds, other: false } }), []);
});
