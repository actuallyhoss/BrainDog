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

type Seen = { method: string; args: Record<string, unknown> };

/** The record's own sentence for a token at an ADMIN door, with the words each method passes to `admin()`. */
const browserOnly = (reads?: string) => ({
  ok: false,
  refusal: { code: 'NEEDS_BROWSER_SESSION', fix: reads === undefined ? 'Open this from the app; a token cannot change what this record is.' : `Open this from the app; a token cannot ${reads}.`, at: 'principal' },
});

async function stub(t: { after: (fn: () => void | Promise<void>) => void }, opts: { admin?: boolean; rows?: unknown[] } = {}) {
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
        if (args.rule === 'chase' || args.rule === 'rule.chase') return answer({ ok: true, value: CHASE });
        return answer({ ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix: `There is no automation called rule.${String(args.rule)}.`, at: 'rule' } });
      }
      if (method === 'automationRun') return answer(admin ? { ok: true, value: { run: 'run_01JANEWNEWNEWNEWNEWNEWNEWN' } } : browserOnly('start an automation'));
      if (method === 'cancelRun') return answer(admin ? { ok: true, value: { run: args.run, state: 'cancelled' } } : browserOnly('stop a run'));
      if (method === 'resumeScript') return answer(admin ? { ok: true, value: { script: args.script } } : browserOnly());
      return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

async function setup(t: { after: (fn: () => void | Promise<void>) => void }, opts: { admin?: boolean; rows?: unknown[] } = {}) {
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

test('automations list: one line each, saying what starts it, whether it is on, and how its last run went', async (t) => {
  const h = await setup(t);
  assert.equal(await automations(['list'], h.io), 0);
  assert.deepEqual(h.out, [
    'Automations on this BrainDog:',
    '  chase  Chase late invoices. When a row of invoices is written, as a run. Last run failed at 2026-09-21 14:02 UTC: The mail step was refused. 1 run open. This month 4 runs: 3 done, 1 failed.',
    '  weekly  On a clock, as a run. Turned off. From money-core, for acme. Next 2026-09-28 09:00 UTC. No run yet.',
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
  assert.equal(await automations(['list', '--all'], h.io), 1);
  assert.deepEqual(h.said, ['braindog automations list takes --host <host>, and nothing else.']);
  assert.equal(h.seen.length, seen, 'a bad flag sends nothing');
});

test('automations show: the automation, then its recent runs step by step, and the whole answer as the value', async (t) => {
  const h = await setup(t);
  assert.equal(await automations(['show', 'chase'], h.io), 0);
  assert.deepEqual(h.out, [
    'rule.chase  Chase late invoices, version 3.',
    'When a row of invoices is written, as a run. On.',
    'This month 4 runs: 3 done, 1 failed. 1 run open.',
    'Recent runs, newest first:',
    '  run_01J9ZZZZZZZZZZZZZZZZZZZZZZ  failed  2026-09-21 14:02 UTC, by S7 on a write. The mail step was refused.',
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
  assert.deepEqual(h.said, ['There is no automation called rule.nowhere.']);
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
  assert.deepEqual(h.said, ['Open this from the app; a token cannot change what this record is.']);
  assert.deepEqual(called(h.seen, 'resumeScript')[0]?.args, { script: 'fx-rates' });

  const ok = await setup(t, { admin: true });
  assert.equal(await scripts(['resume', 'fx-rates'], ok.io), 0);
  assert.deepEqual(ok.out, ['fx-rates runs again now. Three more refused runs in a row pause it again.']);
  assert.deepEqual(ok.answered, [{ value: { script: 'fx-rates' } }]);
});

test('scripts list is refused before any request, and says why there is no list to read', async (t) => {
  const h = await setup(t);
  assert.equal(await scripts(['list'], h.io), 1);
  assert.equal(h.seen.length, 0);
  assert.match(h.said[0] ?? '', /^braindog scripts takes resume <id>/);
  assert.match(h.said[0] ?? '', /no read that lists scripts/);
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
