/**
 * A `create` on a clock, bounded by the day of its turn (`rules.ts`'s `expand`).
 *
 * WITH NO ROW TO STAND ON, `bound:` IS THE MOST A RULE MAKES IN A DAY, as the grammar has always said. Counted by when
 * the rows were made, a drain back from three months off takes every missed monthly turn at one wall instant, so the
 * first turn's row spent the day and every later turn failed: the missed months' tasks were still not made. The day of
 * a turn is the twenty-four hours before it, read from the `<rule>@<turn>` every row a clocked create makes names as
 * its parent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from './index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day' },
    ],
  } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const done = await k.install([OBLIGATIONS, ...decls]);
  assert.ok(done.ok, JSON.stringify(done));
  return { k, sql, clock };
}

/* SPREAD INTO PLAIN OBJECTS, because the driver's rows have no prototype and `deepEqual` tells the two apart. */
const made = (sql: NodeSql): { due: string | null; parent: string }[] =>
  sql
    .all<{ due: string | null; parent: string }>(
      "SELECT json_extract(fields, '$.due') AS due, json_extract(fields, '$._parent') AS parent FROM entry WHERE register = 'obligations' AND deleted_at IS NULL ORDER BY rowid",
    )
    .map((r) => ({ ...r }));

const runs = (sql: NodeSql, name: string): { state: string; say: string | null }[] =>
  sql.all<{ state: string; say: string | null }>('SELECT state, say FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', name).map((r) => ({ ...r }));

test('A MONTHLY CREATE WITH bound: 1 MAKES EVERY MISSED MONTH\'S ROW when one drain takes them all', async () => {
  const { k, sql, clock } = await record(
    rule({ rule: 'next_rent', on: { every: '1mo', day: 1, at: '12:00' }, then: [{ create: { register: 'obligations', fields: { what: 'Rent', due: '{{trigger.day}}' }, bound: 1 } }] }),
  );
  /* OFF FROM BEFORE THE FIRST OF OCTOBER UNTIL THE THIRD OF JANUARY: four turns, taken in one pass at one instant. */
  clock.set(Date.UTC(2027, 0, 3, 12));
  await k.drain();
  assert.deepEqual(
    runs(sql, 'next_rent').map((r) => r.say),
    [null, null, null, null],
  );
  const rows = made(sql);
  assert.deepEqual(
    rows.map((r) => r.due),
    ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01'],
  );
  /* EACH ROW NAMES ITS OWN TURN, so a turn delivered again finds its row and not another month's. */
  assert.equal(new Set(rows.map((r) => r.parent)).size, 4);
  for (const r of rows) assert.match(r.parent, /^next_rent@\d{4}-\d{2}-\d{2}T/u);
  sql.close();
});

test('TWO TURNS OF ONE DAY STILL SHARE ITS bound:, and the second is refused with a sentence', async () => {
  const { k, sql, clock } = await record(rule({ rule: 'twice', on: { every: '12h' }, then: [{ create: { register: 'obligations', fields: { what: 'Check' }, bound: 1 } }] }));
  /* ARMED TWELVE HOURS OUT AT INSTALL, so a drain a day and an hour on takes the turns at twelve and twenty-four hours,
     and the second's day holds the first's row. */
  clock.set(NOW + 25 * HOUR);
  await k.drain();
  const said = runs(sql, 'twice');
  assert.deepEqual(
    said.map((r) => r.state),
    ['done', 'failed'],
  );
  assert.match(said[1]?.say ?? '', /in the day before this turn/u);
  assert.equal(made(sql).length, 1);
  sql.close();
});
