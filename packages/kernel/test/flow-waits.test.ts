/**
 * The steps that wait on somebody else: a person asked through Decide, and Slash asked through the outbox.
 *
 * WHAT WAS MEASURED BEFORE THE RUNNER TOOK THEM. Both steps installed, and a run that reached either failed on the spot
 * with `NOT_IN_THIS_BUILD`: no suggestion was opened, no `infer.ask` row was queued, and the first test below read
 * `failed` where it expects `waiting`. The expected failure was that deciding the suggestion resolves it and the run
 * never moves; there was no suggestion to decide.
 *
 * ASKING SLASH IS THE HOST'S SWITCH, `answersSlash`, AND IT IS OFF UNLESS A HOST SAYS IT SERVES THE JOB. Off, the
 * install refuses the step with `NOT_IN_THIS_BUILD` and the runner fails a rule an earlier build installed with one,
 * which is what every host does today. The Slash half below opens its record with the switch on (`slashed`). These
 * tests were skipped until the host could answer Slash: run against the build before that, each failed at install, and
 * the ack of a refusal ended the run on "Slash answered job ... with no text" and not on the refusal's own sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

const PAY_IT = {
  rule: 'payit',
  on: { written: { register: 'obligations', op: ['create'] } },
  once_per: ['entry'],
  steps: [
    { ask_person: { question: 'Pay {{what}} now?', options: ['pay', 'hold'], as: 'answer', wait: '1d' } },
    { if: 'answer is pay', then: [{ set: { field: 'note', to: 'paying' } }], else: [{ set: { field: 'note', to: 'held' } }] },
    { notify: { say: 'Asked about {{what}}: {{vars.answer}}' } },
  ],
};

const RATE = {
  rule: 'rate',
  on: { written: { register: 'obligations', op: ['create'] } },
  once_per: ['entry'],
  steps: [
    { ask_slash: { question: 'What rate applies to {{what}}?', about: ['what', 'note'], as: 'rate', shape: 'number' } },
    { notify: { say: 'Rate for {{what}}: {{vars.rate}}' } },
  ],
};

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};
const codeOf = (r: Result<unknown>): string | null => (r.ok ? null : 'refusal' in r ? r.refusal.code : 'conflict');

async function opened(answersSlash: boolean, decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, answersSlash ? { answersSlash: true } : {});
  value(await k.install([OBLIGATIONS, ...decls]));
  return { k, sql, clock };
}
/** A record on a host that serves no `infer.ask`, which is every host until one says otherwise. */
const record = (...decls: Declaration[]) => opened(false, decls);
/** A record on a host that says it answers an automation's question to Slash. */
const slashed = (...decls: Declaration[]) => opened(true, decls);

type Run = { id: string; state: string; step: number; vars: string; say: string | null };
const run = (sql: NodeSql, of: string): Run | undefined =>
  sql.one<Run>('SELECT id, state, step, vars, say FROM automation_run WHERE rule = ? ORDER BY started_at DESC, rowid DESC', of);
const steps = (sql: NodeSql, id: string) =>
  sql.all<{ n: number; kind: string; state: string }>('SELECT n, kind, state FROM automation_step WHERE run = ? ORDER BY n', id).map((s) => [s.n, s.kind, s.state]);
const notes = (sql: NodeSql, actor: string): string[] =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = ? ORDER BY rowid", actor).map((r) => r.note);
type Asked = { id: string; body_kind: string; body: Record<string, unknown> };
const openOf = (sql: NodeSql, opener?: string): Asked[] =>
  sql
    .all<{ id: string; body_kind: string; body: string; opened_by: string }>("SELECT id, body_kind, body, opened_by FROM suggestion WHERE status = 'open' ORDER BY rowid")
    .filter((s) => opener === undefined || s.opened_by === opener)
    .map((s) => ({ id: s.id, body_kind: s.body_kind, body: JSON.parse(s.body) as Record<string, unknown> }));
const asked = (sql: NodeSql, rule: string): Asked[] => openOf(sql, `rule:${rule}`);
const optionId = (sql: NodeSql, rule: string, label: string): string => {
  const [s] = asked(sql, rule);
  const found = (s?.body.options as { id: string; label: string }[] | undefined)?.find((o) => o.label === label);
  assert.ok(found, `no option ${label} on the question rule.${rule} asked`);
  return found.id;
};

/* ── asking a person ───────────────────────────────────────────────────── */

test('A RUN THAT ASKS A PERSON WAITS FOR THE DECISION, and the answer they pick is what the next step reads', async () => {
  const { k, sql } = await record(rule(PAY_IT));
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();

  const r = run(sql, 'payit')!;
  assert.equal(r.state, 'waiting', `the run did not wait for the person: ${r.say ?? ''}`);
  const [s] = asked(sql, 'payit');
  assert.ok(s, 'no question was put in front of anybody');
  assert.equal(s.body_kind, 'options');
  assert.deepEqual((s.body.options as { label: string }[]).map((o) => o.label), ['pay', 'hold']);
  assert.equal(s.body.run, r.id);

  const decided = k.decide(s.id, { decide: { option: optionId(sql, 'payit', 'hold'), reason: 'Paid on the first.' } }, 'p_1');
  value(decided);
  assert.equal(run(sql, 'payit')?.state, 'pending', 'the decision did not hand the run back to the drain');
  await k.drain();

  const done = run(sql, 'payit')!;
  assert.equal(done.state, 'done', done.say ?? '');
  assert.deepEqual(JSON.parse(done.vars), { answer: 'hold' });
  assert.equal(k.get(made.id)?.fields.note, 'held');
  assert.deepEqual(notes(sql, 'rule:payit'), ['Asked about Rent: hold']);
  assert.deepEqual(steps(sql, done.id), [
    [0, 'ask_person', 'done'],
    [1, 'if', 'done'],
    [4, 'set', 'done'],
    [5, 'notify', 'done'],
  ]);
  sql.close();
});

test('A QUESTION PUT OFF KEEPS THE RUN WAITING, and one closed with no answer fails it with a sentence', async () => {
  const { k, sql } = await record(rule(PAY_IT));
  value(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  const [s] = asked(sql, 'payit');

  value(k.decide(s!.id, { defer: { until: '2026-09-25', why: 'After payday.' } }, 'p_1'));
  await k.drain();
  assert.equal(run(sql, 'payit')?.state, 'waiting', 'putting the question off moved the run');

  value(k.decide(s!.id, { resolved_as: 'wont-fix', reason: 'Not paying this one.' }, 'p_1'));
  const r = run(sql, 'payit')!;
  assert.equal(r.state, 'failed');
  assert.match(r.say ?? '', new RegExp(`${s!.id} was closed without an answer`));
  assert.deepEqual(notes(sql, 'rule:payit'), []);
  sql.close();
});

test('A QUESTION NOBODY ANSWERS IN ITS WAIT FAILS THE RUN, and is taken out of the queue so a late answer is not lost', async () => {
  const { k, sql, clock } = await record(rule(PAY_IT));
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  assert.equal(asked(sql, 'payit').length, 1);

  clock.advance(DAY - HOUR);
  await k.drain();
  assert.equal(run(sql, 'payit')?.state, 'waiting', 'the wait of a day ended early');

  clock.advance(2 * HOUR);
  await k.drain();
  const r = run(sql, 'payit')!;
  assert.equal(r.state, 'failed');
  assert.match(r.say ?? '', /nobody answered/);
  assert.deepEqual(asked(sql, 'payit'), [], 'the question stayed open for an answer nothing would read');
  assert.equal(k.get(made.id)?.fields.note, undefined);
  sql.close();
});

test('A RUN CANCELLED WHILE IT WAITS ON A PERSON TAKES ITS QUESTION WITH IT', async () => {
  const { k, sql } = await record(rule(PAY_IT));
  value(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  const [s] = asked(sql, 'payit');
  value(k.cancelRun(run(sql, 'payit')!.id, 'p_1'));
  assert.deepEqual(asked(sql, 'payit'), []);
  assert.notEqual(codeOf(k.decide(s!.id, { decide: { option: 'o1', reason: 'late' } }, 'p_1')), null, 'a withdrawn question could still be decided');
  assert.equal(run(sql, 'payit')?.state, 'cancelled');
  sql.close();
});

test('A SUGGESTION THE RUN DID NOT OPEN DOES NOT ANSWER IT, even when its body names the run and the step', async () => {
  /* MEASURED BEFORE THE FIX: an agent's options suggestion carrying `{ run, step }`, decided by a person, left the run
     `pending` with `{ answer: 'pay' }` and the run's own question open with nothing behind it. */
  const { k, sql } = await record(rule(PAY_IT));
  value(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  const r = run(sql, 'payit')!;
  const forge = () =>
    value(
      k.propose(
        {
          question: 'Tidy the notes?',
          body_kind: 'options',
          body: { options: [{ id: 'a', label: 'pay', because: 'x' }, { id: 'b', label: 'hold', because: 'y' }], run: r.id, step: 0 },
        } as never,
        'agent_x',
      ),
    ).id;
  value(k.decide(forge(), { decide: { option: 'a', reason: 'Sure.' } }, 'p_1'));
  value(k.decide(forge(), { resolved_as: 'wont-fix', reason: 'No.' }, 'p_1'));
  assert.equal(run(sql, 'payit')?.state, 'waiting', 'a suggestion the run never opened moved it');
  assert.equal(asked(sql, 'payit').length, 1, 'the run lost its own question');
  sql.close();
});

/* ── asking Slash ──────────────────────────────────────────────────────── */

test('THE SWITCH DECIDES WHETHER ask_slash INSTALLS: on, RATE installs; off, it is refused NOT_IN_THIS_BUILD at the step', async () => {
  const on = await slashed();
  assert.equal(codeOf((await on.k.install([rule(RATE)])) as Result<unknown>), null);
  on.sql.close();
  const off = await record();
  const refused = (await off.k.install([rule(RATE)])) as Result<unknown>;
  assert.equal(codeOf(refused), 'NOT_IN_THIS_BUILD');
  assert.equal(!refused.ok && 'refusal' in refused ? refused.refusal.at : null, 'steps[0].ask_slash');
  /* AN ASK IN EITHER ARM OF A BRANCH IS AN ASK. `slashAskAt` walks both, and a walk of the top list alone was measured
     leaving this body installing on a host that answers nothing, all the rest of this file still green. */
  const branched = (await off.k.install([
    rule({ rule: 'fork', on: { manual: true }, steps: [{ set_var: { name: 'k', to: 'a' } }, { if: 'k is a', then: [{ notify: { say: 'A.' } }], else: [{ ask_slash: { question: 'Which?', as: 'which' } }] }] }),
  ])) as Result<unknown>;
  assert.equal(codeOf(branched), 'NOT_IN_THIS_BUILD');
  assert.equal(!branched.ok && 'refusal' in branched ? branched.refusal.at : null, 'steps[1].else[0].ask_slash');
  off.sql.close();
});

test('A RULE AN EARLIER BUILD INSTALLED WITH ask_slash FAILS AT THE STEP, NOT_IN_THIS_BUILD, and queues nothing', async () => {
  /* INSTALL REFUSES THE STEP ON A HOST THAT DOES NOT ANSWER IT, and the build before the lint let one install, so a
     record can hold such a rule. Written into the table as that build left it, and read by a record opened over it. */
  const { sql, clock } = await record(rule({ rule: 'pick', on: { manual: true }, steps: [{ notify: { say: 'Before.' } }, { set_var: { name: 'which', to: 'x' } }] }));
  const body = { rule: 'pick', on: { manual: true }, steps: [{ notify: { say: 'Before.' } }, { ask_slash: { question: 'Which?', as: 'which' } }] };
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.pick' AND superseded_at IS NULL", JSON.stringify(body));
  const k = await openRecord(sql, clock);
  value(k.automationRun('pick', 'p_1'));
  await k.drain();
  const r = run(sql, 'pick')!;
  assert.equal(r.state, 'failed');
  assert.match(r.say ?? '', /NOT_IN_THIS_BUILD/);
  assert.deepEqual(notes(sql, 'rule:pick'), ['Before.'], 'the steps before it were not taken');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.ask'")?.n, 0, 'a question was queued that no host serves');
  sql.close();
});

test('A RUN THAT ASKS SLASH QUEUES ONE infer.ask AND WAITS; the ack writes the answer and the run carries on', async () => {
  const { k, sql } = await slashed(rule(RATE));
  value(k.create('obligations', { what: 'Gold' }, { actor: 'p_1' }));
  await k.drain();

  const r = run(sql, 'rate')!;
  assert.equal(r.state, 'waiting', `the run did not wait for Slash: ${r.say ?? ''}`);
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.deepEqual(JSON.parse(job.payload), {
    run: r.id,
    rule: 'rate',
    step: 0,
    question: 'What rate applies to Gold?',
    shape: 'number',
    about: { what: 'Gold', note: null },
  });

  value(k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { text: ' 4.25 ' } }));
  assert.equal(run(sql, 'rate')?.state, 'pending');
  await k.drain();
  const done = run(sql, 'rate')!;
  assert.equal(done.state, 'done', done.say ?? '');
  assert.deepEqual(JSON.parse(done.vars), { rate: 4.25 });
  assert.deepEqual(notes(sql, 'rule:rate'), ['Rate for Gold: 4.25']);
  sql.close();
});

test('AN ANSWER FROM SLASH THAT IS NOT THE SHAPE ASKED FOR FAILS THE RUN, and the job is still done', async () => {
  const { k, sql } = await slashed(
    rule({ rule: 'pick', on: { manual: true }, steps: [{ ask_slash: { question: 'Which?', as: 'which', shape: 'choice', choices: ['gold', 'silver'] } }, { notify: { say: '{{vars.which}}' } }] }),
  );
  value(k.automationRun('pick', 'p_1'));
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  value(k.ackOutbox({ id: job!.id, state: 'done', leasedUntil: job!.leasedUntil, result: { text: 'copper' } }));
  const r = run(sql, 'pick')!;
  assert.equal(r.state, 'failed');
  assert.match(r.say ?? '', /copper/);
  assert.equal(sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', job!.id)?.state, 'done');
  assert.deepEqual(notes(sql, 'rule:pick'), []);
  sql.close();
});

test('SLASH UNREACHABLE TO THE END OF THE LADDER FAILS THE RUN, and opens no retry question a retry could not answer', async () => {
  const { k, sql } = await slashed(rule({ rule: 'pick', on: { manual: true }, steps: [{ ask_slash: { question: 'Which?', as: 'which' } }] }));
  value(k.automationRun('pick', 'p_1'));
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  sql.exec('UPDATE outbox SET attempts = 7 WHERE id = ?', job!.id);
  value(k.ackOutbox({ id: job!.id, state: 'failed', leasedUntil: job!.leasedUntil, error: 'model timed out' }));
  const r = run(sql, 'pick')!;
  assert.equal(r.state, 'failed');
  assert.match(r.say ?? '', /model timed out/);
  assert.equal(openOf(sql).filter((s) => s.body_kind === 'change').length, 0);
  sql.close();
});

test('AN ANSWER FROM SLASH TO A RUN ALREADY OVER CHANGES NOTHING, and the ask is taken off the queue when the run ends', async () => {
  const { k, sql } = await slashed(rule({ rule: 'pick', on: { manual: true }, steps: [{ ask_slash: { question: 'Which?', as: 'which' } }, { notify: { say: '{{vars.which}}' } }] }));
  /* A JOB A HOST ALREADY HOLDS IS ACKED AS DONE, and the run it answers stays as it ended. */
  const { run: first } = value(k.automationRun('pick', 'p_1'));
  await k.drain();
  const [held] = k.leaseOutbox(['infer.ask'], 10);
  value(k.cancelRun(first, 'p_1'));
  value(k.ackOutbox({ id: held!.id, state: 'done', leasedUntil: held!.leasedUntil, result: { text: 'gold' } }));
  await k.drain();
  assert.equal(sql.one<{ state: string }>('SELECT state FROM automation_run WHERE id = ?', first)?.state, 'cancelled');
  assert.deepEqual(notes(sql, 'rule:pick'), [], 'a late answer woke a cancelled run');

  /* AND A JOB NOBODY HAS TAKEN GOES WITH THE RUN. */
  const { run: second } = value(k.automationRun('pick', 'p_1'));
  await k.drain();
  value(k.cancelRun(second, 'p_1'));
  assert.deepEqual(k.leaseOutbox(['infer.ask'], 10), [], 'a cancelled run left its question for a model to answer');
  sql.close();
});

test('SLASH NOT ANSWERING WITHIN A DAY FAILS THE RUN at its wake', async () => {
  const { k, sql, clock } = await slashed(rule({ rule: 'pick', on: { manual: true }, steps: [{ ask_slash: { question: 'Which?', as: 'which' } }] }));
  value(k.automationRun('pick', 'p_1'));
  await k.drain();
  clock.advance(DAY + HOUR);
  await k.drain();
  const r = run(sql, 'pick')!;
  assert.equal(r.state, 'failed');
  assert.match(r.say ?? '', /Slash did not answer/);
  sql.close();
});

test('A REFUSAL ACKED AS result.failed ENDS THE RUN ON ITS OWN SENTENCE, not on "no text"', async () => {
  /* A MEASUREMENT, AS A TEST. The host's pass acks a refusal `done` with the package's sentence under `result.failed`,
     and `ack` read `result.text` alone, so the month's sentence was thrown away and the run said "Slash answered job
     ... with no text". */
  const spent = "rule.pick asked Slash at step 1, and this month's Slash questions are used until 1 October. Raise the monthly limit, or wait.";
  const { k, sql } = await slashed(rule({ rule: 'pick', on: { manual: true }, steps: [{ ask_slash: { question: 'Which?', as: 'which' } }, { notify: { say: '{{vars.which}}' } }] }));
  value(k.automationRun('pick', 'p_1'));
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  value(k.ackOutbox({ id: job!.id, state: 'done', leasedUntil: job!.leasedUntil, result: { failed: spent } }));
  const r = run(sql, 'pick')!;
  assert.equal(r.state, 'failed');
  assert.equal(r.say, spent);
  assert.deepEqual(notes(sql, 'rule:pick'), []);
  sql.close();
});

test('A SECRET NAMED IN THE QUESTION TO SLASH IS REFUSED AT INSTALL, in every spelling that reaches its value', async () => {
  /* FOUR SPELLINGS REACH `pin`: the row's own `{{pin}}` and `{{text:pin}}` through `rules.ts`'s `fill`, and the run's
     `{{trigger.row.pin}}`, spaces allowed, through `flow.ts`'s `PATH`. `{{trigger.row}}` names no field and is written
     as the JSON of the whole row, `pin` included, which was measured through `ask_person`. */
  const { k, sql } = await slashed();
  const asks = (question: string) =>
    rule({ rule: 'rate', on: { written: { register: 'obligations', op: ['create'] } }, once_per: ['entry'], steps: [{ ask_slash: { question, as: 'rate' } }] });
  for (const question of ['Rate for {{pin}}?', 'Rate for {{text:pin}}?', 'Rate for {{trigger.row.pin}}?', 'Rate for {{ trigger.row.pin }}?', 'Rate for {{trigger.row}}?'])
    assert.equal(codeOf((await k.install([asks(question)])) as Result<unknown>), 'DECLARATION_INVALID', question);
  /* A FIELD THAT IS NOT SECRET IS ASKED ABOUT AS ALWAYS. */
  assert.equal(codeOf((await k.install([asks('Rate for {{what}} and {{trigger.row.note}}?')])) as Result<unknown>), null);
  sql.close();

  /* AND THE WHOLE ROW, WHERE THE LIST HOLDS NOTHING SECRET. */
  const plain = await openRecord(openSqlite(), fixedClock(NOW), { answersSlash: true });
  const JOBS: Declaration = { id: 'register.jobs', kind: 'register', body: { id: 'jobs', name: 'Jobs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never };
  value(await plain.install([JOBS]));
  const row = rule({ rule: 'rate', on: { written: { register: 'jobs', op: ['create'] } }, once_per: ['entry'], steps: [{ ask_slash: { question: 'Rate for {{trigger.row}}?', as: 'rate' } }] });
  assert.equal(codeOf((await plain.install([row])) as Result<unknown>), null);
});

test("THE LINT'S COPY OF THE ROW'S PATTERN REFUSES EVERY SPELLING rules.ts's fill WOULD WRITE THE SECRET INTO", async () => {
  /* `flow-lint.ts`'s `ROW_FILL` IS A COPY, since `fill` exports no pattern, and this is what holds the two together:
     each spelling is put through `fill` itself over a row whose `pin` is `4321`, and every one that writes any of those
     digits must be refused at install. A spelling `fill` leaves as typed, such as `{{ pin }}`, may install. */
  const { fill } = await import('../src/rules.ts');
  const row = { id: 'e1', register: 'obligations', seq: 1, fields: { what: 'Rent', pin: '4321' }, state: null, version: 1, created_at: '', updated_at: '', deleted_at: null } as unknown as Entry;
  const { k, sql } = await slashed();
  const asks = (question: string) =>
    rule({ rule: 'rate', on: { written: { register: 'obligations', op: ['create'] } }, once_per: ['entry'], steps: [{ ask_slash: { question, as: 'rate' } }] });
  for (const spelled of ['{{pin}}', '{{text:pin}}', '{{money:pin}}', '{{quantity:pin}}', '{{until:pin}}', '{{pct:pin}}', '{{ pin }}', '{{pin:text}}']) {
    const leaks = /4|3|2|1/.test(fill(`Rate ${spelled}?`, row, NOW));
    const code = codeOf((await k.install([asks(`Rate ${spelled}?`)])) as Result<unknown>);
    if (leaks) assert.equal(code, 'DECLARATION_INVALID', `${spelled} is filled as "${fill(`Rate ${spelled}?`, row, NOW)}" and installed`);
  }
  /* ONE MONEY FIELD LESS ANOTHER READS BOTH, so a secret on either side of the minus is refused at install as the fill
     counts it (`filling`'s `secret`). A second field after a form that does not subtract is left as typed, and installs. */
  const { filling } = await import('../src/rules.ts');
  for (const spelled of ['{{short:pin-what}}', '{{short:what-pin}}', '{{money:what-pin}}', '{{on:what-pin}}', '{{text:pin-what}}']) {
    const counted = filling(`Rate ${spelled}?`, row, NOW, { sealed: new Set(['pin']) }).secret !== null;
    const code = codeOf((await k.install([asks(`Rate ${spelled}?`)])) as Result<unknown>);
    assert.equal(code, counted ? 'DECLARATION_INVALID' : null, `${spelled}: the fill ${counted ? 'counts' : 'does not count'} a secret in it`);
  }
  assert.equal(filling('{{on:what-pin}}', row, NOW, { sealed: new Set(['pin']) }).secret, null);
  assert.notEqual(filling('{{short:what-pin}}', row, NOW, { sealed: new Set(['pin']) }).secret, null);
  sql.close();
});

test('A RULE STORED WITH A SECRET IN ITS QUESTION SENDS THE QUESTION WITHOUT IT', async () => {
  /* THE SECOND LINE, as `about:` has one: a rule an earlier build let install, or written into the table, fills its
     question from a row and a trigger context with every secret and file field taken out. */
  const { sql, clock } = await slashed(rule({ rule: 'rate', on: { written: { register: 'obligations', op: ['create'] } }, once_per: ['entry'], steps: [{ set_var: { name: 'x', to: 'y' } }] }));
  const body = {
    rule: 'rate',
    on: { written: { register: 'obligations', op: ['create'] } },
    once_per: ['entry'],
    steps: [{ ask_slash: { question: 'Rate for {{what}}, {{pin}}, {{text:pin}}, {{ trigger.row.pin }}, {{trigger.row}}, {{trigger.row.note}}, {{old}}?', as: 'rate' } }],
  };
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify(body));
  const k = await openRecord(sql, clock, { answersSlash: true });
  /* ONLY THE KEYCHAIN WRITES A SECRET FIELD, so `pin` is put in the row as the keychain would leave a value there, before the
     drain takes the run. `note` holds the words `{{pin}}`, which a question filled twice would read a second time. */
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: '{{pin}}' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  /* AND A VALUE UNDER A FIELD THE LIST NO LONGER DECLARES, which has no live type to say whether it may leave, so it
     does not. Measured: a `sendable` which kept undeclared fields left this file green, and sent `hunter2` here twice:
     in the whole row's JSON and as `{{old}}`. */
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.old', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  const r = run(sql, 'rate')!;
  assert.equal(r.state, 'waiting', r.say ?? '');
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  const question = (JSON.parse(job.payload) as { question: string }).question;
  /* WITH THE SECOND LINE OFF THIS WAS `Rate for Rent, hunter2, hunter2, hunter2, {"what":"Rent","note":"hunter2",
     "pin":"hunter2"}, hunter2?`. Each hole is the dash a path to nothing is written as.

     AND `note` IS ASKED AS THE WORDS IT HOLDS, `{{pin}}`, both in the row's JSON and by `{{trigger.row.note}}`. This
     read `"note":"—"` and `—` while the question was filled twice, the run's fill and then the row's over what it had
     made: the second read the braces the first wrote in and filled them from the cleaned row, which has no `pin`. That
     was no leak here, and it is the fill that leaked through a question to a person, where the row is not cleaned the
     same way (`flow-secret-verbs.test.ts`). The question is filled once now, for both. */
  assert.doesNotMatch(question, /hunter2/, question);
  assert.equal(question, 'Rate for Rent, —, —, —, {"what":"Rent","note":"{{pin}}"}, {{pin}}, —?');
  sql.close();
});

/* ── the lint says what the runner does ────────────────────────────────── */

test('THE LINT REFUSES WHAT THE RUNNER COULD NOT DO WITH AN ASK', async () => {
  const { k, sql } = await record();
  const one = async (step: unknown, on: unknown = { manual: true }) => {
    const out = await k.install([rule({ rule: 'lint', on, ...(on === undefined || 'written' in (on as object) ? { once_per: ['entry'] } : {}), steps: [step] })]);
    return codeOf(out as Result<unknown>);
  };
  const written = { written: { register: 'obligations', op: ['create'] } };
  /* THE GATE TAKES A CHOICE OF TWO OR MORE, so a question of one installed and failed at every run. */
  assert.equal(await one({ ask_person: { question: 'Pay?', options: ['yes'], as: 'a' } }), 'OUT_OF_BOUNDS');
  assert.equal(await one({ ask_person: { question: 'Pay?', options: ['yes', 'yes'], as: 'a' } }), 'OUT_OF_BOUNDS');
  /* A QUESTION MAY BE PUT TO ONE MEMBER BY THEIR ID, which the run asks about when it reaches the step, since who is a
     member changes after install; a `to:` that names nobody is refused here. */
  assert.equal(await one({ ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'a', to: 'p_2' } }), null);
  assert.equal(await one({ ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'a', to: '' } }), 'DECLARATION_INVALID');
  /* `about` IS FIELDS OF THE ROW, so a clock has none, a field the list lacks is named, and a secret never goes. Those
     are told first, and a well-made ask of Slash is then refused as not in this build, since this record's host has not
     said it answers one. */
  assert.equal(await one({ ask_slash: { question: 'Rate?', as: 'r', about: ['what'] } }), 'DECLARATION_INVALID');
  assert.equal(await one({ ask_slash: { question: 'Rate?', as: 'r', about: ['nosuch'] } }, written), 'FIELD_UNKNOWN');
  assert.equal(await one({ ask_slash: { question: 'Rate?', as: 'r', about: ['pin'] } }, written), 'DECLARATION_INVALID');
  assert.equal(await one({ ask_slash: { question: 'Rate?', as: 'r', about: ['what'] } }, written), 'NOT_IN_THIS_BUILD');
  assert.equal(await one({ ask_slash: { question: 'Rate?', as: 'r' } }), 'NOT_IN_THIS_BUILD');
  assert.equal(await one({ ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'a', wait: '2d' } }), null);
  sql.close();
});
