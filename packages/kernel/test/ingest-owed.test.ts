/**
 * A shape nobody has a pattern for is owed a draft until it is answered ("owed, not once").
 *
 * BEFORE: a shape earned one draft at exactly its third arrival. If that draft's call failed, or the arrival that
 * would have been the third came while an older one was being filed, nothing ever asked again, and the arrivals sat
 * in the inbox behind a button a person had to press. Now the shape is owed while three or more wait and nobody has
 * been asked: one draft at a time, again the next day after one that came to nothing, and never again once a person
 * has said yes or no.
 *
 * THE MEMORY IS THE QUESTION AND ITS DECISION, found by the cause `pattern:<shape>` or by the arrivals the question
 * was drawn from. There is no teaching table yet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { owedShapes, patternCause } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const DAY = 86_400_000;
const SHAPE = 'email:alerts@bank.example';

const PAYMENTS: Declaration = {
  id: 'register.payments',
  kind: 'register',
  body: { id: 'payments', name: 'Payments', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/* What a person is asked to accept: an ingest that reads the sender's wording exactly. Synthetic wording, invented here. */
const READS = {
  id: 'ingest.bank-paid',
  kind: 'ingest',
  body: {
    ingest: 'bank-paid',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'Paid ' }] },
    extract: { what: { text: { after: 'Paid ' } } },
    writes: { register: 'payments', confidence: 'exact' },
    dedupe: ['what'],
    on_conflict: 'skip',
  },
};

type Clock = ReturnType<typeof fixedClock>;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: Clock }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const installed = await k.install([PAYMENTS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql, clock };
}

let sent = 0;
const arrive = (k: Kernel, body: string, from = 'Bank <alerts@bank.example>'): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: from, Subject: 'Notice' }, body, sha256: `owed-${++sent}` }) as { ok: boolean; value: Arrived };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

const drafts = (sql: NodeSql): { id: string; state: string; payload: { shape: string; examples: string[]; waiting: number } }[] =>
  sql
    .all<{ id: string; state: string; payload: string }>("SELECT id, state, payload FROM outbox WHERE kind = 'infer.draft' ORDER BY rowid")
    .map((r) => ({ id: r.id, state: r.state, payload: JSON.parse(r.payload) as { shape: string; examples: string[]; waiting: number } }));

const owed = (sql: NodeSql, clock: Clock): string[] => owedShapes(sql, clock.now()).map((o) => o.shape);

/** The question a draft comes back as, filed the way the queue files one, with the shape's cause on it. */
const ask = (k: Kernel, samples: string[], ingest: unknown = READS): string => {
  const made = k.propose({ question: 'Read these three the same way?', body_kind: 'pattern', body: { ingest, samples }, cause: patternCause(SHAPE) }, 'slash');
  assert.ok(made.ok, JSON.stringify(made));
  return (made as { value: { id: string } }).value.id;
};

/** A draft that came to nothing: the route failed every rung (`dead`), or the call ended with nothing to file (`done`). */
const ended = (sql: NodeSql, id: string, state: 'dead' | 'done'): void => sql.exec('UPDATE outbox SET state = ? WHERE id = ?', state, id);

test('A SHAPE WITH THREE WAITING AND NOBODY ASKED IS OWED, and its draft holds the three oldest', async () => {
  const { k, sql, clock } = await record();
  const first = arrive(k, 'Sent 1');
  const second = arrive(k, 'Sent 2');
  assert.deepEqual(owed(sql, clock), [], 'two of anything is a coincidence');
  assert.equal(drafts(sql).length, 0);

  const third = arrive(k, 'Sent 3');
  const out = drafts(sql);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.payload.shape, SHAPE);
  assert.deepEqual(out[0]?.payload.examples, [first.raw, second.raw, third.raw]);
  assert.equal(out[0]?.payload.waiting, 3);
  assert.deepEqual(owed(sql, clock), [], 'a shape whose draft is out was owed a second');

  /* AND THE SHAPE THAT MISSED ITS THIRD ARRIVAL IS STILL OWED. No draft was ever queued for it here, which is what a
     record looks like when the third came before this was built: the count is past three and nothing asked. */
  sql.exec("DELETE FROM outbox WHERE kind = 'infer.draft'");
  arrive(k, 'Sent 4');
  const again = drafts(sql);
  assert.equal(again.length, 1, 'a shape past its third arrival was never asked about');
  assert.deepEqual(again[0]?.payload.examples, [first.raw, second.raw, third.raw], 'the three oldest, in the order they came');
  assert.equal(again[0]?.payload.waiting, 4);
  sql.close();
});

test('OWED AGAIN THE NEXT DAY AFTER A DRAFT THAT FAILED, and one draft a shape at a time', async () => {
  for (const state of ['dead', 'done'] as const) {
    const { k, sql, clock } = await record();
    for (const n of [1, 2, 3]) arrive(k, `Sent ${n}`);
    const one = drafts(sql)[0]!;

    /* STILL OUT, on any rung of its ladder: pending, leased, or failed and waiting for its retry. */
    for (const live of ['pending', 'leased', 'failed']) {
      sql.exec('UPDATE outbox SET state = ? WHERE id = ?', live, one.id);
      clock.advance(2 * DAY);
      arrive(k, `Sent while ${live}`);
      assert.equal(drafts(sql).length, 1, `a second draft was queued beside one still ${live}`);
      assert.deepEqual(owed(sql, clock), []);
    }

    /* IT CAME TO NOTHING TODAY, so nothing is asked again today. The row's day is the day it was queued. */
    sql.exec('UPDATE outbox SET created = ? WHERE id = ?', new Date(clock.now()).toISOString(), one.id);
    ended(sql, one.id, state);
    clock.advance(DAY - 60_000);
    arrive(k, 'Sent the same day');
    assert.equal(drafts(sql).length, 1, `a ${state} draft was asked again inside the day`);
    assert.deepEqual(owed(sql, clock), []);

    /* AND THE NEXT DAY IT IS OWED, and the next arrival of the shape asks. */
    clock.advance(120_000);
    assert.deepEqual(owed(sql, clock), [SHAPE], `a ${state} draft was never asked again`);
    arrive(k, 'Sent the next day');
    assert.equal(drafts(sql).length, 2);
    assert.equal(drafts(sql)[1]?.state, 'pending');
    assert.deepEqual(owed(sql, clock), []);
    arrive(k, 'Sent after that');
    assert.equal(drafts(sql).length, 2, 'two drafts for one shape were out at once');
    sql.close();
  }
});

test('A SHAPE WITH ITS QUESTION OPEN IS NOT OWED, however many more arrive and however long it waits', async () => {
  const { k, sql, clock } = await record();
  for (const n of [1, 2, 3]) arrive(k, `Sent ${n}`);
  const one = drafts(sql)[0]!;
  ask(k, one.payload.examples);
  ended(sql, one.id, 'done');

  for (const n of [4, 5, 6]) {
    clock.advance(2 * DAY);
    arrive(k, `Sent ${n}`);
    assert.deepEqual(owed(sql, clock), []);
  }
  assert.equal(drafts(sql).length, 1, 'a pattern still opened a draft per arrival while its question waited');
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE status = 'open'").length, 1, 'one question for the shape');
  sql.close();
});

test('and a question filed with no cause is found by the arrivals it was drawn from', async () => {
  /* What the queue files today: Slash's draft goes in with no cause on it. Its `samples` are the shape's own arrivals. */
  const { k, sql, clock } = await record();
  for (const n of [1, 2, 3]) arrive(k, `Sent ${n}`);
  const one = drafts(sql)[0]!;
  const made = k.propose({ question: 'Read these three the same way?', body_kind: 'pattern', body: { ingest: READS, samples: one.payload.examples } }, 'slash');
  assert.ok(made.ok, JSON.stringify(made));
  ended(sql, one.id, 'done');

  clock.advance(2 * DAY);
  arrive(k, 'Sent 4');
  assert.deepEqual(owed(sql, clock), []);
  assert.equal(drafts(sql).length, 1);

  /* AND ANOTHER SENDER'S SHAPE IS NOT ANSWERED BY IT. */
  for (const n of [1, 2, 3]) arrive(k, `Other ${n}`, 'billing@utility.example');
  assert.equal(drafts(sql).length, 2);
  assert.equal(drafts(sql)[1]?.payload.shape, 'email:billing@utility.example');
  sql.close();
});

test('and a no to a question with no cause still holds once the arrivals it was drawn from are old or filed', async () => {
  /* The shape of a question is the shape of its arrivals, whatever became of them since. Read off what still waits, a
     no lasted thirty days and a steady sender was asked about again every month. */
  for (const gone of ['old', 'filed'] as const) {
    const { k, sql, clock } = await record();
    for (const n of [1, 2, 3]) arrive(k, `Sent ${n}`);
    const one = drafts(sql)[0]!;
    const made = k.propose({ question: 'Read these three the same way?', body_kind: 'pattern', body: { ingest: READS, samples: one.payload.examples } }, 'slash');
    assert.ok(made.ok, JSON.stringify(made));
    ended(sql, one.id, 'done');
    const said = k.decide((made as { value: { id: string } }).value.id, { resolved_as: 'wont-fix', reason: 'these are only notices' }, 'p_1');
    assert.ok(said.ok, JSON.stringify(said));

    if (gone === 'old') clock.advance(31 * DAY);
    else {
      sql.exec("UPDATE inbox_raw SET state = 'ignored'");
      clock.advance(2 * DAY);
    }
    for (const n of [4, 5, 6]) arrive(k, `Sent ${n}`);
    assert.deepEqual(owed(sql, clock), [], `a shape a person said no to was owed again once its three were ${gone}`);
    assert.equal(drafts(sql).length, 1);
    sql.close();
  }
});

test('A SHAPE WHOSE DRAFT WAS DECLINED IS NOT OWED, the next day or ever', async () => {
  for (const verdict of [{ resolved_as: 'wont-fix' as const, reason: 'these are only notices' }, { decide: { option: 'reject', reason: 'these are only notices' } }]) {
    const { k, sql, clock } = await record();
    for (const n of [1, 2, 3]) arrive(k, `Sent ${n}`);
    const one = drafts(sql)[0]!;
    const question = ask(k, one.payload.examples);
    ended(sql, one.id, 'done');
    const said = k.decide(question, verdict, 'p_1');
    assert.ok(said.ok, JSON.stringify(said));

    for (const n of [4, 5]) {
      clock.advance(3 * DAY);
      arrive(k, `Sent ${n}`);
      assert.deepEqual(owed(sql, clock), [], 'a shape a person said no to was owed again');
    }
    assert.equal(drafts(sql).length, 1, 'a declined pattern was drafted again');
    assert.equal(sql.all("SELECT 1 FROM suggestion WHERE status = 'open'").length, 0);
    sql.close();
  }
});

test('AFTER AN ACCEPTED PATTERN, an arrival it reads exactly files with no question, and one it cannot read asks nothing new', async () => {
  const { k, sql, clock } = await record();
  for (const n of [1, 2, 3]) arrive(k, `Paid invoice ${n}`);
  const one = drafts(sql)[0]!;
  const question = ask(k, one.payload.examples);
  ended(sql, one.id, 'done');

  const said = k.decide(question, { decide: { option: 'accept', reason: 'that is the bank' } }, 'p_1');
  assert.ok(said.ok, JSON.stringify(said));
  const put = await k.install([said.value.install as Declaration]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.equal(sql.one<{ cause: string | null }>('SELECT cause FROM decision ORDER BY rowid DESC LIMIT 1')?.cause, patternCause(SHAPE), 'the answer does not carry the cause it is remembered by');

  clock.advance(DAY);
  const filed = arrive(k, 'Paid invoice 4');
  assert.equal(filed.state, 'matched', JSON.stringify(filed));
  assert.equal(filed.wrote.length, 1);
  assert.equal(filed.suggestion, undefined);
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE status = 'open'").length, 0, 'an arrival the pattern reads exactly opened a question');

  /* AND ONE THE PATTERN DOES NOT READ WAITS, with three of the first still waiting beside it, and buys no second draft. */
  clock.advance(DAY);
  assert.equal(arrive(k, 'Your statement is ready').state, 'untriaged');
  assert.deepEqual(owed(sql, clock), [], 'a shape with an accepted pattern was owed another');
  assert.equal(drafts(sql).length, 1);
  sql.close();
});

test('the cause of a shape is one a question can carry, whatever the address holds', () => {
  assert.equal(patternCause(SHAPE), 'pattern:email:alerts@bank.example');
  assert.equal(patternCause('webhook'), 'pattern:webhook');
  /* A `+`, a space or a very long address is not a cause as it stands, so the shape is named by its hash. */
  for (const odd of ['email:a+b@bank.example', 'email:two words@bank.example', `email:${'a'.repeat(260)}@bank.example`]) {
    const cause = patternCause(odd);
    assert.match(cause, /^pattern:[0-9a-f]{32}$/u, cause);
    assert.equal(patternCause(odd), cause);
  }
  assert.notEqual(patternCause('email:a+b@bank.example'), patternCause('email:a+c@bank.example'));
});
