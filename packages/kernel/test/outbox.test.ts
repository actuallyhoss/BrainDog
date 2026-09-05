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

import { backoffMs, openRecord, summary, type Declaration, type Kernel, type OutboxKind } from '../src/index.ts';
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
  assert.equal(Date.parse(retry.due_at) - NOW, 2 * MINUTE, 'the first retry is not two minutes out');
  assert.deepEqual(JSON.parse(retry.payload), { outbox: id });

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
  assert.equal(Date.parse(due) - (NOW + 3 * MINUTE), 4 * MINUTE, 'the second retry is not four minutes out');
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
    at += backoffMs(n) + MINUTE;
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

test('a kind nothing handles fails ONCE and says so, rather than pretending for eight hours', async () => {
  const { k, sql } = await record();
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'pull', 'weekly', '{}', 'pending', 0)",
    new Date(NOW - MINUTE).toISOString(),
  );
  const drained = await k.drain();
  assert.equal(drained.dead, 1);
  assert.equal(sql.one<{ state: string }>("SELECT state FROM schedule WHERE id = 's_1'")?.state, 'failed');

  const item = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion')!.body) as { question: string };
  assert.match(item.question, /pull/);
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
  assert.equal(row(sql, id).attempts, 3);
  assert.equal(
    sql.one<{ attempts: number }>("SELECT attempts FROM schedule WHERE kind = 'retry'")?.attempts,
    3,
    'the retry row is counting a ladder of its own',
  );
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0, 'a ceiling was reached three attempts early');
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
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE state = 'pending'").length, 3);
  sql.close();
});

/* ── the alarm, and the doorbell ─────────────────────────────────────────── */

test('THE ALARM IS THE EARLIEST PENDING ROW, or there is no alarm', async () => {
  const { k, sql, clock } = await record();
  const scheduler = recordingScheduler();

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
