/**
 * A run's `set` or `create` whose text fills with nothing writes nothing, never a mark.
 *
 * MEASURED ON 25 SEPTEMBER WITH `packs/pad`: a question acked `done` with empty text (which `packages/slash`'s own pass
 * refuses before it acks, so only a host acking the outbox itself gets this far), the rule's `set: { field: reply, to:
 * '{{vars.opinion}}' }` took the dash `pathValue` writes for a hole, and the note's reply read `—`. `once_per` had
 * marked the note by then, so nothing ever asked again. The same dash reached a plain `set` from an empty field of the
 * run's own row, which needs no Slash at all (the first test below). The dash is
 * right inside a sentence, where a hole with nothing in it reads as a bug ("Paid —"), and wrong as a whole value: a
 * field holding only the dash says something was written when nothing was, and a `day` or `money` field refuses it, so
 * a `create` of a task whose due day filled with nothing failed where it could have left the day blank.
 *
 * EACH OF THESE WAS RED BEFORE THE FIX, with the value shown in each assertion's message.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'memo', type: 'text' },
      { id: 'due', type: 'day' },
    ],
  } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  if (!sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'automation_run'")) {
    const { default: ddl } = await import('../src/migrations/0011_automation_run.ts');
    sql.db.exec(ddl);
  }
  const done = await k.install([TASKS, ...decls]);
  assert.ok(done.ok, JSON.stringify(done));
  return { k, sql };
}

const made = (k: Kernel, fields: Record<string, unknown>): Entry => {
  const r = k.create('tasks', fields, { actor: 'p_1' });
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};
const fieldsOf = (k: Kernel, id: string): Record<string, unknown> => (k.get(id) as unknown as Entry).fields;
const runs = (sql: NodeSql, name: string): { state: string; say: string | null }[] =>
  sql.all<{ state: string; say: string | null }>('SELECT state, say FROM automation_run WHERE rule = ?', name).map((r) => ({ ...r }));
const onCreate = { written: { register: 'tasks', op: ['create'] } };

test('A SET FROM A RUN PATH THAT REACHES NOTHING LEAVES THE FIELD EMPTY', async () => {
  const { k, sql } = await record(rule({ rule: 'copy', on: onCreate, steps: [{ set: { field: 'memo', to: '{{trigger.row.note}}' } }] }));
  const row = made(k, { what: 'Rent' });
  await k.drain();
  assert.deepEqual(runs(sql, 'copy'), [{ state: 'done', say: null }]);
  const memo = fieldsOf(k, row.id).memo;
  assert.equal(memo ?? null, null, `the memo was written as ${JSON.stringify(memo)}`);
  sql.close();
});

test('ONE FIELD LESS ANOTHER WITH NOTHING IN THE FIRST LEAVES THE FIELD EMPTY, and a form that does not subtract is words', async () => {
  /* `flow.ts`'s copy of the row's pattern did not see `{{short:a-b}}`, so the text read as words and the dash the fill
     writes for the empty first field was kept as the whole value. `{{on:a-b}}` is left as typed by the fill, so it is. */
  const { k, sql } = await record(
    rule({ rule: 'less', on: onCreate, steps: [{ set: { field: 'memo', to: '{{short:note-due}}' } }] }),
    rule({ rule: 'typed', on: onCreate, steps: [{ set: { field: 'note', to: '{{on:due-memo}}' } }] }),
  );
  const row = made(k, { what: 'Rent' });
  await k.drain();
  const { memo, note } = fieldsOf(k, row.id);
  assert.equal(memo ?? null, null, `the memo was written as ${JSON.stringify(memo)}`);
  assert.equal(note, '{{on:due-memo}}');
  sql.close();
});

test("A SET FROM THE ROW'S OWN EMPTY FIELD LEAVES THE FIELD EMPTY, and so does one of holes and spaces alone", async () => {
  const { k, sql } = await record(
    rule({ rule: 'own', on: onCreate, steps: [{ set: { field: 'memo', to: '{{note}}' } }] }),
    rule({ rule: 'two', on: onCreate, steps: [{ set: { field: 'note', to: ' {{trigger.row.memo}} {{trigger.row.due}} ' } }] }),
  );
  const row = made(k, { what: 'Rent' });
  await k.drain();
  const { memo, note } = fieldsOf(k, row.id);
  assert.equal(memo ?? null, null, `the memo was written as ${JSON.stringify(memo)}`);
  assert.equal(note ?? null, null, `the note was written as ${JSON.stringify(note)}`);
  sql.close();
});

test('A VARIABLE SET FROM NOTHING IS EMPTY, so a set from it one step later writes nothing either', async () => {
  /* THE SAME HOLE ONE HOP AWAY. Filled as a sentence, the variable held the dash itself, and the `set` after it had a
     value to copy: the dash, which no check at the `set` could tell from a variable that held one on purpose. */
  const { k, sql } = await record(
    rule({ rule: 'via', on: onCreate, steps: [{ set_var: { name: 'n', to: '{{trigger.row.note}}' } }, { set: { field: 'memo', to: '{{vars.n}}' } }] }),
  );
  const row = made(k, { what: 'Rent' });
  await k.drain();
  const memo = fieldsOf(k, row.id).memo;
  assert.equal(memo ?? null, null, `the memo was written as ${JSON.stringify(memo)}`);
  sql.close();
});

test('A CREATE LEAVES A FIELD THAT FILLED WITH NOTHING EMPTY, and a day that filled with nothing does not fail the run', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'follow',
      on: onCreate,
      once_per: ['entry'],
      steps: [{ create: { register: 'tasks', fields: { what: 'Follow up', memo: '{{trigger.row.note}}', due: '{{trigger.row.due}}' }, bound: 1 } }],
    }),
  );
  made(k, { what: 'Rent' });
  await k.drain();
  assert.deepEqual(runs(sql, 'follow'), [{ state: 'done', say: null }], 'the create failed on a field that filled with nothing');
  const follow = sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'tasks' AND json_extract(fields, '$.what') = 'Follow up'");
  assert.ok(follow, 'no follow-up was made');
  const fields = JSON.parse(follow.fields) as Record<string, unknown>;
  assert.equal(fields.memo ?? null, null, `the memo was written as ${JSON.stringify(fields.memo)}`);
  assert.equal(fields.due ?? null, null, `the due day was written as ${JSON.stringify(fields.due)}`);
  sql.close();
});

test('A HOLE INSIDE A SENTENCE IS STILL THE DASH, since "seen" with nothing after it reads as a bug', async () => {
  const { k, sql } = await record(rule({ rule: 'said', on: onCreate, steps: [{ set: { field: 'memo', to: 'seen {{trigger.row.note}}' } }] }));
  const row = made(k, { what: 'Rent' });
  await k.drain();
  assert.equal(fieldsOf(k, row.id).memo, 'seen —');
  sql.close();
});

test('A SET FROM A PATH THAT HOLDS SOMETHING WRITES IT, as it always did', async () => {
  const { k, sql } = await record(rule({ rule: 'copy', on: onCreate, steps: [{ set: { field: 'memo', to: '{{trigger.row.note}}' } }] }));
  const row = made(k, { what: 'Rent', note: 'by the fifth' });
  await k.drain();
  assert.equal(fieldsOf(k, row.id).memo, 'by the fifth');
  sql.close();
});
