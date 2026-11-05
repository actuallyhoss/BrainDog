/**
 * The decision gate: how a proposal becomes a change, or does not.
 *
 * WHAT IS ASSERTED HERE IS MOSTLY THAT NOTHING HAPPENS BY ITSELF. A proposal changes nothing; a
 * decision changes exactly what it says it will, in the same transaction as the row that says who
 * decided it and why; and a decision that cannot be applied does not resolve the question it was
 * answering. Every other product with an approval queue gets one of those three wrong, and the
 * symptom is always the same — a record that says a thing was approved and does not do it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text' },
      { id: 'tags', type: 'list', of: 'text' },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

/**
 * What an accepted pattern installs: an ingest that files a bank's payment alerts into Obligations.
 *
 * AN INGEST AND NOT A RULE. These fixtures filed `rule.*` declarations as a pattern's `ingest`, which is the road
 * `record/test/accept-rule-level.test.ts` measured a colleague taking; `checkBody` now refuses it at filing
 * (`pattern-kind.test.ts`), so each test below keeps its point with the one thing a pattern is for.
 */
const RECEIPTS = (over: Record<string, unknown> = {}) => ({
  id: 'ingest.receipts',
  kind: 'ingest',
  body: {
    ingest: 'receipts',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'paid' }] },
    extract: { what: { text: { between: ['You paid ', ' today'] } } },
    writes: { register: 'obligations', confidence: 'exact' },
    dedupe: ['what'],
    on_conflict: 'skip',
    ...over,
  },
});

type Clockish = ReturnType<typeof fixedClock>;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([OBLIGATIONS])).ok);
  return { k, sql, clock };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

const rowset = (rows: Record<string, unknown>[]) => ({
  question: 'File these three?',
  body_kind: 'rowset' as const,
  body: { register: 'obligations', rows, ingest: 'hsbc-sms' },
});

const options = {
  question: 'Which shape should the register take?',
  body_kind: 'options' as const,
  body: {
    options: [
      { id: 'accept', label: 'Take it', because: 'it matches what we already do' },
      { id: 'no', label: 'Leave it', because: 'nobody has asked for this' },
    ],
    requires_reason: true,
  },
};

/* ── it can be seen ──────────────────────────────────────────────────────── */

test('A PROPOSAL NOBODY CAN SEE IS A PROPOSAL THAT WAS NEVER MADE', async () => {
  /* The record opens suggestions from three places — a delivery that failed eight times, an ingest
     whose pattern may not write, and the weekly analyser — and until the gate existed nothing could
     read one, let alone answer it. */
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(options, 'p_1'));
  assert.equal(made.id, 'SG1');

  const open = value<Record<string, unknown>[]>(k.governance('suggestion'));
  assert.equal(open.length, 1);
  assert.equal(open[0]?.id, 'SG1');
  assert.equal(open[0]?.opened_by, 'p_1');
  assert.deepEqual((open[0]?.body as { options: unknown[] }).options.length, 2, 'the body came back as a string');

  // And the question is on the ledger, which is where a person reads it. In `to_v`, uncapped:
  // `note` is one sentence a human reads in six weeks and is capped at 280, and a question is not
  // a note.
  assert.equal(
    sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest'")?.to_v,
    'Which shape should the register take?',
  );

  // A row that is not there is a value, not a refusal — 45 §13 #10.
  assert.equal(k.governanceRow('suggestion', 'SG99'), null);
  sql.close();
});

test('and a proposal that cannot be applied is refused when it is FILED, not when it is answered', async () => {
  /* The person answering it should not be the one who finds out it was malformed. */
  const { k, sql } = await record();
  assert.equal(refusal(k.propose({ ...options, body: { options: [{ id: 'a', label: 'A', because: 'x' }] } }, 'p_1')).code, 'OUT_OF_BOUNDS');
  assert.equal(refusal(k.propose({ ...rowset([{ what: 'x' }]), body: { register: 'ghosts', rows: [{}] } }, 'p_1')).code, 'REGISTER_UNKNOWN');
  assert.equal(refusal(k.propose({ ...options, question: '  ' }, 'p_1')).code, 'REQUIRED_MISSING');
  assert.equal(refusal(k.propose({ ...options, body_kind: 'vibes' as never }, 'p_1')).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(
    refusal(k.propose(rowset(Array.from({ length: 201 }, () => ({ what: 'x' }))), 'p_1')).code,
    'OUT_OF_BOUNDS',
  );
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0);
  sql.close();
});

/* ── the gate ────────────────────────────────────────────────────────────── */

test('A DECISION IS A ROW, AND THE CHANGE IT AUTHORISED IS IN ITS TRANSACTION', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(rowset([{ what: 'Invoice 41', state: 'open' }, { what: 'Invoice 42', state: 'open' }]), 'p_1'));

  const out = value<{ decision: string; wrote: string[] }>(
    k.decide(made.id, { decide: { option: 'accept', reason: 'both are ours and both are open' } }, 'p_2'),
  );
  assert.equal(out.decision, 'D1');
  assert.equal(out.wrote.length, 2);
  assert.equal(k.count('obligations'), 2);

  // The rows wear the ingest's name, because that is what actually produced them.
  assert.equal(k.get('obligations#1')?.fields.what, 'Invoice 41');
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'create' LIMIT 1")?.actor, 'ingest:hsbc-sms');

  // D1 says what was asked, what was answered, why, by whom.
  const d = sql.one<{ question: string; answer: string; reason: string; decided_by: string }>('SELECT question, answer, reason, decided_by FROM decision')!;
  assert.equal(d.question, 'File these three?');
  assert.equal(d.answer, 'accept');
  assert.equal(d.reason, 'both are ours and both are open');
  assert.equal(d.decided_by, 'p_2');

  // And the suggestion is answered, once.
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'resolved');
  assert.equal(k.governanceRow('suggestion', made.id)?.resolved_as, 'addressed');
  assert.equal(refusal(k.decide(made.id, { decide: { option: 'accept', reason: 'again' } }, 'p_2')).code, 'TRANSITION_ILLEGAL');
  sql.close();
});

test('SOME ROWS OF A ROWSET: the rows picked are written, the rest declined by the same decision, and a bad pick is refused', async () => {
  const { k, sql } = await record();
  const three = rowset([{ what: 'Invoice 41', state: 'open' }, { what: 'Invoice 42', state: 'open' }, { what: 'Invoice 43', state: 'open' }]);
  const made = value<{ id: string }>(k.propose(three, 'p_1'));
  for (const rows of [[], [3], [-1], [0, 0], [1.5]])
    assert.equal(refusal(k.decide(made.id, { decide: { option: 'accept', reason: 'some', rows } }, 'p_2')).at, 'rows', JSON.stringify(rows));
  assert.equal(refusal(k.decide(made.id, { decide: { option: 'reject', reason: 'none', rows: [0] } }, 'p_2')).at, 'rows');
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open');

  const out = value<{ decision: string; wrote: string[] }>(k.decide(made.id, { decide: { option: 'accept', reason: 'only these two', rows: [2, 0] } }, 'p_2'));
  assert.equal(out.wrote.length, 2);
  assert.deepEqual(
    [1, 2].map((n) => k.get(`obligations#${n}`)?.fields.what),
    ['Invoice 41', 'Invoice 43'],
  );
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'resolved');
  const said = sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'decide'")!;
  assert.deepEqual(JSON.parse(said.to_v).rows, [0, 2]);

  const options_ = value<{ id: string }>(k.propose(options, 'p_1'));
  assert.equal(refusal(k.decide(options_.id, { decide: { option: 'accept', reason: 'x', rows: [0] } }, 'p_2')).at, 'rows');
  sql.close();
});

test('A DECISION ALWAYS CARRIES A SENTENCE, and one pressed without a reason says that none was given', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(options, 'p_1'));
  assert.equal(refusal(k.decide(made.id, { decide: { option: '', reason: 'because' } }, 'p_2')).at, 'option');

  // And the answer has to be one of the options that were offered.
  assert.equal(refusal(k.decide(made.id, { decide: { option: 'maybe', reason: 'because' } }, 'p_2')).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open');
  assert.equal(sql.all('SELECT 1 FROM decision').length, 0);

  // A blank reason is one press: the decision is written, and its sentence says nobody gave one.
  const out = value<{ decision: string }>(k.decide(made.id, { decide: { option: 'accept', reason: '  ' } }, 'p_2'));
  assert.equal(sql.one<{ reason: string }>('SELECT reason FROM decision WHERE id = ?', out.decision)?.reason, 'Answered in one press, with no reason given.');
  sql.close();
});

test('A LIGHT QUESTION A RULE OR SLASH ASKED IS ANSWERED IN ONE PRESS, for the option’s own reason', async () => {
  const { k, sql } = await record();
  for (const opener of ['rule:x', 'slash']) {
    const made = value<{ id: string }>(k.propose(options, opener));
    const out = value<{ decision: string }>(k.decide(made.id, { decide: { option: 'accept', reason: '' } }, 'p_2'));
    assert.equal(
      sql.one<{ reason: string }>('SELECT reason FROM decision WHERE id = ?', out.decision)?.reason,
      "Answered in one press, for the option's own reason: it matches what we already do",
      opener,
    );
  }
  sql.close();
});

test('THE SAME LIGHT QUESTION, OPENED BY A PERSON, IS ONE PRESS TOO, and is not decided for the option’s own reason', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(options, 'p_1'));
  const out = value<{ decision: string }>(k.decide(made.id, { decide: { option: 'accept', reason: '' } }, 'p_2'));
  assert.equal(sql.one<{ reason: string }>('SELECT reason FROM decision WHERE id = ?', out.decision)?.reason, 'Answered in one press, with no reason given.');
  sql.close();
});

/** A pack update's question as the record files it: keeping changes nothing, and taking cannot be put back. */
const keepOrTake = {
  question: 'Take the update’s page, or keep yours?',
  body_kind: 'options' as const,
  body: {
    options: [
      { id: 'keep', label: 'Keep my page', because: 'nothing changes' },
      { id: 'take', label: 'Take the update’s page', because: 'it is the newer one', hard: true },
    ],
  },
};

test('ONE HARD OPTION BESIDE A SAFE ONE: the question is a call, the hard option says so on its own line, and picking it is never the light press', async () => {
  const { k, sql } = await record();
  const reasonOf = (decision: string) => sql.one<{ reason: string }>('SELECT reason FROM decision WHERE id = ?', decision)?.reason;

  /* THE LIST SAYS THE QUESTION'S BAND AND EACH OPTION'S OWN, by the option's id. */
  const asked = value<{ id: string }>(k.propose(keepOrTake, 'slash'));
  const row = value<Record<string, unknown>[]>(k.governance('suggestion')).find((r) => r.id === asked.id)!;
  assert.equal(row.cost, 'call');
  assert.deepEqual(row.option_costs, [{ id: 'keep', cost: 'call' }, { id: 'take', cost: 'undo' }]);
  /* A question that is not one of options says no option's band. */
  const other = value<{ id: string }>(k.propose(rowset([{ what: 'x', state: 'open' }]), 'p_1'));
  assert.equal('option_costs' in value<Record<string, unknown>[]>(k.governance('suggestion')).find((r) => r.id === other.id)!, false);

  /* THE QUEUE MARKS THE ONE OPTION, and the safe one carries no mark at all. */
  const drawn = k.block({ kind: 'queue', source: 'governance.open', empty: 'Nothing.' }) as { queue?: { id: string; cost: string; options: { key: string; hard?: true }[] }[] };
  const card = drawn.queue?.find((q) => q.id === asked.id);
  assert.equal(card?.cost, 'call');
  assert.deepEqual(card?.options.map((o) => [o.key, o.hard ?? false]), [['keep', false], ['take', true]]);

  /* THE SAFE PICK IS THE LIGHT PRESS A RULE'S OR SLASH'S QUESTION ALLOWS, for the option's own reason. */
  const kept = value<{ decision: string }>(k.decide(asked.id, { decide: { option: 'keep', reason: '' } }, 'p_2'));
  assert.equal(reasonOf(kept.decision), "Answered in one press, for the option's own reason: nothing changes");

  /* THE HARD PICK IS NOT: nobody gave a reason, and the record does not lend it the option's, nor say it changed nothing else. */
  const again = value<{ id: string }>(k.propose({ ...keepOrTake, question: 'And this one?' }, 'slash'));
  const took = value<{ decision: string }>(k.decide(again.id, { decide: { option: 'take', reason: '' } }, 'p_2'));
  assert.equal(reasonOf(took.decision), 'Answered in one press, with no reason given.');
  sql.close();
});

test('ALL THE ROWS OR NONE: a rowset with one bad row writes nothing at all', async () => {
  // Half a rowset accepted is a decision whose answer is not true of the record.
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(rowset([{ what: 'good', state: 'open' }, { state: 'open' }]), 'p_1'));

  assert.equal(refusal(k.decide(made.id, { decide: { option: 'accept', reason: 'go on' } }, 'p_2')).code, 'REQUIRED_MISSING');
  assert.equal(k.count('obligations'), 0);
  assert.equal(sql.all('SELECT 1 FROM decision').length, 0);
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open', 'the question was answered and nothing happened');
  sql.close();
});

test('NO IS AN ANSWER, and `incorrect` is what the brake learns from', async () => {
  const { k, sql } = await record();
  const one = value<{ id: string }>(k.propose(options, 'p_1'));
  value(k.decide(one.id, { resolved_as: 'wont-fix', reason: 'we do not do this' }, 'p_2'));
  assert.equal(k.governanceRow('suggestion', one.id)?.resolved_as, 'wont-fix');
  assert.equal(sql.all("SELECT 1 FROM observation WHERE kind = 'suggestion.incorrect'").length, 0);

  const two = value<{ id: string }>(k.propose(options, 'p_1'));
  value(k.decide(two.id, { resolved_as: 'incorrect' }, 'p_2'));
  assert.equal(
    sql.one<{ subject: string; n: number }>("SELECT subject, n FROM observation WHERE kind = 'suggestion.incorrect'")?.subject,
    'options',
  );
  sql.close();
});

test('THE THIRD VERB: deferring is not answering, and it writes no event', async () => {
  /* A gate with only yes and no is a gate people clear by dismissing what they meant to think
     about. "Not now, ask me on the ninth" is a thing that happened to the reader. */
  const { k, sql, clock } = await record();
  const made = value<{ id: string }>(k.propose(options, 'p_1'));
  const until = new Date(NOW + 4 * DAY).toISOString();

  value(k.decide(made.id, { defer: { until, why: 'after the quarter closes' } }, 'p_2'));
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open');
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind IN ('decide','resolve')").length, 0);
  assert.equal(sql.all('SELECT 1 FROM decision').length, 0);

  // It is out of the open queue until its day comes, and then it is back in it.
  assert.deepEqual(value<unknown[]>(k.governance('suggestion')), []);
  clock.set(NOW + 5 * DAY);
  assert.equal(value<unknown[]>(k.governance('suggestion')).length, 1);

  // And deferring says when and why, or it is a dismissal wearing a nicer word.
  const two = value<{ id: string }>(k.propose(options, 'p_1'));
  assert.equal(refusal(k.decide(two.id, { defer: { until, why: '' } }, 'p_2')).code, 'REQUIRED_MISSING');
  sql.close();
});

test('AND AN ACCEPTED PATTERN INSTALLS, which is the loop the whole product is for', async () => {
  /* Three unmatched payloads earn a draft, a draft becomes a proposal, a person approves it once,
     and from then on the shape is deterministic and free. This is the last link of that chain. */
  const { k, sql } = await record();
  const made = value<{ id: string }>(
    k.propose({ question: 'File these alerts?', body_kind: 'pattern', body: { ingest: RECEIPTS(), samples: ['r1', 'r2', 'r3'] } }, 'p_1'),
  );

  const out = value<{ install: { id: string } }>(k.decide(made.id, { decide: { option: 'accept', reason: 'it is what we already do by hand' } }, 'p_2'));
  assert.equal(out.install.id, 'ingest.receipts', 'the gate did not hand back the declaration to install');

  // The kernel hands it back rather than installing it, because installing is asynchronous — and a
  // decision that resolved before its change landed would be a lie.
  assert.ok((await k.install([out.install as never])).ok);
  // And the next alert of that shape is filed by the pattern, with nobody asked.
  value(k.arrive({ channel: 'email', headers: { From: 'bank@example.com' }, body: 'You paid Invoice 9 today.', sha256: 'm1' }));
  assert.equal(k.get('obligations#1')?.fields.what, 'Invoice 9');
  sql.close();
});

test('and one that will not install puts the question back', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(
    k.propose(
      {
        question: 'File these alerts?',
        body_kind: 'pattern',
        /* FILED, BECAUSE FILING ASKS WHAT KIND IT IS AND NOT WHETHER IT INSTALLS. `install` asks that, and an arrival holds
           no `colour` to match on, as Obligations held none for the `when: 'colour is red'` of the rule this replaced. */
        body: { ingest: RECEIPTS({ match: { all: [{ field: 'colour', is: 'red' }] } }), samples: ['r1'] },
      },
      'p_1',
    ),
  );
  const out = value<{ suggestion: string; install: unknown }>(k.decide(made.id, { decide: { option: 'accept', reason: 'go on' } }, 'p_2'));
  assert.ok(out.install);
  assert.equal((await k.install([out.install as never])).ok, false, 'an ingest matching on nothing an arrival holds installed');

  k.reopen(out.suggestion);
  assert.equal(k.governanceRow('suggestion', out.suggestion)?.status, 'open');
  assert.equal(k.governanceRow('suggestion', out.suggestion)?.resolved_as, null);
  sql.close();
});

/* ── five ways the gate answered without reading ────────────────── */

test('A BODY THIS RECORD CANNOT READ IS NOT A QUESTION IT CAN ANSWER', async () => {
  /* It used to resolve as `addressed` with a `D<n>` behind it and nothing written — the gate saying
     yes to something it had not read. */
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(rowset([{ what: 'x', state: 'open' }]), 'p_1'));
  sql.exec("UPDATE suggestion SET body = '{not json' WHERE id = ?", made.id);

  assert.equal(refusal(k.decide(made.id, { decide: { option: 'accept', reason: 'go on' } }, 'p_2')).code, 'VALUE_MALFORMED');
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open');
  assert.equal(sql.all('SELECT 1 FROM decision').length, 0);

  // And a row that is not an object is refused when it is FILED, not by throwing at the gate.
  assert.equal(refusal(k.propose(rowset([null as never]), 'p_1')).at, 'body.rows');
  assert.equal(refusal(k.propose(rowset(['a string' as never]), 'p_1')).at, 'body.rows');
  sql.close();
});

test('AND `Accept` IS NOT `accept`: a non-options body takes one of two words', async () => {
  /* Anything else fell past the branch that applies it and resolved the question having done
     nothing — the gate silently answering yes and applying none of it. */
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(rowset([{ what: 'Invoice 41', state: 'open' }]), 'p_1'));

  const tried = refusal(k.decide(made.id, { decide: { option: 'Accept', reason: 'go on' } }, 'p_2'));
  assert.equal(tried.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(tried.allowed, ['accept', 'reject']);
  assert.equal(k.count('obligations'), 0);
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open');

  // And `reject` is an answer: recorded, applied to nothing.
  const out = value<{ decision: string; wrote: string[] }>(k.decide(made.id, { decide: { option: 'reject', reason: 'not ours' } }, 'p_2'));
  assert.equal(out.decision, 'D1');
  assert.deepEqual(out.wrote, []);
  assert.equal(k.count('obligations'), 0);
  sql.close();
});

test('and deferring says a DATE, or the question leaves the queue for ever', async () => {
  /* `defer_until` is compared as a string against an instant, so `next Tuesday` sorts after every
     date there will ever be — gone from the open queue while the gate reports it as open. */
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(options, 'p_1'));
  assert.equal(refusal(k.decide(made.id, { defer: { until: 'next Tuesday', why: 'busy' } }, 'p_2')).at, 'until');
  assert.equal(value<unknown[]>(k.governance('suggestion')).length, 1, 'the question left the queue');

  /* AND PARSING IS NOT THE CHECK. Both of these parse and neither sorts: one lands after every date
     there will ever be, so the question is gone for good while the gate reports it open; the other
     lands before today, so the deferral is a silent no-op and the question never left. */
  for (const until of ['Oct 1 2026', '10/01/2026', '2026/10/01'])
    assert.equal(refusal(k.decide(made.id, { defer: { until, why: 'busy' } }, 'p_2')).at, 'until', until);

  // The shape that does sort is accepted, and it is the one the refusal names.
  value(k.decide(made.id, { defer: { until: '2027-01-01', why: 'after the quarter closes' } }, 'p_2'));
  assert.equal(value<unknown[]>(k.governance('suggestion')).length, 0);
  sql.close();
});

test('REOPEN IS FOR THE ONE CASE IT EXISTS FOR, and does not apply a decision twice', async () => {
  /* An accepted `rowset` wrote its rows inside the gate's transaction. Reopening it let a decision
     made once be applied twice, and the second copy of forty rows is not a thing anybody undoes by
     hand. */
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(rowset([{ what: 'Invoice 41', state: 'open' }]), 'p_1'));
  value(k.decide(made.id, { decide: { option: 'accept', reason: 'ours' } }, 'p_2'));
  assert.equal(k.count('obligations'), 1);

  assert.equal(refusal(k.reopen(made.id)).at, 'body_kind');
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'resolved');
  assert.equal(k.count('obligations'), 1, 'a decision was applied twice');

  // Nor does a `wont-fix` come back, which would resurrect a question somebody answered.
  const two = value<{ id: string }>(k.propose(options, 'p_1'));
  value(k.decide(two.id, { resolved_as: 'wont-fix', reason: 'no' }, 'p_2'));
  assert.equal(refusal(k.reopen(two.id)).code, 'TRANSITION_ILLEGAL');
  assert.equal(refusal(k.reopen('SG99')).code, 'OUT_OF_BOUNDS');
  sql.close();
});

test('and a reopened pattern comes back visible, deferral and all', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(
    k.propose({ question: 'Turn it on?', body_kind: 'pattern', body: { ingest: RECEIPTS(), samples: ['r1'] } }, 'p_1'),
  );
  value(k.decide(made.id, { defer: { until: new Date(NOW + 400 * DAY).toISOString(), why: 'next year' } }, 'p_2'));
  value(k.decide(made.id, { decide: { option: 'accept', reason: 'go on' } }, 'p_2'));
  value(k.reopen(made.id));

  const row = k.governanceRow('suggestion', made.id)!;
  assert.equal(row.status, 'open');
  assert.equal(row.defer_until, null, 'it came back invisible');
  assert.equal(value<unknown[]>(k.governance('suggestion')).length, 1);
  sql.close();
});

/* ── what the record's permanent answer says ─────────────────────────────── */

test('A LONG QUESTION SURVIVES BEING ASKED', async () => {
  /* The `suggestion` table has no question column, so the `suggest` event is the only copy — and it
     was written into `note`, which is capped at 280 by the rule that a note is one sentence a human
     reads in six weeks. A question is not a note. So a long one was silently cut and the cut version
     became the immutable `decision.question`: the record's permanent answer to "what was asked",
     wrong, with the original nowhere. */
  const { k, sql } = await record();
  const asked = `Should we ${'raise the retainer and re-paper the terms '.repeat(12)}before the quarter closes?`;
  assert.ok(asked.length > 280);

  const made = value<{ id: string }>(k.propose({ ...options, question: asked }, 'p_1'));
  value(k.decide(made.id, { decide: { option: 'accept', reason: 'agreed' } }, 'p_2'));

  const decision = sql.one<{ question: string }>('SELECT question FROM decision LIMIT 1');
  assert.equal(decision?.question, asked, 'the record remembers a shorter question than the one it asked');
  sql.close();
});

test('and it is written where every consumer is told to look', async () => {
  // `to_v`, per 45 §5.4. `note` is for the sentence, and there is not one on a `suggest`.
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(options, 'p_1'));
  const row = sql.one<{ to_v: string | null; note: string | null }>(
    "SELECT to_v, note FROM event WHERE kind = 'suggest' AND target = ?",
    `suggestion:${made.id}`,
  );
  assert.equal(row?.to_v, options.question);
  assert.equal(row?.note, null);
  sql.close();
});

test('REOPENING LEAVES A TRACE, because a decision is a row and not a side effect', async () => {
  /* A resolved row went back to open with nothing between the `resolve` event and the reopened
     state, so anybody reading the log saw a suggestion both resolved and open with no account of
     how. The decision stands — somebody did answer — and this is not an undo of it. */
  const { k, sql } = await record();
  const made = value<{ id: string }>(
    k.propose({ question: 'File these alerts?', body_kind: 'pattern', body: { ingest: RECEIPTS(), samples: ['r1'] } }, 'p_1'),
  );
  value(k.decide(made.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_2'));
  value(k.reopen(made.id, 'the declaration named a field that is not there'));

  const back = sql.all<{ to_v: string | null; note: string | null }>(
    "SELECT to_v, note FROM event WHERE kind = 'suggest' AND target = ? ORDER BY rowid",
    `suggestion:${made.id}`,
  );
  assert.equal(back.length, 2, 'a suggestion came back with nothing in the log to say so');
  assert.equal(back[1]?.to_v, 'reopened');
  assert.match(back[1]?.note ?? '', /named a field that is not there/);
  // And the decision it was reopened from is untouched.
  assert.equal(sql.all('SELECT 1 FROM decision').length, 1);
  sql.close();
});

test('A PATTERN ARRIVES WITH THE ARRIVALS IT WAS DRAWN FROM', async () => {
  /* 45 §5.4 puts `samples` in the body and 07 §4's review counts hits against them — the
     `3/3 · 2/3 · 0/3` a reviewer reads before accepting. Without them somebody is asked to approve a
     declaration with nothing to check it against, which is the shape of proposal that gets approved
     because reading it is the harder option. */
  const { k, sql } = await record();
  const decl = RECEIPTS();

  const bare = refusal(k.propose({ question: 'Turn this on?', body_kind: 'pattern', body: { ingest: decl } }, 'p_1'));
  assert.equal(bare.code, 'REQUIRED_MISSING');
  assert.equal(bare.at, 'body.samples');
  assert.equal(refusal(k.propose({ question: 'x?', body_kind: 'pattern', body: { ingest: decl, samples: [] } }, 'p_1')).at, 'body.samples');

  value(k.propose({ question: 'Turn this on?', body_kind: 'pattern', body: { ingest: decl, samples: ['r1', 'r2', 'r3'] } }, 'p_1'));
  sql.close();
});

/* ── the half of the loop that grades it ────────────────────────────────── */

/** A `change` that promises something falsifiable about the record's own rows. */
const change = (prediction?: unknown) => ({
  question: 'Should the direction field admit `part`?',
  body_kind: 'change' as const,
  body: {
    declaration_id: 'register.obligations',
    from: { values: ['owed_to_me', 'owed_by_me'] },
    to: { ...OBLIGATIONS, body: { ...(OBLIGATIONS.body as object), name: 'Obligations owed' } },
    ...(prediction === undefined ? {} : { prediction }),
  },
});

const promise = {
  claim: 'refused writes to direction fall to zero',
  measure: { source: 'register.obligations', where: { field: 'state', is: 'open' }, value: { count: 'id' } },
  target: { lte: 0 },
  window: '30d',
  unit: 'count',
};

test('ACCEPTING A CHANGE WRITES ITS PREDICTION, which is what makes the brake reachable', async () => {
  /* `scorePrediction`, the `score` schedule handler and the brake that reads twenty scored rows were
     all built, tested and unreachable: the table they work on had no writer. A loop that proposes
     and is never graded is the exact failure 24 §4.6 is titled after. */
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));

  const made = value<{ id: string }>(k.propose(change(promise), 'p_1'));
  value(k.decide(made.id, { decide: { option: 'accept', reason: 'the third direction is real' } }, 'p_2'));

  const pred = sql.one<{ baseline: number; target: string; window: string; on_miss: string; scored_at: string | null }>(
    'SELECT baseline, target, window, on_miss, scored_at FROM prediction',
  );
  assert.ok(pred, 'nothing wrote a prediction, so nothing can ever grade this change');
  assert.equal(pred.baseline, 1, 'the baseline was not frozen from what the record held at acceptance');
  assert.equal(pred.window, '30d');
  assert.equal(pred.on_miss, 'suggest');
  assert.equal(pred.scored_at, null);

  /* AND `score_at` IS A ROW IN `schedule` — 24 §4.6's own note, and the reason this costs no new
     infrastructure: the single alarm already drains hundreds of due rows. */
  const job = sql.one<{ kind: string; key: string }>("SELECT kind, key FROM schedule WHERE kind = 'score'");
  assert.ok(job, 'the prediction will never be scored, because nothing asked for it to be');
  sql.close();
});

test('and a prediction the record already meets is refused, which is the reward-hacking control', async () => {
  /* Without it the cheapest way for the loop to look useful is to predict things that are already
     true, and that is a local optimum it will find. */
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(change({ ...promise, target: { lte: 5 } }), 'p_1'));
  const tried = refusal(k.decide(made.id, { decide: { option: 'accept', reason: 'sure' } }, 'p_2'));
  assert.equal(tried.code, 'OUT_OF_BOUNDS');
  assert.match(tried.fix, /already true/);
  assert.equal(sql.all('SELECT 1 FROM prediction').length, 0);
  // And the decision did not happen either: the gate said no, in one transaction.
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open');
  sql.close();
});

test('AN UNMEASURABLE CLAIM IS REFUSED WHERE IT IS FILED, not where it is answered', async () => {
  /* `PREDICTION_UNMEASURABLE` kills the entire class of improvements that are vibes: a claim with no
     source, no value to read and no bound cannot be wrong, and a loop whose proposals cannot be
     wrong learns nothing from being run. It is checked at filing for the reason every other body is:
     the person answering should not be the one who finds out it was malformed. */
  const { k, sql } = await record();
  const vibes = [
    { ...promise, claim: '' },
    { ...promise, measure: { value: { count: 'id' } } },
    { ...promise, target: {} },
    { ...promise, window: 'soon' },
  ];
  for (const p of vibes) {
    const out = refusal(k.propose(change(p), 'p_1'));
    assert.equal(out.code, 'PREDICTION_UNMEASURABLE', JSON.stringify(p).slice(0, 60));
  }
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0);
  sql.close();
});

test('and a change with no prediction is still a change a person may make', async () => {
  // A `change` can be proposed by somebody who is simply changing something. The prediction is what
  // the LOOP owes, not what every author does.
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(change(), 'p_1'));
  value(k.decide(made.id, { decide: { option: 'accept', reason: 'we talked about it' } }, 'p_2'));
  assert.equal(sql.all('SELECT 1 FROM prediction').length, 0);
  sql.close();
});

test('AND THE PREDICTION IT WRITES IS ONE THE SCORER CAN READ', async () => {
  /* The writer stored `target` as JSON and `scorePrediction` parses `<=0`: `Number('{"lte":0}')` is
     NaN, so every prediction came back VALUE_MALFORMED at scoring time, never got a `scored_at`, and
     walked the retry ladder to dead. The brake needs twenty SCORED rows, so the loop still could not
     grade itself — the writer had moved and nothing else. This walks the whole loop. */
  const { k, sql, clock } = await record();
  value(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));

  const made = value<{ id: string }>(k.propose(change(promise), 'p_1'));
  value(k.decide(made.id, { decide: { option: 'accept', reason: 'the third direction is real' } }, 'p_2'));

  const id = sql.one<{ id: string }>('SELECT id FROM prediction')?.id;
  assert.ok(id);

  clock.advance(31 * DAY);
  const out = await k.drain();
  assert.equal(out.failed, 0, 'the score job failed, so nothing is ever graded');
  /* MORE THAN ONE ROW COMES DUE. Installing a declaration arms the weekly analysis too, and at 31
     days both are ready — what this test is about is that the score row RAN, not how many rows the
     record happened to have. */
  assert.ok(out.done >= 1);

  const scored = sql.one<{ scored_at: string | null; observed: number; met: number }>(
    'SELECT scored_at, observed, met FROM prediction WHERE id = ?',
    id,
  );
  assert.ok(scored?.scored_at, 'the prediction was never scored, so the brake can never engage');
  assert.equal(scored.observed, 1, 'one open obligation, which is not the zero it predicted');
  assert.equal(scored.met, 0);

  /* AND A MISS COMES BACK TO A PERSON. `on_miss` was read out of the row and never used: the column
     exists, the default is `suggest`, 24 §4.6 writes the sentence out, and the score was written
     while nothing reached anybody. A loop that measures and does not report has measured for its own
     benefit. */
  const asked = sql.one<{ id: string; opened_by: string }>("SELECT id, opened_by FROM suggestion WHERE opened_by = 'system'");
  assert.ok(asked, 'the prediction missed and nobody was told');
  const question = sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${asked.id}`);
  assert.match(question?.to_v ?? '', /Supersede that decision, or say why you are keeping it/);
  assert.match(question?.to_v ?? '', /observed 1/);
  sql.close();
});

/* ── a rowset that changes rows that exist ──────────────────────────────── */

/** A rowset of `{ at, version, patch }` rows, and any creates beside them. */
const updates = (rows: Record<string, unknown>[], register = 'obligations') => ({
  question: 'Change these?',
  body_kind: 'rowset' as const,
  body: { register, rows },
});

test('AN ACCEPTED UPDATE CHANGES THE ROW, as the person who decided, beside the rows it creates', async () => {
  const { k, sql } = await record();
  const row = value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  const made = value<{ id: string }>(
    k.propose(
      {
        question: 'HSBC paid Invoice 41, and Invoice 42 arrived?',
        body_kind: 'rowset',
        body: {
          register: 'obligations',
          ingest: 'hsbc-sms',
          rows: [{ at: 'obligations#1', version: row.version, patch: { party: 'HSBC', state: 'paid' } }, { what: 'Invoice 42' }],
        },
      },
      'p_1',
    ),
  );
  assert.equal(k.get(row.id)?.fields.party, undefined, 'a proposal changed the row before anybody answered it');

  const out = value<{ decision: string; wrote: string[] }>(k.decide(made.id, { decide: { option: 'accept', reason: 'HSBC paid it' } }, 'p_2'));
  assert.equal(out.wrote.length, 2);
  assert.equal(out.wrote[0], row.id);

  const after = k.get(row.id)!;
  assert.equal(after.fields.party, 'HSBC');
  assert.equal(after.fields.state, 'paid');
  assert.equal(after.version, row.version + 1);

  /* The update is the decider's; the row created beside it keeps the ingest's name. */
  const events = sql.all<{ kind: string; field: string | null; actor: string; batch: string | null }>(
    'SELECT kind, field, actor, batch FROM event WHERE target = ? AND kind <> ? ORDER BY rowid',
    `entry:${row.id}`,
    'create',
  );
  assert.deepEqual(
    events.map((e) => `${e.kind} ${e.field} by ${e.actor}`),
    ['edit party by p_2', 'edit state by p_2'],
  );
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'create' AND target = ?", `entry:${out.wrote[1]}`)?.actor, 'ingest:hsbc-sms');
  sql.close();
});

test('A FIELD SOMEBODY CHANGED SINCE SETTLES THE ROWSET IN A PLAIN LINE, and not one row of it lands', async () => {
  const { k, sql } = await record();
  const one = value<Entry>(k.create('obligations', { what: 'Invoice 41' }, { actor: 'p_1' }));
  const two = value<Entry>(k.create('obligations', { what: 'Invoice 42' }, { actor: 'p_1' }));
  const made = value<{ id: string }>(
    k.propose(
      updates([
        { at: 'obligations#1', version: one.version, patch: { party: 'HSBC' } },
        { at: two.id, version: two.version, patch: { party: 'Monzo' } },
      ]),
      'p_1',
    ),
  );

  /* Somebody sets the second row's party another way after the proposal was drawn. An edit to a field the proposal
     does not change is taken onto the fresh row instead (`rowset-moved.test.ts`). */
  value(k.update('obligations', two.id, { party: 'Barclays' }, { actor: 'p_3', version: two.version }));

  const out = value<{ decision: string | null; status: string; settled?: string }>(k.decide(made.id, { decide: { option: 'accept', reason: 'both are right' } }, 'p_2'));
  assert.equal(out.decision, null);
  assert.equal(out.status, 'resolved');
  assert.match(out.settled ?? '', /^The party of Invoice 42 changed after this was asked/u);

  assert.equal(k.get(one.id)?.fields.party, undefined, 'half a rowset landed');
  assert.equal(k.get(one.id)?.version, one.version);
  assert.equal(k.get(two.id)?.fields.party, 'Barclays');
  assert.equal(sql.all("SELECT 1 FROM event WHERE actor = 'p_2'").length, 0);
  assert.equal(sql.all('SELECT 1 FROM decision').length, 0);
  sql.close();
});

test('AN UPDATE ROW IS CHECKED WHEN IT IS FILED: a live row, its version, a patch, and nothing else', async () => {
  const { k, sql } = await record();
  const row = value<Entry>(k.create('obligations', { what: 'Invoice 41' }, { actor: 'p_1' }));
  const filed = (r: Record<string, unknown>[]) => {
    const x = refusal(k.propose(updates(r), 'p_1'));
    return `${x.code} at ${x.at}`;
  };

  assert.equal(filed([{ at: 'obligations#9', version: 1, patch: { party: 'x' } }]), 'VALUE_MALFORMED at body.rows[0].at');
  assert.equal(filed([{ what: 'new' }, { at: 'obligations#1', patch: { party: 'x' } }]), 'REQUIRED_MISSING at body.rows[1].version');
  assert.equal(filed([{ at: 'obligations#1', version: 1.5, patch: { party: 'x' } }]), 'VALUE_MALFORMED at body.rows[0].version');
  assert.equal(filed([{ at: 'obligations#1', version: 1, patch: {} }]), 'VALUE_MALFORMED at body.rows[0].patch');
  assert.equal(filed([{ at: 'obligations#1', version: 1, patch: { party: 'x' }, what: 'y' }]), 'FIELD_UNKNOWN at body.rows[0].what');
  assert.equal(
    filed([
      { at: 'obligations#1', version: 1, patch: { party: 'x' } },
      { at: row.id, version: 1, patch: { what: 'y' } },
    ]),
    'VALUE_MALFORMED at body.rows[1].at',
    'one row updated twice can never be accepted',
  );

  value(k.update('obligations', row.id, { deleted_at: true }, { actor: 'p_1' }));
  assert.equal(filed([{ at: 'obligations#1', version: 2, patch: { party: 'x' } }]), 'VALUE_MALFORMED at body.rows[0].at');
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0);
  sql.close();
});

/* ── what only a decision changes ────────────────────────────────────────── */

const LEARNINGS: Declaration = {
  id: 'register.learnings',
  kind: 'register',
  body: {
    id: 'learnings',
    name: 'Learnings',
    title: 'lesson',
    state: 'state',
    seq_prefix: 'LN',
    done: ['superseded', 'reverted'],
    fields: [
      { id: 'lesson', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
      { id: 'why', type: 'text' },
      {
        id: 'state',
        type: 'enum',
        values: ['active', 'superseded', 'reverted'],
        default: 'active',
        transitions: {
          active: { to: ['superseded', 'reverted'], requires: ['why'] },
          superseded: { to: ['active'], by: 'decide' },
          reverted: { to: ['active'], by: 'decide' },
        },
      },
    ],
  } as never,
};

const SKILLS: Declaration = {
  id: 'register.skills',
  kind: 'register',
  body: {
    id: 'skills',
    name: 'Skills',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person', same: 'nearer' } },
      { id: 'body', type: 'document', required: true, by: 'decide' },
      { id: 'rev', type: 'int', default: 1, required: true, by: 'decide' },
      { id: 'because', type: 'list', of: 'ref', to: 'learnings' },
    ],
  } as never,
};

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

const AGENT: WriteContext = {
  actor: 'p_owner',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id: 'cc-1', host: 'h', repo: 'braindog' },
};

async function agentsRecord(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([THINGS, LEARNINGS, SKILLS]));
  value(k.create('things', { name: 'BrainDog', repos: ['braindog'] }, { actor: 'p_owner' }));
  return { k, sql };
}

test('A FIELD AND A MOVE `by: decide` CHANGE THROUGH AN ACCEPTED PROPOSAL, and through nothing else', async () => {
  const { k, sql } = await agentsRecord();
  const skill = value<Entry>(k.create('skills', { name: 'review-pr', body: '# Review\nRead the diff first.' }, AGENT));
  const lesson = value<Entry>(k.create('learnings', { lesson: 'Read the tests before the diff.' }, AGENT));
  const gone = value<Entry>(
    k.update('learnings', lesson.id, { state: 'superseded', why: 'A later learning says the same thing better.' }, { actor: 'p_owner' }),
  );

  /* Directly, the owner and the agent are both refused. */
  assert.equal(refusal(k.update('skills', skill.id, { rev: 2 }, { actor: 'p_owner' })).code, 'FORBIDDEN');
  assert.equal(refusal(k.update('learnings', lesson.id, { state: 'active' }, AGENT)).code, 'FORBIDDEN');

  const made = value<{ id: string }>(
    k.propose(
      {
        question: 'Move review-pr to version 2?',
        body_kind: 'rowset',
        body: { register: 'skills', rows: [{ at: 'skills#1', version: skill.version, patch: { rev: 2 } }] },
      },
      AGENT,
    ),
  );
  const back = value<{ id: string }>(
    k.propose(
      {
        question: 'Bring LN1 back?',
        body_kind: 'rowset',
        body: { register: 'learnings', rows: [{ at: 'LN1', version: gone.version, patch: { state: 'active' } }] },
      },
      AGENT,
    ),
  );

  value(k.decide(made.id, { decide: { option: 'accept', reason: 'the new text is right' } }, 'p_owner'));
  value(k.decide(back.id, { decide: { option: 'accept', reason: 'it holds again' } }, 'p_owner'));
  assert.equal(k.get(skill.id)?.fields.rev, 2);
  assert.equal(k.get(lesson.id)?.state, 'active');
  sql.close();
});

test('A SKILL CHANGES VERSION END TO END: the agent proposes, the owner accepts, and history keeps both texts', async () => {
  const { k, sql } = await agentsRecord();
  const ln1 = value<Entry>(k.create('learnings', { lesson: 'Run the gates after the build, never beside it.' }, AGENT));
  const ln2 = value<Entry>(k.create('learnings', { lesson: 'A browser gate needs a build that is not moving.' }, AGENT));
  const before = '# Gates\nRun every gate.';
  const after = '# Gates\nBuild first, then run the gates one at a time.';
  const skill = value<Entry>(k.create('skills', { name: 'gates', body: before }, AGENT));
  assert.equal(skill.fields.project, k.get('things#1')?.id, 'the skill did not start in the run’s project');

  /* The agent cannot write the text itself. */
  assert.equal(refusal(k.update('skills', skill.id, { body: after }, AGENT)).at, 'body');

  const mark = Number(sql.one<{ n: number }>('SELECT MAX(rowid) AS n FROM event')?.n);
  const made = value<{ id: string }>(
    k.propose(
      {
        question: 'Change the gates skill to build first?',
        body_kind: 'rowset',
        body: {
          register: 'skills',
          rows: [{ at: 'skills#1', version: skill.version, patch: { body: after, rev: 2, because: ['learnings#1', 'learnings#2'] } }],
        },
      },
      AGENT,
    ),
  );
  const out = value<{ decision: string; wrote: string[] }>(k.decide(made.id, { decide: { option: 'accept', reason: 'LN1 and LN2 both say so' } }, 'p_owner'));
  assert.deepEqual(out.wrote, [skill.id]);

  const now = k.get(skill.id)!;
  assert.equal(now.fields.body, after);
  assert.equal(now.fields.rev, 2);
  assert.deepEqual(now.fields.because, [ln1.id, ln2.id]);
  assert.equal(now.version, skill.version + 1);

  const trail = sql.all<{ actor: string; kind: string; field: string | null; target_kind: string; from_v: string | null; to_v: string | null }>(
    'SELECT actor, kind, field, target_kind, from_v, to_v FROM event WHERE rowid > ? ORDER BY rowid',
    mark,
  );
  assert.deepEqual(
    trail.map((e) => `${e.actor} ${e.kind} ${e.target_kind}${e.field ? ` ${e.field}` : ''}`),
    [
      `S1 suggest suggestion`,
      `p_owner edit entry body`,
      `p_owner edit entry rev`,
      `p_owner edit entry because`,
      `p_owner decide decision`,
      `p_owner resolve suggestion`,
    ],
  );
  const body = trail.find((e) => e.field === 'body')!;
  assert.equal(JSON.parse(body.from_v!), before);
  assert.equal(JSON.parse(body.to_v!), after);
  sql.close();
});

test('and a target the scorer cannot read is refused at filing', async () => {
  // `lt`, `gt` and `is` used to file cleanly and be unscoreable — and an unrecognised key silently
  // turned off the already-true check as well, because `met()` answered `false` for one.
  const { k, sql } = await record();
  for (const target of [{ lt: 3 }, { gt: 3 }, { is: 0 }, { below: 5 }, { lte: 1, gte: 0 }]) {
    const out = refusal(k.propose(change({ ...promise, target: target as never }), 'p_1'));
    assert.equal(out.at, 'body.prediction.target', JSON.stringify(target));
  }
  sql.close();
});

test('A DECISION NAMES THE QUESTION IT SETTLED, and the question names its decision, even decided in the same instant', async () => {
  const { k, sql } = await record();
  const first = value<{ id: string }>(k.propose({ ...options, question: 'Same words?' }, 'p_1'));
  const second = value<{ id: string }>(k.propose({ ...options, question: 'Same words?' }, 'p_1'));
  const dropped = value<{ id: string }>(k.propose({ ...options, question: 'Dropped?' }, 'p_1'));

  /* ANSWERED OUT OF ORDER, BY ONE PERSON, AT ONE INSTANT, WITH THE SAME QUESTION: nothing but the link tells them apart. */
  const d2 = value<{ decision: string }>(k.decide(second.id, { decide: { option: 'no', reason: 'not this one' } }, 'p_2')).decision;
  const d1 = value<{ decision: string }>(k.decide(first.id, { decide: { option: 'accept', reason: 'this one' } }, 'p_2')).decision;
  value(k.decide(dropped.id, { resolved_as: 'wont-fix', reason: 'no' }, 'p_2'));

  const decisions = value<Record<string, unknown>[]>(k.governance('decision'));
  assert.equal(decisions.find((d) => d.id === d1)?.suggestion, first.id);
  assert.equal(decisions.find((d) => d.id === d2)?.suggestion, second.id);

  const settled = value<Record<string, unknown>[]>(k.governance('suggestion', { status: 'all' }));
  assert.equal(settled.find((s) => s.id === first.id)?.decision, d1);
  assert.equal(settled.find((s) => s.id === second.id)?.decision, d2);
  assert.equal(settled.find((s) => s.id === dropped.id)?.decision, null, 'a question closed without a decision named one');
  assert.equal(k.governanceRow('decision', d1)?.suggestion, first.id);
  sql.close();
});

test('A CHANGE THAT WOULD NOT INSTALL IS REFUSED WHEN IT IS PROPOSED, so the owner is not the one who finds out', async () => {
  const { k, sql } = await record();
  const page = (blocks: unknown[]) => ({
    question: 'Add an Invoicing page?',
    body_kind: 'change' as const,
    body: {
      declaration_id: 'page.invoicing',
      to: {
        id: 'page.invoicing',
        kind: 'page',
        body: { page: 'invoicing', title: 'Invoicing', requires: ['register.obligations'], blocks },
      },
    },
  });

  const empty = refusal(k.propose(page([]), 'S1'));
  assert.equal(empty.code, 'DECLARATION_INVALID');
  const unknown = refusal(
    k.propose(page([{ kind: 'table', heading: 'Open', span: 12, source: 'register.nothing', columns: [{ field: 'what' }], limit: 50, empty: 'None.' }]), 'S1'),
  );
  assert.notEqual(unknown.code, undefined);
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0, 'a change that would not install was filed');

  /* The same page with a block the install takes is filed, and installs when accepted. */
  const good = page([{ kind: 'table', heading: 'Open', span: 12, source: 'register.obligations', columns: [{ field: 'what' }], limit: 50, empty: 'Nothing outstanding.' }]);
  const made = value<{ id: string }>(k.propose(good, 'S1'));
  const out = value<{ install?: unknown }>(k.decide(made.id, { decide: { option: 'accept', reason: 'it reads well' } }, 'p_owner'));
  value(await k.install([out.install as Declaration]));
  sql.close();
});

/* ── the three bodies that arrange a BrainDog ───────────────────── */

test('A PACK, A SETTINGS CHANGE AND AN ARRANGEMENT ARE FILED, AND ACCEPTING ONE CHANGES NOTHING BY ITSELF', async () => {
  /* The gate hands the body back for the record to apply, as it does a `change`: installing is
     asynchronous, and a decision that resolved before its change landed would be a lie. */
  const { k, sql } = await record();
  const bodies = [
    { question: 'Add Work?', body_kind: 'pack' as const, body: { install: 'work' } },
    { question: 'Say Today on Home?', body_kind: 'settings' as const, body: { pack: 'usecase-student', values: { voice_home: 'Today' } } },
    {
      question: 'Arrange this BrainDog for studies?',
      body_kind: 'arrange' as const,
      body: { why: ['Four assignments were added this week.'], packs: { install: ['usecase-student'] }, settings: [{ pack: 'usecase-student', values: { voice_home: 'Today' } }] },
    },
  ];
  for (const p of bodies) {
    const made = value<{ id: string }>(k.propose(p, 'S1'));
    const before = sql.all('SELECT id FROM declaration').length;
    const out = value<{ apply?: { kind: string; body: unknown }; install?: unknown }>(
      k.decide(made.id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'),
    );
    assert.equal(out.apply?.kind, p.body_kind);
    assert.deepEqual(out.apply?.body, p.body);
    assert.equal(out.install, undefined);
    assert.equal(sql.all('SELECT id FROM declaration').length, before, 'the gate installed something itself');
    /* AND IT COMES BACK when what was accepted will not land. */
    value(k.reopen(made.id, 'The pack would not install.'));
    assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open');
  }
  sql.close();
});

test('EACH REFUSAL SAYS WHAT TO SEND INSTEAD, at the key that was wrong', async () => {
  const { k, sql } = await record();
  const at = (body_kind: string, body: Record<string, unknown>) => refusal(k.propose({ question: 'x?', body_kind: body_kind as never, body }, 'S1'));

  const none = at('pack', {});
  assert.equal(none.code, 'REQUIRED_MISSING');
  assert.deepEqual(none.allowed, ['install', 'enable', 'disable']);
  assert.equal(at('pack', { install: 'work', enable: 'people' }).code, 'REQUIRED_MISSING');
  assert.equal(at('pack', { install: 'Work Pack' }).at, 'body.install');
  assert.equal(at('pack', { enable: 'work', doc: {} }).at, 'body.doc');

  assert.equal(at('settings', { pack: 'usecase-student' }).at, 'body.values');
  /* A LIST OF TEXT IS A VALUE, and a list of anything else is not. */
  assert.equal(at('settings', { pack: 'usecase-student', values: { voice_home: [1] } }).at, 'body.values.voice_home');

  assert.equal(at('arrange', { packs: { install: ['work'] } }).at, 'body.why');
  assert.equal(at('arrange', { why: ['x'] }).at, 'body');
  assert.equal(at('arrange', { why: ['x'], packs: { add: ['work'] } }).code, 'FIELD_UNKNOWN');
  assert.equal(at('arrange', { why: ['x'], pages: [{ id: 'studies', kind: 'page', body: {} }] }).at, 'body.pages[0]');
  assert.equal(at('arrange', { why: [''], packs: { install: ['work'] } }).at, 'body.why[0]');
  sql.close();
});

test('AT MOST THREE ARRANGEMENTS WAIT AT ONCE, and the fourth names the three', async () => {
  const { k, sql } = await record();
  const arrange = { question: 'Arrange it?', body_kind: 'arrange' as const, body: { why: ['x'], packs: { enable: ['work'] } } };
  /* EACH ITS OWN CAUSE, since the same arrangement asked again by one run joins the first. */
  const ids = [1, 2, 3].map((n) => value<{ id: string }>(k.propose({ ...arrange, cause: `arrange-${n}` }, 'S1')).id);
  const fourth = refusal(k.propose({ ...arrange, cause: 'arrange-4' }, 'S1'));
  assert.equal(fourth.code, 'OUT_OF_BOUNDS');
  for (const id of ids) assert.ok(fourth.fix.split(/[ ,]+/).includes(id), id);
  value(k.decide(ids[0]!, { resolved_as: 'wont-fix', reason: 'not now' }, 'p_owner'));
  value(k.propose({ ...arrange, cause: 'arrange-5' }, 'S1'));
  sql.close();
});

test('WHAT AN ACCEPTED ARRANGEMENT DID IS KEPT ON ITS DECISION, and read back with it', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(options, 'p_1'));
  const out = value<{ decision: string }>(k.decide(made.id, { decide: { option: 'accept', reason: 'ours' } }, 'p_2'));
  assert.equal(k.governanceRow('decision', out.decision)?.applied, null, 'a decision nothing was kept on');
  value(k.keepApplied(out.decision, { installed: ['usecase-personal'] }, 'p_2'));
  assert.deepEqual(k.governanceRow('decision', out.decision)?.applied, { installed: ['usecase-personal'] });
  assert.deepEqual((value<Record<string, unknown>[]>(k.governance('decision'))[0] ?? {}).applied, { installed: ['usecase-personal'] });
  assert.equal(refusal(k.keepApplied('D99', {}, 'p_2')).code, 'OUT_OF_BOUNDS');
  sql.close();
});
