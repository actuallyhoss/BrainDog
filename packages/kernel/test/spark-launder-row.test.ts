/**
 * A secret carried into a question to Spark by way of a field of the row: audit forty-nine §7.
 *
 * WHAT THE AUDIT MEASURED. The lint and the runner followed a secret field into a variable (`spark-vars-hidden.test.ts`)
 * and not into the row. A `set` step wrote `pin`'s value into `note`, a text field that may leave, and the question read
 * `note` from the row as it then was: `{{note}}`, `{{trigger.row.note}}`, `about: [note]`, and a `set_var` filled from
 * `note`, each installed clean and each sent `hunter2`. It also wrote the secret into a text field every reader of the
 * list sees, which is why the lint refuses it at install rather than only cleaning the question.
 *
 * AND SINCE AUDIT FIFTY-ONE §3 THE LINT REFUSES THE COPY ITSELF, at the `set` or `tag`, and no longer the question that
 * reads it: a second rule on a later edit read `note` and sent `hunter2`, and no walk of one body could see that
 * (`launder-across-rules.test.ts`). So each refusal below names the step that writes the field, and the bodies that
 * installed because nothing after the write read it are refused now too.
 *
 * AND SINCE WAVE FIFTY-FIVE THE RUNNER REFUSES THE COPY TOO. The stored cases let a rule written past the lint copy
 * `pin` into `note` and pinned that the row kept it, to reach the question after it; that copy is the leak, since every
 * reader of the list sees `note`. So a stored rule is now held to writing nothing from the secret, and the runner's
 * second line is measured over a run an earlier build took past its write: the step rows, the field and the run's
 * column are put in by SQL as that build left them, and this build takes the steps after.
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
    /* THE STEP THAT WRITES THE FIELD, and then the `set_var` that took the secret into the variable it is written from. */
    wrote: /writes note from \{\{vars\.p\}\} at steps\[1\], and p holds pin: steps\[0\] put it there with \{\{trigger\.row\.pin\}\}/,
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
    /* REFUSED AT THE WRITE, before the `set_var` that reads it: the copy into `note` is the fault. */
    wrote: /writes note from \{\{pin\}\} at steps\[0\]/,
    sends: { question: 'Rate for —?' },
  },
  /* NOT IN THE PROBE: a tag is filled by the run, and `tags` then holds it. Measured before the repair through the same
     kernel as `Rate for hunter2 ["hunter2"]?` for `{{tags}} {{trigger.row.tags}}`. */
  {
    what: 'tag from trigger.row.pin, ask {{tags}}',
    steps: [{ tag: '{{trigger.row.pin}}' }, { ask_spark: { question: 'Rate for {{tags}} {{trigger.row.tags}}?', as: 'rate' } }],
    wrote: /writes tags from \{\{trigger\.row\.pin\}\} at steps\[0\]/,
    field: 'tags',
    sends: { question: 'Rate for — —?' },
  },
];

test('A STEP THAT WOULD WRITE A SECRET INTO A FIELD A QUESTION TO SPARK READS IS REFUSED AT INSTALL, at the step', async () => {
  const { k, sql } = await sparked();
  const cases = [
    ...LAUNDERED.map((c) => [c.what, c.steps, c.wrote] as const),
    /* A FIELD WRITTEN FROM ANOTHER THAT A STEP WROTE FROM THE SECRET is never reached: the first copy is refused. */
    [
      'set note from pin, set memo from note, ask {{memo}}',
      [{ set: { field: 'note', to: '{{pin}}' } }, { set: { field: 'memo', to: 'again {{note}}' } }, { ask_spark: { question: 'Rate for {{memo}}?', as: 'rate' } }],
      /writes note from \{\{pin\}\} at steps\[0\]/,
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
    assert.match(out!.fix, wrote, `${what}: the refusal does not name the step that writes the field: ${out!.fix}`);
  }
  /* THESE INSTALLED WHILE THE LINT FOLLOWED THE FIELD TO A QUESTION, and are refused now. A plain `set` after the secret
     one, a question to a person, the arm beside the write, and a question about another field each left no question
     in this rule reading what the step wrote; but the write put `pin` in `note`, which every reader of the list sees
     and any other rule may ask Spark about, so the copy is refused whatever follows it. */
  for (const [steps, at] of [
    [[{ set: { field: 'note', to: '{{pin}}' } }, { set: { field: 'note', to: 'plain' } }, { ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }], 'steps[0]'],
    [[{ set: { field: 'note', to: '{{pin}}' } }, { ask_person: { question: 'Pay {{note}}?', options: ['yes', 'no'], as: 'a' } }], 'steps[0]'],
    [[{ if: 'what is Rent', then: [{ set: { field: 'note', to: '{{pin}}' } }], else: [{ ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }] }], 'steps[0].then[0]'],
    [[{ set: { field: 'note', to: '{{pin}}' } }, { ask_spark: { question: 'Rate for {{what}}?', about: ['what'], as: 'rate' } }], 'steps[0]'],
  ] as const) {
    const out = refusal((await k.install([rule([...steps])])) as Result<unknown>);
    assert.equal(out?.code, 'DECLARATION_INVALID', out?.fix ?? 'installed');
    assert.ok(out!.fix.includes(`writes note from {{pin}} at ${at}, and a secret field is copied only into another secret or file field`), out!.fix);
  }
  /* WHAT COPIES NO SECRET STILL INSTALLS. */
  const plain = refusal((await k.install([rule([{ set: { field: 'note', to: '{{what}} {{trigger.row.memo}}' } }, { ask_spark: { question: 'Rate for {{note}}?', as: 'rate' } }])])) as Result<unknown>);
  assert.equal(plain, null, plain?.fix);
  sql.close();
});

/**
 * `rule.rate` written into the table past the lint as `steps`, as an earlier build let it install and as
 * `spark-vars-hidden.test.ts` writes its stored rule, and a row made, with `pin` put in by SQL after it.
 */
async function storedRate(steps: unknown[]): Promise<{ k: Kernel; sql: NodeSql; made: Entry; run: string }> {
  const { sql, clock } = await sparked(rule([{ set_var: { name: 'x', to: 'y' } }]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }));
  const k = await openRecord(sql, clock, { answersSpark: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  return { k, sql, made, run: sql.one<{ id: string }>("SELECT id FROM automation_run WHERE rule = 'rate'")!.id };
}

/**
 * The run put where an earlier build left it after taking `steps[0]` to `steps[upTo]`, before this build takes the
 * next: a done step row for each, a `set_var` answering `hunter2`, the row's `fields` as those steps wrote them, and the
 * run's column as `vars`. This build refuses the write among those steps, so it cannot take them itself.
 */
function tookPast(sql: NodeSql, s: { made: Entry; run: string }, steps: unknown[], upTo: number, fields: Record<string, unknown>, vars: Record<string, unknown>): void {
  const at = new Date(NOW).toISOString();
  for (const [n, step] of steps.slice(0, upTo + 1).entries()) {
    const kind = Object.keys(step as object)[0]!;
    sql.exec("INSERT INTO automation_step (run, n, kind, state, answer, ms, at) VALUES (?, ?, ?, 'done', ?, NULL, ?)", s.run, n, kind, kind === 'set_var' ? 'hunter2' : null, at);
  }
  for (const [field, v] of Object.entries(fields)) sql.exec(`UPDATE entry SET fields = json_set(fields, '$.${field}', json(?)) WHERE id = ?`, JSON.stringify(v), s.made.id);
  sql.exec('UPDATE automation_run SET step = ?, vars = ? WHERE id = ?', upTo + 1, JSON.stringify(vars), s.run);
}

test('A RULE STORED PAST THE LINT WRITES NO SECRET INTO THE ROW AT RUN TIME, and asks Spark nothing after the write', async () => {
  /* MEASURED AT HEAD `b7409d2d`, BEFORE THIS CHANGE: each of these wrote `hunter2` into `note` or `tags`, held the field
     back from the question and asked it, and the test that stood here pinned that the row kept the copy. The run now
     fails at the write, says which spelling reached the secret and never the value, and takes no step after it. */
  for (const c of LAUNDERED) {
    const { k, sql, made } = await storedRate(c.steps);
    await k.drain();
    const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'rate'");
    assert.equal(run?.state, 'failed', `${c.what}: ${run?.say ?? ''}`);
    assert.match(run!.say ?? '', /secret or file field/, c.what);
    assert.doesNotMatch(run!.say ?? '', /hunter2/, c.what);
    assert.deepEqual(k.leaseOutbox(['infer.ask'], 10), [], c.what);
    const held = sql.one<{ v: string | null }>(`SELECT json_extract(fields, '$.${c.field ?? 'note'}') AS v FROM entry WHERE id = ?`, made.id)?.v;
    assert.doesNotMatch(String(held), /hunter2/, `${c.what}: the row holds ${String(held)}`);
    sql.close();
  }
});

test('A RUN AN EARLIER BUILD TOOK PAST ITS WRITE SENDS NO VALUE THAT WRITE COPIED FROM A SECRET, in the question or in about:', async () => {
  /* THE SECOND LINE: each case's write taken as HEAD `b7409d2d` took it, with the field it wrote under `-unsent`, and a
     `set_var` from the secret under `-sealed` with the dash kept for Spark. This build takes the steps after it. */
  const sent: string[] = [];
  for (const c of LAUNDERED) {
    const upTo = c.steps.findIndex((s) => 'set' in (s as object) || 'tag' in (s as object));
    const field = c.field ?? 'note';
    const named = c.steps.slice(0, upTo).map((s) => (s as { set_var: { name: string } }).set_var.name);
    const s = await storedRate(c.steps);
    tookPast(s.sql, s, c.steps, upTo, { [field]: field === 'tags' ? ['hunter2'] : 'hunter2' }, {
      ...Object.fromEntries(named.map((n) => [n, 'hunter2'])),
      '-sendable': Object.fromEntries(named.map((n) => [n, '—'])),
      '-unsent': [field],
      '-sealed': named,
    });
    await s.k.drain();
    const [job] = s.k.leaseOutbox(['infer.ask'], 10);
    const run = s.sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'rate'");
    assert.ok(job, `${c.what}: no infer.ask row was queued, and the run is ${run?.state} ${run?.say ?? ''}`);
    const payload = JSON.parse(job.payload) as { question: string; about?: Record<string, unknown> };
    sent.push(`${c.what}: ${job.payload}`);
    assert.doesNotMatch(job.payload, /hunter2/, `${c.what}: ${job.payload}`);
    assert.deepEqual({ question: payload.question, ...(payload.about === undefined ? {} : { about: payload.about }) }, c.sends, c.what);
    s.sql.close();
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
  /* THE COPY AS AN EARLIER BUILD WROTE IT, since this build refuses it: `note` holds the secret and `-unsent` says so. */
  const past = await storedRate(steps);
  const { k, sql } = past;
  tookPast(sql, past, steps, 0, { note: 'hunter2' }, { '-sendable': {}, '-unsent': ['note'], '-sealed': [] });
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
     removed by SQL, as `spark-vars-hidden.test.ts` removes `-sendable` for the build before that one. It wrote no
     `-sealed` either, which came after it, so that key goes too. */
  const steps = [
    { set: { field: 'note', to: '{{pin}}' } },
    { ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'a' } },
    { ask_spark: { question: 'Rate for {{note}}?', about: ['note', 'what'], as: 'rate' } },
  ];
  /* THE WRITE AS THAT BUILD TOOK IT, since this build refuses it: the step row and `note`, and a column of `-sendable`
     alone. This build takes the question to the person and parks, writing its keys, which go again below. */
  const past = await storedRate(steps);
  const { k, sql } = past;
  tookPast(sql, past, steps, 0, { note: 'hunter2' }, { '-sendable': {} });
  await k.drain();
  sql.exec(`UPDATE automation_run SET vars = json_remove(vars, '$."-unsent"', '$."-sealed"') WHERE rule = 'rate'`);
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
  const past = await storedRate(steps);
  const { k, sql, made } = past;
  tookPast(sql, past, steps, 1, { note: 'hunter2', tags: ['hunter2'] }, { '-sendable': {} });
  await k.drain();
  sql.exec(`UPDATE automation_run SET vars = json_remove(vars, '$."-unsent"', '$."-sealed"') WHERE rule = 'rate'`);
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
