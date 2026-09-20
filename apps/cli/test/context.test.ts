/**
 * `braindog context` against a stub record on node:http: the briefing it prints, the first line it writes for
 * itself, the caps, the arguments it takes, and the three exit codes of `docs/48-SPEC-CLI.md` §4.4.
 *
 * ONE RENDERER. The proof that splitting the first line out of `briefing` cost the start hook nothing is here:
 * the same context rendered both ways, asserted equal character for character.
 *
 * EVERY FOLDER IS A TEMPORARY ONE. The config folder and the working folder are made per test and removed after
 * it, so nothing here reads or writes this machine's own hosts file.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Attached, Brief, Context as Ctx } from '@braindog/client';

import { briefing, briefingOf, MAX_CHARS, MAX_LINES, placeOf, type Where } from '../src/brief.ts';
import { context, headline } from '../src/context.ts';
import { positionOf } from '../src/position.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-7c41'].join('.');

/** Every line any command wrote, for the last test. */
const printed: string[] = [];

type After = { after: (fn: () => void | Promise<void>) => void };
type Seen = { method: string; authorization: string | undefined };

const row = (spoken: string, scope: Brief['scope'], fields: Record<string, unknown>): Brief => ({ spoken, version: 1, scope, state: 'active', ...fields });

const KILN = { spoken: 'things#1', name: 'Kiln', mark: null, hue: null, how: 'folder' as const };
const NEXT = 'Before you stop, call handoff with the one next step.';

/** A context with something in every register the briefing knows how to draw. */
const FULL: Ctx = {
  session: { spoken: 'S7', state: 'active' },
  project: KILN,
  ambiguous: [],
  handoff: { from: 'S5', age_s: 10_800, next: 'Wire the device routes into the self-host.', tried: ['reading the claim from the cookie; it is not set on plain http'], head: 'abc1234' },
  live: { same_repo: [{ spoken: 'S6', state: 'active', doing: 'Money page', agent: 'claude', repo: 'kiln', project: 'things#1', stale: false, age_s: 240 }], elsewhere: [] },
  waiting: [{ id: 'SG12', question: 'Keep the address field?' }],
  registers: [
    { id: 'tasks', name: 'Tasks', rows: [row('tasks#41', 'project', { task: 'Ship the hooks' })], inherited: [], truncated: false },
    { id: 'learnings', name: 'Learnings', rows: [row('LN7', 'project', { lesson: 'Run the gates after the build, never beside it.' })], inherited: [], truncated: false },
    { id: 'credentials', name: 'Keys', rows: [row('credentials#3', 'project', { label: 'Stripe test' })], inherited: [], truncated: false },
    { id: 'skills', name: 'Skills', rows: [row('skills#2', 'project', { name: 'review-pr' })], inherited: [], truncated: false },
  ],
  people: [],
  faded: 2,
  next: NEXT,
};

/** Nothing at all but the run: no project, no handoff, nobody live, nothing waiting, no register. */
const BARE: Ctx = {
  session: { spoken: 'S7', state: 'active' },
  project: null,
  ambiguous: [],
  handoff: null,
  live: { same_repo: [], elsewhere: [] },
  waiting: [],
  registers: [],
  people: [],
  faded: 0,
  next: NEXT,
};

/** A record that answers `context` with what the test gives it, or refuses. */
async function stubRecord(t: After, answer: { value?: Ctx; refusal?: { code: string; fix: string } }) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//, '');
      seen.push({ method, authorization: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(method === 'context' && answer.refusal === undefined ? { ok: true, value: answer.value ?? BARE } : { ok: false, refusal: answer.refusal ?? { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

function folders(t: After) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-context-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = join(dir, 'config');
  const home = join(dir, 'home');
  const cwd = join(dir, 'work');
  for (const d of [config, home, cwd]) mkdirSync(d, { recursive: true });
  return { dir, config, home, cwd };
}

async function setup(t: After, answer: { value?: Ctx; refusal?: { code: string; fix: string } } = {}) {
  const host = await stubRecord(t, answer);
  const { config, home, cwd } = folders(t);
  /* Both, so the hosts file is the temporary one on every platform. */
  const env = { XDG_CONFIG_HOME: config, APPDATA: config, BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN, BRAINDOG_TIMEOUT_MS: '2000' };
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env, cwd, home, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  const run = async (args: string[] = []) => {
    const code = await context(args, io);
    printed.push(...out, ...said);
    return code;
  };
  return { ...host, config, home, cwd, env, io, out, said, run, stderr: () => said.join('\n') };
}

/** A command with no host to reach: no `BRAINDOG_HOST`, no hosts file. */
async function offline(t: After, host?: string) {
  const { config, home, cwd } = folders(t);
  const env: Record<string, string | undefined> = { XDG_CONFIG_HOME: config, APPDATA: config, BRAINDOG_TIMEOUT_MS: '1000', ...(host === undefined ? {} : { BRAINDOG_HOST: host, BRAINDOG_TOKEN: TOKEN }) };
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env, cwd, home, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  const run = async (args: string[] = []) => {
    const code = await context(args, io);
    printed.push(...out, ...said);
    return code;
  };
  return { config, cwd, out, said, run, stderr: () => said.join('\n') };
}

const USAGE = 'braindog context takes --host and nothing else.';

/* ── the briefing it prints ────────────────────────────────────────────── */

test('braindog context prints the whole briefing, line by line, and exits 0', async (t) => {
  const h = await setup(t, { value: FULL });

  assert.equal(await h.run(), 0, h.stderr());
  assert.equal(h.said.length, 0, h.stderr());
  assert.deepEqual(h.seen.map((s) => s.method), ['context'], 'context is one call and opens no run');
  assert.equal(h.seen[0]?.authorization, `Bearer ${TOKEN}`);

  assert.equal(h.out[0], headline(FULL.session, await positionOf(h.cwd), 'Project: Kiln.'), 'the first line is not the one this command writes');
  assert.match(h.out[0] ?? '', /^BrainDog: S7 in .+ on .+, active\. Project: Kiln\.$/);
  assert.deepEqual(h.out.slice(1), [
    'Last handoff (S5, 3 hours ago): Wire the device routes into the self-host.',
    '  Already tried: reading the claim from the cookie; it is not set on plain http',
    'Also live in this repo: S6 "Money page", seen 4 minutes ago.',
    '  Two sessions in one working tree overwrite each other. Coordinate or stop.',
    'Waiting on the owner (1):',
    '  SG12 Keep the address field?',
    '  The owner answers these in the app. Do not decide for them.',
    'Open in Tasks (1 of 1): tasks#41 Ship the hooks.',
    'Learnings here (1 shown, 2 faded):',
    '  LN7 Run the gates after the build, never beside it.',
    'Keys you may use here, by name: Stripe test (this project). A value is never shown here.',
    'Skills: review-pr (this project).',
    NEXT,
  ]);
  assert.match(h.out.join('\n'), /^[\x20-\x7e\n]*$/, 'the briefing is not plain ASCII');
});

test('THE FIRST LINE CARRIES NO EVENT WORD: nothing started and nothing resumed, and a state is said as it is', () => {
  const at: Where = { repo: 'kiln', host: 'studio-pc' };
  assert.equal(headline({ spoken: 'S7', state: 'active' }, at, 'Project: Kiln.'), 'BrainDog: S7 in kiln on studio-pc, active. Project: Kiln.');
  assert.equal(headline({ spoken: 'S7', state: 'handoff' }, at, 'Project: Kiln.'), 'BrainDog: S7 in kiln on studio-pc, handoff. Project: Kiln.');
  assert.equal(headline({ spoken: 'S7', state: null }, at, 'Project: Kiln.'), 'BrainDog: S7 in kiln on studio-pc. Project: Kiln.');
  assert.equal(
    headline({ spoken: 'S7', state: 'active' }, { repo: null, host: 'studio-pc' }, 'No project here, so only what applies everywhere is shown.'),
    'BrainDog: S7 in a folder outside any repository on studio-pc, active. No project here, so only what applies everywhere is shown.',
  );
  for (const word of ['started', 'resumed', 'attached']) assert.equal(headline({ spoken: 'S7', state: 'active' }, at, 'Project: Kiln.').includes(word), false, `the first line says ${word}`);
});

test('NO RUN IN THIS FOLDER YET is one plain line saying what opens one', async (t) => {
  const h = await setup(t, { value: { ...BARE, session: null } });

  assert.equal(await h.run(), 0, h.stderr());
  assert.equal(
    h.out[0],
    `BrainDog: no run in a folder outside any repository on ${(await positionOf(h.cwd)).host} yet. Run braindog install, then start a session in this folder. No project here, so only what applies everywhere is shown.`,
  );
  assert.deepEqual(h.out.slice(1), [NEXT]);
});

test('AN EMPTY LIVE, WAITING AND REGISTERS is the first line and the next step, and nothing between them', async (t) => {
  const h = await setup(t, { value: BARE });

  assert.equal(await h.run(), 0, h.stderr());
  assert.equal(h.out.length, 2, h.out.join('\n'));
  assert.match(h.out[0] ?? '', /^BrainDog: S7 in .+, active\. No project here, so only what applies everywhere is shown\.$/);
  assert.equal(h.out[1], NEXT);
});

/* ── the start hook's output did not move ──────────────────────────────── */

test('THE START HOOK GETS THE SAME CHARACTERS: briefing is its own first line and briefingOf, and nothing else', () => {
  const at: Where = { repo: 'braindog', host: 'studio-pc' };
  const attached: Attached = { session: { id: 'e_7', seq: 7, state: 'active', version: 1, fields: {} }, spoken: 'S7', resumed: true, project: 'things#1', context: FULL };

  const whole = briefing(attached, at, 4);
  assert.equal(whole.split('\n')[0], 'BrainDog: S7 resumed in braindog on studio-pc. Project: Kiln.');
  assert.equal(whole, briefingOf(`BrainDog: S7 resumed in braindog on studio-pc. ${placeOf(FULL)}`, FULL, 4));

  const started: Attached = { ...attached, resumed: false };
  assert.equal(briefing(started, { repo: null, host: 'box' }, undefined), briefingOf(`BrainDog: S7 started in a folder outside any repository on box. ${placeOf(FULL)}`, FULL, undefined));

  /* The one path that is not a context at all: a host too old to send one. */
  const bare: Attached = { session: attached.session, spoken: 'S7', resumed: false, project: null };
  assert.equal(
    briefing(bare, at, undefined),
    'BrainDog: S7 started in braindog on studio-pc. No project here, so only what applies everywhere is shown.\nThis host sends no briefing. Call context for one, and call handoff with the one next step before you stop.',
  );
});

/* ── the caps ──────────────────────────────────────────────────────────── */

const manyRegisters = (n: number): Ctx => ({
  ...BARE,
  registers: Array.from({ length: n }, (_, i) => {
    const id = `reg${String(i).padStart(2, '0')}`;
    return { id, name: `Reg${String(i).padStart(2, '0')}`, rows: [row(`${id}#1`, 'project', { task: `Row ${String(i).padStart(2, '0')}.` })], inherited: [], truncated: false };
  }),
});

test('THE FORTY-LINE CAP COUNTS THE FIRST LINE: sixty rows come back as forty lines, and the count left out says so', () => {
  const lines = briefingOf('BrainDog: S7 in kiln on box.', manyRegisters(60), undefined).split('\n');

  assert.equal(lines.length, MAX_LINES);
  assert.equal(lines[0], 'BrainDog: S7 in kiln on box.');
  assert.equal(lines.at(-1), NEXT);
  /* Twenty-three, not twenty-two: the first line takes one of the forty. */
  assert.equal(lines.at(-2), '23 more lines left out. Call context for all of it.');
});

test('THE THREE-THOUSAND-CHARACTER CAP COUNTS THE FIRST LINE: a longer one costs the briefing lines', () => {
  const wide: Ctx = {
    ...BARE,
    registers: Array.from({ length: 12 }, (_, i) => ({
      id: `reg${String(i)}`,
      name: `Reg${String(i)}`,
      rows: Array.from({ length: 5 }, (_, j) => row(`reg${String(i)}#${String(j)}`, 'project', { task: 'Ship the hooks, then the rest of it, and then the thing after that one' })),
      inherited: [],
      truncated: false,
    })),
  };
  const short = briefingOf('BrainDog: S7.', wide, undefined);
  const long = briefingOf(`BrainDog: S7, ${'and more of the same first line, '.repeat(10)}done.`, wide, undefined);

  assert.ok(short.length <= MAX_CHARS, `${String(short.length)} characters`);
  assert.ok(long.length <= MAX_CHARS, `${String(long.length)} characters`);
  assert.ok(short.split('\n').length < MAX_LINES, 'the line cap did the cutting, so this proves nothing about characters');
  assert.ok(long.split('\n').length < short.split('\n').length, 'a longer first line cost no lines, so it is not counted');
  assert.equal(short.split('\n').at(-1), NEXT);
  assert.equal(long.split('\n').at(-1), NEXT);
});

/* ── the arguments ─────────────────────────────────────────────────────── */

test('--host names the record, and nothing else is taken', async (t) => {
  const h = await setup(t, { value: BARE });
  delete (h.env as Record<string, string | undefined>).BRAINDOG_HOST;

  assert.equal(await h.run(['--host', h.base]), 0, h.stderr());
  assert.equal(h.out.length, 2);

  h.out.length = 0;
  h.said.length = 0;
  assert.equal(await h.run(['--json']), 1, '--json is specified and built nowhere, so it is not taken');
  assert.deepEqual(h.said, [USAGE]);
  assert.deepEqual(h.out, []);
});

test('A BAD ARGUMENT IS ONE SENTENCE THAT NEVER ECHOES IT, and nothing is sent', async (t) => {
  const h = await setup(t, { value: BARE });
  const pasted = 'rec_01PASTEDINTHEWRONGPLACE';

  for (const args of [['show'], ['--vault', pasted], [pasted]]) {
    h.said.length = 0;
    assert.equal(await h.run(args), 1);
    assert.deepEqual(h.said, [USAGE]);
    assert.equal(h.said.join('\n').includes('rec_01'), false, 'what was typed came back out');
  }
  assert.deepEqual(h.seen, [], 'a bad argument reached the host');
  assert.deepEqual(h.out, []);
});

/* ── the exit codes of §4.4 ────────────────────────────────────────────── */

test('A HOST THAT REFUSES prints its own fix on stderr, nothing on stdout, and exits 1', async (t) => {
  const fix = 'This token may not read here. Ask the owner for a read grant.';
  /* A CODE FROM `30 §6`'s REGISTRY, because `refusals.mjs` counts every code any first-party file
     names, a test included, and one invented for a stub is a code with no home. */
  const h = await setup(t, { refusal: { code: 'LEVEL_REQUIRED', fix } });

  assert.equal(await h.run(), 1);
  assert.deepEqual(h.said, [fix]);
  assert.deepEqual(h.out, []);
});

test('A HOST THAT DOES NOT ANSWER is one line and exit 3', async (t) => {
  /* Nothing listens on port 9 of this machine, so the connection is refused at once. */
  const h = await offline(t, 'http://127.0.0.1:9');

  assert.equal(await h.run(), 3);
  assert.deepEqual(h.said, ['http://127.0.0.1:9 did not answer.']);
  assert.deepEqual(h.out, []);
});

test('NO HOST SET is one line saying how to name one, and exit 1', async (t) => {
  const h = await offline(t);

  assert.equal(await h.run(), 1);
  assert.deepEqual(h.said, [`No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or name a default in ${join(h.config, 'braindog', 'hosts.json')}.`]);
  assert.deepEqual(h.out, []);
});

test('THE TOKEN WAS NEVER PRINTED by any command above', () => {
  assert.ok(printed.length > 10, 'the tests above printed nothing, so this proves nothing');
  assert.equal(printed.join('\n').includes('stub-bearer-for-tests-only'), false);
});
