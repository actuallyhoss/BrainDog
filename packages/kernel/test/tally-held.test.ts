/**
 * How many rows hold each value of a field, held while the list stands: a page's chips and the record's `countBy`.
 *
 * MEASURED: nine scans of a 20,000 line ledger, 105 of `page(money-ledger)`'s 139 ms warm and 108 of `page(money-reports)`'s
 * 143. What is asserted is that a second ask reads no row, and that the count never outlives what it counted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 3, 12);
const DAY = 86_400_000;
const P = { actor: 'p_owner' };

const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'jobs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'stage', type: 'enum', values: ['new', 'done'] },
      { id: 'due', type: 'day' },
    ],
  },
} as never;
const NOTES: Declaration = { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'notes', title: 'text', fields: [{ id: 'text', type: 'text', required: true }, { id: 'job', type: 'ref', to: 'jobs' }] } } as never;

async function made() {
  const sql = openSqlite();
  const statements: string[] = [];
  const all = sql.all.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (statements.push(q), all(q, ...a))) as typeof sql.all;
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([JOBS, NOTES])).ok);
  const job = (what: string, stage: string, more: Record<string, unknown> = {}): Entry => {
    const out = k.create('jobs', { what, stage, ...more }, P);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value as Entry;
  };
  const counted = (where?: unknown): Record<string, number> => {
    const out = k.countBy({ register: 'jobs', field: 'stage', where: where as never });
    assert.ok(out.ok, JSON.stringify(out));
    return Object.fromEntries((out.value as { value: string; n: number }[]).map((t) => [String(t.value), t.n]));
  };
  const scans = () => statements.filter((q) => /COUNT\(\*\) AS n FROM entry/u.test(q)).length;
  return { sql, k, clock, job, counted, statements, scans };
}

test('A SECOND ASK READS NO ROW, and answers the same', async () => {
  const { job, counted, statements, scans } = await made();
  job('One', 'new');
  job('Two', 'done');
  const first = counted();
  assert.deepEqual(first, { new: 1, done: 1 });
  statements.length = 0;
  assert.deepEqual(counted(), first);
  assert.equal(scans(), 0, 'a held count scanned the rows');
});

test('A ROW ADDED, EDITED OR DELETED IS COUNTED AT ONCE', async () => {
  const { sql, k, job, counted } = await made();
  const one = job('One', 'new');
  assert.deepEqual(counted(), { new: 1 });
  job('Two', 'new');
  assert.deepEqual(counted(), { new: 2 });
  assert.ok(k.update('jobs', one.id, { stage: 'done' }, P).ok);
  assert.deepEqual(counted(), { new: 1, done: 1 });
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), one.id);
  assert.deepEqual(counted(), { new: 1 });
});

test('EACH QUESTION IS ITS OWN ANSWER: another filter is not the one held', async () => {
  const { job, counted } = await made();
  job('One', 'new', { due: '2026-09-01' });
  job('Two', 'new', { due: '2026-09-30' });
  assert.deepEqual(counted(), { new: 2 });
  assert.deepEqual(counted({ field: 'due', after: '2026-09-15' }), { new: 1 });
  assert.deepEqual(counted(), { new: 2 });
});

test('A FILTER SAID AS TODAY IS ASKED AGAIN THE NEXT DAY', async () => {
  const { clock, job, counted } = await made();
  job('One', 'new', { due: '2026-09-04' });
  const late = 'due before today';
  assert.deepEqual(counted(late), {});
  clock.set(NOW + 2 * DAY);
  assert.deepEqual(counted(late), { new: 1 });
});

test('A FILTER THAT HOPS MOVES WITH THE LIST IT HOPS TO', async () => {
  const { k, job, counted } = await made();
  const one = job('One', 'new');
  const hop = { pointed: { register: 'notes', by: 'job' } };
  assert.deepEqual(counted(hop), {});
  const note = k.create('notes', { text: 'About one', job: one.id }, P);
  assert.ok(note.ok, JSON.stringify(note));
  assert.deepEqual(counted(hop), { new: 1 });
});

test('A TRANSACTION THAT WROTE COUNTS ITS OWN ROW, and a write taken back is not seen', async () => {
  const { k, job, counted } = await made();
  job('One', 'new');
  assert.deepEqual(counted(), { new: 1 });
  assert.throws(() =>
    k.transaction(() => {
      job('Taken back', 'new');
      assert.deepEqual(counted(), { new: 2 });
      throw new Error('taken back');
    }),
  );
  assert.deepEqual(counted(), { new: 1 });
});

test('A ROW KEPT PRIVATE: each reader\'s chip counts what that reader sees, held apart, and moved at once', async () => {
  const { sql, k, job } = await made();
  const page = { id: 'page.jobs', kind: 'page', body: { page: 'jobs', title: 'Jobs', filters: [{ field: 'stage', control: 'chips' }], blocks: [{ kind: 'table', source: 'register.jobs', columns: [{ field: 'what', label: 'What' }], empty: 'None.' }] } } as never as Declaration;
  const installed = await k.install([page]);
  assert.ok(installed.ok, JSON.stringify(installed));
  job('Open', 'new');
  const secret = job('Secret', 'new');
  const chip = (viewer: string): number => {
    const out = k.page('jobs', undefined, { viewer });
    assert.ok(out.ok, JSON.stringify(out));
    const filter = (out.value as unknown as { filters: { field: string; values: { value: string; count: number }[] }[] }).filters.find((f) => f.field === 'stage')!;
    return filter.values.find((v) => v.value === 'new')!.count;
  };
  assert.equal(chip('p_owner'), 2);
  assert.equal(chip('p_member'), 2);
  sql.exec('INSERT INTO entry_private (entry_id, person_id) VALUES (?, ?)', secret.id, 'p_owner');
  assert.equal(chip('p_member'), 1, 'a member was counted a row kept from her');
  assert.equal(chip('p_owner'), 2, 'the owner lost her own row');
  assert.equal(chip('p_member'), 1);
  sql.exec('DELETE FROM entry_private WHERE entry_id = ?', secret.id);
  assert.equal(chip('p_member'), 2);
});
