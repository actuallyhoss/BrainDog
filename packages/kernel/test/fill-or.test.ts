/**
 * `{{path or "words"}}`: what a run writes where a path reaches nothing, said by the rule (SHL-D06).
 *
 * WHAT WAS WRONG. A run path that reached an empty or missing value was written as the dash, so a note read
 * `Keys: —` and the owner read it as a failed run on brace values (H.774). The rule can now say what goes there.
 * A path with no `or` still writes what it wrote before: switching that to a failed step waits on a count over
 * every installed rule and one question to the owner (SHL-D06 job 3).
 *
 * ON A FRESH RECORD, through the real runner and the real pass. The lint does not yet admit `or` where it reads a
 * step (`flow-lint.ts` and `declare.ts` are another job's), so a rule spelling it is written into the table over a
 * plain one that installed, as a rule an earlier build let in is, and read by a record opened over it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const VISITS: Declaration = {
  id: 'register.visits',
  kind: 'register',
  body: {
    id: 'visits',
    name: 'Visits',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'memo', type: 'text' },
    ],
  } as never,
};

const onCreate = { written: { register: 'visits', op: ['create'] } };

/** A record holding one rule whose steps are `steps`, written into the table as typed. */
async function record(steps: unknown[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const first = await openRecord(sql, clock);
  const done = await first.install([VISITS, { id: 'rule.say', kind: 'rule', body: { rule: 'say', on: onCreate, once_per: ['entry'], steps: [{ note: 'plain' }] } as never }]);
  assert.ok(done.ok, JSON.stringify(done));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.say' AND superseded_at IS NULL", JSON.stringify({ rule: 'say', on: onCreate, once_per: ['entry'], steps }));
  return { k: await openRecord(sql, clock), sql };
}

async function ran(steps: unknown[], fields: Record<string, unknown>): Promise<{ sql: NodeSql; row: Record<string, unknown>; notes: string[]; say: string | null }> {
  const { k, sql } = await record(steps);
  const made = k.create('visits', fields, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
  await k.drain();
  const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'say'");
  assert.equal(run?.state, 'done', run?.say ?? 'no run');
  const notes = sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'rule:say' ORDER BY rowid").map((r) => r.note);
  return { sql, row: (k.get(made.value.id) as unknown as Entry).fields, notes, say: run?.say ?? null };
}

test('THE WORDS AFTER or ARE WRITTEN FOR A PATH THAT IS EMPTY, and for one that is missing', async () => {
  const r = await ran(
    [
      { note: 'Keys: {{trigger.row.note or "none left"}}.' },
      { note: 'Parking: {{trigger.row.parking or "not said"}}.' },
      { set: { field: 'memo', to: '{{trigger.row.note or "no note"}}' } },
    ],
    { what: 'Survey at Brannock House', note: '' },
  );
  assert.deepEqual(r.notes, ['Keys: none left.', 'Parking: not said.']);
  assert.equal(r.row.memo, 'no note');
  r.sql.close();
});

test('A VALUE THE PATH REACHES WINS OVER THE WORDS', async () => {
  const r = await ran(
    [{ note: 'Keys: {{trigger.row.note or "none left"}}.' }, { set_var: { name: 'n', to: '{{trigger.row.note}}' } }, { set: { field: 'memo', to: '{{vars.n or "blank"}}' } }],
    { what: 'Survey at Brannock House', note: 'with the porter' },
  );
  assert.deepEqual(r.notes, ['Keys: with the porter.']);
  assert.equal(r.row.memo, 'with the porter');
  r.sql.close();
});

test('QUOTES INSIDE THE WORDS ARE WRITTEN AS QUOTES, an escaped one and a single one alike', async () => {
  const r = await ran(
    [{ note: '{{trigger.row.note or "she said \\"later\\""}}' }, { note: "{{ trigger.row.note or \"it's not in\" }} today" }],
    { what: 'Survey at Brannock House' },
  );
  assert.deepEqual(r.notes, ['she said "later"', "it's not in today"]);
  r.sql.close();
});

test('WITHOUT or THE FILL IS WHAT IT WAS: the dash in a sentence, nothing for a whole value', async () => {
  const r = await ran(
    [{ note: 'Keys: {{trigger.row.note}}.' }, { set_var: { name: 'n', to: '{{trigger.row.note}}' } }, { set: { field: 'memo', to: '{{vars.n}}' } }],
    { what: 'Survey at Brannock House', note: '' },
  );
  assert.deepEqual(r.notes, ['Keys: —.']);
  assert.equal(r.row.memo ?? null, null, `the memo was written as ${JSON.stringify(r.row.memo)}`);
  r.sql.close();
});
