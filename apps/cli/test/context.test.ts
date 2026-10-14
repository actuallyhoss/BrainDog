/**
 * `braindog context` against a stub record on node:http: the card it prints, the first line it writes for itself, the
 * cap, the run it asks as, the arguments it takes, and the three exit codes of `docs/48-SPEC-CLI.md` §4.4.
 *
 * ONE RENDERER. The proof that the command and the start hook print one card is here: the same context rendered both
 * ways, asserted equal character for character.
 *
 * EVERY FOLDER IS A TEMPORARY ONE. The config folder and the working folder are made per test and removed after
 * it, so nothing here reads or writes this machine's own hosts file or session files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Attached, Brief, Context as Ctx } from '@braindog/client';

import { briefing, briefingOf, MAX_CHARS, placeOf, TWO_SESSIONS, type Where } from '../src/brief.ts';
import { context, headline } from '../src/context.ts';
import { readSession, sessionPath, writeSession } from '../src/hooks.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-7c41'].join('.');

/** Every line any command wrote, for the last test. */
const printed: string[] = [];

type After = { after: (fn: () => void | Promise<void>) => void };
type Seen = { method: string; authorization: string | undefined; headers: IncomingHttpHeaders };

const row = (spoken: string, scope: Brief['scope'], fields: Record<string, unknown>): Brief => ({ spoken, version: 1, scope, state: 'active', ...fields });

const KILN = { spoken: 'things#1', name: 'Kiln', mark: null, hue: null, how: 'folder' as const };
const NEXT = 'Before you stop, call handoff with the one next step.';

/** A context with something in every register the card knows how to draw. */
const FULL: Ctx = {
  session: { spoken: 'S7', state: 'active' },
  project: KILN,
  ambiguous: [],
  handoff: { from: 'S5', age_s: 10_800, next: 'Wire the device routes into the self-host.', tried: ['reading the claim from the cookie; it is not set on plain http'], head: 'abc1234' },
  live: { same_repo: [{ spoken: 'S6', state: 'active', doing: 'Money page', agent: 'claude', repo: 'kiln', project: 'things#1', stale: false, quiet: false, age_s: 240 }], elsewhere: [] },
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

/**
 * `boot` answers who the sign-in speaks for, by name; `null` makes it refuse, as a host that will not say does. `decide`
 * is how many questions it counts on Decide, left out as an older host leaves it.
 */
type Answer = { value?: Ctx; of?: (headers: IncomingHttpHeaders) => Ctx; refusal?: { code: string; fix: string }; name?: string | null; decide?: number };

/**
 * A record that answers `context` with what the test gives it, worked out from the request's headers when `of` is given,
 * or refuses; and `boot` with the name of the person the questions wait on.
 */
async function stubRecord(t: After, answer: Answer) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//, '');
      seen.push({ method, authorization: req.headers.authorization, headers: req.headers });
      res.writeHead(200, { 'content-type': 'application/json' });
      const value = answer.of?.(req.headers) ?? answer.value ?? BARE;
      const name = answer.name === undefined ? 'Mara' : answer.name;
      if (method === 'boot' && name !== null)
        return res.end(
          JSON.stringify({
            ok: true,
            value: { registers: [], now: '2026-10-02T09:00:00Z', me: { kind: 'token', person: 'p_owner', name, level: 'owner' }, ...(answer.decide === undefined ? {} : { counts: { decide: answer.decide, inbox: null } }) },
          }),
        );
      res.end(JSON.stringify(method === 'context' && answer.refusal === undefined ? { ok: true, value } : { ok: false, refusal: answer.refusal ?? { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } }));
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

/**
 * A command in a folder of its own. `remember` makes its headers what `main.ts` makes them, from the session file for
 * the folder; without it they name no run, as most tests here want. `env` adds variables, such as Claude Code's own.
 */
async function setup(t: After, answer: Answer = {}, o: { remember?: boolean; env?: Record<string, string> } = {}) {
  const host = await stubRecord(t, answer);
  const { config, home, cwd } = folders(t);
  /* Both, so the hosts file is the temporary one on every platform. */
  const env: Record<string, string | undefined> = { XDG_CONFIG_HOME: config, APPDATA: config, BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN, BRAINDOG_TIMEOUT_MS: '2000', ...o.env };
  const out: string[] = [];
  const said: string[] = [];
  const headers = async (to: string): Promise<Record<string, string>> => {
    if (!o.remember) return {};
    const held = readSession(sessionPath(env, cwd));
    return held === null || held.host !== to ? {} : { 'x-braindog-session': held.spoken, ...(held.client_id === undefined ? {} : { 'x-braindog-client': held.client_id }) };
  };
  const io: AgentIo = { env, cwd, home, out: (l) => void out.push(l), say: (l) => void said.push(l), headers, device: 'MacBook' };
  const run = async (args: string[] = []) => {
    const code = await context(args, io);
    printed.push(...out, ...said);
    return code;
  };
  const remember = (spoken: string, ago: number, client = 'claude-run-old') =>
    writeSession(sessionPath(env, cwd), { host: host.base, spoken, client_id: client, head_at_start: null, at: new Date(Date.now() - ago).toISOString() });
  return { ...host, config, home, cwd, env, io, out, said, run, remember, stderr: () => said.join('\n') };
}

/** A command with no host to reach: no `BRAINDOG_HOST`, no hosts file. */
async function offline(t: After, host?: string) {
  const { config, home, cwd } = folders(t);
  const env: Record<string, string | undefined> = { XDG_CONFIG_HOME: config, APPDATA: config, BRAINDOG_TIMEOUT_MS: '1000', ...(host === undefined ? {} : { BRAINDOG_HOST: host, BRAINDOG_TOKEN: TOKEN }) };
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env, cwd, home, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}), device: 'MacBook' };
  const run = async (args: string[] = []) => {
    const code = await context(args, io);
    printed.push(...out, ...said);
    return code;
  };
  return { config, cwd, out, said, run, stderr: () => said.join('\n') };
}

const USAGE = 'braindog context takes --host and nothing else.';
const HOUR = 3_600_000;

/* ── the card it prints ────────────────────────────────────────────────── */

test('braindog context prints the card, line by line, and exits 0', async (t) => {
  const h = await setup(t, { value: FULL });

  assert.equal(await h.run(), 0, h.stderr());
  assert.equal(h.said.length, 0, h.stderr());
  /* Two reads, and neither opens a run: the context, and whose the waiting question is. */
  assert.deepEqual(h.seen.map((s) => s.method), ['context', 'boot']);
  assert.equal(h.seen[0]?.authorization, `Bearer ${TOKEN}`);

  assert.deepEqual(h.out, ['Connected to BrainDog. Call context.']);
  assert.match(h.out.join('\n'), /^[^\u0000-\u0009\u000b-\u001f\u007f-\u009f]*$/u, 'the card holds a control character');
  assert.equal(h.out.join('\n').includes(hostname()), false, 'the card names the machine by its network name');
});

test('WHOSE THE QUESTIONS ARE is asked only when one waits, and a record that will not say is answered with the role', async (t) => {
  const quiet = await setup(t, { value: { ...FULL, waiting: [] } });
  assert.equal(await quiet.run(), 0, quiet.stderr());
  assert.deepEqual(quiet.seen.map((s) => s.method), ['context'], 'a card with nothing waiting asked whose it was');
  assert.equal(quiet.out.some((l) => l.startsWith('Waiting')), false);

  const silent = await setup(t, { value: FULL, name: null });
  assert.equal(await silent.run(), 0, silent.stderr());
  assert.deepEqual(silent.seen.map((s) => s.method), ['context', 'boot']);

  /* The same read counts them all, where `context` sends only the newest. */
  const counted = await setup(t, { value: FULL, decide: 12 });
  assert.equal(await counted.run(), 0, counted.stderr());
  assert.deepEqual(counted.seen.map((s) => s.method), ['context', 'boot']);
});

test('THE FIRST LINE CARRIES NO EVENT WORD: the run, its project, and the app and machine, and a state only once it has ended', () => {
  const at: Where = { repo: 'kiln', host: 'STUDIO-PC', device: 'MacBook' };
  assert.equal(headline({ spoken: 'S7', state: 'active' }, at, 'project Kiln'), 'BrainDog · run S7 · project Kiln · on MacBook');
  assert.equal(headline({ spoken: 'S7', state: 'idle' }, at, 'project Kiln'), 'BrainDog · run S7 · project Kiln · on MacBook');
  assert.equal(headline({ spoken: 'S7', state: null }, at, 'project Kiln'), 'BrainDog · run S7 · project Kiln · on MacBook');
  assert.equal(headline({ spoken: 'S7', state: 'handoff' }, at, 'project Kiln'), 'BrainDog · run S7, handoff · project Kiln · on MacBook');
  assert.equal(headline(null, { ...at, agent: 'Claude Code' }, 'no project'), 'BrainDog · no run here yet · no project · Claude Code on MacBook');
  assert.equal(headline({ spoken: 'S7', state: 'active' }, { repo: null, host: 'STUDIO-PC' }, ''), 'BrainDog · run S7 · on this machine');
  for (const word of ['started', 'resumed', 'attached', 'STUDIO-PC']) assert.equal(headline({ spoken: 'S7', state: 'active' }, at, 'project Kiln').includes(word), false, `the first line says ${word}`);
});

test('NO RUN IN THIS FOLDER YET is said on the first line, and the card goes on without one', async (t) => {
  const h = await setup(t, { value: { ...BARE, session: null } });

  assert.equal(await h.run(), 0, h.stderr());
  assert.deepEqual(h.out, ['Connected to BrainDog. Call context.']);
});

test('AN EMPTY LIVE, WAITING AND REGISTERS is the first line and the call, and nothing between them', async (t) => {
  const h = await setup(t, { value: BARE });

  assert.equal(await h.run(), 0, h.stderr());
  assert.deepEqual(h.out, ['Connected to BrainDog. Call context.']);
});

test('THE RECORD’S OWN CARD IS PRINTED AS IT CAME, and nothing of this renderer is added to it', async (t) => {
  const card = 'BrainDog · run S7 · project Kiln · Claude Code on MacBook\nNext     Wire the device routes. (S5, Claude Code, 3h ago, check before acting)\nMore     call context';
  const h = await setup(t, { value: { ...FULL, card } as Ctx });

  assert.equal(await h.run(), 0, h.stderr());
  assert.deepEqual(h.out, card.split('\n'));
});

/* ── the start hook's card is this one ─────────────────────────────────── */

test('THE START HOOK GETS THE SAME CHARACTERS: its first line names the run it attached, and the rest is briefingOf', () => {
  const at: Where = { repo: 'braindog', host: 'STUDIO-PC', device: 'MacBook', agent: 'Claude Code' };
  const attached: Attached = { session: { id: 'e_7', seq: 7, state: 'active', version: 1, fields: {} }, spoken: 'S7', resumed: true, project: 'things#1', context: FULL };

  assert.equal(briefing(attached, at, 4), 'Connected to BrainDog. Call context.');
  assert.equal(briefingOf('', FULL, 4), briefing(attached, at, 4));
});

/* ── the cap ───────────────────────────────────────────────────────────── */

const manyRegisters = (n: number): Ctx => ({
  ...BARE,
  registers: Array.from({ length: n }, (_, i) => {
    const id = `reg${String(i).padStart(2, '0')}`;
    return { id, name: `Reg${String(i).padStart(2, '0')}`, rows: [row(`${id}#1`, 'project', { task: `Row ${String(i).padStart(2, '0')}.` })], inherited: [], truncated: false };
  }),
});

test('SIXTY LISTS OF OPEN ROWS ARE NOT THE CARD: what applies here is on demand, never an inventory', () => {
  assert.deepEqual(briefingOf('BrainDog · run S7', manyRegisters(60), undefined).split('\n'), ['Connected to BrainDog. Call context.']);
});

test('THE 1,500-CHARACTER CAP COUNTS THE FIRST LINE, through the command as through the hook', async (t) => {
  const long = 'and more of the same words, '.repeat(40);
  const wide: Ctx = {
    ...FULL,
    project: { ...KILN, name: long },
    handoff: { ...FULL.handoff!, next: long },
    waiting: Array.from({ length: 6 }, (_, i) => ({ id: `SG${String(i)}`, question: `${String(i)} ${long}` })),
    registers: [{ id: 'learnings', name: 'Learnings', rows: Array.from({ length: 6 }, (_, i) => row(`LN${String(i)}`, 'project', { lesson: `${String(i)} ${long}` })), inherited: [], truncated: false }],
    /* The record draws the card; this command holds what it was sent to the cap, the first line cut at a word. */
    card: [`BrainDog · run S7 · project ${long}`, `Next     ${long}`, ...Array.from({ length: 6 }, (_, i) => `Waiting  ${String(i)} ${long}`)].join('\n'),
  } as Ctx;
  const h = await setup(t, { value: wide });
  assert.equal(await h.run(), 0, h.stderr());
  const text = h.out.join('\n');
  assert.ok([...text].length <= MAX_CHARS, `${String([...text].length)} characters`);
  assert.match(h.out[0]!, /^BrainDog · run S7 · project and more of the same words, /u);
  assert.ok(h.out.length < 8, `${String(h.out.length)} lines`);
});

/* ── the run it asks as ────────────────────────────────────────────────── */

test('A REMEMBERED RUN THAT HAS ENDED IS NOT WHERE THE CALLER STARTS: the context is asked again without it, and its own step leads', async (t) => {
  /* S297 handed off three days ago. Named, the record calls the caller S297 and hands it S294's older step; unnamed, the
     caller has no run yet and S297's own step is the one waiting for it. */
  const named: Ctx = { ...BARE, project: KILN, session: { spoken: 'S297', state: 'handoff' }, handoff: { from: 'S294', age_s: 279_142, next: 'Draw the bento boards.', tried: [], head: null } };
  const unnamed: Ctx = { ...BARE, project: KILN, session: null, handoff: { from: 'S297', age_s: 260_000, next: 'Cut page answers to block summaries.', tried: [], head: null } };
  const h = await setup(t, { of: (headers) => (headers['x-braindog-session'] === 'S297' ? named : unnamed) }, { remember: true });
  h.remember('S297', HOUR);

  assert.equal(await h.run(), 0, h.stderr());
  assert.deepEqual(h.seen.map((s) => [s.headers['x-braindog-session'], s.headers['x-braindog-client']]), [['S297', 'claude-run-old'], [undefined, undefined]]);
  assert.deepEqual(h.out, ['Connected to BrainDog. Call context.']);
  assert.equal(h.out.join('\n').includes('S294'), false, 'the ended run was presented as the place to start');
});

test('A REMEMBERED RUN STILL WORKING IS THE CALLER’S, and one no hook has heard from in twelve hours is not sent at all', async (t) => {
  const fresh = await setup(t, { of: (headers) => (headers['x-braindog-session'] === 'S7' ? BARE : { ...BARE, session: null }) }, { remember: true });
  fresh.remember('S7', HOUR);
  assert.equal(await fresh.run(), 0, fresh.stderr());
  assert.equal(fresh.seen.length, 1);

  const stale = await setup(t, { of: (headers) => (headers['x-braindog-session'] === 'S7' ? BARE : { ...BARE, session: null }) }, { remember: true });
  stale.remember('S7', 13 * HOUR);
  assert.equal(await stale.run(), 0, stale.stderr());
  assert.deepEqual(stale.seen.map((s) => [s.headers['x-braindog-session'], s.headers['x-braindog-client']]), [[undefined, undefined]]);
});

test('INSIDE CLAUDE CODE THE CALLER IS ITS OWN SESSION: another session’s file is not sent, and its own run is never a second session', async (t) => {
  /* Measured on the owner's Mac: a subagent of S729 in a folder whose file named S297 was told it was S297, and that S729
     was a second session in its working tree. Asked by its own session's id, the record names S729. */
  const mine: Ctx = {
    ...BARE,
    project: KILN,
    session: { spoken: 'S729', state: 'active' },
    live: { same_repo: [{ spoken: 'S729', state: 'active', doing: 'Claude run, 1 Oct', agent: 'claude', repo: 'braindog', project: null, stale: false, quiet: false, age_s: 603 }], elsewhere: [] },
  };
  const h = await setup(
    t,
    { of: (headers) => (headers['x-braindog-client'] === 'claude-run-mine' ? mine : { ...mine, session: { spoken: 'S297', state: 'handoff' } }) },
    { remember: true, env: { CLAUDE_CODE_SESSION_ID: 'claude-run-mine', CLAUDECODE: '1' } },
  );
  h.remember('S297', HOUR);

  assert.equal(await h.run(), 0, h.stderr());
  assert.deepEqual(h.seen.map((s) => [s.headers['x-braindog-session'], s.headers['x-braindog-client']]), [[undefined, 'claude-run-mine']]);
  assert.deepEqual(h.out, ['Connected to BrainDog. Call context.']);
});

/* ── the arguments ─────────────────────────────────────────────────────── */

test('--host names the record, and nothing else is taken', async (t) => {
  const h = await setup(t, { value: BARE });
  delete h.env.BRAINDOG_HOST;

  assert.equal(await h.run(['--host', h.base]), 0, h.stderr());
  assert.equal(h.out.length, 1);

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
