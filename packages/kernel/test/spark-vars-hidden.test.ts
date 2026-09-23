/**
 * A secret carried into a question to Spark by way of a variable: audit forty-six §1, which restates audit forty-five's
 * brief 2.
 *
 * WHAT THE AUDIT MEASURED. The question's own braces were held to the rule `about:` is (`flow-lint.ts`'s `hiddenIn`,
 * and `sendable` in `ask()`), and a variable was not. `set_var: { name: p, to: '{{trigger.row.pin}}' }` then a question
 * naming `{{vars.p}}` installed clean, and through a real self-host the model's request body held "What rate applies to
 * Rent, given hunter2?". `set_var` to `{{trigger.row}}` sent the row's JSON with `pin` in it. `set_var` fills `to` from
 * the whole row, and `sendable` cleaned the row the question was filled from and never a variable filled earlier.
 *
 * RED BEFORE THE REPAIR, MEASURED ON 23 SEPTEMBER against `flow.ts` and `flow-lint.ts` as they stood: every case below
 * failed. The install cases read `null` where they expect `DECLARATION_INVALID`, and the queued question read
 * `Rate for plain, hunter2, again hunter2, {"what":"Rent","note":"plain","pin":"hunter2"}, hunter2?`.
 *
 * AND EACH LINE OF THE REPAIR WAS TAKEN OUT AGAIN, ONE AT A TIME. The second fill at `set_var` left out: the stored case
 * fails here and both stored cases in `apps/selfhost/test/spark-secret.test.ts` fail, while every install case holds.
 * The kept dash left in place when an answer overwrites its variable: the second question reads `Then — and —?` where it
 * expects `Then four and —?`.
 *
 * `hunter2` IS PUT IN BY SQL, as `flow-waits.test.ts` puts it. In use a secret field holds only a vault grant's id, since
 * `coerce` refuses anything else and the vault door writes nothing else, so what leaves in use is that id. The rule
 * `UNSENDABLE` states is that it does not leave at all, and a plaintext is the plainest way to see whether it did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'pin', type: 'secret' },
    ],
  } as never,
};

const WRITTEN = { written: { register: 'obligations', op: ['create'] } };
const rule = (steps: unknown[]): Declaration => ({ id: 'rule.rate', kind: 'rule', body: { rule: 'rate', on: WRITTEN, once_per: ['entry'], steps } as never });

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

async function sparked(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { answersSpark: true });
  value(await k.install([OBLIGATIONS, ...decls]));
  return { k, sql, clock };
}

const refusal = (r: Result<unknown>): { code: string; fix: string } | null => (r.ok ? null : 'refusal' in r ? { code: r.refusal.code, fix: r.refusal.fix } : { code: 'conflict', fix: '' });

test('A QUESTION TO SPARK NAMING A VARIABLE SET FROM A SECRET FIELD IS REFUSED AT INSTALL, and the refusal names the step that set it', async () => {
  const { k, sql } = await sparked();
  const cases: [string, unknown[]][] = [
    ['the field', [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { ask_spark: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
    ['the field, spaced', [{ set_var: { name: 'p', to: 'pin {{ trigger.row.pin }}' } }, { ask_spark: { question: 'Rate given {{ vars.p }}?', as: 'rate' } }]],
    ['the whole row', [{ set_var: { name: 'p', to: '{{trigger.row}}' } }, { ask_spark: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
    /* A VARIABLE SET FROM ANOTHER holds what the other holds, so the chain is followed and the first link is named. */
    [
      'through a second variable',
      [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { set_var: { name: 'q', to: 'again {{vars.p}}' } }, { ask_spark: { question: 'Rate given {{vars.q}}?', as: 'rate' } }],
    ],
    /* A BRANCH TAKEN BEFORE THE QUESTION may have set it, and the lint cannot tell which arm the row will take. */
    ['inside a branch', [{ if: 'what is Rent', then: [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }] }, { ask_spark: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
  ];
  for (const [what, steps] of cases) {
    const out = refusal((await k.install([rule(steps)])) as Result<unknown>);
    assert.equal(out?.code, 'DECLARATION_INVALID', `${what}: ${out?.fix ?? 'installed'}`);
    assert.match(out!.fix, /pin/, what);
    assert.match(out!.fix, what === 'inside a branch' ? /steps\[0\]\.then\[0\]/ : /steps\[0\]/, `${what}: the refusal does not name the set_var: ${out!.fix}`);
  }
  /* A VARIABLE SET FROM FIELDS THAT MAY LEAVE IS ASKED ABOUT AS ALWAYS, and so is a secret one in a question to a
     person, which stays in the record. */
  for (const steps of [
    [{ set_var: { name: 'p', to: '{{trigger.row.what}}, {{trigger.row.note}}' } }, { ask_spark: { question: 'Rate given {{vars.p}}?', as: 'rate' } }],
    [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { ask_spark: { question: 'Rate given {{vars.q}}?', as: 'rate' } }],
    [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { ask_person: { question: 'Pay {{vars.p}}?', options: ['yes', 'no'], as: 'a' } }],
  ]) {
    const out = refusal((await k.install([rule(steps)])) as Result<unknown>);
    assert.equal(out, null, out?.fix);
  }
  sql.close();
});

test('A RULE STORED WITH SUCH A VARIABLE SENDS THE DASH A FIELD IS WRITTEN AS, and the whole row cleaned as sendable cleans one', async () => {
  /* THE SECOND LINE: a rule an earlier build let install, written into the table past the lint, as
     `flow-waits.test.ts` writes its stored rule. */
  const { sql, clock } = await sparked(rule([{ set_var: { name: 'x', to: 'y' } }]));
  const steps = [
    { set_var: { name: 'n', to: '{{trigger.row.note}}' } },
    { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 'q', to: 'again {{vars.p}}' } },
    { set_var: { name: 'w', to: '{{trigger.row}}' } },
    /* `a` IS SET FROM THE SECRET AND THEN OVERWRITTEN BY THE ANSWER, so the second question reads the answer and not
       the dash kept for what `a` held before. */
    { set_var: { name: 'a', to: '{{trigger.row.pin}}' } },
    { ask_spark: { question: 'Rate for {{vars.n}}, {{vars.p}}, {{vars.q}}, {{vars.w}}, {{vars.a}}?', as: 'a' } },
    /* A SECOND QUESTION, AFTER THE FIRST IS ANSWERED, so what the run keeps beside `vars` is shown to outlive the park
       and the answer that wakes it. */
    { ask_spark: { question: 'Then {{vars.a}} and {{vars.p}}?', as: 'b' } },
  ];
  sql.exec(
    "UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL",
    JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }),
  );
  const k = await openRecord(sql, clock, { answersSpark: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await k.drain();

  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  const question = (JSON.parse(job.payload) as { question: string }).question;
  assert.doesNotMatch(question, /hunter2/, question);
  assert.equal(question, 'Rate for plain, —, again —, {"what":"Rent","note":"plain"}, —?');

  value(k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { text: 'four' } }));
  await k.drain();
  const [next] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(next, 'the second question was not queued');
  assert.equal((JSON.parse(next.payload) as { question: string }).question, 'Then four and —?');

  value(k.ackOutbox({ id: next.id, state: 'done', leasedUntil: next.leasedUntil, result: { text: 'five' } }));
  await k.drain();
  const r = sql.one<{ state: string; vars: string; say: string | null }>("SELECT state, vars, say FROM automation_run WHERE rule = 'rate'");
  assert.equal(r?.state, 'done', r?.say ?? 'no run');
  /* THE VARIABLE ITSELF IS UNTOUCHED: the record kept what the row held, and only what went to Spark was cleaned. What
     the run kept beside `vars` for its questions is gone with the last of them. */
  const vars = JSON.parse(r!.vars) as Record<string, unknown>;
  assert.deepEqual(Object.keys(vars).sort(), ['a', 'b', 'n', 'p', 'q', 'w']);
  assert.equal(vars.p, 'hunter2');
  sql.close();
});

test('WHAT WAS KEPT GOES WHEN THE VARIABLE IS SET AGAIN FROM A FIELD THAT MAY LEAVE, and a question to a person reads the value', async () => {
  /* TWO LINES THE CASE ABOVE LEFT UNTESTED, found by the checker on 23 September by taking each out and watching the
     suite stay green. With the `delete` at `set_var` taken out, `r` set from `pin` and then from `note` kept its dash
     and Spark was asked `Given — and —?` about a variable holding `plain`. With `ask()` reading the kept values for every
     verb, the person was asked `Pay —?`, and a question to a person stays in the record, so it has no reason to lose
     what it asks about. */
  const { sql, clock } = await sparked(rule([{ set_var: { name: 'x', to: 'y' } }]));
  const steps = [
    { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 'r', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 'r', to: '{{trigger.row.note}}' } },
    { ask_spark: { question: 'Given {{vars.p}} and {{vars.r}}?', as: 'a' } },
    { ask_person: { question: 'Pay {{vars.p}}?', options: ['yes', 'no'], as: 'b' } },
  ];
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }));
  const k = await openRecord(sql, clock, { answersSpark: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await k.drain();

  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.equal((JSON.parse(job.payload) as { question: string }).question, 'Given — and plain?');

  value(k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { text: 'four' } }));
  await k.drain();
  const open = sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND opened_by = 'rule:rate'");
  assert.equal(open.length, 1, `${open.length} questions opened for the person`);
  /* THE QUESTION RIDES ON THE `suggest` EVENT the gate writes, not on the suggestion's body. */
  const said = JSON.stringify(sql.all("SELECT * FROM event WHERE actor = 'rule:rate'"));
  assert.match(said, /Pay hunter2\?/, said);
  sql.close();
});
