/**
 * `braindog actions run <name>` against a stub record on node:http, with the press handed in as a fake fetch.
 *
 * THE STUB ANSWERS WHAT THE RECORD ANSWERS: `context`, and `actions` with two scheduled actions. The press goes to the
 * stub's `actionRun` through the `run` the command takes, because the client's route table does not hold the method
 * until the host's does; the stub answers the turn, a paused action's own sentence, the browser-only refusal, and the
 * door's 429 with `Retry-After`. Invented names only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Result } from '@braindog/ports';

import { actionsCommand, findAction, waitWords, type Ran } from '../src/actions-run.ts';
import type { Answer } from '../src/json.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-4c1d'].join('.');

const CONTEXT = { session: null, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], people: [], faded: 0, project: null, registers: [], next: '' };

const NOW = Date.parse('2026-10-15T09:00:00.000Z');

const month = { runs: 3, requests: 3, bytes: 900, failures: 0, held: 0 };
const ROWS = [
  { ingest: 'tide-tables', channel: 'pull', project: null, host: 'tides.example', every: '6h', key: null, state: 'pending', next: '2026-10-15T12:00:00.000Z', last: null, month, days: [] },
  { ingest: 'kelp-prices', channel: 'poll', project: null, host: 'kelp.example', every: '1h', key: 'kelp', state: 'paused', next: null, last: null, month, days: [] },
];

const PAUSED = 'Kelp prices is paused: the key it uses is not in the vault. Resume it on its project’s page.';
const BROWSER = 'Open this from the app; a token cannot run an action now.';

type Press = { status: number; body: unknown; headers?: Record<string, string> };

async function setup(t: { after: (fn: () => void | Promise<void>) => void }, press: (ingest: string) => Press) {
  const seen: { method: string; args: Record<string, unknown> }[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : Object.fromEntries(url.searchParams)) as Record<string, unknown>;
      seen.push({ method, args });
      const send = (status: number, value: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(value));
      };
      if (method === 'context') return send(200, { ok: true, value: CONTEXT });
      if (method === 'actions') return send(200, { ok: true, value: ROWS });
      if (method === 'actionRun') {
        const p = press(String(args.ingest));
        return send(p.status, p.body, p.headers);
      }
      return send(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const dir = mkdtempSync(join(tmpdir(), 'braindog-actions-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), APPDATA: join(dir, 'config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN };
  const out: string[] = [];
  const said: string[] = [];
  const answered: Answer[] = [];
  const io: AgentIo = { env, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}), answer: (a) => void answered.push(a) };
  /* THE FAKE FETCH: the press as the host's route will take it, a POST of the action's id. */
  const run = async (_client: unknown, ingest: string): Promise<Result<Ran>> => {
    const res = await fetch(`${base}/api/actionRun`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingest }) });
    return (await res.json()) as Result<Ran>;
  };
  return { io, out, said, answered, seen, deps: { run, now: () => NOW } };
}

const turn = (ingest: string): Press => ({ status: 200, body: { ok: true, value: { ingest, due_at: '2026-10-15T09:00:00.000Z' } } });

test('a name found, in its id or in words, is pressed and says it runs in a moment', async (t) => {
  const h = await setup(t, turn);
  assert.equal(await actionsCommand(['run', 'tide-tables'], h.io, h.deps), 0);
  assert.deepEqual(h.out, ['Tide tables runs in a moment.']);
  assert.deepEqual(h.said, []);
  assert.equal(await actionsCommand(['run', 'Tide', 'Tables'], h.io, h.deps), 0);
  const pressed = h.seen.filter((s) => s.method === 'actionRun');
  assert.deepEqual(
    pressed.map((s) => s.args),
    [{ ingest: 'tide-tables' }, { ingest: 'tide-tables' }],
  );
});

test('a name nobody has is a sentence naming the ones there are, and nothing is pressed', async (t) => {
  const h = await setup(t, turn);
  assert.equal(await actionsCommand(['run', 'eel-counts'], h.io, h.deps), 1);
  assert.deepEqual(h.said, ['No scheduled action you can read is called eel-counts. The ones there are: Tide tables, Kelp prices.']);
  assert.equal(h.seen.filter((s) => s.method === 'actionRun').length, 0);
  assert.deepEqual(h.out, []);
});

test('a second press reads the 429 as a wait in words, and the hour’s allowance in minutes', async (t) => {
  let n = 0;
  const h = await setup(t, (ingest) =>
    ++n === 1
      ? turn(ingest)
      : { status: 429, body: { ok: false, refusal: { code: 'RATE_LIMITED', fix: 'Wait.', retry_after: n === 2 ? 40 : 1790 } }, headers: { 'retry-after': n === 2 ? '40' : '1790' } },
  );
  assert.equal(await actionsCommand(['run', 'tide-tables'], h.io, h.deps), 0);
  assert.equal(await actionsCommand(['run', 'tide-tables'], h.io, h.deps), 1);
  assert.equal(h.said[0], 'Tide tables was pressed a moment ago. Try again in 40 seconds.');
  assert.equal(await actionsCommand(['run', 'tide-tables'], h.io, h.deps), 1);
  assert.equal(h.said[1], 'Run now has been pressed as often as this hour allows. Try again in 30 minutes.');
  assert.equal(h.answered[1]?.refusal?.code, 'RATE_LIMITED');
});

test('a paused action and a token at a browser’s door are the record’s own sentences', async (t) => {
  const h = await setup(t, (ingest) =>
    ingest === 'kelp-prices'
      ? { status: 409, body: { ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix: PAUSED, at: 'ingest' } } }
      : { status: 403, body: { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: BROWSER, at: 'principal' } } },
  );
  assert.equal(await actionsCommand(['run', 'kelp prices'], h.io, h.deps), 1);
  assert.equal(await actionsCommand(['run', 'tide-tables'], h.io, h.deps), 1);
  assert.deepEqual(h.said, [PAUSED, BROWSER]);
  assert.deepEqual(h.out, []);
});

test('--json hands over the record’s answer, untouched', async (t) => {
  const h = await setup(t, turn);
  assert.equal(await actionsCommand(['run', 'tide-tables'], h.io, h.deps), 0);
  assert.deepEqual(h.answered, [{ value: { ingest: 'tide-tables', due_at: '2026-10-15T09:00:00.000Z' } }]);
  assert.doesNotMatch(JSON.stringify([h.out, h.said, h.answered]), /stub-bearer/u);
});

test('a verb it does not take says what it takes', async (t) => {
  const h = await setup(t, turn);
  assert.equal(await actionsCommand(['list'], h.io, h.deps), 1);
  assert.equal(await actionsCommand(['run'], h.io, h.deps), 1);
  assert.equal(h.said.length, 2);
  for (const l of h.said) assert.match(l, /braindog actions takes run <name>/u);
  assert.equal(h.seen.length, 0);
});

test('the name in words and the wait in words', () => {
  const rows = ROWS as unknown as Parameters<typeof findAction>[0];
  assert.deepEqual(findAction(rows, 'TIDE_TABLES').map((r) => r.ingest), ['tide-tables']);
  assert.deepEqual(findAction(rows, '  '), []);
  assert.equal(waitWords(40), '40 seconds');
  assert.equal(waitWords(91), '2 minutes');
  assert.equal(waitWords(7200), '2 hours');
});
