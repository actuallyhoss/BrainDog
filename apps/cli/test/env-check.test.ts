/**
 * `braindog env check`: each Claude Code profile's MCP servers as `claude mcp list` finds them in that profile, by name
 * and status alone, with the `claude` it runs approved on this machine first.
 *
 * NO `claude` RUNS. The one on the path is a file made here, and the list is a stand-in that answers as each profile's
 * would, so what the check hands it (the folder, the environment, the program) is what is held to account. The sample
 * lines are in the shape of a real run's (`connected.test.ts`), with every name and address made up.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { healthOf, LIST_MS, type ListRunner } from '../src/clients/connected.ts';
import { envCommand } from '../src/env.ts';
import { envCheck, type CheckIo } from '../src/env-check.ts';
import { pinsFile, readPins } from '../src/pins.ts';

/* Made up, in the shape of a key. It must never reach a line. */
const TOKEN = 'hb_live_4f9K2mQ8xZ71Lp0Qw3';
const NOW = Date.parse('2026-10-22T09:00:00.000Z');

const DEFAULT_LIST = [
  'Checking MCP server health…',
  '',
  'claude.ai Linear: https://mcp.linear.example/mcp - ✔ Connected',
  'plugin:quill:quill: https://mcp.quill.example/mcp (HTTP) - ! Needs authentication',
  `ledger: npx -y ledger-mcp --token ${TOKEN} - ✘ Failed to connect: HTTP 401 - bad token ${TOKEN}`,
  'tally: npx -y tally-mcp - ⏸ Pending approval (run `claude` to approve)',
  '',
].join('\n');
const STUDIO_LIST = ['Checking MCP server health…', '', 'braindog: node /fake/braindog/main.ts mcp --agent claude - ✔ Connected', `${TOKEN}: echo - ✔ Connected`, ''].join('\n');

const scratch = mkdtempSync(join(tmpdir(), 'braindog-env-check-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const json = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value)}\n`);
};

/** Two profiles, the default one and `.claude-studio`, and a `claude` on a path of its own. */
function planted() {
  const home = join(scratch, `home-${String(homes++)}`);
  const main = join(home, '.claude');
  const studio = join(home, '.claude-studio');
  json(join(main, 'settings.json'), {});
  json(join(studio, 'settings.json'), {});
  const bin = join(home, 'bin');
  mkdirSync(bin, { recursive: true });
  const claude = join(bin, 'claude');
  writeFileSync(claude, '#!/bin/sh\nexit 0\n');
  chmodSync(claude, 0o755);
  /* Run from inside ccenv's studio profile: the default one must still be checked without it. */
  return { home, main, studio, claude, env: { PATH: bin, CLAUDE_CONFIG_DIR: studio, HOME: home } };
}

type Ran = { args: string[]; cwd: string; ms: number; config: string | undefined; program: string | undefined };

/** The list as each profile's `claude` would print it, by the profile its environment names. */
function lists(answer: (config: string | undefined) => { code: number | 'absent' | 'late'; out: string } = (config) => ({ code: 0, out: config === undefined ? DEFAULT_LIST : STUDIO_LIST })) {
  const ran: Ran[] = [];
  const list: ListRunner = async (args, cwd, ms, env, program) => {
    ran.push({ args, cwd, ms, config: env?.CLAUDE_CONFIG_DIR, program });
    return answer(env?.CLAUDE_CONFIG_DIR);
  };
  return { list, ran };
}

function io(p: ReturnType<typeof planted>, list: ListRunner, answer: boolean | null = true) {
  const asked: string[] = [];
  const said: string[] = [];
  const shape: CheckIo = {
    home: p.home,
    env: p.env,
    list,
    ask: async (question) => {
      asked.push(question);
      return answer;
    },
    say: (line) => void said.push(line),
    now: () => NOW,
  };
  return { io: shape, asked, said };
}

test('EACH SERVER BY ITS MARK ALONE: connected, needing a sign-in, failed, waiting, and never the words after it', () => {
  const { entries } = healthOf(DEFAULT_LIST);
  assert.deepEqual(
    entries.map((e) => [e.name, e.health]),
    [
      ['Linear', 'connected'],
      ['quill', 'needs sign-in'],
      ['ledger', 'failed'],
      ['tally', 'waiting'],
    ],
  );
});

test('claude IS ASKED ABOUT ONCE, SHOWN WHOLE, PINNED, then run in each profile with that profile\'s CLAUDE_CONFIG_DIR', async () => {
  const p = planted();
  const l = lists();
  const run = io(p, l.list);
  const out = await envCheck([], run.io);
  assert.deepEqual(run.asked, ['Allow claude mcp list to run on this machine? [y/N] ']);
  assert.equal(run.said.length, 1);
  assert.ok(run.said[0]?.endsWith(JSON.stringify({ command: p.claude, args: ['mcp', 'list'] })), run.said[0]);
  /* The default profile with no CLAUDE_CONFIG_DIR, though this shell has one; the other with its own folder. */
  assert.deepEqual(
    l.ran.map((r) => [r.args, r.cwd, r.ms, r.config, r.program]),
    [
      [['mcp', 'list'], p.home, LIST_MS, undefined, p.claude],
      [['mcp', 'list'], p.home, LIST_MS, p.studio, p.claude],
    ],
  );
  assert.deepEqual(out.lines, [
    'braindog env check ran claude mcp list in 2 profiles.',
    'default, ~/.claude: 4 servers, 1 connected, 1 needs a sign-in, 1 failed and 1 waits for approval in a session.',
    '  Connected: Linear.',
    '  Needs a sign-in: quill.',
    '  Failed: ledger.',
    '  Waits for approval: tally.',
    'studio, ~/.claude-studio: 2 servers, 2 connected.',
    '  Connected: braindog, [hidden name 1].',
    '1 server needs a sign-in and 1 server failed. Sign in to each from a session in its profile, with /mcp.',
  ]);
  assert.equal(out.code, 1);
  const pins = Object.values(readPins(pinsFile(p.home)) ?? {});
  assert.deepEqual(pins, [{ name: 'claude', kind: 'check', profiles: ['default', 'studio'], at: '2026-10-22T09:00:00.000Z' }]);

  /* Pinned, it is not asked again; all well, the code is 0. */
  const again = io(p, lists((config) => ({ code: 0, out: config === undefined ? 'claude.ai Linear: https://mcp.linear.example/mcp - ✔ Connected\n' : STUDIO_LIST })).list);
  const fine = await envCheck([], again.io);
  assert.deepEqual(again.asked, []);
  assert.equal(fine.code, 0);
  assert.equal(fine.lines.at(-1), 'Nothing waits on a sign-in and nothing failed.');
});

test('NAMES ONLY: no address, no command, no error text and no key-shaped name reaches a line or the JSON', async () => {
  const p = planted();
  const run = io(p, lists().list);
  const out = await envCheck(['--json'], run.io);
  assert.equal(out.json, true);
  const all = [...out.lines, JSON.stringify(out.report), ...run.said].join('\n');
  for (const never of [TOKEN, 'https://', 'npx', 'HTTP 401', 'bad token', '/fake/braindog']) assert.ok(!all.includes(never), `${never} reached a line`);
  assert.deepEqual(
    out.report.profiles.map((x) => [x.name, x.ran, x.servers.length]),
    [
      ['default', 'read', 4],
      ['studio', 'read', 2],
    ],
  );
});

test('WITH NO ONE TO SAY YES, OR A NO, claude DOES NOT RUN and nothing is pinned', async () => {
  const p = planted();
  const l = lists();
  const nobody = await envCheck([], io(p, l.list, null).io);
  assert.equal(nobody.code, 1);
  assert.deepEqual(nobody.lines, [
    'claude mcp list runs a program not yet approved on this machine, and no one is at a terminal to approve it, so no profile was checked. Run braindog env check at a terminal once.',
  ]);
  const no = await envCheck([], io(p, l.list, false).io);
  assert.deepEqual(no.lines, ['claude mcp list was not approved on this machine, so no profile was checked.']);
  assert.deepEqual(l.ran, []);
  assert.equal(existsSync(pinsFile(p.home)), false);
});

test('ANOTHER claude ON THE PATH IS ANOTHER PROGRAM, so it is asked about again and its pin replaces the old one', async () => {
  const p = planted();
  assert.equal((await envCheck([], io(p, lists().list).io)).code, 1);
  const bin = join(p.home, 'other-bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'claude'), 0o755);
  const moved = { ...p, env: { ...p.env, PATH: bin } };
  const run = io(moved, lists().list);
  await envCheck([], run.io);
  assert.equal(run.asked.length, 1);
  assert.equal(Object.keys(readPins(pinsFile(p.home)) ?? {}).length, 1);
});

test('claude MISSING IS ONE SENTENCE AND NOTHING ELSE; a list that is late, fails or does not start is said by profile', async () => {
  const p = planted();
  const away = { ...p, env: { ...p.env, PATH: join(p.home, 'nowhere') } };
  const run = io(away, lists().list);
  const missing = await envCheck([], run.io);
  assert.equal(missing.code, 1);
  assert.deepEqual(missing.lines, ["claude is not on this machine's path, so no profile was checked. Install Claude Code, then run braindog env check again."]);
  assert.deepEqual(run.asked, []);

  const odd = await envCheck([], io(p, lists((config) => ({ code: config === undefined ? 'late' : 2, out: `${TOKEN}\n` })).list).io);
  assert.equal(odd.code, 1);
  assert.deepEqual(odd.lines, [
    'braindog env check ran claude mcp list in 2 profiles.',
    'default, ~/.claude: claude mcp list took longer than 30 seconds, so its servers were not read.',
    'studio, ~/.claude-studio: claude mcp list did not finish, so its servers were not read.',
    '2 lists were not read.',
  ]);
});

test('--profile CHECKS THE ONES NAMED, a name not here is one sentence, and no profile at all is said', async () => {
  const p = planted();
  const l = lists();
  const one = await envCheck(['--profile', 'studio'], io(p, l.list).io);
  assert.deepEqual(
    l.ran.map((r) => r.config),
    [p.studio],
  );
  assert.equal(one.code, 0, one.lines.join('\n'));
  await assert.rejects(envCheck(['--profile', 'nowhere'], io(p, l.list).io), /^Error: braindog env check --profile takes a profile on this machine: default and studio\.$/u);
  await assert.rejects(envCheck([TOKEN], io(p, l.list).io), (e: Error) => !e.message.includes(TOKEN));
  const empty = join(scratch, `home-${String(homes++)}`);
  mkdirSync(empty, { recursive: true });
  const none = await envCommand(['check'], { home: empty, env: {}, check: { home: empty, env: {}, list: l.list } });
  assert.deepEqual(none.lines, ['No Claude Code profile was found on this machine, so nothing was checked.']);
  assert.equal(none.code, 0);
});
