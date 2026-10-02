/**
 * `backdate`: a history written in process, as a sample is, with each write stamped when it happened.
 *
 * The seed wrote every row, question and rule's pass at one clock reading, so every line of every feed read "just now"
 * (visual review 4). `backdate` holds the clock for the writes inside it, never ahead of the record's clock and never
 * behind an instant an earlier `backdate` held, and arms reminders on the clock that runs, so a row written into the
 * past does not arm every reminder that came due since.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 3, 12);
const HOUR = 3_600_000;

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', remind: ['-1d'] },
    ],
  } as never,
};

test('A BACKDATED WRITE IS STAMPED THEN, its ids still sort in the order they were written, and the clock comes back', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([BILLS])).ok);

  const early = k.backdate(NOW - 6 * HOUR, () => k.create('bills', { what: 'Rent', due: '2026-09-10' } as never, { actor: 'system' }));
  assert.ok(early.ok);
  const later = k.create('bills', { what: 'Power', due: '2026-09-11' } as never, { actor: 'system' });
  assert.ok(later.ok);

  const rows = sql.all<{ id: string; created_at: string }>('SELECT id, created_at FROM entry ORDER BY rowid');
  assert.deepEqual(rows.map((r) => r.created_at), [new Date(NOW - 6 * HOUR).toISOString(), new Date(NOW).toISOString()]);
  assert.ok(rows[0]!.id < rows[1]!.id, 'an id minted inside a backdate sorts before one minted after it');
  const events = sql.all<{ ts: string }>("SELECT ts FROM event WHERE kind = 'create' ORDER BY rowid");
  assert.deepEqual(events.map((e) => e.ts), rows.map((r) => r.created_at));
  sql.close();
});

test('A BACKDATE IS NEVER AHEAD OF THE CLOCK NOR BEHIND AN EARLIER ONE, and an async write holds the instant until it settles', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([BILLS])).ok);
  const at = (what: string) => sql.one<{ created_at: string }>("SELECT created_at FROM entry WHERE json_extract(fields, '$.what') = ?", what)!.created_at;

  k.backdate(NOW + 5 * HOUR, () => k.create('bills', { what: 'Ahead' } as never, { actor: 'system' }));
  assert.equal(at('Ahead'), new Date(NOW).toISOString(), 'a write was stamped after the record’s clock');
  k.backdate(NOW - 2 * HOUR, () => k.create('bills', { what: 'Behind' } as never, { actor: 'system' }));
  assert.equal(at('Behind'), new Date(NOW).toISOString(), 'a later write was stamped before an earlier one');
  assert.throws(() => k.backdate(Number.NaN, () => null));

  const sql2 = openSqlite();
  const k2 = await openRecord(sql2, fixedClock(NOW));
  await k2.backdate(NOW - 3 * HOUR, async () => {
    assert.ok((await k2.install([BILLS])).ok);
    assert.ok(k2.create('bills', { what: 'Held' } as never, { actor: 'system' }).ok);
  });
  assert.equal(sql2.one<{ created_at: string }>('SELECT created_at FROM entry')!.created_at, new Date(NOW - 3 * HOUR).toISOString());
  sql.close();
  sql2.close();
});

test('A ROW WRITTEN INTO THE PAST ARMS ONLY THE REMINDERS STILL TO COME, on the clock that runs', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([BILLS])).ok);
  /* DUE ON THE 2ND, a day before the clock: its reminder fell due on the 1st, which a write stamped a week back would arm. */
  assert.ok(k.backdate(NOW - 7 * 24 * HOUR, () => k.create('bills', { what: 'Water', due: '2026-09-02' } as never, { actor: 'system' })).ok);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM schedule WHERE kind = 'reminder'")!.n, 0, 'a reminder already past was armed');
  /* AND ONE STILL TO COME IS ARMED as on any write. */
  assert.ok(k.backdate(NOW - 7 * 24 * HOUR, () => k.create('bills', { what: 'Gas', due: '2026-09-20' } as never, { actor: 'system' })).ok);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM schedule WHERE kind = 'reminder'")!.n, 1, 'a reminder still to come was not armed');
  sql.close();
});
