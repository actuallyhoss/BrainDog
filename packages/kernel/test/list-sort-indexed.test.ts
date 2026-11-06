/**
 * A sorted list's first page, read from the index on the day it is sorted by, and the same rows in the same order.
 *
 * MEASURED: 6 ms for the newest fifty of 20,000 lines, sorting all of them, against 0.05 from the day index that was there.
 * An index changes how rows are reached and never which or in what order, and this holds it to that: empties last, ties by
 * id, deleted rows out, the next page carrying on, and an answer with the index gone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const P = { actor: 'p_owner' };
const LEDGER: Declaration = {
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', index: true },
      { id: 'kind', type: 'text', index: true },
      { id: 'plain', type: 'day' },
    ],
  },
} as never;

async function made() {
  const sql = openSqlite();
  const statements: string[] = [];
  const all = sql.all.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (statements.push(q), all(q, ...a))) as typeof sql.all;
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 8, 3, 12)));
  const installed = await k.install([LEDGER]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const rows: Entry[] = [];
  /* Ties, empties and an out-of-order insert, so no accident of rowid can pass for the order. */
  for (const on of ['2026-01-02', undefined, '2026-03-01', '2026-01-02', '2026-02-01', undefined, '2026-03-01', '2026-01-01', '2026-02-01', '2026-01-02']) {
    const out = k.create('ledger', { what: `Line ${rows.length}`, ...(on === undefined ? {} : { on }), kind: rows.length % 2 === 0 ? 'a' : 'b' }, P);
    assert.ok(out.ok, JSON.stringify(out));
    rows.push(out.value as Entry);
  }
  /* The order it has always been: the day descending, empties last, then the id descending. */
  const expected = (keep: (r: Entry) => boolean = () => true): string[] =>
    rows
      .filter(keep)
      .slice()
      .sort((a, b) => {
        const x = (a.fields.on as string | undefined) ?? null;
        const y = (b.fields.on as string | undefined) ?? null;
        if (x !== y) {
          if (x === null) return 1;
          if (y === null) return -1;
          return x < y ? 1 : -1;
        }
        return a.id < b.id ? 1 : -1;
      })
      .map((r) => r.id);
  const read = (q: Record<string, unknown>) => {
    const out = k.list({ register: 'ledger', order: [{ field: 'on', dir: 'desc' }], ...q } as never);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value as { rows: Entry[]; matched: number; cursor: string | null };
  };
  const named = () => statements.some((q) => /INDEXED BY entry_i_ledger__on/u.test(q));
  return { sql, k, rows, expected, read, statements, named };
}

test('THE FIRST PAGE COMES FROM THE INDEX, and is the same rows in the same order: empties last, ties by id', async () => {
  const { read, expected, named } = await made();
  const out = read({ limit: 50 });
  assert.ok(named(), 'it sorted every row');
  assert.deepEqual(out.rows.map((r) => r.id), expected());
  assert.equal(out.matched, 10);
});

test('THE NEXT PAGE CARRIES ON FROM IT, with nothing lost or said twice', async () => {
  const { read, expected } = await made();
  const seen: string[] = [];
  let cursor: string | null | undefined;
  do {
    const out: { rows: Entry[]; cursor: string | null } = read({ limit: 3, ...(cursor ? { cursor } : {}) });
    seen.push(...out.rows.map((r) => r.id));
    cursor = out.cursor;
  } while (cursor);
  assert.deepEqual(seen, expected());
});

test('A DELETED ROW IS OUT OF IT, and asked for, is in it from the list and not the index', async () => {
  const { sql, k, rows, read, expected, statements, named } = await made();
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', '2026-09-03T00:00:00.000Z', rows[2]!.id);
  assert.deepEqual(read({ limit: 50 }).rows.map((r) => r.id), expected((r) => r.id !== rows[2]!.id));
  statements.length = 0;
  const every = k.list({ register: 'ledger', order: [{ field: 'on', dir: 'desc' }], includeDeleted: true, limit: 50 } as never);
  assert.ok(every.ok, JSON.stringify(every));
  assert.deepEqual((every.value as { rows: Entry[] }).rows.map((r) => r.id), expected());
  assert.equal(named(), false, 'a partial index over live rows was named for a read of the deleted');
});

test('A FILTER THAT NARROWS IS LEFT TO CHOOSE ITS OWN INDEX, and answers right', async () => {
  const { rows, read, expected, statements, named } = await made();
  statements.length = 0;
  const out = read({ where: { field: 'kind', is: 'a' }, limit: 50 });
  assert.equal(named(), false);
  assert.deepEqual(out.rows.map((r) => r.id), expected((r) => rows.indexOf(r) % 2 === 0));
});

test('ASCENDING, ANOTHER FIELD OR ONE WITH NO INDEX ARE SORTED AS THEY WERE', async () => {
  const { k, read, statements, named } = await made();
  statements.length = 0;
  const up = read({ order: [{ field: 'on', dir: 'asc' }], limit: 50 });
  assert.equal(named(), false);
  const days = up.rows.map((r) => r.fields.on ?? null);
  assert.deepEqual(days.slice(-2), [null, null], 'ascending, the empties still go last');
  for (const field of ['plain', 'what', 'kind']) {
    statements.length = 0;
    const out = k.list({ register: 'ledger', order: [{ field, dir: 'desc' }], limit: 50 } as never);
    assert.ok(out.ok, JSON.stringify(out));
    assert.ok(!statements.some((q) => /INDEXED BY/u.test(q)), `${field} named an index`);
  }
});

test('AN INDEX THAT IS NOT THERE IS NO REFUSAL: the same answer, and it is not asked for again', async () => {
  const { sql, read, expected, statements } = await made();
  sql.exec('DROP INDEX entry_i_ledger__on');
  assert.deepEqual(read({ limit: 50 }).rows.map((r) => r.id), expected());
  statements.length = 0;
  assert.deepEqual(read({ limit: 50 }).rows.map((r) => r.id), expected());
  assert.ok(!statements.some((q) => /INDEXED BY/u.test(q)), 'it kept asking for an index that is not there');
});
