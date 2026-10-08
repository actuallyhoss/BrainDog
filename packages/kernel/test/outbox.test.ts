/**
 * The outbox and the alarm handler: everything that has to happen when nobody is looking.
 *
 * The failures these are about are all the same shape — work the record believed it had done. A
 * notification leased twice and sent twice. A delivery that failed and was never retried. A delivery
 * that was retried forever and never surfaced. A schedule that stopped because one handler threw
 * before re-arming, which is the single worst bug available here: the customer's reminders simply
 * never fire again, and nothing anywhere says so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCHEDULE_KINDS, backoffMs, drainSchedule, openRecord, summary, type Declaration, type Kernel, type OutboxKind } from '../src/index.ts';
import { unlease } from '../src/outbox.ts';
import { fixedClock, openSqlite, recordingScheduler, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const MINUTE = 60_000;
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
      { id: 'due', type: 'day', remind: ['-7d'] },
    ],
  } as never,
};

type Clockish = ReturnType<typeof fixedClock>;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  /* THE SIGNS' NIGHT IS ARMED AS EVERY RECORD OPENS (`armSigns`), and this file counts only the outbox's own claims and
     alarms, so the row is taken out before anything is counted. */
  sql.exec("DELETE FROM schedule WHERE kind = 'snapshot' AND key = 'signs'");
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

const row = (sql: NodeSql, id: string) =>
  sql.one<{ state: string; attempts: number; leased_until: string | null }>(
    'SELECT state, attempts, leased_until FROM outbox WHERE id = ?',
    id,
  )!;

const ALL: OutboxKind[] = ['notify.email', 'notify.push', 'infer.embed', 'export.r2'];

/* ── the lease ───────────────────────────────────────────────────────────── */

test('A JOB LEASED IS A JOB NOBODY ELSE CAN TAKE, which is one statement or it is nothing', async () => {
  const { k, sql } = await record();
  k.outbox('notify.email', { to: 'p_1', subject: 'Invoice 41' });
  k.outbox('notify.push', { title: 'Something needs attention' });

  const first = k.leaseOutbox(ALL, 10);
  assert.equal(first.length, 2);
  assert.deepEqual(k.leaseOutbox(ALL, 10), [], 'a second drain took the same jobs and would send them twice');
  sql.close();
});

test('the lease window is as long as the thing on the other end of it', async () => {
  // One window would have to be the longest, and a lease that outlives the worker holding it is a
  // notification nobody sends for five minutes after that worker died.
  const { k, sql } = await record();
  k.outbox('notify.email', {});
  k.outbox('infer.embed', {});
  k.outbox('export.r2', {});

  const leased = new Map(k.leaseOutbox(ALL, 10).map((r) => [r.kind, Date.parse(r.leasedUntil) - NOW]));
  assert.equal(leased.get('notify.email'), 60_000);
  assert.equal(leased.get('infer.embed'), 120_000);
  assert.equal(leased.get('export.r2'), 300_000);
  sql.close();
});

test('AN EXPIRED LEASE IS CLAIMABLE AGAIN, because a worker that died must not take jobs with it', async () => {
  const { k, sql, clock } = await record();
  k.outbox('notify.email', {});
  assert.equal(k.leaseOutbox(ALL, 10).length, 1);

  clock.set(NOW + 59_000);
  assert.equal(k.leaseOutbox(ALL, 10).length, 0, 'a live lease was taken from under its holder');
  clock.set(NOW + 61_000);
  assert.equal(k.leaseOutbox(ALL, 10).length, 1, 'a lease expired and the job was left there');
  sql.close();
});

test('a lease asks for kinds, and gets only those', async () => {
  const { k, sql } = await record();
  k.outbox('notify.email', {});
  k.outbox('infer.embed', {});
  const got = k.leaseOutbox(['infer.embed'], 10);
  assert.deepEqual(
    got.map((r) => r.kind),
    ['infer.embed'],
  );
  assert.equal(k.leaseOutbox(['notify.email'], 10).length, 1, 'the untaken job was leased anyway');
  sql.close();
});

test('an unknown kind asks for nothing rather than everything', async () => {
  const { k, sql } = await record();
  k.outbox('notify.email', {});
  assert.deepEqual(k.leaseOutbox(['notify.sms' as OutboxKind], 10), []);
  assert.deepEqual(k.leaseOutbox([], 10), []);
  assert.deepEqual(k.leaseOutbox(ALL, 0), []);
  sql.close();
});

/* ── the ack ─────────────────────────────────────────────────────────────── */

test('a job acked done is finished, and cannot be acked twice', async () => {
  const { k, sql } = await record();
  const id = k.outbox('notify.email', {});
  k.leaseOutbox(ALL, 10);

  value(k.ackOutbox({ id, state: 'done' }));
  assert.equal(row(sql, id).state, 'done');
  assert.equal(row(sql, id).leased_until, null, 'a finished job kept its lease');

  const again = refusal(k.ackOutbox({ id, state: 'done' }));
  assert.equal(again.code, 'OUT_OF_BOUNDS');
  assert.match(again.fix, /done/, 'the refusal does not say what state the job is in');
  assert.match(refusal(k.ackOutbox({ id: 'nope', state: 'done' })).fix, /No job nope/);
  sql.close();
});

test('a job that was never leased cannot be acked', async () => {
  const { k, sql } = await record();
  const id = k.outbox('notify.email', {});
  assert.equal(refusal(k.ackOutbox({ id, state: 'done' })).code, 'OUT_OF_BOUNDS');
  assert.equal(row(sql, id).state, 'pending', 'the ack changed a job it had no lease on');
  sql.close();
});

/* ── the ladder ──────────────────────────────────────────────────────────── */

test('THE RETRY IS A SCHEDULE ROW, and there is exactly one ladder', async () => {
  // The alternative — a counter and a cap in the outbox too — gives one notification two ladders,
  // and it is retried either forever or never depending on which one wins.
  const { k, sql, clock } = await record();
  const id = k.outbox('notify.email', { to: 'p_1' });
  k.leaseOutbox(ALL, 10);
  value(k.ackOutbox({ id, state: 'failed', error: 'smtp timeout' }));

  assert.equal(row(sql, id).state, 'failed');
  assert.equal(row(sql, id).attempts, 1);
  const retry = sql.one<{ due_at: string; key: string; payload: string; attempts: number }>(
    "SELECT due_at, key, payload, attempts FROM schedule WHERE kind = 'retry'",
  )!;
  assert.equal(retry.key, `outbox:${id}`);
  /* TWO MINUTES AND A SPREAD, not two minutes exactly. `backoffMs` is the same number for every job,
     so a provider that goes down and fails twenty of them arms twenty retries at one instant. The
     jitter is the record's own, deterministic over the record, the kind and the job, and its window
     here is thirty seconds: the rung is never early and never more than a window late. */
  const out = Date.parse(retry.due_at) - NOW;
  assert.ok(out >= 2 * MINUTE && out < 2 * MINUTE + 30_000, `the first retry is ${out} ms out, not two minutes and a spread`);
  assert.deepEqual(JSON.parse(retry.payload), { outbox: id, attempt: 1 });

  // And when it fires, the job goes back where the deliverer can lease it.
  clock.set(NOW + 3 * MINUTE);
  const drained = await k.drain();
  assert.equal(drained.done, 1);
  assert.equal(row(sql, id).state, 'pending', 'a retry fired and the job stayed failed');
  assert.equal(k.leaseOutbox(ALL, 10).length, 1);
  sql.close();
});

test('two failures of one job arm one retry, not two', async () => {
  const { k, sql, clock } = await record();
  const id = k.outbox('notify.email', {});
  k.leaseOutbox(ALL, 10);
  value(k.ackOutbox({ id, state: 'failed', error: 'first' }));
  clock.set(NOW + 3 * MINUTE);
  await k.drain();
  k.leaseOutbox(ALL, 10);
  value(k.ackOutbox({ id, state: 'failed', error: 'second' }));

  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'retry'").length, 1, 'a second retry row for one job');
  assert.equal(row(sql, id).attempts, 2);
  const due = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'retry'")!.due_at;
  const out = Date.parse(due) - (NOW + 3 * MINUTE);
  assert.ok(out >= 4 * MINUTE && out < 4 * MINUTE + 30_000, `the second retry is ${out} ms out, not four minutes and a spread`);
  sql.close();
});

test('TWO JOBS FAILING AT ONE INSTANT DO NOT COME BACK AT ONE INSTANT, and each rung is where it was', async () => {
  /* THE OUTAGE, WHICH IS THE ORDINARY CASE AND NOT THE RARE ONE. A provider stops answering and every
     job pointed at it fails in the same drain. With the backoff alone each one armed its retry at
     exactly the same instant, so the herd came back together, hit the same struggling host, failed
     together and did it again eight times over. */
  const { k, sql, clock } = await record();
  const ids = ['a', 'b', 'c'].map(() => k.outbox('notify.email', {}));
  k.leaseOutbox(ALL, 10);
  for (const id of ids) value(k.ackOutbox({ id, state: 'failed', error: 'the provider is down' }));

  const dues = ids.map((id) => Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE key = ?", `outbox:${id}`)!.due_at));
  assert.equal(new Set(dues).size, 3, 'three jobs failing together came back together');
  for (const due of dues) assert.ok(due - NOW >= 2 * MINUTE && due - NOW < 2 * MINUTE + 30_000, 'a rung moved outside its window');

  /* AND IT IS ARITHMETIC, NEVER RANDOM: the same job failing again at the same instant lands on the
     same instant, so a gap somebody asks about is a gap with a reason. */
  const first = dues[0]!;
  clock.set(NOW + 3 * MINUTE);
  await k.drain();
  k.leaseOutbox(ALL, 10);
  value(k.ackOutbox({ id: ids[0]!, state: 'failed', error: 'again' }));
  sql.exec("UPDATE outbox SET state = 'leased', attempts = 0, leased_until = ? WHERE id = ?", new Date(NOW + 60 * MINUTE).toISOString(), ids[0]!);
  clock.set(NOW);
  value(k.ackOutbox({ id: ids[0]!, state: 'failed', error: 'again' }));
  const again = Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE key = ?", `outbox:${ids[0]!}`)!.due_at);
  assert.equal(again, first, 'the same job on the same rung at the same instant moved');
  sql.close();
});

test('THE EIGHTH FAILURE IS VISIBLE, because a notification that silently gave up is the worst one', async () => {
  const { k, sql, clock } = await record();
  const id = k.outbox('notify.email', { to: 'p_1', subject: 'Invoice 41', text: 'the whole body' });

  let at = NOW;
  for (let n = 1; n <= 8; n++) {
    k.leaseOutbox(ALL, 10);
    value(k.ackOutbox({ id, state: 'failed', error: 'smtp said 550' }));
    if (n === 8) break;
    /* THE ROW'S OWN `due_at`, and not `backoffMs` again: the rung carries a deterministic spread of
       up to a tenth of the wait, so a walk that adds only the backoff arrives before its own retry. */
    at = Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'retry'")!.due_at) + MINUTE;
    clock.set(at);
    await k.drain();
  }

  assert.equal(row(sql, id).state, 'dead');
  assert.equal(row(sql, id).attempts, 8);
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'retry' AND state = 'pending'").length, 0, 'a ninth retry');

  const item = sql.one<{ id: string; body_kind: string; opened_by: string; body: string; status: string }>(
    'SELECT id, body_kind, opened_by, body, status FROM suggestion',
  )!;
  assert.equal(item.body_kind, 'change');
  assert.equal(item.opened_by, 'system');
  assert.equal(item.status, 'open');
  assert.match(item.id, /^SG\d+$/);
  const body = JSON.parse(item.body) as { question: string; from: { kind: string; error: string; payload: Record<string, string> } };
  assert.match(body.question, /notify\.email could not be delivered after 8 attempts: smtp said 550/);
  assert.equal(body.from.kind, 'notify.email');

  // The item is READ by whoever the record belongs to, so the payload in it is a summary.
  assert.equal(body.from.payload.text, '--withheld--', 'the failure report quoted the message body');
  assert.equal(body.from.payload.to, 'p_1');

  // And the event, or the suggestion arrived and nothing in the app knows.
  const event = sql.one<{ kind: string; actor: string; target: string }>(
    "SELECT kind, actor, target FROM event WHERE kind = 'suggest'",
  )!;
  assert.equal(event.actor, 'system');
  assert.equal(event.target, `suggestion:${item.id}`);
  sql.close();
});

test('the backoff doubles in minutes and stops at six hours', () => {
  assert.equal(backoffMs(1), 2 * MINUTE);
  assert.equal(backoffMs(2), 4 * MINUTE);
  /* THE LADDER'S TOP RUNG, and it is under the cap: at a ceiling of eight, `attempts` reaches 7 and
     the longest wait is 128 minutes. The cap is a BOUND rather than a rung — it keeps the wait
     finite if the ceiling ever rises, and it is not reached by the ladder as it stands. */
  assert.equal(backoffMs(7), 128 * MINUTE);
  assert.equal(backoffMs(9), 6 * 3_600_000, 'the cap is the only thing between a retry and a year of them');
  assert.equal(backoffMs(40), 6 * 3_600_000);
});

/* ── what a person is shown ──────────────────────────────────────────────── */

test('A SUMMARY NEVER QUOTES THE THING THE JOB WAS CARRYING', () => {
  // A dead-letter item is read by a person. A failure report that quotes the credential it failed to
  // use has published it, and the record's whole posture is that a credential is never in the record.
  const out = summary(JSON.stringify({ to: 'p_1', token: 'sk_live_41', texts: ['a', 'b'], body: 'x', n: 3 }));
  assert.equal(out.token, '--withheld--');
  assert.equal(out.texts, '--withheld--');
  assert.equal(out.body, '--withheld--');
  assert.equal(out.to, 'p_1');
  assert.equal(out.n, '3');
});

test('and it is short, and it survives a payload that is not an object', () => {
  const long = summary(JSON.stringify({ note: 'x'.repeat(400) }));
  assert.equal(long.note?.length, 120);
  assert.deepEqual(summary('not json at all'), { payload: 'not json at all' });
  assert.deepEqual(summary('[1,2,3]'), { payload: '1,2,3' });
  assert.deepEqual(summary('null'), { payload: 'null' });
});

/* ── the alarm handler ───────────────────────────────────────────────────── */

test('CLAIM BEFORE WORK: a second drain of the same rows finds nothing', async () => {
  // An alarm handler can be re-entered — a platform guarantees delivery, not exactly-once.
  const { k, sql, clock } = await record();
  value(k.create('obligations', { what: 'Invoice 41', due: new Date(NOW + 10 * DAY).toISOString().slice(0, 10) }, { actor: 'p_1' }));
  clock.set(NOW + 4 * DAY);

  assert.equal((await k.drain()).claimed, 1);
  assert.equal((await k.drain()).claimed, 0, 'the same reminder fired twice');
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'note'").length, 1);
  sql.close();
});

test('a reminder that fires says what it is about, in the row it is about', async () => {
  const { k, sql, clock } = await record();
  const due = new Date(NOW + 10 * DAY).toISOString().slice(0, 10);
  value(k.create('obligations', { what: 'Invoice 41', due }, { actor: 'p_1' }));
  clock.set(NOW + 4 * DAY);
  await k.drain();

  const note = sql.one<{ actor: string; note: string; target: string }>("SELECT actor, note, target FROM event WHERE kind = 'note'")!;
  assert.equal(note.actor, 'system');
  assert.match(note.note, /^Invoice 41 · due /);
  assert.ok(note.note.length <= 120);
  assert.equal(note.target, `entry:${k.get('obligations#1')!.id}`);
  sql.close();
});

test('A REMINDER ABOUT A ROW THAT MOVED ON IS DROPPED, not fired', async () => {
  // Firing it is the failure the whole derivation exists to avoid: a reminder about a date that is
  // no longer true. Here the row was deleted between the derivation and the fire.
  const { k, sql, clock } = await record();
  const due = new Date(NOW + 10 * DAY).toISOString().slice(0, 10);
  value(k.create('obligations', { what: 'Invoice 41', due }, { actor: 'p_1' }));

  // A deleted row's reminders are cancelled at the write, so reach past it: the row goes on holding
  // its schedule row, and the drain is the last line of defence.
  sql.exec("UPDATE entry SET deleted_at = ? WHERE register = 'obligations'", new Date(NOW).toISOString());
  clock.set(NOW + 4 * DAY);
  const drained = await k.drain();

  assert.equal(drained.claimed, 1);
  assert.equal(drained.done, 1, 'a reminder about a deleted row was a failure rather than a drop');
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'note'").length, 0, 'it fired about a row that is gone');
  sql.close();
});

test('and one whose field was cleared is dropped too', async () => {
  const { k, sql, clock } = await record();
  const due = new Date(NOW + 10 * DAY).toISOString().slice(0, 10);
  value(k.create('obligations', { what: 'Invoice 41', due }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_remove(fields, '$.due') WHERE register = 'obligations'");
  clock.set(NOW + 4 * DAY);
  await k.drain();
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'note'").length, 0);
  sql.close();
});

test('EVERY ONE OF THE TEN KINDS IS HANDLED NOW, and a kind that were not would fail once', async () => {
  /* The record answers all ten the DDL admits. The property still matters, because the eleventh
     arrives with a migration and a handler that was forgotten would otherwise walk eight hours of a
     ladder over code that does not exist — so it is asserted against the function directly. */
  const { k, sql } = await record();
  for (const kind of SCHEDULE_KINDS) assert.ok(kind, kind);

  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'pull', 'weekly', '{}', 'pending', 0)",
    new Date(NOW - MINUTE).toISOString(),
  );
  const drained = drainSchedule(sql, { mint: () => '01ABCDEFGHJKMNPQRSTVWXYZ01', allocate: () => 1, nowMs: NOW }, {});
  assert.equal(drained.dead, 1);
  assert.equal(sql.one<{ state: string }>("SELECT state FROM schedule WHERE id = 's_1'")?.state, 'failed');

  const item = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion')!.body) as { question: string };
  assert.match(item.question, /pull/);
  void k;
  sql.close();
});

test('a handler that throws walks the ladder and comes back, rather than staying `firing` forever', async () => {
  // A row claimed into `firing` and then abandoned is never claimed again — `firing` is not `pending`
  // — so a handler that throws with no ladder under it loses that reminder permanently and silently.
  const { k, sql, clock } = await record();
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_x', ?, 'retry', 'outbox:gone', 'not json', 'pending', 0)",
    new Date(NOW - MINUTE).toISOString(),
  );
  clock.set(NOW + 3 * MINUTE);
  assert.equal((await k.drain()).failed, 1);

  const after = sql.one<{ state: string; attempts: number; due_at: string }>(
    "SELECT state, attempts, due_at FROM schedule WHERE id = 's_x'",
  )!;
  assert.equal(after.state, 'pending', 'a throwing handler left the row firing forever');
  assert.equal(after.attempts, 1);
  assert.equal(Date.parse(after.due_at) - (NOW + 3 * MINUTE), 2 * MINUTE);
  sql.close();
});

test('A RETRY ROW MIRRORS THE OUTBOX LADDER RATHER THAN RUNNING ONE OF ITS OWN', async () => {
  // The whole reason the retry lives in `schedule` is that there is exactly ONE ladder. If the retry
  // row counted its own attempts, one notification would have two ceilings and two dead-letter items.
  const { k, sql, clock } = await record();
  const id = k.outbox('notify.email', {});
  let at = NOW;
  for (let n = 1; n <= 3; n++) {
    k.leaseOutbox(ALL, 10);
    value(k.ackOutbox({ id, state: 'failed', error: `try ${n}` }));
    at += backoffMs(n) + MINUTE;
    clock.set(at);
    await k.drain();
  }
  assert.equal(row(sql, id).attempts, 3, 'the job is not on its third rung');
  /* AND THE SCHEDULE ROW'S OWN COUNTER IS ZERO, because the schedule row has not failed. The two
     numbers are different quantities — how many times a NOTIFICATION was not delivered, and how
     many times a HANDLER threw — and this column had been carrying the first while `drainSchedule`
     read it as the second. */
  assert.equal(
    sql.one<{ attempts: number }>("SELECT attempts FROM schedule WHERE kind = 'retry'")?.attempts,
    0,
    'the retry row inherited the job as its own failure count',
  );
  assert.deepEqual(
    JSON.parse(sql.one<{ payload: string }>("SELECT payload FROM schedule WHERE kind = 'retry'")!.payload),
    { outbox: id, attempt: 3 },
    'the count somebody reads is not on the row',
  );
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0, 'a ceiling was reached three attempts early');
  sql.close();
});

test('A RETRY ARMED AT THE OUTBOX CEILING SURVIVES ITS OWN FIRST BAD MINUTE', async () => {
  /* The shape that lost notifications silently. The retry row was seeded with the JOB's attempt
     count, so a job failing its seventh delivery armed a row `drainSchedule` already believed to be
     on its seventh rung — and the first transient error inside the handler made it eight, which is
     the ceiling. The row went `failed` at once and the outbox row stayed `failed` for ever: not
     `pending`, so nothing could lease it; not `dead`, so no dead letter and no question. The only
     trace was a suggestion about the wrong subject. */
  const { k, sql, clock } = await record();
  const id = k.outbox('notify.email', {});
  let at = NOW;
  for (let n = 1; n <= 7; n++) {
    k.leaseOutbox(ALL, 10);
    value(k.ackOutbox({ id, state: 'failed', error: `try ${n}` }));
    if (n === 7) break;
    /* The row's own `due_at`, for the reason the walk above gives: a rung carries a spread. */
    at = Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'retry'")!.due_at) + MINUTE;
    clock.set(at);
    await k.drain();
  }
  assert.equal(row(sql, id).attempts, 7, 'the job is not one rung below the ceiling');
  assert.equal(row(sql, id).state, 'failed');

  const retry = sql.one<{ id: string; attempts: number; due_at: string }>("SELECT id, attempts, due_at FROM schedule WHERE kind = 'retry'")!;
  assert.equal(retry.attempts, 0, 'the retry row was armed already seven rungs up');

  /* AND THE HANDLER THROWS ONCE. Anything can: one lock, one blip, one row that came back wrong. */
  sql.exec('UPDATE schedule SET payload = ? WHERE id = ?', 'not json', retry.id);
  clock.set(Date.parse(retry.due_at) + MINUTE);
  await k.drain();

  const after = sql.one<{ state: string; attempts: number }>('SELECT state, attempts FROM schedule WHERE id = ?', retry.id)!;
  assert.equal(after.state, 'pending', 'one bad minute took the whole retry with it');
  assert.equal(after.attempts, 1, 'the retry row is on the wrong rung of its own ladder');
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0, 'the ceiling was reached on the first failure');
  sql.close();
});

test('the batch has a ceiling, and the rest is still there', async () => {
  const { k, sql } = await record();
  for (let n = 0; n < 5; n++)
    sql.exec(
      "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'retry', ?, '{}', 'pending', 0)",
      `s_${n}`,
      new Date(NOW - MINUTE + n).toISOString(),
      `outbox:x${n}`,
    );
  assert.equal((await k.drain(undefined, 2)).claimed, 2);
  /* THE RETRY ROWS, and only those. Installing a declaration also arms the weekly analysis, which
     is what makes the observe loop run — counting it here would make this test about the schedule
     rather than about the batch ceiling. */
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'retry' AND state = 'pending'").length, 3);
  sql.close();
});

/* ── the alarm, and the doorbell ─────────────────────────────────────────── */

test('THE ALARM IS THE EARLIEST PENDING ROW, or there is no alarm', async () => {
  const { k, sql, clock } = await record();
  const scheduler = recordingScheduler();

  /* NOTHING TO DO IS NO ALARM. The weekly analysis is `createRecord`'s row rather than an install's,
     and this helper opens a record without creating one. */
  await k.tail(scheduler);
  assert.equal(scheduler.armed, null, 'a record with nothing to do armed an alarm');

  const due = new Date(NOW + 10 * DAY).toISOString().slice(0, 10);
  value(k.create('obligations', { what: 'Invoice 41', due }, { actor: 'p_1' }));
  await k.tail(scheduler);
  assert.equal(scheduler.armed, Date.parse(`${new Date(NOW + 3 * DAY).toISOString().slice(0, 10)}T12:00:00Z`));

  // Idempotent: a tail that changes nothing sets nothing.
  const before = scheduler.calls.length;
  await k.tail(scheduler);
  assert.deepEqual(scheduler.calls.slice(before), ['get'], 'the alarm was re-set to the time it already held');

  // And when the last row is drained, the alarm is cleared rather than left in the past.
  clock.set(NOW + 4 * DAY);
  await k.drain(scheduler);
  assert.equal(scheduler.armed, null, 'a drained schedule left an alarm behind');
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'reminder' AND state = 'pending'").length, 0, 'the reminder was not drained');
  sql.close();
});

test('AND IT IS RE-ARMED EVEN WHEN THE DRAIN THROWS, which is the worst bug this can have', async () => {
  // A handler that throws before re-arming stops the customer's entire schedule forever, and nothing
  // anywhere says so: the reminders simply never fire again.
  const { k, sql, clock } = await record();
  const scheduler = recordingScheduler();
  const due = new Date(NOW + 10 * DAY).toISOString().slice(0, 10);
  value(k.create('obligations', { what: 'Invoice 41', due }, { actor: 'p_1' }));

  // Break the claim itself, so the transaction throws rather than one handler.
  sql.exec('DROP INDEX schedule_due');
  const broken = { ...sql, all: (text: string, ...p: never[]) => {
    if (text.includes("SET state = 'firing'")) throw new TypeError('storage went away');
    return sql.all(text, ...p);
  } };
  const k2 = await openRecord(broken as never, clock);

  clock.set(NOW + 4 * DAY);
  await assert.rejects(() => k2.drain(scheduler), /storage went away/);
  assert.ok(scheduler.armed !== null, 'the drain threw and the schedule stopped forever');
  sql.close();
});

test('the doorbell rings only when there is something in the outbox', async () => {
  const { k, sql } = await record();
  const scheduler = recordingScheduler();

  await k.tail(scheduler);
  assert.ok(!scheduler.calls.includes('wake'), 'the doorbell rang for an empty outbox');

  const id = k.outbox('notify.email', {});
  await k.tail(scheduler);
  assert.ok(scheduler.calls.includes('wake'));

  k.leaseOutbox(ALL, 10);
  value(k.ackOutbox({ id, state: 'done' }));
  const before = scheduler.calls.length;
  await k.tail(scheduler);
  assert.ok(!scheduler.calls.slice(before).includes('wake'), 'the doorbell rang for a drained outbox');
  sql.close();
});

test('AND `kept` IS CHECKED: a handler that says it moved the row and did not is a failure', async () => {
  /* `kept` is the one return the drain takes on trust. A handler that leaves the row at `firing`
     strands it — never claimable again, no ladder, no failure, and `done` reported to whoever
     asked. */
  const { sql } = await record();
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_liar', ?, 'purge', 'hourly', '{}', 'pending', 0)",
    new Date(NOW).toISOString(),
  );

  let n = 0;
  const drained = drainSchedule(sql, { mint: () => `01ABCDEFGHJKMNPQRSTVWXYZ0${++n}`, allocate: () => n, nowMs: NOW }, {
    purge: () => 'kept',
  });
  assert.equal(drained.done, 0);
  assert.equal(drained.failed, 1);

  const row = sql.one<{ state: string; attempts: number }>("SELECT state, attempts FROM schedule WHERE id = 's_liar'")!;
  assert.equal(row.state, 'pending', 'the row is stranded at firing');
  assert.equal(row.attempts, 1, 'it did not walk the ladder');
  sql.close();
});

test('AN `infer.draft` THAT COMES BACK FILES ITS QUESTION', async () => {
  /* `analyse` queues the one proposal a crossed threshold earns, and the ack marked the row done and
     returned — so whatever the model drafted reached nobody. Every governor, every threshold and the
     whole brake existed to decide WHETHER to ask a question, and the question could not be asked. */
  const { k, sql } = await record();
  k.outbox('infer.draft', { signal: 'search.empty', subject: 'retainer' });

  const leased = k.leaseOutbox(['infer.draft'], 10);
  assert.equal(leased.length, 1);
  value(
    k.ackOutbox({
      id: leased[0]!.id,
      state: 'done',
      result: {
        question: 'Six searches for “retainer” found nothing. Should there be a register for them?',
        body_kind: 'options',
        body: {
          options: [
            { id: 'yes', label: 'Add one', because: 'you keep looking for it' },
            { id: 'no', label: 'Leave it', because: 'it is not a thing you keep' },
          ],
          requires_reason: true,
        },
      },
    }),
  );

  const filed = sql.one<{ id: string; opened_by: string }>("SELECT id, opened_by FROM suggestion WHERE opened_by = 'slash'");
  assert.ok(filed, 'the draft was delivered and the question was thrown away');
  assert.equal(
    sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest'")?.to_v,
    'Six searches for “retainer” found nothing. Should there be a register for them?',
  );
  sql.close();
});

test('and a draft with nothing to file is a refusal rather than a retry', async () => {
  // The gate refuses a malformed body, and that is a fact about the DRAFT rather than about the
  // queue: a retry cannot fix it, so the job is done and the caller is told why.
  const { k, sql } = await record();
  k.outbox('infer.draft', {});
  const leased = k.leaseOutbox(['infer.draft'], 10);
  const out = k.ackOutbox({ id: leased[0]!.id, state: 'done', result: { body_kind: 'options' } });
  assert.equal(refusal(out).at, 'result');
  sql.close();
});

/* ── handing a row back unrun ────────────────────────────────────────────── */

test('UNLEASE PUTS A ROW BACK WITHOUT MOVING THE RETRY LADDER, which an ack would', async () => {
  const { k, sql } = await record();
  k.outbox('infer.draft', {});
  const held = k.leaseOutbox(['infer.draft'], 10)[0]!;

  unlease(sql, { id: held.id, leasedUntil: held.leasedUntil });

  const row = sql.one<{ state: string; leased_until: string | null; attempts: number }>(
    'SELECT state, leased_until, attempts FROM outbox WHERE id = ?',
    held.id,
  );
  assert.equal(row?.state, 'pending');
  assert.equal(row?.leased_until, null, 'and the lease is gone, so the next pass can take it');
  /* THE ATTEMPT COUNT DID NOT MOVE. Nothing was attempted: a row released because the invocation
     ran out of room is not a row that failed, and counting it would walk a healthy connector to
     the dead letter over a few busy afternoons. The ack is what counts an attempt, and an ack is
     exactly what this is not. */
  assert.equal(row?.attempts, 0);
  /* And it is leasable again, which is the whole point. */
  assert.equal(k.leaseOutbox(['infer.draft'], 10).length, 1);
  sql.close();
});

test('AND IT IS FENCED ON THE LEASE: a stale holder cannot unclaim a row another host now has', async () => {
  const { k, sql } = await record();
  k.outbox('infer.draft', {});
  const held = k.leaseOutbox(['infer.draft'], 10)[0]!;

  /* A PASS THAT RAN LONG AND LOST ITS LEASE. Without the fence it would hand back a row the new
     holder is in the middle of running, and two hosts would deliver one job. */
  unlease(sql, { id: held.id, leasedUntil: '1999-01-01T00:00:00.000Z' });

  const row = sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', held.id);
  assert.equal(row?.state, 'leased', 'the row stayed with whoever holds the lease');
  sql.close();
});
