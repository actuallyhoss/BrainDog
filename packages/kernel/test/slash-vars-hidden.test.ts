/**
 * A secret carried into a question to Slash by way of a variable: audit forty-six §1, which restates audit forty-five's
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
 * fails here and both stored cases in `apps/selfhost/test/slash-secret.test.ts` fail, while every install case holds.
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

async function slashed(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { answersSlash: true });
  value(await k.install([OBLIGATIONS, ...decls]));
  return { k, sql, clock };
}

const refusal = (r: Result<unknown>): { code: string; fix: string } | null => (r.ok ? null : 'refusal' in r ? { code: r.refusal.code, fix: r.refusal.fix } : { code: 'conflict', fix: '' });

test('A QUESTION TO SLASH NAMING A VARIABLE SET FROM A SECRET FIELD IS REFUSED AT INSTALL, and the refusal names the step that set it', async () => {
  const { k, sql } = await slashed();
  const cases: [string, unknown[]][] = [
    ['the field', [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
    ['the field, spaced', [{ set_var: { name: 'p', to: 'pin {{ trigger.row.pin }}' } }, { ask_slash: { question: 'Rate given {{ vars.p }}?', as: 'rate' } }]],
    ['the whole row', [{ set_var: { name: 'p', to: '{{trigger.row}}' } }, { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
    /* A VARIABLE SET FROM ANOTHER holds what the other holds, so the chain is followed and the first link is named. */
    [
      'through a second variable',
      [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { set_var: { name: 'q', to: 'again {{vars.p}}' } }, { ask_slash: { question: 'Rate given {{vars.q}}?', as: 'rate' } }],
    ],
    /* A BRANCH TAKEN BEFORE THE QUESTION may have set it, and the lint cannot tell which arm the row will take. */
    ['inside a branch', [{ if: 'what is Rent', then: [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }] }, { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
    /* THE CASES BELOW GUARD THE TWO PLACES THE LINT WAS MADE PRECISE, each one a way the relaxing could go too far. A
       plain `set_var` inside one arm clears that arm only, so the other arm still reaches the question holding `pin`. */
    [
      'cleared in one arm only',
      [
        { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
        { if: 'what is Rent', then: [{ set_var: { name: 'p', to: '{{trigger.row.note}}' } }] },
        { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } },
      ],
    ],
    [
      'set in the else arm, cleared in the then arm',
      [
        { if: 'what is Rent', then: [{ set_var: { name: 'p', to: '{{trigger.row.note}}' } }], else: [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }] },
        { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } },
      ],
    ],
    /* THE LAST WRITE IS THE ONE THAT COUNTS, both ways: plain then secret is secret. */
    ['set plain, then from the secret', [{ set_var: { name: 'p', to: '{{trigger.row.note}}' } }, { set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
    /* A SECOND WRITE THAT READS THE FIRST carries it, so a set_var of the same name clears only when it is plain. */
    ['set again from itself', [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { set_var: { name: 'p', to: 'again {{vars.p}}' } }, { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
    /* AND AN ARM SEES WHAT WAS SET EARLIER IN THE SAME ARM, however deep the question sits in it. */
    [
      'later in the same arm',
      [{ if: 'what is Rent', then: [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { if: 'note is plain', then: [{ ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }] }] }],
    ],
  ];
  for (const [what, steps] of cases) {
    const out = refusal((await k.install([rule(steps)])) as Result<unknown>);
    assert.equal(out?.code, 'DECLARATION_INVALID', `${what}: ${out?.fix ?? 'installed'}`);
    assert.match(out!.fix, /pin/, what);
    const setter: Record<string, RegExp> = {
      'inside a branch': /steps\[0\]\.then\[0\]/,
      'later in the same arm': /steps\[0\]\.then\[0\]/,
      'set in the else arm, cleared in the then arm': /steps\[0\]\.else\[0\]/,
      'set plain, then from the secret': /steps\[1\]/,
    };
    assert.match(out!.fix, setter[what] ?? /steps\[0\]/, `${what}: the refusal does not name the set_var: ${out!.fix}`);
  }
  /* A VARIABLE SET FROM FIELDS THAT MAY LEAVE IS ASKED ABOUT AS ALWAYS. */
  for (const steps of [
    [{ set_var: { name: 'p', to: '{{trigger.row.what}}, {{trigger.row.note}}' } }, { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }],
    [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { set_var: { name: 'q', to: '{{trigger.row.note}}' } }, { ask_slash: { question: 'Rate given {{vars.q}}?', as: 'rate' } }],
    [{ set_var: { name: 'p', to: '{{trigger.row.note}}' } }, { ask_person: { question: 'Pay {{vars.p}}?', options: ['yes', 'no'], as: 'a' } }],
  ]) {
    const out = refusal((await k.install([rule(steps)])) as Result<unknown>);
    assert.equal(out, null, out?.fix);
  }
  /* AND A SECRET ONE IN A QUESTION TO A PERSON IS REFUSED TOO. This installed until 23 September, "a question to a
     person stays in the record"; it stays in the record's one queue, which everyone who decides reads, and at run time
     it was asked as `Pay hunter2?` (`flow-secret-verbs.test.ts` measured each spelling). */
  const person = refusal((await k.install([rule([{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { ask_person: { question: 'Pay {{vars.p}}?', options: ['yes', 'no'], as: 'a' } }])])) as Result<unknown>);
  assert.equal(person?.code, 'DECLARATION_INVALID', person?.fix ?? 'installed');
  assert.match(person!.fix, /\{\{vars\.p\}\} into its question to a person at steps\[1\], and p holds pin: steps\[0\] put it there/);
  sql.close();
});

test('A QUESTION NO RUN CAN REACH HOLDING THE SECRET INSTALLS: the arm beside the one that set it, and after a plain set_var of the same name', async () => {
  /* THE LINT REFUSED BOTH UNTIL 23 SEPTEMBER, measured against `flow-lint.ts` as wave forty-seven left it: each read
     `DECLARATION_INVALID` naming the `set_var` that took `pin`. Neither can leave. A plan has no loops, so an `else` is
     never taken after its own `then` (`flow.ts`'s `plan`), and the runner takes `p` out of what it keeps when a later
     `set_var` fills it the same both ways (the test "WHAT WAS KEPT GOES" below measures that one reaching Slash as
     `plain`). */
  const { k, sql } = await slashed();
  const cases: [string, unknown[]][] = [
    [
      'the sibling arm',
      [{ if: 'what is Rent', then: [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }], else: [{ set_var: { name: 'p', to: '{{trigger.row.note}}' } }, { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }] }],
    ],
    ['set again, plainly', [{ set_var: { name: 'p', to: '{{trigger.row.pin}}' } }, { set_var: { name: 'p', to: '{{trigger.row.note}}' } }, { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } }]],
    /* BOTH ARMS SET IT PLAINLY, so whichever the row takes, the question after the branch reads a plain value. */
    [
      'cleared in both arms',
      [
        { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
        { if: 'what is Rent', then: [{ set_var: { name: 'p', to: '{{trigger.row.note}}' } }], else: [{ set_var: { name: 'p', to: 'none' } }] },
        { ask_slash: { question: 'Rate given {{vars.p}}?', as: 'rate' } },
      ],
    ],
  ];
  const refused: string[] = [];
  for (const [what, steps] of cases) {
    const out = refusal((await k.install([rule(steps)])) as Result<unknown>);
    if (out) refused.push(`${what}: ${out.fix}`);
  }
  assert.deepEqual(refused, []);
  sql.close();
});

test('A RULE STORED WITH SUCH A VARIABLE SENDS THE DASH A FIELD IS WRITTEN AS, and the whole row cleaned as sendable cleans one', async () => {
  /* THE SECOND LINE: a rule an earlier build let install, written into the table past the lint, as
     `flow-waits.test.ts` writes its stored rule. */
  const { sql, clock } = await slashed(rule([{ set_var: { name: 'x', to: 'y' } }]));
  const steps = [
    { set_var: { name: 'n', to: '{{trigger.row.note}}' } },
    { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 'q', to: 'again {{vars.p}}' } },
    { set_var: { name: 'w', to: '{{trigger.row}}' } },
    /* `a` IS SET FROM THE SECRET AND THEN OVERWRITTEN BY THE ANSWER, so the second question reads the answer and not
       the dash kept for what `a` held before. */
    { set_var: { name: 'a', to: '{{trigger.row.pin}}' } },
    { ask_slash: { question: 'Rate for {{vars.n}}, {{vars.p}}, {{vars.q}}, {{vars.w}}, {{vars.a}}?', as: 'a' } },
    /* A SECOND QUESTION, AFTER THE FIRST IS ANSWERED, so what the run keeps beside `vars` is shown to outlive the park
       and the answer that wakes it. */
    { ask_slash: { question: 'Then {{vars.a}} and {{vars.p}}?', as: 'b' } },
  ];
  sql.exec(
    "UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL",
    JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }),
  );
  const k = await openRecord(sql, clock, { answersSlash: true });
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
  /* THE VARIABLE ITSELF IS UNTOUCHED: the record kept what the row held, and only what went to Slash was cleaned. What
     the run kept beside `vars` for its questions is gone with the last of them. */
  const vars = JSON.parse(r!.vars) as Record<string, unknown>;
  assert.deepEqual(Object.keys(vars).sort(), ['a', 'b', 'n', 'p', 'q', 'w']);
  assert.equal(vars.p, 'hunter2');
  sql.close();
});

test('WHAT WAS KEPT GOES WHEN THE VARIABLE IS SET AGAIN FROM A FIELD THAT MAY LEAVE, for Slash and for a person alike', async () => {
  /* TWO LINES THE CASE ABOVE LEFT UNTESTED, found by the checker on 23 September by taking each out and watching the
     suite stay green. With the `delete` at `set_var` taken out, `r` set from `pin` and then from `note` kept its dash
     and Slash was asked `Given — and —?` about a variable holding `plain`.

     AND A QUESTION TO A PERSON NO LONGER READS THE SECRET. This test pinned `Pay hunter2?`, "a question to a person
     stays in the record", and that was the leak itself: it stays in the record's one queue, which everyone who decides
     reads, and a `suggest` into the same queue is refused the same copy (`flow-secret-verbs.test.ts`). The person is
     asked with the dash where `p` held `pin`, and `r`, set again from `note`, reads its value. */
  const { sql, clock } = await slashed(rule([{ set_var: { name: 'x', to: 'y' } }]));
  const steps = [
    { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 'r', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 'r', to: '{{trigger.row.note}}' } },
    { ask_slash: { question: 'Given {{vars.p}} and {{vars.r}}?', as: 'a' } },
    { ask_person: { question: 'Pay {{vars.p}} {{vars.r}}?', options: ['yes', 'no'], as: 'b' } },
  ];
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }));
  const k = await openRecord(sql, clock, { answersSlash: true });
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
  assert.match(said, /Pay — plain\?/, said);
  assert.doesNotMatch(said, /hunter2/, said);
  sql.close();
});

test('A VARIABLE SET FROM ITSELF IS ASKED ABOUT AS IT HOLDS, not filled a second time from its own new value', async () => {
  /* FOUND WHILE WRITING THE REBUILD BELOW, which fills in the order a run took its steps. `set_var` wrote the new value
     into `vars` before its second fill, so `{{vars.p}}` in its own `to` read the value it was making, the two fills
     differed, and what was kept for Slash was the text filled twice. Measured against `flow.ts` as wave forty-seven
     left it: `Given plain more more?` about a variable holding `plain more`. Nothing secret went out, and the question
     was still wrong. */
  const { sql, clock } = await slashed(rule([{ set_var: { name: 'x', to: 'y' } }]));
  const steps = [
    { set_var: { name: 'p', to: '{{trigger.row.note}}' } },
    { set_var: { name: 'p', to: '{{vars.p}} more' } },
    { set_var: { name: 's', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 's', to: 'again {{vars.s}}' } },
    { ask_slash: { question: 'Given {{vars.p}}, {{vars.s}}?', as: 'a' } },
  ];
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }));
  const k = await openRecord(sql, clock, { answersSlash: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.equal((JSON.parse(job.payload) as { question: string }).question, 'Given plain more, again —?');
  sql.close();
});

/**
 * A run a build before `-sendable` parked, resumed by a build with it: the rule written into the table past the lint,
 * the run parked, and the key taken off its stored `vars`, which is the column as the older build left it.
 */
async function parkedBefore(steps: unknown[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const { sql, clock } = await slashed(rule([{ set_var: { name: 'x', to: 'y' } }]));
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.rate' AND superseded_at IS NULL", JSON.stringify({ rule: 'rate', on: WRITTEN, once_per: ['entry'], steps }));
  const k = await openRecord(sql, clock, { answersSlash: true });
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE id = ?", made.id);
  await k.drain();
  const r = sql.one<{ state: string; vars: string }>("SELECT state, vars FROM automation_run WHERE rule = 'rate'");
  assert.equal(r?.state, 'waiting', 'the run did not park');
  sql.exec(`UPDATE automation_run SET vars = json_remove(vars, '$."-sendable"') WHERE rule = 'rate'`);
  const stored = JSON.parse(sql.one<{ vars: string }>("SELECT vars FROM automation_run WHERE rule = 'rate'")!.vars) as Record<string, unknown>;
  assert.equal(stored['-sendable'], undefined);
  assert.equal(stored.p, 'hunter2');
  return { k, sql, clock };
}

test('A RUN PARKED BY A BUILD BEFORE THE KEEPING SENDS THE DASH WHEN IT WAKES, rebuilt from the steps it had taken', async () => {
  /* THE CHECKER'S FINDING ON WAVE FORTY-SEVEN. A run that parked between the `set_var` and the question kept its `vars`
     with no `-sendable` beside them, since the build that parked it wrote none, and the build that woke it read nothing
     kept and filled the question from `vars`. Measured against `flow.ts` as that wave left it, the question went out as
     `Given hunter2, plain, r hunter2, —?`. `s` is set from `pin` after the wake, so the column has something kept by
     the time the question is reached: a rebuild done at the question, for a run with nothing kept, found `s` there and
     asked `Given hunter2, plain, r hunter2, —?` again, measured with the rebuild moved there. */
  const { k, sql, clock } = await parkedBefore([
    { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 'n', to: '{{trigger.row.note}}' } },
    { wait: '1h' },
    { set_var: { name: 'r', to: 'r {{vars.p}}' } },
    { set_var: { name: 's', to: '{{trigger.row.pin}}' } },
    { ask_slash: { question: 'Given {{vars.p}}, {{vars.n}}, {{vars.r}}, {{vars.s}}?', as: 'a' } },
  ]);
  clock.advance(3_600_000);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.equal((JSON.parse(job.payload) as { question: string }).question, 'Given —, plain, r —, —?');
  sql.close();
});

test('AND ONE PARKED ON A PERSON BY THAT BUILD, where the answer overwrote a variable set from the secret', async () => {
  /* THE ANSWER'S OWN STEP ROW IS READ IN THE REBUILD, so `a`, set from `pin` and then answered `yes`, is asked about as
     `yes` and not as the dash. Measured against `flow.ts` as wave forty-seven left it: `Given hunter2 and yes?`. */
  const { k, sql } = await parkedBefore([
    { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
    { set_var: { name: 'a', to: '{{trigger.row.pin}}' } },
    { ask_person: { question: 'Pay?', options: ['yes', 'no'], as: 'a' } },
    { ask_slash: { question: 'Given {{vars.p}} and {{vars.a}}?', as: 'b' } },
  ]);
  const [s] = sql
    .all<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND opened_by = 'rule:rate'")
    .map((r) => ({ id: r.id, body: JSON.parse(r.body) as { options: { id: string; label: string }[] } }));
  assert.ok(s, 'no question was put to the person');
  value(k.decide(s.id, { decide: { option: s.body.options.find((o) => o.label === 'yes')!.id, reason: 'Yes.' } }, 'p_1'));
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.equal((JSON.parse(job.payload) as { question: string }).question, 'Given — and yes?');
  sql.close();
});

test('A RUN THIS BUILD PARKED IS NOT REBUILT, so a field edited during the wait does not replace what the variable holds', async () => {
  /* THE CHECKER'S FINDING ON THE REBUILD ABOVE. `pack` wrote no `-sendable` for a run keeping nothing, so every run this
     build parked with nothing kept read as one an earlier build parked, and was rebuilt from the row as it is now:
     measured on 23 September, `p` set from `note` while it said `plain`, `note` edited to `changed` during the wait,
     and Slash was asked `Given changed?` about a variable holding `plain`. No secret in the rule at all, and the
     question was still about a value the run does not have. */
  const { k, sql, clock } = await slashed(rule([{ set_var: { name: 'p', to: '{{trigger.row.note}}' } }, { wait: '1h' }, { ask_slash: { question: 'Given {{vars.p}}?', as: 'a' } }]));
  const made = value<Entry>(k.create('obligations', { what: 'Rent', note: 'plain' }, { actor: 'p_1' }));
  await k.drain();
  assert.equal(sql.one<{ state: string }>("SELECT state FROM automation_run WHERE rule = 'rate'")?.state, 'waiting', 'the run did not park');
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.note', 'changed') WHERE id = ?", made.id);
  clock.advance(3_600_000);
  await k.drain();
  const [job] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no infer.ask row was queued');
  assert.equal((JSON.parse(job.payload) as { question: string }).question, 'Given plain?');
  sql.close();
});
