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

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
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
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
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

  // And the question is on the ledger, which is where a person reads it.
  assert.equal(
    sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'suggest'")?.note,
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

test('A DECISION CARRIES ITS REASON, and a gate without one is a gate nobody can revisit', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(k.propose(options, 'p_1'));
  assert.equal(refusal(k.decide(made.id, { decide: { option: 'accept', reason: '  ' } }, 'p_2')).at, 'reason');
  assert.equal(refusal(k.decide(made.id, { decide: { option: '', reason: 'because' } }, 'p_2')).at, 'option');

  // And the answer has to be one of the options that were offered.
  assert.equal(refusal(k.decide(made.id, { decide: { option: 'maybe', reason: 'because' } }, 'p_2')).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(k.governanceRow('suggestion', made.id)?.status, 'open');
  assert.equal(sql.all('SELECT 1 FROM decision').length, 0);
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
  const decl = {
    id: 'rule.chase',
    kind: 'rule',
    body: { rule: 'chase', register: 'obligations', when: 'state is open', once_per: ['entry'], then: [{ tag: 'chased' }] },
  };
  const made = value<{ id: string }>(
    k.propose({ question: 'Turn this rule on?', body_kind: 'pattern', body: { ingest: decl, samples: ['r1', 'r2', 'r3'] } }, 'p_1'),
  );

  const out = value<{ install: { id: string } }>(k.decide(made.id, { decide: { option: 'accept', reason: 'it is what we already do by hand' } }, 'p_2'));
  assert.equal(out.install.id, 'rule.chase', 'the gate did not hand back the declaration to install');

  // The kernel hands it back rather than installing it, because installing is asynchronous — and a
  // decision that resolved before its change landed would be a lie.
  assert.ok((await k.install([out.install as never])).ok);
  assert.equal(value<{ id: string }>(k.create('obligations', { what: 'Invoice 9', state: 'open' }, { actor: 'p_1' }) as never).id.length > 0, true);
  assert.deepEqual(k.get('obligations#1')?.fields.tags, ['chased']);
  sql.close();
});

test('and one that will not install puts the question back', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(
    k.propose(
      { question: 'Turn this rule on?', body_kind: 'pattern', body: { ingest: { id: 'rule.bad', kind: 'rule', body: { rule: 'bad', register: 'obligations', when: 'colour is red', then: [] } } } },
      'p_1',
    ),
  );
  const out = value<{ suggestion: string; install: unknown }>(k.decide(made.id, { decide: { option: 'accept', reason: 'go on' } }, 'p_2'));
  assert.ok(out.install);
  assert.equal((await k.install([out.install as never])).ok, false, 'a rule nobody can read installed');

  k.reopen(out.suggestion);
  assert.equal(k.governanceRow('suggestion', out.suggestion)?.status, 'open');
  assert.equal(k.governanceRow('suggestion', out.suggestion)?.resolved_as, null);
  sql.close();
});
