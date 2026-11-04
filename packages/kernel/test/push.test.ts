/**
 * Where a phone's subscription is kept: `push_sub`, migration 14, and the kernel's half of it (`push.ts`).
 *
 * THREE PROMISES, EACH ONE A WAY A SUBSCRIPTION COULD OUTLIVE ITS PERSON OR REACH SOMEBODY ELSE. It is listed for the
 * person who made it and for nobody else; the erasure of that person takes it; and a `.brain` file carries none of
 * it, because an endpoint is an address that rings one person's phone and a backup is a file that gets copied.
 *
 * THE ROWS ARE WRITTEN HERE BY HAND, IN THE SHAPE `packages/record/src/push.ts` WRITES THEM. The record's
 * `subscribePush` is the only writer, and it sits above the kernel; what is proved here is what the kernel does with
 * a row once it exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type EraseReport, type Kernel } from '../src/index.ts';
import { ownersPushSubs, pushKindOf, pushSubsOf, pushTargets, settlePush } from '../src/push.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const AT = new Date(NOW).toISOString();

/* A real endpoint's shape: the push service's host and an opaque path it minted for one browser. */
const ADA_PHONE = 'https://fcm.googleapis.com/fcm/send/ada-phone-7f3a';
const ADA_LAPTOP = 'https://updates.push.services.mozilla.com/wpush/v2/ada-laptop-91c2';
const MARA_PHONE = 'https://web.push.apple.com/QMara-phone-0d4e';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

function subscribe(sql: NodeSql, id: string, person: string, endpoint: string): void {
  sql.exec(
    'INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    person,
    endpoint,
    'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    'tBHItJI5svbpez7KI4CCXg',
    AT,
  );
}

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_ada', 'ada@studio.test', 'Ada Owner'), ('p_mara', 'mara@quill.test', 'Mara Quill')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_ada', '*', 'owner'), ('p_mara', '*', 'read')");
  subscribe(sql, 'ps_ada_phone', 'p_ada', ADA_PHONE);
  subscribe(sql, 'ps_ada_laptop', 'p_ada', ADA_LAPTOP);
  subscribe(sql, 'ps_mara_phone', 'p_mara', MARA_PHONE);
  return { k, sql };
}

test('A SUBSCRIPTION IS LISTED FOR THE PERSON WHO MADE IT, and a push to the owners reaches no reader', async () => {
  const { sql } = await record();
  assert.deepEqual(pushSubsOf(sql, ['p_ada']), ['ps_ada_laptop', 'ps_ada_phone']);
  assert.deepEqual(pushSubsOf(sql, ['p_mara']), ['ps_mara_phone']);
  assert.deepEqual(pushSubsOf(sql, ['p_nobody']), [], "a person with no subscription was listed somebody else's");
  assert.deepEqual(pushSubsOf(sql, []), []);

  /* THE OWNERS ARE WHO AN URGENT NOTICE AND A DIGEST GO TO (`digest.ts`), so a reader's phone is not among them. */
  assert.deepEqual(ownersPushSubs(sql), ['ps_ada_laptop', 'ps_ada_phone']);

  /* AND A SUSPENDED OWNER IS NOT AN OWNER, for the reason `owners()` in `index.ts` gives for their address. */
  sql.exec("UPDATE person SET suspended_at = ? WHERE id = 'p_ada'", AT);
  assert.deepEqual(ownersPushSubs(sql), [], "a suspended owner's phone would still have been rung");
  sql.close();
});

test('THE ENDPOINTS COME OUT ONLY BY ID, and only the ids asked for', async () => {
  const { sql } = await record();
  assert.deepEqual(pushTargets(sql, ['ps_ada_phone', 'ps_gone_already']), [{ id: 'ps_ada_phone', endpoint: ADA_PHONE }]);
  assert.deepEqual(pushTargets(sql, []), []);
  sql.close();
});

test('ERASING A PERSON TAKES EVERY SUBSCRIPTION THEY MADE, and nobody else\'s', async () => {
  const { k, sql } = await record();
  const report = value<EraseReport>(await k.erase({ subjects: ['Mara Quill'], personId: 'p_mara', basis: 'Article 17 request received 2026-09-22' }, 'p_ada'));
  assert.equal(report.counts.push_sub, 1, 'the erasure did not count the phone it took');
  assert.deepEqual(pushSubsOf(sql, ['p_mara']), [], 'the erased person can still be rung');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM push_sub WHERE person_id = 'p_mara'")?.n, 0);
  assert.deepEqual(pushSubsOf(sql, ['p_ada']), ['ps_ada_laptop', 'ps_ada_phone'], "the owner's phones went with somebody else's erasure");
  sql.close();
});

test('A .brain FILE CARRIES NO SUBSCRIPTION: not the table, not an endpoint, not a key', async () => {
  const { k, sql } = await record();
  const lines = value<string[]>(await k.export());
  assert.ok(lines.length > 0);
  const file = lines.join('\n');
  for (const needle of [ADA_PHONE, ADA_LAPTOP, MARA_PHONE, 'tBHItJI5svbpez7KI4CCXg', 'ps_ada_phone'])
    assert.equal(file.includes(needle), false, `the export carries ${needle}`);
  /* THE TABLE'S NAME IS IN THE FILE ONCE, AS ITS PLACE IN `dog_section`, and that is by design (`brainl.ts`): an import
     reads the map to know that a `local` table is absent on purpose rather than cut out. Measured on the first run of
     this test, which asked for no mention at all and found `["push_sub","local"]`. */
  assert.deepEqual(lines.filter((l) => l.includes('push_sub')), ['["push_sub","local"]']);
  sql.close();
});

test('A 404 OR 410 FROM THE PUSH SERVICE TAKES THE ROW, and one it accepted is marked as used', async () => {
  const { sql } = await record();
  const later = new Date(NOW + 60_000).toISOString();
  assert.deepEqual(settlePush(sql, { sent: ['ps_ada_laptop'], gone: ['ps_ada_phone'] }, later), { used: 1, dropped: 1 });
  assert.deepEqual(pushSubsOf(sql, ['p_ada']), ['ps_ada_laptop']);
  assert.equal(sql.one<{ used_at: string | null }>("SELECT used_at FROM push_sub WHERE id = 'ps_ada_laptop'")?.used_at, later);
  assert.equal(sql.one<{ used_at: string | null }>("SELECT used_at FROM push_sub WHERE id = 'ps_mara_phone'")?.used_at, null);
  /* A row already gone is nothing to drop, not a failure: two deliveries can both be told 410 for one phone. */
  assert.deepEqual(settlePush(sql, { gone: ['ps_ada_phone'] }, later), { used: 0, dropped: 0 });
  sql.close();
});

/* ── the job, its lease and its answer ───────────────────────────────────── */

/* A LIST AND ONE URGENT RULE, which is the shortest path to `notify()` a test can take: a rule declaring `urgent` is one
   of the two things `09 §5` interrupts for, and `digest.ts` routes it through the same `outbox` dep a digest's `push`
   channel uses. */
const TASKS = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', one: 'task', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};
const URGENT = {
  id: 'rule.urgent',
  kind: 'rule',
  body: { rule: 'urgent', register: 'tasks', on: 'create', once_per: ['row'], then: [{ notify: { say: 'Payment failed on {{what}}', urgent: true } }] },
};

async function interrupting(subscribed: boolean): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { delivers: ['notify.email', 'notify.push'] });
  value(
    k.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_ada', email: 'ada@studio.test', name: 'Ada Owner' },
    }),
  );
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_mara', 'mara@quill.test', 'Mara Quill')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_mara', '*', 'read')");
  if (subscribed) {
    subscribe(sql, 'ps_ada_phone', 'p_ada', ADA_PHONE);
    subscribe(sql, 'ps_ada_laptop', 'p_ada', ADA_LAPTOP);
    subscribe(sql, 'ps_mara_phone', 'p_mara', MARA_PHONE);
  }
  value(await k.install([TASKS, URGENT] as never));
  return { k, sql, clock };
}

const queued = (sql: NodeSql, kind: string): unknown[] =>
  sql.all<{ payload: string }>('SELECT payload FROM outbox WHERE kind = ? ORDER BY id', kind).map((r) => JSON.parse(r.payload) as unknown);

const refusalOf = (r: unknown): { code?: string; at?: string } => (r as { refusal?: { code: string; at?: string } }).refusal ?? {};

test('AN INTERRUPT QUEUES ONE notify.push PER OWNER SUBSCRIPTION, and each names its id and nothing else', async () => {
  const { k, sql } = await interrupting(true);
  value(k.create('tasks', { what: 'Invoice 41' }, { actor: 'p_ada' }));

  /* ONE JOB PER PHONE, BECAUSE THE ACK SAYS WHETHER THAT PHONE IS GONE (`51 §5`), and a job naming two could only say it
     of both. Mara reads the record and is not an owner, so her phone is not rung for it. */
  assert.deepEqual(
    queued(sql, 'notify.push').map((p) => JSON.stringify(p)).sort(),
    /* THE ID, WHERE A TAP OPENS AND THE KIND, which the owner's switches read: a path and a word, never an address or a sentence. */
    [{ sub: { id: 'ps_ada_laptop' }, open: '/r/tasks', kind: 'needs' }, { sub: { id: 'ps_ada_phone' }, open: '/r/tasks', kind: 'needs' }].map((p) => JSON.stringify(p)),
    'the push jobs are not one per owner subscription, by id, where it opens and its kind',
  );
  /* AND NO ADDRESS AND NO WORDS IN THE OUTBOX, WHICH TRAVELS. The outbox is in the `data` section, so whatever a payload
     holds is in the next `.brain` file; an endpoint there is a way to ring Ada's phone from a copied backup. */
  const outbox = sql.all<{ payload: string }>('SELECT payload FROM outbox').map((r) => r.payload).join('\n');
  for (const needle of [ADA_PHONE, ADA_LAPTOP, MARA_PHONE, 'fcm.googleapis.com'])
    assert.equal(outbox.includes(needle), false, `the outbox carries ${needle}`);
  assert.equal(JSON.stringify(queued(sql, 'notify.push')).includes('Payment failed'), false, 'a push job carries the notice');
  assert.equal(queued(sql, 'notify.email').length, 1, 'the email half of the interrupt was lost');

  /* ONE INTERRUPT AN HOUR, STILL (`09 §4`). */
  value(k.create('tasks', { what: 'Invoice 42' }, { actor: 'p_ada' }));
  assert.equal(queued(sql, 'notify.push').length, 2, 'the second write rang the phones again within the hour');
  assert.equal(queued(sql, 'notify.email').length, 1, 'the second write mailed again within the hour');
  sql.close();
});

test('WITH NOBODY SUBSCRIBED AN INTERRUPT QUEUES NO PUSH, and the hour still holds the email to one', async () => {
  /* THE STATE OF EVERY RECORD TODAY. The hour's limit was counted over `notify.push` rows, and an interrupt used to write
     one whether or not a phone would ever hear it; one job per subscription writes none here, so counted the old way the
     limit reads "never interrupted" and mails the owner on every urgent write. */
  const { k, sql, clock } = await interrupting(false);
  value(k.create('tasks', { what: 'Invoice 41' }, { actor: 'p_ada' }));
  value(k.create('tasks', { what: 'Invoice 42' }, { actor: 'p_ada' }));
  assert.deepEqual(queued(sql, 'notify.push'), [], 'a push job was queued for nobody');
  assert.equal(queued(sql, 'notify.email').length, 1, 'the owner was mailed twice inside the hour');

  /* AND AN HOUR LATER IT INTERRUPTS AGAIN, so the limit is an hour and not for ever. */
  clock.set(NOW + 3_600_000 + 1000);
  value(k.create('tasks', { what: 'Invoice 43' }, { actor: 'p_ada' }));
  assert.equal(queued(sql, 'notify.email').length, 2);
  sql.close();
});

test('THE ENDPOINT COMES OUT UNDER THE LEASE AND NO OTHER WAY, as a sealed key does', async () => {
  const { k, sql, clock } = await interrupting(true);
  const id = k.outbox('notify.push', { sub: { id: 'ps_ada_phone' } });

  /* PENDING IS NOT HELD. The same three lease checks `sealedGrant` makes, for the same three attacks. */
  assert.equal(refusalOf(k.pushTarget({ outbox: id, leasedUntil: '2026-09-23T12:01:00.000Z' })).code, 'PULL_LEASE_EDGE');

  const [job] = k.leaseOutbox(['notify.push'], 1);
  assert.ok(job && job.id === id);
  assert.deepEqual(value(k.pushTarget({ outbox: id, leasedUntil: job.leasedUntil })), { id: 'ps_ada_phone', endpoint: ADA_PHONE });
  assert.equal(refusalOf(k.pushTarget({ outbox: id, leasedUntil: '2026-09-23T12:00:30.000Z' })).at, 'leasedUntil', 'a lease somebody else took answered');

  /* A JOB OF ANOTHER KIND OPENS NO ADDRESS, whatever its payload says. */
  const mail = k.outbox('notify.email', { sub: { id: 'ps_ada_phone' } });
  const [held] = k.leaseOutbox(['notify.email'], 1);
  assert.ok(held && held.id === mail);
  assert.equal(refusalOf(k.pushTarget({ outbox: mail, leasedUntil: held.leasedUntil })).code, 'OUT_OF_BOUNDS');

  /* UNSUBSCRIBED BETWEEN THE QUEUE AND THE LEASE: nothing to ring, and that is an answer rather than a refusal. */
  sql.exec("DELETE FROM push_sub WHERE id = 'ps_ada_phone'");
  assert.equal(value(k.pushTarget({ outbox: id, leasedUntil: job.leasedUntil })), null);

  /* AND A LAPSED LEASE IS NOBODY'S. */
  clock.set(Date.parse(job.leasedUntil) + 1);
  assert.equal(refusalOf(k.pushTarget({ outbox: id, leasedUntil: job.leasedUntil })).code, 'PULL_LEASE_EDGE');
  sql.close();
});

test('AN ACK OF { gone: true } DELETES THE SUBSCRIPTION, and a push that went marks it used', async () => {
  const { k, sql } = await interrupting(true);
  k.outbox('notify.push', { sub: { id: 'ps_ada_phone' } });
  k.outbox('notify.push', { sub: { id: 'ps_ada_laptop' } });
  const jobs = k.leaseOutbox(['notify.push'], 10);
  const of = (sub: string) => jobs.find((j) => (JSON.parse(j.payload) as { sub: { id: string } }).sub.id === sub)!;

  value(k.ackOutbox({ id: of('ps_ada_phone').id, state: 'done', leasedUntil: of('ps_ada_phone').leasedUntil, result: { gone: true } }));
  value(k.ackOutbox({ id: of('ps_ada_laptop').id, state: 'done', leasedUntil: of('ps_ada_laptop').leasedUntil }));

  assert.deepEqual(pushSubsOf(sql, ['p_ada']), ['ps_ada_laptop'], 'the phone the service called gone is still rung');
  assert.equal(sql.one<{ used_at: string | null }>("SELECT used_at FROM push_sub WHERE id = 'ps_ada_laptop'")?.used_at, AT);
  assert.deepEqual(
    sql.all<{ state: string }>("SELECT state FROM outbox WHERE kind = 'notify.push'").map((r) => r.state),
    ['done', 'done'],
    'a gone phone walked the ladder',
  );
  sql.close();
});

test('A STALE ACK SAYING gone DELETES NOTHING: the fence is checked before the row is touched', async () => {
  const { k, sql } = await interrupting(true);
  k.outbox('notify.push', { sub: { id: 'ps_ada_phone' } });
  const [job] = k.leaseOutbox(['notify.push'], 1);
  assert.ok(job);
  const stale = k.ackOutbox({ id: job.id, state: 'done', leasedUntil: '2026-09-23T11:00:00.000Z', result: { gone: true } });
  assert.equal(stale.ok, false);
  assert.deepEqual(pushSubsOf(sql, ['p_ada']), ['ps_ada_laptop', 'ps_ada_phone'], 'an ack about a lease that is over dropped a phone');
  sql.close();
});

test('A PUSH THAT NAMES WHERE IT OPENS HANDS THE PATH AND THE PHONE\'S KEYS UNDER THE LEASE, and a path that is not one is dropped (E44)', async () => {
  const { k, sql } = await interrupting(true);
  const id = k.outbox('notify.push', { sub: { id: 'ps_ada_phone' }, open: '/decide/sg_01JABCDEF' });
  const bad = k.outbox('notify.push', { sub: { id: 'ps_ada_laptop' }, open: 'https://elsewhere.test/x' });
  const jobs = k.leaseOutbox(['notify.push'], 2);
  const job = jobs.find((j) => j.id === id)!;
  const other = jobs.find((j) => j.id === bad)!;
  const target = value<{ open?: string; keys?: { p256dh: string; auth: string } }>(k.pushTarget({ outbox: id, leasedUntil: job.leasedUntil }));
  assert.equal(target.open, '/decide/sg_01JABCDEF');
  assert.deepEqual(Object.keys(target.keys ?? {}).sort(), ['auth', 'p256dh']);
  assert.deepEqual(value(k.pushTarget({ outbox: bad, leasedUntil: other.leasedUntil })), { id: 'ps_ada_laptop', endpoint: ADA_LAPTOP });
  sql.close();
});

test('A KIND AN OWNER TURNED OFF RINGS NONE OF THEIR PHONES, and every other kind still rings them', async () => {
  const { k, sql } = await record();
  subscribe(sql, 'ps_1', 'p_ada', 'https://fcm.googleapis.com/fcm/send/ada');
  sql.exec("INSERT INTO pref (person_id, key, value, updated_at) VALUES ('p_ada', 'push.off', '[\"money\",\"summary\"]', ?)", new Date(NOW).toISOString());
  assert.deepEqual(ownersPushSubs(sql, 'money'), []);
  assert.deepEqual(ownersPushSubs(sql, 'summary'), []);
  /* EVERY ONE OF ADA'S PHONES, the two `record` seeds and this one, for the kinds she left on. */
  assert.deepEqual(ownersPushSubs(sql, 'needs'), ['ps_1', 'ps_ada_laptop', 'ps_ada_phone']);
  /* WITH NO KIND, every owner's phone, as before: the test press and the counts read it so. */
  assert.deepEqual(ownersPushSubs(sql), ['ps_1', 'ps_ada_laptop', 'ps_ada_phone']);
  void k;
  sql.close();
});

test('A PUSH IS ONE KIND, read off its cause and where it opens, and never a word of it', () => {
  assert.equal(pushKindOf({ url: '/agents/summary/money-weekly' }), 'summary');
  assert.equal(pushKindOf({ cause: 'asked.sg_1', url: '/decide/sg_1' }), 'agents');
  assert.equal(pushKindOf({ cause: 'instruction.e_1.done', open: '/p/agents' }), 'agents');
  assert.equal(pushKindOf({ url: '/r/installments' }), 'money');
  assert.equal(pushKindOf({ url: '/r/tasks' }), 'needs');
  assert.equal(pushKindOf({ url: '/decide' }), 'needs');
  assert.equal(pushKindOf(null), 'needs');
});
