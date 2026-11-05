/**
 * The repository's settings check (`tools/watch/settings.mjs`) over a fake fetch: a repository as decided is
 * green, each drift is red with its own line, a setting free only once public waits while private, and the token's
 * value is in no printed line and is sent nowhere but api.github.com.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import settings, { API, compare, readmeLine, repoInput } from './settings.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EXPECTED = JSON.parse(readFileSync(`${ROOT}.github/settings.expected.json`, 'utf8'));
const REPO = 'fernhollow-labs/quillmark';
const TOKEN = 'watch-token-fixture-7f3a91';
const README = '<picture>\n  <img alt="Quillmark">\n</picture>\n\n# Keep the ledger plain\n\nBody.\n';

const on = { status: 'enabled' };
/** A repository exactly as the expected file decides, made public so every `at: public` setting is judged. */
const green = () => ({
  '': { status: 200, body: {
    visibility: 'public', private: false, has_wiki: false, has_discussions: false, description: 'Keep the ledger plain',
    security_and_analysis: { secret_scanning: on, secret_scanning_push_protection: on, secret_scanning_validity_checks: on },
  } },
  '/rules/branches/master': { status: 200, body: [{ type: 'deletion' }, { type: 'non_fast_forward' }] },
  '/private-vulnerability-reporting': { status: 200, body: { enabled: true } },
  '/actions/permissions': { status: 200, body: { enabled: true, allowed_actions: 'selected', sha_pinning_required: true } },
  '/actions/permissions/workflow': { status: 200, body: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false } },
  '/actions/runners?per_page=1': { status: 200, body: { total_count: 0, runners: [] } },
  '/environments/production': { status: 200, body: { name: 'production', protection_rules: [{ type: 'branch_policy' }], deployment_branch_policy: { custom_branch_policies: true } } },
  '/dependabot/alerts?state=open&severity=high,critical&per_page=100': { status: 200, body: [] },
});

/** Run the check over `table`; answers the exit code, every printed line, and every request sent. */
async function run(table, { token = TOKEN, readme = README } = {}) {
  const sent = [];
  const lines = [];
  const ask = async (url, init) => {
    sent.push({ url, init });
    const path = url.slice(`${API}/repos/${REPO}`.length);
    const r = table[path] ?? { status: 404, body: { message: 'Not Found' } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  const code = await settings({ expected: EXPECTED, readme, repo: REPO, token, ask, log: (l) => lines.push(l) });
  return { code, lines, out: lines.join('\n'), sent };
}

const lineOf = (out, says) => out.split('\n').find((l) => l.includes(says)) ?? '';

test('a repository as decided is green, one line a setting', async () => {
  const { code, lines, out } = await run(green());
  assert.equal(code, 0, out);
  assert.equal(lines.filter((l) => /^\s+ok\s/.test(l)).length, 14, out);
  assert.ok(!/MISS|WAIT/.test(out), out);
  assert.match(out, /0 missed, 0 waiting/);
});

test('every question is a GET to api.github.com, the token in one header, a redirect refused', async () => {
  const { sent } = await run(green());
  assert.equal(sent.length, 8);
  for (const { url, init } of sent) {
    assert.equal(new URL(url).origin, 'https://api.github.com');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
    assert.ok(!url.includes(TOKEN));
    assert.equal(init.body, undefined);
  }
});

/* EACH DRIFT, ONE AT A TIME: what changes on GitHub, the line that goes red, and the why printed under it. */
const drifts = [
  ['force push allowed', (t) => { t['/rules/branches/master'].body = [{ type: 'deletion' }]; }, 'the rules on master', 'not held: force push'],
  ['a rule not decided', (t) => { t['/rules/branches/master'].body.push({ type: 'pull_request' }); }, 'the rules on master', 'held and not decided: pull request'],
  ['secret scanning off', (t) => { t[''].body.security_and_analysis.secret_scanning = { status: 'disabled' }; }, 'secret scanning is on', 'GitHub says disabled'],
  ['push protection off', (t) => { t[''].body.security_and_analysis.secret_scanning_push_protection = { status: 'disabled' }; }, 'push protection is on', 'GitHub says disabled'],
  ['validity checks off', (t) => { t[''].body.security_and_analysis.secret_scanning_validity_checks = { status: 'disabled' }; }, 'validity checks are on', 'GitHub says disabled'],
  ['private reporting off', (t) => { t['/private-vulnerability-reporting'].body.enabled = false; }, 'private vulnerability reporting is on', 'GitHub says it is off'],
  ['every action allowed', (t) => { t['/actions/permissions'].body.allowed_actions = 'all'; }, 'Actions are off, or take', 'allowing all'],
  ['pinning not required', (t) => { t['/actions/permissions'].body.sha_pinning_required = false; }, 'Actions are off, or take', 'pinning not required'],
  ['the token writes', (t) => { t['/actions/permissions/workflow'].body.default_workflow_permissions = 'write'; }, 'the workflow token defaults to read', 'it defaults to write'],
  ['the token approves', (t) => { t['/actions/permissions/workflow'].body.can_approve_pull_request_reviews = true; }, 'the workflow token defaults to read', 'approving allowed'],
  ['any branch may deploy', (t) => { t['/environments/production'].body.deployment_branch_policy = null; }, 'chosen branches only', 'any branch may name it'],
  ['a runner registered', (t) => { t['/actions/runners?per_page=1'].body.total_count = 1; }, 'no runner is registered', '1 registered'],
  ['the wiki on', (t) => { t[''].body.has_wiki = true; }, 'the wiki is off', 'GitHub says it is on'],
  ['Discussions on', (t) => { t[''].body.has_discussions = true; }, 'Discussions is off', 'GitHub says it is on'],
  ['the old pitch', (t) => { t[''].body.description = 'An older pitch'; }, "the description is README.md's first heading", 'it is "An older pitch"'],
  ['a reviewer added', (t) => { t['/environments/production'].body.protection_rules.push({ type: 'required_reviewers', reviewers: [{ type: 'User' }] }); }, 'no required reviewer', 'GitHub says 1'],
  ['no production environment', (t) => { delete t['/environments/production']; }, 'no required reviewer', 'there is no production environment'],
  ['a high alert open', (t) => { t['/dependabot/alerts?state=open&severity=high,critical&per_page=100'].body = [{ dependency: { package: { name: 'pixel-squash' } }, security_advisory: { severity: 'high' } }]; }, 'no open high or critical alert', '1 open: pixel-squash (high)'],
  ['alerts unreadable', (t) => { t['/dependabot/alerts?state=open&severity=high,critical&per_page=100'] = { status: 403, body: {} }; }, 'no open high or critical alert', 'answered 403'],
];

for (const [name, drift, says, why] of drifts) {
  test(`a drift is red with its line: ${name}`, async () => {
    const table = green();
    drift(table);
    const { code, out } = await run(table);
    assert.equal(code, 1, out);
    assert.match(lineOf(out, says), /MISS/, out);
    assert.ok(out.includes(why), `"${why}" not printed:\n${out}`);
    assert.equal(out.match(/MISS/g).length, 1, `only the drifted line is red:\n${out}`);
  });
}

test('while private, a setting free only once public waits and is not red; on stays green', async () => {
  const table = green();
  table[''].body.visibility = 'private';
  table[''].body.private = true;
  table[''].body.security_and_analysis.secret_scanning = { status: 'disabled' };
  table[''].body.security_and_analysis.secret_scanning_push_protection = { status: 'disabled' };
  table['/private-vulnerability-reporting'] = { status: 404, body: {} };
  const { code, out } = await run(table);
  assert.equal(code, 0, out);
  assert.match(lineOf(out, 'secret scanning is on'), /WAIT.*waits on going public/);
  assert.match(lineOf(out, 'push protection is on'), /WAIT/);
  assert.match(lineOf(out, 'private vulnerability reporting'), /WAIT/);
  assert.match(lineOf(out, 'validity checks are on'), /ok/);
  assert.match(out, /0 missed, 3 waiting on going public/);
});

test('private, a setting not marked public is still red', async () => {
  const table = green();
  table[''].body.visibility = 'private';
  table[''].body.has_wiki = true;
  const { code, out } = await run(table);
  assert.equal(code, 1);
  assert.match(lineOf(out, 'the wiki is off'), /MISS/);
});

test('the token is in no printed line, even when GitHub echoes it back', async () => {
  const table = green();
  table[''].body.description = `echo ${TOKEN}`;
  table['/actions/permissions'].body.allowed_actions = TOKEN;
  const { out } = await run(table);
  assert.ok(!out.includes(TOKEN), out);
  assert.match(out, /\*\*\*/);
});

test('with no token it skips, sends nothing and exits 0', async () => {
  const { code, out, sent } = await run(green(), { token: '' });
  assert.equal(code, 0);
  assert.equal(sent.length, 0);
  assert.match(out, /skipped: no read-only token/);
});

test('the script itself skips with no token, and prints no value of a token it was given', () => {
  const env = { ...process.env };
  delete env.WATCH_TOKEN;
  const skip = spawnSync(process.execPath, [`${ROOT}tools/watch/settings.mjs`], { env, encoding: 'utf8' });
  assert.equal(skip.status, 0, skip.stderr);
  assert.match(skip.stdout, /skipped: no read-only token/);
  const bad = spawnSync(process.execPath, [`${ROOT}tools/watch/settings.mjs`, '--repo', 'not a repo'], { env: { ...env, WATCH_TOKEN: TOKEN }, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.ok(!`${bad.stdout}${bad.stderr}`.includes(TOKEN));
});

test("the README's first heading is the description, and the expected file asks for it", () => {
  assert.equal(readmeLine(README), 'Keep the ledger plain');
  assert.equal(readmeLine('no heading here'), '');
  assert.ok(readmeLine(readFileSync(`${ROOT}README.md`, 'utf8')).length > 0);
  assert.deepEqual(EXPECTED.description, { from: 'README.md' });
  const down = Object.fromEntries(['info', 'rules', 'reporting', 'actions', 'workflowToken', 'runners', 'production', 'alerts'].map((k) => [k, { status: 500 }]));
  assert.ok(compare(EXPECTED, down, README).every((l) => l.state === 'miss'), 'a GitHub that answers nothing is red on every line');
});

test('a repository name is owner/name and nothing else', () => {
  assert.equal(repoInput('fernhollow-labs/quillmark'), 'fernhollow-labs/quillmark');
  assert.throws(() => repoInput('../../evil'));
  assert.throws(() => repoInput('a/b?x=1'));
  assert.throws(() => repoInput(''));
});

test('Actions switched off is green whatever else they would allow', async () => {
  const table = green();
  table['/actions/permissions'].body = { enabled: false };
  const { code, out } = await run(table);
  assert.equal(code, 0, out);
  assert.match(lineOf(out, 'Actions are off, or take'), /^\s+ok\s/);
});
