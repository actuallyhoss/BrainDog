/**
 * Undo on the server, dry first and then with the hash, for one change, one decision and one run; and a receipt's Undo
 * that asks the record first and falls back to the screen's own inverse where the record has none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { optimist, type Change } from '../data/optimistic.ts';
import { batchOf, serverFirst } from './undo-back.ts';
import { planOf, undoChange, undoDecision, undoPlan, undoRun, undoneSaid, undoWords, type Undone } from './undo-write.ts';
import type { Fetch } from './boot-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A host that answers `undo` and `undoRun` by what it was sent, and keeps every body. */
function host(answer: (method: string, body: Record<string, unknown>) => Response): { io: Fetch; sent: { method: string; body: Record<string, unknown> }[] } {
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = new URL(String(url)).pathname.split('/').pop() ?? '';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    sent.push({ method, body });
    return answer(method, body);
  }) as Fetch;
  return { io, sent };
}

const PLAN = {
  steps: [
    { row: 'tasks#4', title: 'Renew brain.dog', field: 'state', label: 'State', from: 'done', to: 'open', do: 'Back to open' },
    { row: 'tasks#5', title: 'Pay rent', field: 'state', label: 'State', from: 'done', to: 'open', do: 'Back to open' },
  ],
  skipped: [{ row: 'tasks#6', title: 'Call Jo', why: 'You changed it since.', line: 'Leaves Call Jo as it is: you changed it since.' }],
  say: 'Puts back 2 changes. Leaves one as it is.',
  hash: 'h1',
};

test('ONE PRESS IS TWO CALLS: the plan, dry, and then that plan by its hash, said in one sentence', async () => {
  const { io, sent } = host((_m, body) => json(200, { ok: true, value: body.dry ? PLAN : { put: 2, skipped: PLAN.skipped } }));
  const out = await undoChange(BASE, 'b1', io);
  assert.deepEqual(
    sent.map((s) => [s.method, s.body]),
    [
      ['undo', { batch: 'b1', dry: true }],
      ['undo', { batch: 'b1', hash: 'h1' }],
    ],
  );
  assert.deepEqual(out, { from: 'undone', put: 2, skipped: [{ title: 'Call Jo', why: 'You changed it since.', line: 'Leaves Call Jo as it is: you changed it since.' }], said: 'Put back 2 changes. Left Call Jo as it is: You changed it since.' });
});

test('a decision goes back by its id, and a run through its own route', async () => {
  const { io, sent } = host((_m, body) => json(200, { ok: true, value: body.dry ? { ...PLAN, skipped: [] } : {} }));
  assert.equal((await undoDecision(BASE, 'D12', io)).from, 'undone');
  assert.equal((await undoRun(BASE, 'S42', io)).from, 'undone');
  assert.deepEqual(
    sent.map((s) => [s.method, s.body.decision ?? s.body.run, s.body.dry ?? s.body.hash]),
    [
      ['undo', 'D12', true],
      ['undo', 'D12', 'h1'],
      ['undoRun', 'S42', true],
      ['undoRun', 'S42', 'h1'],
    ],
  );
});

test('a record with no server undo says so as `missing`, a refusal is its sentence, and a plan that moved is a conflict', async () => {
  const missing = host(() => json(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot put changes back yet.' } }));
  assert.deepEqual(await undoChange(BASE, 'b1', missing.io), { from: 'missing', fix: 'This BrainDog cannot put changes back yet.' });
  assert.equal(missing.sent.length, 1, 'nothing is applied after a plan the record could not make');
  const refused = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner can put a run back.' } }));
  assert.deepEqual(await undoRun(BASE, 'S42', refused.io), { from: 'refused', fix: 'Only the owner can put a run back.' });
  for (const code of ['VERSION_STALE', 'PLAN_STALE']) {
    const moved = host((_m, body) => (body.dry ? json(200, { ok: true, value: PLAN }) : json(409, { ok: false, refusal: { code, fix: 'x' } })));
    assert.deepEqual(await undoChange(BASE, 'b1', moved.io), { from: 'conflict', fix: undoWords.moved }, code);
  }
});

test('the plan alone, for a panel that shows it first, and a plan in a shape this build cannot read is refused', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: PLAN }));
  const read = await undoPlan(BASE, { run: 'S42' }, io);
  assert.equal(read.from, 'plan');
  assert.equal(read.from === 'plan' && read.plan.steps.length, 2);
  assert.equal(read.from === 'plan' && read.plan.say, PLAN.say, 'the record’s sentence for the plan rides with it');
  assert.equal(sent.length, 1);
  assert.equal(planOf({ steps: [] }), null, 'no hash, no plan');
  assert.deepEqual(planOf({ hash: 'h', steps: [7, { title: 'A' }] })?.steps, [{ title: 'A', label: null, from: undefined, to: undefined, do: '', line: '', row: null, list: null, at: null }]);
  assert.deepEqual(
    planOf({ hash: 'h', steps: [{ title: 'A', row: '01J0000000000000000000000A', list: 'Tasks', register: 'tasks', seq: 4 }] })?.steps.map((s) => [s.row, s.list, s.at]),
    [['01J0000000000000000000000A', 'Tasks', { register: 'tasks', seq: 4 }]],
    'which row a step is on rides with it, as handles a byline matches its own row by',
  );
  assert.equal(undoneSaid(0, []), undoWords.nothing);
  assert.equal(undoneSaid(1, [{ title: 'A', why: 'x', line: '' }, { title: 'B', why: 'y', line: '' }]), 'Put back 1 change. Skipped 2 that changed since or cannot come back.');
});

/* ── the receipt ─────────────────────────────────────────────────────────── */

const said = () => {
  const lines: { text: string; undo?: () => void }[] = [];
  return { lines, push: (text: string, opts?: { undo?: () => void }) => lines.push({ text, ...(opts?.undo ? { undo: opts.undo } : {}) }) };
};

const settle = () => new Promise((r) => setTimeout(r, 0));

test('A WRITE THAT LANDED UNDER A BATCH is undone by the record, drawn at once, and let go once the screen has read it back', async () => {
  const log: string[] = [];
  const inverse: Change<unknown> = {
    apply: () => log.push('draw inverse'),
    revert: () => log.push('drop inverse'),
    send: async () => (log.push('send inverse'), { ok: true, value: null }),
    said: 'Put back.',
  };
  const undo = async (batch: string): Promise<Undone> => (log.push(`undo ${batch}`), { from: 'undone', put: 1, skipped: [], said: 'Put back 1 change.' });
  const say = said();
  const { run } = optimist(say);
  await run({
    apply: () => {},
    revert: () => {},
    send: async () => ({ ok: true, value: { seq: 4, batch: 'b9' } }),
    said: 'Marked it done.',
    undo: (value) => serverFirst(batchOf(value), inverse, undo, () => log.push('reread')),
  });
  say.lines[0]!.undo!();
  await settle();
  assert.deepEqual(log, ['draw inverse', 'undo b9', 'reread', 'drop inverse']);
  assert.deepEqual(say.lines.map((l) => l.text), ['Marked it done.', 'Put back 1 change.']);
  assert.equal(say.lines[1]!.undo, undefined, 'the record’s undo is not offered back in turn');
});

test('NO BATCH, OR NO SERVER UNDO, is the screen’s own inverse, and a refusal takes the drawing back', async () => {
  const inverse: Change<unknown> = { apply: () => {}, revert: () => {}, send: async () => ({ ok: true, value: null }) };
  assert.equal(serverFirst(null, inverse, async () => ({ from: 'missing', fix: '' })), inverse);
  assert.equal(batchOf({ batch: '' }), null);
  assert.equal(batchOf([]), null);

  const log: string[] = [];
  const back = (sent: Undone) =>
    serverFirst(
      'b1',
      { apply: () => log.push('draw'), revert: () => log.push('drop'), send: async () => (log.push('inverse'), { ok: true, value: 'row' }), settle: (v) => log.push(`settle ${String(v)}`) },
      async () => sent,
    ) as Change<unknown>;
  const say = said();
  const { run } = optimist(say);
  await run(back({ from: 'missing', fix: 'no undo here' }));
  assert.deepEqual(log, ['draw', 'inverse', 'settle row']);
  assert.equal(say.lines.at(-1)?.text, 'Put back.', 'an inverse with no line of its own still says what it did');
  log.length = 0;
  await run(back({ from: 'refused', fix: 'Only the owner can.' }));
  assert.deepEqual(log, ['draw', 'drop']);
  assert.equal(say.lines.at(-1)?.text, 'Only the owner can.');
});

test('A BATCH WITH NO SERVER UNDO AND NO INVERSE says the record’s sentence, never "Put back." for what nobody did', async () => {
  const back = serverFirst('b1', null, async () => ({ from: 'missing', fix: 'This BrainDog cannot put changes back yet.' })) as Change<unknown>;
  const say = said();
  const out = await optimist(say).run(back);
  assert.equal(out.ok, false);
  assert.equal(say.lines.at(-1)?.text, 'This BrainDog cannot put changes back yet.');
});
