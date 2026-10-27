/**
 * The door check's runner, held with two planted checks (one passes, one fails), and Claude Code's check where it
 * must say "not run" rather than read as green. No network: the planted checks touch nothing, and Claude Code's
 * check installs the command from a planted host on this disk (`file://`, which curl reads) and stops at the missing
 * key, or fails at a host that serves no door.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readSession } from '../claude-code.check.mjs';

const RUN = join(dirname(fileURLToPath(import.meta.url)), '..', 'run.mjs');

let planted;
/** A host on this disk whose `/cli/install.sh` puts a `braindog` where a stranger's install puts it, and one with no door. */
let door;
let noDoor;
let hosts;
before(() => {
  hosts = mkdtempSync(join(tmpdir(), 'door-hosts-'));
  door = `file://${join(hosts, 'door')}`;
  noDoor = `file://${join(hosts, 'none')}`;
  mkdirSync(join(hosts, 'door', 'cli'), { recursive: true });
  mkdirSync(join(hosts, 'none'));
  writeFileSync(join(hosts, 'door', 'cli', 'install.sh'), 'mkdir -p "$HOME/.braindog/bin" && printf \'#!/bin/sh\\n\' > "$HOME/.braindog/bin/braindog" && chmod +x "$HOME/.braindog/bin/braindog"\n');
  planted = mkdtempSync(join(tmpdir(), 'door-planted-'));
  /* PASS answers two rows: its own, and a newest release that failed and only warns. */
  writeFileSync(
    join(planted, 'pass.check.mjs'),
    `import { existsSync } from 'node:fs';
export default async ({ host, record, home }) => [
  { app: 'pass-app', version: '1.0.0', ok: existsSync(home) && host === 'https://example.test' && record === 'fresh', saw: 'connected, 3 tools' },
  { app: 'pass-app', version: '2.0.0', ok: false, warn: true, saw: 'connected, 0 tools' },
];
`,
  );
  writeFileSync(join(planted, 'fail.check.mjs'), `export default async () => ({ app: 'fail-app', version: '9.9.9', ok: false, saw: 'connected, 0 tools' });\n`);
});
after(() => {
  rmSync(planted, { recursive: true, force: true });
  rmSync(hosts, { recursive: true, force: true });
});

/** The runner, with no model key and no record key, so no check can reach anything real. */
function runner(args, extraEnv = {}, host = 'https://example.test') {
  const report = join(mkdtempSync(join(tmpdir(), 'door-report-')), 'report.json');
  const env = { ...process.env };
  for (const name of ['ANTHROPIC_API_KEY', 'DOOR_TOKEN', 'GITHUB_ACTIONS', 'CI']) delete env[name];
  Object.assign(env, extraEnv);
  const got = spawnSync(process.execPath, [RUN, '--host', host, '--record', 'fresh', '--report', report, ...args], { env, encoding: 'utf8' });
  let rows = null;
  try {
    rows = JSON.parse(readFileSync(report, 'utf8')).rows;
  } catch {
    /* no report written */
  }
  rmSync(dirname(report), { recursive: true, force: true });
  return { code: got.status, out: got.stdout, err: got.stderr, rows };
}

test('every check beside it runs, one line a row, and one failure exits 1', () => {
  const r = runner(['--dir', planted]);
  assert.equal(r.code, 1);
  const lines = r.out.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^FAIL\s+fail-app 9\.9\.9: connected, 0 tools$/);
  assert.match(lines[1], /^ok\s+pass-app 1\.0\.0: connected, 3 tools$/);
  assert.match(lines[2], /^warn\s+pass-app 2\.0\.0: connected, 0 tools$/);
});

test('the report holds check, app, version, ok, saw and ms for every row', () => {
  const { rows } = runner(['--dir', planted]);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    for (const key of ['check', 'app', 'version', 'ok', 'saw', 'ms']) assert.ok(key in row, `${key} in ${JSON.stringify(row)}`);
    assert.equal(typeof row.ms, 'number');
  }
  assert.deepEqual(
    rows.map((r) => [r.check, r.app, r.ok, r.warn === true]),
    [
      ['fail', 'fail-app', false, false],
      ['pass', 'pass-app', true, false],
      ['pass', 'pass-app', false, true],
    ],
  );
});

test('--only runs one check, and a failing newest release only warns', () => {
  assert.equal(runner(['--dir', planted, '--only', 'pass']).code, 0);
  assert.equal(runner(['--dir', planted, '--only', 'fail']).code, 1);
});

test('a check that is not there is said, and exits 1', () => {
  const r = runner(['--dir', planted, '--only', 'nope']);
  assert.equal(r.code, 1);
  assert.match(r.err, /No check is called nope\. The checks here are: fail, pass\./);
});

test('a check that throws is a failed row carrying its sentence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'door-throws-'));
  writeFileSync(join(dir, 'boom.check.mjs'), `export default async () => { throw new Error('the door was shut'); };\n`);
  const r = runner(['--dir', dir]);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL\s+boom: the door was shut$/m);
});

test('a check that answers no rows fails, and never reads as a quiet pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'door-empty-'));
  writeFileSync(join(dir, 'quiet.check.mjs'), `export default async () => [];\n`);
  const r = runner(['--dir', dir]);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL\s+quiet: the check answered nothing$/m);
});

test('a key in the environment never reaches a line or the report, whatever a check echoes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'door-leak-'));
  const key = 'sk-door-check-planted-0123456789';
  writeFileSync(
    join(dir, 'leak.check.mjs'),
    `export default async () => ({ app: 'leak-app', ok: false, saw: 'refused ' + process.env.DOOR_TOKEN, first: { echoed: process.env.DOOR_TOKEN } });\n`,
  );
  const report = join(dir, 'report.json');
  const env = { ...process.env, DOOR_TOKEN: key };
  for (const name of ['ANTHROPIC_API_KEY', 'GITHUB_ACTIONS', 'CI']) delete env[name];
  const got = spawnSync(process.execPath, [RUN, '--dir', dir, '--report', report], { env, encoding: 'utf8' });
  const written = readFileSync(report, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  assert.equal(got.status, 1);
  assert.match(got.stdout, /^FAIL\s+leak-app: refused \[withheld\]$/m);
  assert.ok(!got.stdout.includes(key) && !got.stderr.includes(key), 'the key was printed');
  assert.ok(!written.includes(key), 'the key was written into the report');
  assert.equal(JSON.parse(written).rows[0].first.echoed, '[withheld]');
});

test('Claude Code with no key installs the command, prints "not run: no key", one line, and exits 0', () => {
  const r = runner(['--only', 'claude-code'], {}, door);
  assert.equal(r.code, 0);
  assert.equal(r.out.trim().split('\n').length, 1);
  assert.match(r.out, /^warn\s+claude-code \d+\.\d+\.\d+: not run: no key$/m);
  assert.equal(r.rows[0].ok, null);
});

test('in CI the same line is one warning annotation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'door-ci-'));
  const ci = spawnSync(process.execPath, [RUN, '--only', 'claude-code', '--host', door, '--report', join(dir, 'report.json')], {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ANTHROPIC_API_KEY')), GITHUB_ACTIONS: 'true', CI: 'true' },
    encoding: 'utf8',
  });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(ci.status, 0);
  assert.match(ci.stdout.trim(), /^::warning title=door-check::claude-code \S+: not run: no key$/);
});

test('a host that serves no door is a red row with no key at all, never "not run"', () => {
  const r = runner(['--only', 'claude-code'], {}, noDoor);
  assert.equal(r.code, 1);
  assert.match(r.out, /^FAIL\s+claude-code \S+: install failed: /m);
  assert.equal(r.rows[0].ok, false);
});

/* ── a dispatched host is handed no key ─────────────────────────────────────── */

const KEYS = ['DOOR_TOKEN', 'DOOR_TOKEN_2', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY'];
const keyed = Object.fromEntries(KEYS.map((k) => [k, `sk-planted-${k.toLowerCase()}-0123456789`]));
/** A check that says which keys it was handed, by name only. */
const SEES = `export default async () => ({ app: 'sees', ok: true, saw: 'keys: ' + (${JSON.stringify(KEYS)}.filter((k) => process.env[k]).join(' ') || 'none') });\n`;

test('a dispatched host runs with no key, and says so in one line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'door-sees-'));
  writeFileSync(join(dir, 'sees.check.mjs'), SEES);
  const r = runner(['--dir', dir], keyed, 'https://other.example');
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.code, 0);
  assert.match(r.out, /^ok\s+sees: keys: none$/m);
  assert.equal(r.err.split('\n').filter((l) => /No key is handed/.test(l)).length, 1);
  assert.match(r.err, /No key is handed to https:\/\/other\.example: only https:\/\/app\.brain\.dog gets them, so this run has none\./);
});

test('a record named by an address on another host is handed no key either', () => {
  const dir = mkdtempSync(join(tmpdir(), 'door-sees-'));
  writeFileSync(join(dir, 'sees.check.mjs'), SEES);
  const report = join(dir, 'report.json');
  const env = { ...process.env, ...keyed };
  for (const name of ['GITHUB_ACTIONS', 'CI', 'DOOR_HOST']) delete env[name];
  const got = spawnSync(process.execPath, [RUN, '--dir', dir, '--record', 'https://other.example/app/x', '--report', report], { env, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.match(got.stdout, /^ok\s+sees: keys: none$/m);
  assert.match(got.stderr, /No key is handed to https:\/\/other\.example/);
});

test('production keeps its keys, and says nothing about them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'door-sees-'));
  writeFileSync(join(dir, 'sees.check.mjs'), SEES);
  const r = runner(['--dir', dir], keyed, 'https://app.brain.dog');
  rmSync(dir, { recursive: true, force: true });
  assert.match(r.out, new RegExp(`^ok\\s+sees: keys: ${KEYS.join(' ')}$`, 'm'));
  assert.doesNotMatch(r.err, /No key is handed/);
});

/* ── what a session printed, read ─────────────────────────────────────────── */

const NAMES = ['record_index', 'context', 'schema'];
const stream = (status, names, result) =>
  [
    { type: 'system', subtype: 'init', mcp_servers: [{ name: 'braindog', status }], tools: ['Read', ...names.map((n) => `mcp__braindog__${n}`)] },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__braindog__context', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', ...result }] } },
  ]
    .map((e) => JSON.stringify(e))
    .join('\n');

test('a connected session carries its names and the answer to context', () => {
  const s = readSession(stream('connected', NAMES, { content: [{ type: 'text', text: 'BrainDog · run Morning tidy · project Kennel' }] }));
  assert.equal(s.status, 'connected');
  assert.deepEqual(s.names, NAMES.map((n) => `mcp__braindog__${n}`));
  assert.equal(s.called, true);
  assert.deepEqual(s.answer, { error: false, text: 'BrainDog · run Morning tidy · project Kennel' });
});

test('a session that listed no tools, or whose server failed, reads as such', () => {
  const none = readSession(stream('connected', [], { content: 'x' }));
  assert.equal(none.names.length, 0);
  assert.equal(readSession(stream('failed', NAMES, { content: 'x' })).status, 'failed');
  assert.equal(readSession('not json\n').first, null);
  assert.equal(readSession(stream('connected', NAMES, { is_error: true, content: 'refused' })).answer.error, true);
});
