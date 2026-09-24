/**
 * A run-path `if` the run cannot read is refused at install, with the sentence the run would have failed with.
 *
 * FOUND BY THE CHECKER OF THE RECORD-REACH WAVE, on the way. `steps: [{ if: 'amount more than 1000', then: [...] }]`
 * installed: the lint asked only that `if` was a string or a tree (`flow-lint.ts`, `case 'if'`), and `unreadable` reads a
 * rule's `when:` and not its steps. Every run then failed at that step, "could not read its condition at step 1: amount
 * more than 1000: more is not something a filter can say", on the automation's page, for a mistake that was plain the
 * moment it was written.
 *
 * ONLY WHAT THE RUN WOULD SAY WHATEVER ITS ANSWERS HOLD. The run reads an `if` against the row's schema and each answer
 * typed by its value (`flow.ts`'s `test`): a number is a decimal, a flag is a bool, anything else is text. An answer's
 * value is not known at install, so a clause is refused only when it is refused under all three, and a condition holding
 * `{{...}}` is left alone, since the run fills it first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'decimal' }] } as never,
};

const check = (steps: unknown[]): Declaration => ({
  id: 'rule.check',
  kind: 'rule',
  body: { rule: 'check', on: { written: { register: 'bills', op: ['create'] } }, once_per: ['entry'], steps } as never,
});
const TOLD = [{ notify: { say: 'Large bill' } }];

async function withRuns(sql: NodeSql): Promise<void> {
  if (sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'automation_run'")) return;
  const { default: ddl } = await import('../src/migrations/0011_automation_run.ts');
  sql.db.exec(ddl);
}

async function open(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  await withRuns(sql);
  assert.ok((await k.install([BILLS])).ok);
  return { k, sql };
}

test('AN if THE RUN CANNOT READ IS REFUSED AT INSTALL, in the words the run would have failed with', async () => {
  /* THE RUN'S OWN SENTENCE FIRST, from a body written straight into the declaration row, as a record installed before
     this check holds it. Measured before the check: the same body installed through `install` as well. */
  const { k, sql } = await open();
  assert.ok((await k.install([check([{ if: 'what is Rent', then: TOLD }])])).ok);
  sql.exec("UPDATE declaration SET body = json_set(body, '$.steps', json(?)) WHERE id = 'rule.check'", JSON.stringify([{ if: 'amount over 1000', then: TOLD }]));
  const again = await openRecord(sql, fixedClock(NOW));
  assert.ok(again.create('bills', { what: 'Rent', amount: '1200' }, { actor: 'p_1' }).ok);
  await again.drain();
  const run = sql.one<{ state: string; say: string }>("SELECT state, say FROM automation_run WHERE rule = 'check'");
  assert.equal(run?.state, 'failed');
  const said = run!.say.replace(/^rule\.check could not read its condition at step 1: /, '');
  assert.equal(said, 'amount over 1000: over is not something a filter can say. Write is, is not, before, after, on, has, lacks or contains.');

  const fresh = await open();
  const out = await fresh.k.install([check([{ if: 'amount over 1000', then: TOLD }])]);
  assert.equal(out.ok, false, 'a run-path if the run cannot read installed');
  assert.equal(codeOf(out), 'MATCH_OP_UNSUPPORTED');
  assert.equal(fixOf(out), `rule.check cannot read its condition at steps[0]: ${said}`);
  assert.equal((out as { refusal?: { at?: string } }).refusal?.at, 'steps[0].if');
});

test('AND THE if THIS FILE WAS FOUND ON IS READ NOW, at install and at the run', async () => {
  /* `amount more than 1000` WAS THIS FILE'S UNREADABLE CONDITION UNTIL M4 brief 6 taught the sentence the five ordered
     words, and the two tests above went red on it: it installed, and the run answered `done`. They ask `over` now, which
     neither grammar reads. This is the other half, so the lint is seen passing the words it used to refuse and the run
     is seen finishing on the step it used to fail at. */
  const { k, sql } = await open();
  const out = await k.install([check([{ if: 'amount more than 1000', then: TOLD }])]);
  assert.ok(out.ok, fixOf(out));
  assert.ok(k.create('bills', { what: 'Rent', amount: '1200' }, { actor: 'p_1' }).ok);
  await k.drain();
  const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'check'");
  assert.equal(run?.state, 'done', run?.say ?? '');
});

test('INSIDE A BRANCH TOO, and a name that is neither a field of the row nor an answer the rule gives', async () => {
  const { k } = await open();
  const nested = await k.install([check([{ if: 'what is Rent', then: [{ if: 'amount over 1000', then: TOLD }] }])]);
  assert.equal(nested.ok, false);
  assert.equal((nested as { refusal?: { at?: string } }).refusal?.at, 'steps[0].then[0].if');

  const unknown = await k.install([check([{ if: 'total is 5', then: TOLD }])]);
  assert.equal(unknown.ok, false, 'an if naming nothing the run holds installed');
  assert.equal(codeOf(unknown), 'FIELD_UNKNOWN');
});

test('AN if ABOUT AN ANSWER IS REFUSED ONLY FOR WHAT NO ANSWER COULD MAKE READABLE, and a templated one is not judged', async () => {
  const { k } = await open();
  const asked = { set_var: { name: 'n', to: '{{trigger.row.amount}}' } };
  /* `n is late` IS REFUSED FOR A DECIMAL AND READ FOR TEXT, and the answer's type is its value's, known only at the run.
     The lint does not work out which of the three a given step can leave, so it reads every answer as any of them. */
  for (const cond of ['n is late', 'n is 5', 'what is Rent, n is 3'])
    assert.ok((await k.install([check([asked, { if: cond, then: TOLD }])])).ok, cond);
  /* A VERB NO TYPE TAKES IS REFUSED ABOUT AN ANSWER AS ABOUT A FIELD. */
  const verb = await k.install([check([asked, { if: 'n over 3', then: TOLD }])]);
  assert.equal(codeOf(verb), 'MATCH_OP_UNSUPPORTED');
  assert.equal((verb as { refusal?: { at?: string } }).refusal?.at, 'steps[1].if');

  const templated = await k.install([check([{ set_var: { name: 'w', to: 'x' } }, { if: '{{vars.w}} over 3', then: TOLD }])]);
  assert.ok(templated.ok, fixOf(templated));
});

test('A CLOCK RULE, WHICH HAS NO ROW, IS READ AGAINST ITS ANSWERS ALONE', async () => {
  const { k } = await open();
  const clock = (cond: string): Declaration => ({
    id: 'rule.tick',
    kind: 'rule',
    body: { rule: 'tick', on: { every: '1d' }, steps: [{ set_var: { name: 'w', to: 'x' } }, { if: cond, then: TOLD }] } as never,
  });
  assert.ok((await k.install([clock('w is x')])).ok);
  const out = await k.install([clock('what is Rent')]);
  assert.equal(codeOf(out), 'FIELD_UNKNOWN', 'a clock rule read a field no row brings it');
});
