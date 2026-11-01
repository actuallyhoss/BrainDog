/**
 * Batch 85's wiring through a real record: the lines that hand what was built to the kernel that runs it.
 *
 * - A draft the queue answers is filed under the cause its job was queued for (`pattern:<shape>`), so the shape's one
 *   question is found by its cause and not only by its samples.
 * - A time-sensitive notice inside the record's quiet hours sounds nothing, is kept, and leads the next digest; outside
 *   them, and on a record that turned them off, it sounds as it did.
 * - The names a host reads the bands, the other pairs and the owed shapes by are the kernel's own exports, and none of
 *   them folds or asks by being read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as kernel from '../src/index.ts';
import { openRecord, patternCause, owedShapes, pairsFor, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const DAY = 86_400_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/* ── the pattern's question carries its cause ───────────────────────────── */

const PAYMENTS: Declaration = {
  id: 'register.payments',
  kind: 'register',
  body: { id: 'payments', name: 'Payments', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/* An ingest that reads the sender's wording exactly. Synthetic wording, invented here. */
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

test('A DRAFT THE QUEUE ANSWERS IS FILED UNDER ITS JOB\'S CAUSE, so the shape is not owed and a second answer joins the one question', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 9, 14, 9));
  const k = await openRecord(sql, clock, { delivers: ['infer.draft'] });
  value(await k.install([PAYMENTS]));
  const shape = 'email:alerts@bank.example';
  for (const n of [1, 2, 3])
    value(k.arrive({ channel: 'email', headers: { From: 'Bank <alerts@bank.example>', Subject: 'Notice' }, body: `Paid ${n}`, sha256: `wire-${n}` }));
  assert.deepEqual(owedShapes(sql, clock.now()).map((o) => o.shape), [], 'a draft is out, so the shape is not owed a second');

  const [job] = k.leaseOutbox(['infer.draft'], 1);
  assert.ok(job, 'the third arrival queued no draft');
  const queued = JSON.parse(job.payload) as { cause: string; examples: string[] };
  assert.equal(queued.cause, patternCause(shape));
  value(k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { question: 'Read these three the same way?', body_kind: 'pattern', body: { ingest: READS, samples: queued.examples } } }));

  const asked = sql.all<{ cause: string | null; opened_by: string }>("SELECT cause, opened_by FROM suggestion WHERE status = 'open'").map((r) => ({ ...r }));
  assert.deepEqual(asked, [{ cause: 'pattern:email:alerts@bank.example', opened_by: 'slash' }]);
  /* AND IT IS FOUND BY THE CAUSE ALONE: with its samples gone from the question, the shape is still not owed. */
  sql.exec("UPDATE suggestion SET body = json_remove(body, '$.samples') WHERE status = 'open'");
  clock.advance(2 * DAY);
  value(k.arrive({ channel: 'email', headers: { From: 'Bank <alerts@bank.example>', Subject: 'Notice' }, body: 'Paid 4', sha256: 'wire-4' }));
  assert.deepEqual(owedShapes(sql, clock.now()).map((o) => o.shape), []);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.draft'")!.n, 1, 'a second draft was queued while the question waited');
  sql.close();
});

/* ── a notice inside quiet hours ────────────────────────────────────────── */

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    one: 'obligation',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

const RULE_URGENT: Declaration = {
  id: 'rule.urgent',
  kind: 'rule',
  body: { rule: 'urgent', register: 'obligations', on: 'create', when: 'state is open', once_per: ['row'], then: [{ notify: { say: 'Payment failed on {{what}}', urgent: true } }] } as never,
};

const WEEKLY = (channels: string[]): Declaration => ({
  id: 'digest.money-weekly',
  kind: 'digest',
  body: {
    digest: 'money-weekly',
    name: 'Money, weekly',
    schedule: { day: 'mon', at: '08:00' },
    channels,
    sections: [{ heading: 'Paid', source: 'register.obligations', where: 'state is paid', as: 'table', columns: [{ field: 'what' }], omit_when_empty: true }],
  } as never,
});

/** Saturday 5 September 2026 at 23:30 in London (22:30 UTC), inside 21:00 to 08:00. */
const NIGHT = Date.UTC(2026, 8, 5, 22, 30);
/** The same day at 13:00 in London. */
const NOON = Date.UTC(2026, 8, 5, 12);

async function studio(at: number, channels: string[] = ['email', 'in-app']): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(at);
  const k = await openRecord(sql, clock, { delivers: ['notify.email', 'notify.push'] });
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'Europe/London', locale: 'en-GB', owner: { id: 'p_1', email: 'me@example.test', name: 'Sam' } }));
  value(await k.install([OBLIGATIONS, RULE_URGENT, WEEKLY(channels)]));
  sql.exec("INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES ('ps_1', 'p_1', 'https://fcm.googleapis.com/fcm/send/p1', 'k', 'a', ?)", new Date(at).toISOString());
  return { k, sql, clock };
}

const sounded = (sql: NodeSql): string[] => sql.all<{ kind: string }>("SELECT kind FROM outbox WHERE kind IN ('notify.push', 'notify.email') ORDER BY kind").map((r) => r.kind);

/* ONCE WITH THE DIGEST'S OWN NOTE AND ONCE WITHOUT: a digest that only mails writes no note, and still says a held
   notice once. */
for (const channels of [['email', 'in-app'], ['email']])
test(`AT HALF PAST ELEVEN AN URGENT NOTICE SOUNDS NOTHING AND IS KEPT, and the next digest leads with it once (${channels.join(' and ')})`, async () => {
  const { k, sql, clock } = await studio(NIGHT, channels);
  value(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  assert.deepEqual(sounded(sql), [], 'a notice sounded inside quiet hours');
  assert.deepEqual(
    sql.all<{ field: string | null; note: string }>("SELECT field, note FROM event WHERE kind = 'note'").map((r) => ({ ...r })),
    [{ field: 'urgent', note: 'Payment failed on Invoice 41' }],
    'the notice was not kept',
  );

  /* MONDAY AT EIGHT, WITH NOTHING ELSE TO SAY: the digest still goes, because one waits, and leads with it. */
  const monday = Date.UTC(2026, 8, 7, 7, 0, 1);
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'digest', 'money-weekly', ?, 'pending', 0) ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, state = 'pending', attempts = 0",
    new Date(monday - 1000).toISOString(),
    JSON.stringify({ declaration: 'digest.money-weekly' }),
  );
  clock.set(monday);
  await k.drain();
  const mail = sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'notify.email'").map((r) => JSON.parse(r.payload) as { text: string });
  assert.equal(mail.length, 1, 'no digest went on the morning a held notice waited');
  assert.match(mail[0]!.text, /Held in quiet hours/u);
  assert.match(mail[0]!.text, /Payment failed on Invoice 41/u);

  /* AND IT IS SAID ONCE: the digest after that one has nothing held to lead with, and nothing else, so it is not sent. */
  sql.exec("UPDATE schedule SET due_at = ?, state = 'pending', attempts = 0 WHERE kind = 'digest'", new Date(monday + 7 * DAY - 1000).toISOString());
  clock.set(monday + 7 * DAY);
  await k.drain();
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'notify.email'")!.n, 1, 'a held notice was said twice');
  sql.close();
});

test('AT ONE IN THE AFTERNOON IT SOUNDS, and at night too on a record that turned quiet hours off', async () => {
  const day = await studio(NOON);
  value(day.k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  assert.deepEqual(sounded(day.sql), ['notify.email', 'notify.push']);
  /* A PUSH THAT NAMES NO CAUSE IS ITS PHONE'S ID, WHERE IT OPENS AND ITS KIND: a rule's notice opens its list, and a
     money list's is `money`. */
  assert.deepEqual(JSON.parse(day.sql.one<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'notify.push'")!.payload), {
    sub: { id: 'ps_1' },
    open: '/r/obligations',
    kind: 'money',
  });
  day.sql.close();

  const night = await studio(NIGHT);
  night.sql.exec("UPDATE record SET quiet = 'off' WHERE singleton = 1");
  value(night.k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  assert.deepEqual(sounded(night.sql), ['notify.email', 'notify.push']);
  night.sql.close();
});

/* ── read, and nothing more ─────────────────────────────────────────────── */

test('THE BANDS, THE OTHER PAIRS AND THE OWED SHAPES ARE THE KERNEL\'S OWN EXPORTS, and reading them writes nothing', async () => {
  for (const name of ['BAND_ASK', 'BAND_SURE', 'corroborated', 'settleVerdicts', 'pairsFor', 'evidenceOf', 'PAIRS_MOST', 'owedShapes', 'patternCause', 'RECORD_TIDY', 'readTidy', 'staleFigureOf', 'LEVELS', 'levelOf', 'heldIn'])
    assert.ok(name in kernel, `${name} is not exported`);
  assert.equal(kernel.BAND_ASK, 0.6);
  assert.equal(kernel.BAND_SURE, 0.9);

  const sql = openSqlite();
  const clock = fixedClock(NOON);
  const k = await openRecord(sql, clock);
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const counts = () => [sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')!.n, sql.one<{ n: number }>('SELECT count(*) AS n FROM outbox')!.n];
  const before = counts();
  assert.deepEqual(pairsFor(sql, clock.now()), { pairs: [], rows: {} });
  assert.deepEqual(owedShapes(sql, clock.now()), []);
  assert.deepEqual(counts(), before);
  /* AND THE NIGHT'S SWEEP FOLDS NOBODY AND ASKS NOTHING ON ITS OWN. */
  k.purge();
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')!.n, before[1]);
  sql.close();
});
