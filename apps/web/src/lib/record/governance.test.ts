/**
 * `/decide` on a live record: which rows it draws, the sample when there is no record, the record's own
 * sentence when it refuses, and the `decide` call an answer sends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { answer, park, plainOf, questionOf, readOne, readQueue, type Governor } from './governance.ts';
import { updatesOf } from '../../routes/decide/[id]/changes.ts';

type Calls = { name: string; args: unknown }[];

const refused = (code: string, fix: string) => ({ ok: false as const, refusal: { code, fix } });

function client(over: Partial<Governor> = {}, calls: Calls = []): Governor {
  return {
    boot: async () => ({ ok: true, value: { waiting: [{ id: 'SG2', question: 'Per seat or per product?' }] } }),
    governance: async (args) => {
      calls.push({ name: 'governance', args });
      if (args.register === 'decision') {
        const decisions = [{ id: 'D1', question: 'Which registrar?', answer: 'nordhaven', reason: 'Registry lock.', decided_by: 'sam', ts: '2026-09-01T10:00:00Z' }];
        return { ok: true, value: args.id ? decisions.find((d) => d.id === args.id) ?? null : decisions };
      }
      if (args.id === 'SG3') return { ok: true, value: null };
      const rows = [
        { id: 'SG4', body_kind: 'rowset', status: 'open', opened_by: 'spark', opened_at: '2026-09-14T09:00:00Z', body: { register: 'things', rows: [{ at: 'things#1', version: 3, patch: { lane: 'earning', note: 'one\n2' } }, { name: 'A new one' }] } },
        { id: 'SG2', body_kind: 'options', status: 'open', opened_by: 'sam', opened_at: '2026-09-10T09:00:00Z', body: { options: [{ id: 'seat', label: 'Per seat', because: 'Predictable.' }, { id: 'product', label: 'Per product', because: 'Matches use.', recommended: true }] } },
      ];
      return { ok: true, value: args.id ? rows.find((r) => r.id === args.id) ?? null : rows };
    },
    schema: async () => ({ ok: true, value: { title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'lane', type: 'enum', label: 'Status' }, { id: 'note', type: 'document' }] } }),
    get: async (register, seq) => {
      calls.push({ name: 'get', args: { register, seq } });
      return { ok: true, value: { id: '01J', seq, version: 3, fields: { name: 'Kiln', lane: 'building', note: 'one\ntwo' } } };
    },
    call: async (name, args) => {
      calls.push({ name, args });
      return { ok: true, value: { decision: 'D2' } };
    },
    ...over,
  };
}

test('the queue is the record’s open suggestions, in its order, each with the question it asks', async () => {
  const calls: Calls = [];
  const out = await readQueue(client({}, calls));
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(out.value.open.map((q) => [q.id, q.rank]), [['SG4', 1], ['SG2', 2]]);
  assert.deepEqual(calls.find((c) => c.name === 'governance')?.args, { status: 'open' });

  const [rowset, options] = out.value.open;
  assert.equal(options?.title, 'Per seat or per product?');
  assert.deepEqual(options?.options, [
    { key: 'seat', title: 'Per seat', body: 'Predictable.' },
    { key: 'product', title: 'Per product', body: 'Matches use.', recommended: true },
  ]);
  /* A proposal the record did not say the question of is still named, by its id. */
  assert.equal(rowset?.title, 'SG4');
  assert.deepEqual(rowset?.options.map((o) => o.key), ['accept', 'reject']);

  assert.deepEqual(out.value.decided.map((q) => [q.id, q.title, q.decided?.option, q.decided?.by]), [['D1', 'Which registrar?', 'nordhaven', 'sam']]);
});

test('a rowset update draws the same diff as the sample, from the record’s own rows and declaration', async () => {
  const out = await readQueue(client());
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  const updates = updatesOf(out.value.rowsets.SG4, out.value.registers, out.value.rows, plainOf(out.value.registers));
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.title, 'Kiln');
  const [lane, note] = updates[0]?.changes ?? [];
  assert.deepEqual(lane, { field: 'lane', label: 'Status', long: false, before: 'building', after: 'earning' });
  assert.equal(note?.long, true);
});

test('no record here is the sample, and any other refusal is the record’s own sentence', async () => {
  for (const code of ['UNREACHABLE', 'UNAUTHORIZED']) {
    const out = await readQueue(client({ governance: async () => refused(code, 'No record.') }));
    assert.deepEqual(out, { from: 'sample' });
  }
  const out = await readQueue(client({ governance: async () => refused('FORBIDDEN', 'You may not read the queue.') }));
  assert.deepEqual(out, { from: 'refused', fix: 'You may not read the queue.' });
});

test('one question is read by its id, a decision from the decisions, and a missing one is null', async () => {
  const calls: Calls = [];
  const sg = await readOne(client({}, calls), 'SG2');
  assert.ok(sg.from === 'live' && sg.value.question?.title === 'Per seat or per product?');
  assert.deepEqual(calls[0]?.args, { register: 'suggestion', id: 'SG2' });

  const d = await readOne(client(), 'D1');
  assert.ok(d.from === 'live' && d.value.question?.decided?.reason === 'Registry lock.');

  const none = await readOne(client(), 'SG3');
  assert.ok(none.from === 'live' && none.value.question === null);
});

test('answering sends decide with the option and the reason, and an empty reason sends nothing', async () => {
  const calls: Calls = [];
  const c = client({}, calls);
  assert.deepEqual(await answer(c, 'SG2', 'product', '  Matches how the fonts are used.  '), { ok: true });
  assert.deepEqual(calls.at(-1), { name: 'decide', args: { id: 'SG2', decide: { option: 'product', reason: 'Matches how the fonts are used.' } } });

  const before = calls.length;
  assert.deepEqual(await answer(c, 'SG2', 'product', '   '), { ok: false, fix: copy.reasonRequired });
  assert.equal(calls.length, before);

  assert.deepEqual(await park(c, 'SG2', '2026-10-01', 'Waiting on the quote.'), { ok: true });
  assert.deepEqual(calls.at(-1), { name: 'decide', args: { id: 'SG2', defer: { until: '2026-10-01', why: 'Waiting on the quote.' } } });
});

test('a refused answer shows the record’s fix, and a conflict says the row changed', async () => {
  const no = client({ call: async () => refused('TRANSITION_ILLEGAL', 'SG2 is resolved, and a decision is made once.') });
  assert.deepEqual(await answer(no, 'SG2', 'seat', 'Because.'), { ok: false, fix: 'SG2 is resolved, and a decision is made once.' });
  const stale = client({ call: async () => ({ ok: false, conflict: { current: {} } }) });
  assert.deepEqual(await answer(stale, 'SG4', 'accept', 'Both are right.'), { ok: false, fix: copy.changedSince });
});

test('an options body with no usable options offers the two words, and a blank question falls back to the id', () => {
  const q = questionOf({ id: 'SG9', body_kind: 'pattern', body: {}, opened_at: '' }, '   ', 3);
  assert.equal(q.title, 'SG9');
  assert.deepEqual(q.options.map((o) => o.title), [copy.acceptIt, copy.rejectIt]);
});
