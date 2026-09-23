/**
 * A secret carried into a question to Spark by way of a field of the row: audit forty-nine §7.
 *
 * WHAT THE AUDIT MEASURED. The lint and the runner followed a secret field into a variable (`spark-vars-hidden.test.ts`)
 * and not into the row. A `set` step wrote `pin`'s value into `note`, a text field that may leave, and the question read
 * `note` from the row as it then was: `{{note}}`, `{{trigger.row.note}}`, `about: [note]`, and a `set_var` filled from
 * `note`, each installed clean and each sent `hunter2`. It also wrote the secret into a text field every reader of the
 * list sees, which is why the lint refuses it at install rather than only cleaning the question.
 *
 * `hunter2` IS PUT IN BY SQL AFTER THE ROW IS MADE AND BEFORE THE DRAIN, as `spark-vars-hidden.test.ts` puts it, so the
 * pin is in the row before the run takes its first step. In use a secret field holds a vault grant's id and nothing
 * else, and a plaintext is the plainest way to see whether it left.
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
      { id: 'memo', type: 'text' },
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

/**
 * The probe's five and one more, each with what the refusal says about the step that wrote the field, the field written
 * (`note` unless it says), and what the stored rule's question to Spark should carry.
 */
const LAUNDERED: { what: string; steps: unknown[]; wrote: RegExp; field?: string; sends: { question: string; about?: Record<string, unknown> } }[] = [
  {
    what: 'set note from the row fill, then ask {{note}}',
    steps: [{ set: { field: 'note', to: '{{pin}}' } }, { ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }],
    wrote: /steps\[0\]/,
    sends: { question: 'Rate for —?' },
  },
  {
    what: 'set note from trigger.row.pin, then ask {{note}}',
    steps: [{ set: { field: 'note', to: '{{trigger.row.pin}}' } }, { ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }],
    wrote: /steps\[0\]/,
    sends: { question: 'Rate for —?' },
  },
  {
    what: 'set_var p from pin, set note from vars.p, ask {{note}}',
    steps: [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { set: { field: 'note', to: '{{vars.p}}' } }, { ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }],
    /* THE STEP THAT WROTE THE FIELD, and then the `set_var` that took the secret into the variable it was written from. */
    wrote: /steps\[1\] wrote note from \{\{vars\.p\}\}, which steps\[0\] set from \{\{trigger\.row\.pin\}\}/,
    sends: { question: 'Rate for —?' },
  },
  {
    what: 'set note from pin, ask with about note',
    steps: [{ set: { field: 'note', to: '{{pin}}' } }, { ask_spark: { question: 'Rate?', about: ['note'], as: 'rate' } }],
    wrote: /steps\[0\]/,
    sends: { question: 'Rate?', about: {} },
  },
  {
    what: 'set note from pin, set_var n from trigger.row.note, ask vars',
    steps: [{ set: { field: 'note', to: '{{pin}}' } }, { set_var: { name: 'n', to: '{{trigger.row.note}}' } }, { ask_spark: { question: 'Rate for {{vars.n}}?', as: 'rate' } }],
    wrote: /steps\[1\] put it there with \{\{trigger\.row\.note\}\}, which steps\[0\] wrote from \{\{pin\}\}/,
    sends: { question: 'Rate for —?' },
  },
  /* NOT IN THE PROBE: a tag is filled by the run, and `tags` then holds it. Measured before the repair through the same
     kernel as `Rate for hunter2 ["hunter2"]?` for `{{tags}} {{trigger.row.tags}}`. */
  {
    what: 'tag from trigger.row.pin, ask {{tags}}',
    steps: [{ tag: '{{trigger.row.pin}}' }, { ask_spark: { question: 'Rate for {{tags}} {{trigger.row.tags}}?', as: 'rate' } }],
    wrote: /steps\[0\] wrote tags from \{\{trigger\.row\.pin\}\}/,
    field: 'tags',
    sends: { question: 'Rate for — —?' },
  },
];

test('A QUESTION TO SPARK READING A FIELD A STEP WROTE FROM A SECRET IS REFUSED AT INSTALL, naming the step that wrote it', async () => {
  const { k, sql } = await sparked();
  const cases = [
    ...LAUNDERED.map((c) => [c.what, c.steps, c.wrote] as const),
    /* A FIELD WRITTEN FROM ANOTHER THAT A STEP WROTE FROM THE SECRET holds it too, and the refusal walks back to both. */
    [
      'set note from pin, set memo from note, ask {{memo}}',
      [{ set: { field: 'note', to: '{{pin}}' } }, { set: { field: 'memo', to: 'again {{note}}' } }, { ask_spark: { question: 'Rate for {{memo}}?', as: 'rate' } }],
      /steps\[1\] wrote memo from \{\{note\}\}, which steps\[0\] wrote from \{\{pin\}\}/,
    ] as const,
    /* A BRANCH TAKEN BEFORE THE QUESTION may have written it, and the lint cannot tell which arm the row will take. */
    [
      'set inside a branch',
      [{ if: 'what is Rent', then: [{ set: { field: 'note', to: '{{pin}}' } }] }, { ask_spark: { question: 'Rate for {{trigger.row.note}}?', as: 'rate' } }],
      /steps\[0\]\.then\[0\]/,
    ] as const,
  ];
  for (const [what, steps, wrote] of cases) {
    const out = refusal((await k.install([rule([...steps])])) as Result<unknown>);
    assert.equal(out?.code, 'DECLARATION_INVALID', `${what}: ${out?.fix ?? 'installed'}`);
    assert.match(out!.fix, /pin/, what);
    assert.match(out!.fix, /note|tags/, what);
    assert.match(out!.fix, wrote, `${what}: the refusal does not name the step that wrote the field: ${out!.fix}`);
  }
  /* WHAT NO QUESTION TO SPARK CAN CARRY INSTALLS. A plain `set` of the same field after the secret one puts a plain
     value where it stood; a question to a person stays in the record; the arm beside the one that wrote it is never
     taken after it; and a question that reads another field reads nothing the step wrote. */
  for (const steps of [
    [{ set: { field: 'note', to: '{{pin}}' } }, { set: { field: 'note', to: 'plain' } }, { ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }],
    [{ set: { field: 'note', to: '{{pin}}' } }, { ask_person: { question: 'Pay {{note}}?', options: ['yes', 'no'], as: 'a' } }],
    [{ if: 'what is Rent', then: [{ set: { field: 'note', to: '{{pin}}' } }], else: [{ ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }] }],
    [{ set: { field: 'note', to: '{{pin}}' } }, { ask_spark: { question: 'Rate for {{what}}?', about: ['what'], as: 'rate' } }],
    [{ set: { field: 'note', to: '{{what}} {{trigger.row.memo}}' } }, { ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }],
  ]) {
    const out = refusal((await k.install([rule(steps)])) as Result<unknown>);
    assert.equal(out, null, out?.fix);
  }
  sql.close();
});

test('A RULE STORED PAST THE LINT SENDS NO VALUE A STEP WROTE FROM A SECRET, in the question or in about:', async () => {
  const sent: string[] = [];
  for (const c of LAUNDERED) {
    /* THE SECOND LINE: a rule an earlier build let install, written into the table past the lint, as
       `spark-vars-hidden.test.ts` writes its stored rule. */
    const { sql, clock } = await sparked(rule([{ set_var: { name: 'x', to: 'y' } }]));
    sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps: c.steps }));
    const k = await openRecord(sql, clock, { answersSpark: true });
    const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
    sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
    await k.drain();
    const [job] = k.leaseOutbox(['infer.ask'], 10);
    const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'rate'");
    assert.ok(job, `${c.what}: no infer.ask row was queued, and the run is ${run?.state} ${run?.say ?? ''}`);
    const payload = JSON.parse(job.payload) as { question: string; about?: Record<string, unknown> };
    sent.push(`${c.what}: ${job.payload}`);
    assert.doesNotMatch(job.payload, /hunter2/, `${c.what}: ${job.payload}`);
    assert.deepEqual({ question: payload.question, ...(payload.about === undefined ? {} : { about: payload.about }) }, c.sends, c.what);
    /* THE ROW ITSELF WAS WRITTEN: the record keeps what the step put there, and only what leaves is cleaned. */
    const held = sql.one<{ v: string }>(`SELECT json_extract(fields, '$.${c.field ?? 'note'}') AS v FROM entry WHERE id = ?`, made.id)?.v;
    assert.match(String(held), /hunter2/, c.what);
    sql.close();
  }
  assert.equal(sent.length, LAUNDERED.length);
});

test('A PLAIN SET OF THE SAME FIELD PUTS THE FIELD BACK IN THE QUESTION, and a question to a person reads it as it is', async () => {
  const steps = [
    { set: { field: 'note', to: '{{pin}}' } },
    { ask_person: { question: 'Pay {{note}}?', options: ['yes', 'no'], as: 'a' } },
    { set: { field: 'note', to: 'cleared' } },
    { ask_spark: { question: 'Rate for {{note}} and {{trigger.row.note}}?', about: ['note'], as: 'rate' } },
  ];
  const { sql, clock } = await sparked(rule([{ set_var: { name: 'x', to: 'y' } }]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }));
  const k = await openRecord(sql, clock, { answersSpark: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  /* THE PERSON IS ASKED ABOUT THE VALUE, since that question stays in the record. It rides on the `suggest` event. */
  const asked = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND opened_by = 'rule:rate'");
  assert.ok(asked, 'the question to a person was not opened');
  assert.match(JSON.stringify(sql.all("SELECT * FROM event WHERE actor = 'rule:rate'")), /Pay hunter2\?/);
  /* AND ACROSS THE PARK the run still holds that `note` was written from a secret, until the plain `set` takes it off. */
  const parked = sql.one<{ vars: string }>("SELECT vars FROM automation_run WHERE rule = 'rate'");
  assert.match(parked!.vars, /"note"/, `the run did not keep that note was written from a secret: ${parked!.vars}`);
  const yes = (JSON.parse(asked.body) as { options: { id: string; label: string }[] }).options.find((o) => o.label === 'yes')!.id;
  value(k.decide(asked.id, { decide: { option: yes, reason: 'Paid.' } }, 'p_1') as Result<unknown>);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  const payload = JSON.parse(job.payload) as { question: string; about?: Record<string, unknown> };
  assert.equal(payload.question, 'Rate for cleared and cleared?');
  assert.deepEqual(payload.about, { note: 'cleared' });
  sql.close();
});

test('A RUN PARKED BY A BUILD BEFORE -unsent HOLDS THE FIELD BACK WHEN IT WAKES, replayed from the steps it had taken', async () => {
  /* THAT BUILD WROTE `-sendable` AND NOTHING ABOUT THE ROW, so the column is taken as this build leaves it and the key is
     removed by SQL, as `spark-vars-hidden.test.ts` removes `-sendable` for the build before that one. */
  const steps = [
    { set: { field: 'note', to: '{{pin}}' } },
    { ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'a' } },
    { ask_spark: { question: 'Rate for {{note}}?', about: ['note', 'what'], as: 'rate' } },
  ];
  const { sql, clock } = await sparked(rule([{ set_var: { name: 'x', to: 'y' } }]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }));
  const k = await openRecord(sql, clock, { answersSpark: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  sql.exec(`UPDATE automation_run SET vars = json_remove(vars, '$."-unsent"') WHERE rule = 'rate'`);
  const stored = JSON.parse(sql.one<{ vars: string }>("SELECT vars FROM automation_run WHERE rule = 'rate'")!.vars) as Record<string, unknown>;
  assert.deepEqual(stored, { '-sendable': {} });
  const asked = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND opened_by = 'rule:rate'")!;
  const yes = (JSON.parse(asked.body) as { options: { id: string; label: string }[] }).options.find((o) => o.label === 'yes')!.id;
  value(k.decide(asked.id, { decide: { option: yes, reason: 'Paid.' } }, 'p_1') as Result<unknown>);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  const payload = JSON.parse(job.payload) as { question: string; about?: Record<string, unknown> };
  assert.equal(payload.question, 'Rate for —?');
  assert.deepEqual(payload.about, { what: 'Rent' });
  sql.close();
});

test('A RUN PARKED BY A BUILD BEFORE -unsent HOLDS THE FIELD BACK WHEN THE SECRET WAS CLEARED DURING THE WAIT', async () => {
  /* THE REPLAY FILLS THE STEP AGAIN FROM THE ROW AS IT IS NOW, and a `pin` cleared while the run waited fills both ways
     alike, so the two fills alone said `note` carried nothing while it still held what the step wrote. Measured on 23
     September before the repair: `Rate for hunter2?` with `about: { note: 'hunter2' }`. */
  const steps = [
    { set: { field: 'note', to: '{{pin}}' } },
    { tag: '{{trigger.row.pin}}' },
    { ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'a' } },
    { ask_spark: { question: 'Rate for {{note}} {{tags}}?', about: ['note', 'what'], as: 'rate' } },
  ];
  const { sql, clock } = await sparked(rule([{ set_var: { name: 'x', to: 'y' } }]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }));
  const k = await openRecord(sql, clock, { answersSpark: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  sql.exec(`UPDATE automation_run SET vars = json_remove(vars, '$."-unsent"') WHERE rule = 'rate'`);
  sql.exec("UPDATE entry SET fields = json_remove(fields, '$.pin') WHERE id = ?", made.id);
  const asked = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND opened_by = 'rule:rate'")!;
  const yes = (JSON.parse(asked.body) as { options: { id: string; label: string }[] }).options.find((o) => o.label === 'yes')!.id;
  value(k.decide(asked.id, { decide: { option: yes, reason: 'Paid.' } }, 'p_1') as Result<unknown>);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.doesNotMatch(job.payload, /hunter2/);
  const payload = JSON.parse(job.payload) as { question: string; about?: Record<string, unknown> };
  assert.equal(payload.question, 'Rate for — —?');
  assert.deepEqual(payload.about, { what: 'Rent' });
  sql.close();
});
