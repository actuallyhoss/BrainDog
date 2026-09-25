/**
 * A `create` step on a run that has no row behind it: a clock, a button, an arrival that wrote nothing.
 *
 * MEASURED BEFORE THIS, on 25 September: such a create installed, armed, ran on time and failed every run with "rule.<id>'s
 * create step acts on a row, and this run has none to act on." `flow.ts`'s `act` sent every step with no subject away
 * from `runRules`, and `runRules` was the only thing that filled a create. `clock-monthly.test.ts` holds the clock half;
 * this file holds the button, and what a create with no row refuses rather than guesses.
 *
 * THE ROW A TURN MAKES IS KEYED ON THE RUN. A create on a row is once per tuple per parent row (`expand`'s header), and a
 * create with no row has no parent row, so the run stands in for it: every turn of the clock is a run of its own and
 * makes its row, and the same run taken twice finds the row it already made.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'kinds', type: 'list', of: 'text' },
    ],
  } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  if (!sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'automation_run'")) {
    const { default: ddl } = await import('../src/migrations/0011_automation_run.ts');
    sql.db.exec(ddl);
  }
  const done = await k.install([OBLIGATIONS, ...decls]);
  assert.ok(done.ok, JSON.stringify(done));
  return { k, sql, clock };
}

const press = (k: Kernel, name: string): string => {
  const r = k.automationRun(name, 'p_1');
  assert.ok(r.ok, JSON.stringify(r));
  return r.value.run;
};
/* SPREAD INTO PLAIN OBJECTS, because the driver's rows have no prototype and `deepEqual` tells the two apart. */
const made = (sql: NodeSql): { what: string; parent: string }[] =>
  sql
    .all<{ what: string; parent: string }>(
      "SELECT json_extract(fields, '$.what') AS what, json_extract(fields, '$._parent') AS parent FROM entry WHERE register = 'obligations' AND deleted_at IS NULL ORDER BY rowid",
    )
    .map((r) => ({ ...r }));
const run = (sql: NodeSql, id: string) => ({ ...sql.one<{ state: string; say: string | null }>('SELECT state, say FROM automation_run WHERE id = ?', id)! });

test('A BUTTON THAT CREATES MAKES ONE ROW A PRESS, each keyed on its own run, filled from the run', async () => {
  const { k, sql } = await record(
    rule({ rule: 'next_bill', on: { manual: true }, steps: [{ set_var: { name: 'label', to: 'Water' } }, { create: { register: 'obligations', fields: { what: '{{vars.label}} bill' }, bound: 1 } }] }),
  );
  const first = press(k, 'next_bill');
  await k.drain();
  assert.deepEqual(run(sql, first), { state: 'done', say: null });
  const second = press(k, 'next_bill');
  await k.drain();
  assert.deepEqual(run(sql, second), { state: 'done', say: null });
  assert.deepEqual(made(sql), [
    { what: 'Water bill', parent: first },
    { what: 'Water bill', parent: second },
  ]);
  sql.close();
});

test('WHAT A VARIABLE HOLDS IS FILLED INTO THE ROW ONCE, braces and all', async () => {
  /* FILLED BY THE RUN AND THEN BY THE CREATE, the braces in the variable were read the second time as a field of a row
     this run does not have, and the run failed for a spelling nobody wrote in the create. */
  const { k, sql } = await record(
    rule({ rule: 'braced', on: { manual: true }, steps: [{ set_var: { name: 'label', to: 'a {{what}} b' } }, { create: { register: 'obligations', fields: { what: 'x {{vars.label}}' }, bound: 1 } }] }),
  );
  const id = press(k, 'braced');
  await k.drain();
  assert.deepEqual(run(sql, id), { state: 'done', say: null });
  assert.deepEqual(made(sql), [{ what: 'x a {{what}} b', parent: id }]);
  sql.close();
});

test('THE SAME RUN TAKEN AGAIN FROM ITS CREATE MAKES NO SECOND ROW', async () => {
  /* A RUN IS SAVED AFTER EACH STEP, so it is taken again from a step only when it stopped between the write and the
     save. That is put back by hand here: the run set to its create again and re-armed, as a drain that died there
     would leave it. */
  const { k, sql } = await record(rule({ rule: 'next_bill', on: { manual: true }, steps: [{ create: { register: 'obligations', fields: { what: 'Gas' }, bound: 1 } }] }));
  const id = press(k, 'next_bill');
  await k.drain();
  assert.equal(made(sql).length, 1);
  sql.exec("UPDATE automation_run SET state = 'running', step = 0 WHERE id = ?", id);
  sql.exec("UPDATE schedule SET state = 'pending', attempts = 0 WHERE kind = 'rule' AND key = ?", `flow.run:${id}`);
  await k.drain();
  assert.equal(run(sql, id).state, 'done', run(sql, id).say ?? '');
  assert.deepEqual(made(sql), [{ what: 'Gas', parent: id }]);
  sql.close();
});

test('A CREATE WITH NO ROW REFUSES WHAT ONLY A ROW COULD FILL, in a sentence, and makes nothing', async () => {
  /* BOTH INSTALL: the lint reads neither `each:` nor a row's `{{field}}` against the trigger (measured with
     `validateDeclaration` on 25 September). Filled against no row, `each: [kinds]` crossed nothing and made nothing
     with no word said, and `{{what}}` would have written the dash into the task a person reads. */
  const { k, sql } = await record(
    rule({ rule: 'crossed', on: { manual: true }, steps: [{ create: { register: 'obligations', each: ['kinds'], fields: { what: 'Rent {{each.0}}' }, bound: 3 } }] }),
    rule({ rule: 'copied', on: { manual: true }, steps: [{ create: { register: 'obligations', fields: { what: 'Rent {{what}}' }, bound: 1 } }] }),
  );
  const crossed = press(k, 'crossed');
  const copied = press(k, 'copied');
  await k.drain();
  assert.equal(run(sql, crossed).state, 'failed');
  assert.match(run(sql, crossed).say ?? '', /crosses kinds.*no row/u);
  assert.equal(run(sql, copied).state, 'failed');
  assert.match(run(sql, copied).say ?? '', /\{\{what\}\}.*no row/u);
  assert.deepEqual(made(sql), []);
  sql.close();
});
