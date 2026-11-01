/**
 * The digest: what the record tells you, on a schedule you set once.
 *
 * BATCH BY DEFAULT, INTERRUPT BY EXCEPTION. What is asserted here is mostly restraint — a digest
 * with nothing in it is not sent, a section with no rows is dropped rather than printed as a heading
 * over nothing, a push carries no content, and nothing leaves the record: every channel is an outbox
 * row assembled inside the alarm's transaction, so a slow SMTP server cannot hold a schedule.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inQuietHours, jcs, localParts, mutedFor, nextOccurrence, openRecord, URGENT_NOTE, type Declaration, type Kernel, type OutboxKind } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

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
      { id: 'amount', type: 'money', index: true },
      { id: 'due', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

const OVERDUE: Declaration = {
  id: 'metric.overdue',
  kind: 'metric',
  body: {
    metric: 'overdue',
    name: 'Overdue',
    source: 'register.obligations',
    where: 'state is open, due before today',
    value: { sum: 'amount' },
    target: { lte: 100_000 },
    window: '30d',
    compare: 'none',
    format: 'money.GBP',
  } as never,
};

/** A rule that interrupts. 09 §5's first urgent-by-default: a payment failing. */
const RULE_URGENT: Declaration = {
  id: 'rule.urgent',
  kind: 'rule',
  body: {
    rule: 'urgent',
    register: 'obligations',
    on: 'create',
    when: 'state is open',
    once_per: ['row'],
    then: [{ notify: { say: 'Payment failed on {{what}}', urgent: true } }],
  } as never,
};

const WEEKLY = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'digest.money-weekly',
  kind: 'digest',
  body: {
    digest: 'money-weekly',
    name: 'Money, weekly',
    schedule: { day: 'mon', at: '08:00' },
    channels: ['email', 'in-app'],
    sections: [
      { heading: 'Overdue', source: 'metric.overdue', as: 'stat' },
      {
        heading: 'What is late',
        source: 'register.obligations',
        where: 'state is open, due before today',
        as: 'table',
        columns: [{ field: 'seq' }, { field: 'what' }, { field: 'amount' }, { field: 'due' }],
        omit_when_empty: true,
      },
      {
        heading: 'Paid',
        source: 'register.obligations',
        where: 'state is paid',
        as: 'table',
        columns: [{ field: 'what' }],
        omit_when_empty: true,
      },
    ],
    ...over,
  } as never,
});

const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);

type Clockish = ReturnType<typeof fixedClock>;

async function record(
  digest = WEEKLY(),
  rows = true,
  delivers: OutboxKind[] = ['notify.email', 'notify.push', 'notify.webhook', 'infer.prose'],
): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { delivers });
  assert.ok(
    k.createRecord({
      id: ID,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'Europe/London',
      locale: 'en-GB',
      owner: { id: 'p_1', email: 'me@example.test', name: 'Sam' },
    }).ok,
  );
  assert.ok((await k.install([OBLIGATIONS, OVERDUE, digest])).ok);
  if (rows) {
    assert.ok(k.create('obligations', { what: 'Invoice 41', amount: { amount: 480_000, currency: 'GBP' }, due: day(-38), state: 'open' }, { actor: 'p_1' }).ok);
    assert.ok(k.create('obligations', { what: 'Invoice 38', amount: { amount: 180_000, currency: 'GBP' }, due: day(-71), state: 'paid' }, { actor: 'p_1' }).ok);
  }
  return { k, sql, clock };
}

/**
 * The digest's own row, moved to a time these tests can reach.
 *
 * AN UPSERT, BECAUSE THE INSTALL ARMS IT NOW. It did not — `digest` had a complete handler and
 * nothing ever wrote a row for it — so this used to insert one, and now collides with the row the
 * declaration earned. Moving the armed row is also closer to what these tests are about: the digest
 * that fires is the one the record armed, not one the test invented.
 */
const arm = (sql: NodeSql, atMs: number) =>
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'digest', 'money-weekly', ?, 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0`,
    new Date(atMs).toISOString(),
    JSON.stringify({ declaration: 'digest.money-weekly' }),
  );

const outbox = (sql: NodeSql) => sql.all<{ kind: string; payload: string }>('SELECT kind, payload FROM outbox ORDER BY created, id');

/* ── it goes out ─────────────────────────────────────────────────────────── */

test('A DIGEST IS ASSEMBLED IN THE RECORD AND DELIVERED BY SOMETHING ELSE', async () => {
  const { k, sql, clock } = await record();
  arm(sql, NOW);
  clock.set(NOW + 1000);

  const drained = await k.drain();
  assert.ok(drained.done >= 1);
  assert.equal(drained.failed, 0);
  assert.equal(drained.dead, 0, '`digest` is a kind nothing handles');

  const queued = outbox(sql);
  assert.equal(queued.length, 1, `${queued.length} rows for one digest`);
  assert.equal(queued[0]?.kind, 'notify.email');

  const payload = JSON.parse(queued[0]!.payload) as { to: string[]; subject: string; text: string };
  assert.deepEqual(payload.to, ['me@example.test'], 'the digest went somewhere other than its owner');
  assert.equal(payload.subject, 'Money, weekly');
  assert.match(payload.text, /## Overdue/);
  assert.match(payload.text, /Invoice 41/, 'the late invoice is not in the digest');
  sql.close();
});

test('and the in-app channel is an EVENT, because the event is the notification', async () => {
  // There is no inbox table: the unread count is counted over these, in one place, on the record
  // rather than per page — a badge per nav section is how a product teaches people to ignore badges.
  const { k, sql, clock } = await record();
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const note = sql.one<{ actor: string; note: string }>("SELECT actor, note FROM event WHERE actor LIKE 'digest:%'")!;
  assert.equal(note.actor, 'digest:money-weekly');
  assert.match(note.note, /^Money, weekly: /);
  assert.ok(note.note.length <= 280);
  sql.close();
});

test('A SECTION WITH NO ROWS IS DROPPED, not printed as a heading over nothing', async () => {
  const { k, sql, clock } = await record();
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const text = (JSON.parse(outbox(sql)[0]!.payload) as { text: string }).text;
  assert.match(text, /## What is late/);
  assert.match(text, /## Paid/, 'the seed has a paid row, so that section is not empty');

  // With nothing paid, that heading goes rather than standing over an empty table.
  const bare = await record(WEEKLY(), false);
  assert.ok(bare.k.create('obligations', { what: 'Late', amount: { amount: 1, currency: 'GBP' }, due: day(-1), state: 'open' }, { actor: 'p_1' }).ok);
  arm(bare.sql, NOW);
  bare.clock.set(NOW + 1000);
  await bare.k.drain();
  const only = (JSON.parse(outbox(bare.sql)[0]!.payload) as { text: string }).text;
  assert.match(only, /## What is late/);
  assert.ok(!only.includes('## Paid'), 'an empty section printed its heading anyway');
  sql.close();
  bare.sql.close();
});

test('A COLUMN WITH NO LABEL OVER THE LIST’S TITLE IS HEADED BY WHAT ONE ROW IS CALLED, as a page heads it', async () => {
  const { k, sql, clock } = await record();
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();
  const text = (JSON.parse(outbox(sql)[0]!.payload) as { text: string }).text;
  assert.ok(text.includes('seq | Obligation | amount | due'), text);
  assert.ok(!text.includes('| what |'), 'the title column is headed by its field id');
  sql.close();
});

test('AND BY THE WORD THE RECORD SPEAKS, when a use case calls one row of the list something else', async () => {
  const { k, sql, clock } = await record();
  const words = (id: string, one: string, speaks?: boolean) =>
    k.rememberPack({
      id,
      version: '1.0.0',
      source: 'local',
      ref: null,
      manifest: jcs({ pack: id, version: '1.0.0', config: { one_obligations: { type: 'text', default: one }, ...(speaks === undefined ? {} : { speaks: { type: 'bool', default: speaks } }) } }),
      checksum: 'not-a-real-checksum',
    });
  words('usecase-aaa', 'Receipt', false);
  words('usecase-bbb', 'Bill');
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();
  const text = (JSON.parse(outbox(sql)[0]!.payload) as { text: string }).text;
  assert.ok(text.includes('seq | Bill | amount | due'), text);
  sql.close();
});

test('A DIGEST WITH NOTHING IN IT IS NOT SENT', async () => {
  /* "Nothing needs you this week" is worth saying at most once a month, not weekly — weekly nothing
     teaches somebody to stop opening it, and then the one that mattered arrives in a folder they no
     longer read. */
  const empty = WEEKLY({
    sections: [
      { heading: 'What is late', source: 'register.obligations', where: 'state is open', as: 'table', omit_when_empty: true },
    ],
  });
  const { k, sql, clock } = await record(empty, false);
  arm(sql, NOW);
  clock.set(NOW + 1000);
  const drained = await k.drain();

  assert.equal(drained.done, 1, 'a skipped digest is not a failed one');
  assert.equal(outbox(sql).length, 0, 'a digest with nothing in it was sent');
  assert.equal(sql.all("SELECT 1 FROM event WHERE actor LIKE 'digest:%'").length, 0);

  // And it is still due next Monday: skipping is not failing.
  const next = sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'digest'")!;
  assert.equal(next.state, 'pending');
  assert.ok(Date.parse(next.due_at) > NOW);
  sql.close();
});

/* ── the channels ────────────────────────────────────────────────────────── */

test('A PUSH CARRIES NO CONTENT, only which phone it rings', async () => {
  /* A lock screen is not a place a person chose to read their business on, and the outbox travels in every `.brain`
     file. A push is one job per owner subscription naming it by id, and the Worker sends it with no body. */
  const { k, sql, clock } = await record(WEEKLY({ channels: ['push'] }));
  sql.exec(
    "INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES ('ps_1', 'p_1', 'https://fcm.googleapis.com/fcm/send/p1', 'k', 'a', ?)",
    new Date(NOW).toISOString(),
  );
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const row = outbox(sql)[0]!;
  assert.equal(row.kind, 'notify.push');
  /* WHERE A TAP OPENS rides with it: the summary's own screen, a path in the app, which says no content either. */
  assert.deepEqual(JSON.parse(row.payload), { sub: { id: 'ps_1' }, open: '/agents/summary/money-weekly', kind: 'summary' });
  assert.ok(!row.payload.includes('Invoice 41'), 'the push carried the content');
  assert.ok(!row.payload.includes('fcm.googleapis.com'), 'the push carried the address');
  sql.close();
});

test('`prose: slash` QUEUES ONE INFERENCE AND STOPS, so a slow model never holds the alarm', async () => {
  const { k, sql, clock } = await record(WEEKLY({ prose: 'slash' }));
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const queued = outbox(sql);
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.kind, 'infer.prose', 'the digest sent itself instead of waiting for its sentence');
  const payload = JSON.parse(queued[0]!.payload) as { digest: string; channels: string[] };
  assert.equal(payload.digest, 'money-weekly');
  assert.deepEqual(payload.channels, ['email', 'in-app'], 'the ack has no idea where to send it');

  /* AND THE ACK IS WHERE IT LEAVES. This half was never written: the row was queued, nothing
     consumed it, and every digest declaring `prose: slash` sent nothing on any channel, ever, with
     no error to say so. */
  const leased = k.leaseOutbox(['infer.prose'], 10);
  assert.equal(leased.length, 1);
  assert.ok(
    k.ackOutbox({
      id: leased[0]!.id,
      state: 'done',
      leasedUntil: leased[0]!.leasedUntil,
      result: { text: 'Two invoices are open. One is over a month late. And a third sentence nobody asked for.' },
    }).ok,
  );

  const sent = outbox(sql).filter((r) => r.kind === 'notify.email');
  assert.equal(sent.length, 1, 'the ack sent no email');
  const mail = JSON.parse(sent[0]!.payload) as { text: string; subject: string };
  assert.match(mail.text, /^Two invoices are open\. One is over a month late\.\n\n— Slash\n\n# Money, weekly/);
  assert.ok(!mail.text.includes('third sentence'), 'the two-sentence cap is the record’s, and it did not apply it');

  /* AND THE IN-APP NOTE WENT TOO, from the headline decided when the alarm fired. */
  assert.equal(
    sql.all("SELECT 1 FROM event WHERE actor = 'digest:money-weekly'").length,
    1,
    'the in-app channel was dropped on the prose path',
  );
  sql.close();
});

test('A PROSE CALL THAT COULD NOT BE MADE IS RETRIED, and the digest goes at the ceiling', async () => {
  /* TWO DIFFERENT EVENTS WEAR THE SAME ACK. A model that answered and said nothing usable is 46 §5's
     case — figures only, never retried, because retrying bills twice for one payload (07 §7). A
     request that never REACHED one is not: `pump` acks `failed` for a twenty-second timeout, a 502
     or a DNS blip, and nothing bills twice for a call that did not happen. So the ladder runs, and
     the ladder ending is the right moment to stop waiting for two sentences. */
  const { k, sql, clock } = await record(WEEKLY({ prose: 'slash' }));
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const id = sql.one<{ id: string }>("SELECT id FROM outbox WHERE kind = 'infer.prose'")!.id;
  const fail = () => {
    const leased = k.leaseOutbox(['infer.prose'], 10);
    assert.equal(leased.length, 1, 'the prose row was not leasable');
    assert.ok(k.ackOutbox({ id, state: 'failed', error: 'the model answered 503', leasedUntil: leased[0]!.leasedUntil }).ok);
  };

  fail();
  assert.equal(sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', id)!.state, 'failed');
  assert.equal(outbox(sql).filter((r) => r.kind === 'notify.email').length, 0, 'one bad minute shipped the digest early');
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'retry'").length, 1, 'a transport failure armed no retry');

  /* Seven more, which is the ceiling. Each retry row is wound forward rather than waited out. */
  let at = NOW + 1000;
  for (let n = 2; n <= 8; n++) {
    at += 6 * 3_600_000;
    clock.set(at);
    sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'retry'", new Date(at - 1000).toISOString());
    await k.drain();
    fail();
  }

  /* AT THE CEILING THE DIGEST STILL GOES, as figures. `done` and not `dead`: the work this row
     existed for was done at that point, and a dead letter would ask somebody to decide about an
     ornament. */
  assert.equal(sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', id)!.state, 'done');
  const mail = outbox(sql).filter((r) => r.kind === 'notify.email');
  assert.equal(mail.length, 1, 'eight failures took the digest with them');
  assert.match(JSON.parse(mail[0]!.payload).text as string, /^# Money, weekly/, 'the figures-only digest carried an attribution');
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0, 'an ornament was filed as a decision to make');
  sql.close();
});

test('AND ON A HOST WITH NO MODEL IT SHIPS AS FIGURES NOW, rather than never', async () => {
  /* A kind no host delivers waits `pending` for ever, which is right for a notification and wrong
     for the row that is HOLDING a digest: it parks everything behind it. A self-host with no model
     would have gone quiet the morning somebody added two sentences to a declaration, and stayed
     quiet, with nothing anywhere saying why. 11 §3: Slash is an accelerant, never a dependency. */
  const { k, sql, clock } = await record(WEEKLY({ prose: 'slash' }), true, ['notify.email']);
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const rows = outbox(sql);
  assert.equal(rows.filter((r) => r.kind === 'infer.prose').length, 0, 'the digest is parked behind a model nobody has');
  assert.equal(rows.filter((r) => r.kind === 'notify.email').length, 1, 'the digest never went');
  sql.close();
});

test('a digest with no owner to send to queues nothing rather than guessing one', async () => {
  // On a shared record the first person the record can name is somebody else.
  const { k, sql, clock } = await record(WEEKLY({ channels: ['email'] }));
  sql.exec("UPDATE person SET email = NULL WHERE id = 'p_1'");
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();
  assert.equal(outbox(sql).length, 0);
  sql.close();
});

test('a digest whose declaration is gone is dropped rather than fired', async () => {
  const { k, sql, clock } = await record();
  arm(sql, NOW);
  value(await k.retire(['digest.money-weekly']));
  clock.set(NOW + 1000);
  const drained = await k.drain();
  assert.equal(drained.dead, 0, 'a retired digest was a failure rather than a drop');
  assert.equal(outbox(sql).length, 0);
  sql.close();
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/* ── when it next fires ──────────────────────────────────────────────────── */

test('A WEEKLY DIGEST LANDS ON ITS DAY, at its hour, in the record’s timezone', () => {
  /* A table of offsets is a table that is wrong the next time a government moves one. The runtime
     carries the zone data; the walk asks it what the local parts of a candidate instant are. */
  const saturday = Date.UTC(2026, 8, 5, 12);
  const next = nextOccurrence({ day: 'mon', at: '08:00' }, saturday, 'Europe/London')!;
  assert.ok(next !== null);
  const parts = localParts(next, 'Europe/London');
  assert.equal(parts.weekday, 1, 'a Monday digest did not land on a Monday');
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 0);
  assert.ok(next > saturday && next < saturday + 4 * DAY);
});

test('and a daily one lands every day, at that hour where the customer is', () => {
  const at = nextOccurrence({ at: '08:00' }, NOW, 'Pacific/Auckland')!;
  assert.ok(at !== null);
  assert.equal(localParts(at, 'Pacific/Auckland').hour, 8);
  assert.ok(at > NOW);

  // A different zone is a different instant for the same wall clock, which is the whole point.
  const london = nextOccurrence({ at: '08:00' }, NOW, 'Europe/London');
  assert.notEqual(at, london);
});

test('quiet hours are 21:00 to 08:00 where the customer is, not where the server is', () => {
  // Which is why the record stores a timezone and why plain days render at noon UTC.
  assert.equal(inQuietHours(Date.UTC(2026, 8, 5, 23), 'Europe/London'), true);
  assert.equal(inQuietHours(Date.UTC(2026, 8, 5, 12), 'Europe/London'), false);
  // Midday UTC is one in the morning in Auckland.
  assert.equal(inQuietHours(Date.UTC(2026, 8, 5, 12), 'Pacific/Auckland'), true);
});

/* ── what a section could not do ─────────────────────────────────────────── */

test('A SECTION THE RECORD CANNOT ANSWER SAYS SO, rather than going quietly missing', async () => {
  // The alternative is a digest silently without the thing somebody set it up for — and the person
  // who set it up is the one least likely to notice its absence.
  const broken = WEEKLY({
    sections: [{ heading: 'Nonsense', source: 'register.obligations', where: 'colour is red', as: 'table' }],
  });
  const { k, sql, clock } = await record(broken);
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const text = (JSON.parse(outbox(sql)[0]!.payload) as { text: string }).text;
  assert.match(text, /## Nonsense/);
  assert.match(text, /colour/, 'the digest dropped the section instead of saying what happened');
  sql.close();
});

test('A CHANNEL THAT SENT NOTHING IS NOT IN THE RECEIPT', async () => {
  /* `mcp` fell out of the bottom of a loop with no `else`: the schedule row was marked done and
     re-armed, and `runDigest` returned `{ channels: ['mcp'], skipped: false }`, so everything that
     could have noticed said it went. It is a case now — a digest is already the MCP resource
     `digest/today`, "what the scheduler would have said" (10 §6), so an agent reads it by asking
     rather than by being pushed at — and the receipt says which channels actually carried it. */
  const { k, sql, clock } = await record(WEEKLY({ channels: ['mcp', 'email', 'in-app'] }));
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  assert.equal(outbox(sql).filter((r) => r.kind === 'notify.email').length, 1, 'the email went nowhere');
  assert.equal(sql.all("SELECT 1 FROM event WHERE actor = 'digest:money-weekly'").length, 1, 'the in-app note went nowhere');

  /* AND AN EMAIL CHANNEL ON A RECORD WITH NO ADDRESS TO SEND TO IS NOT IN IT EITHER. */
  const { k: k2, sql: sql2, clock: c2 } = await record(WEEKLY({ channels: ['email', 'mcp'] }));
  sql2.exec("UPDATE person SET email = NULL WHERE id = 'p_1'");
  arm(sql2, NOW);
  c2.set(NOW + 1000);
  await k2.drain();
  assert.equal(outbox(sql2).length, 0, 'a digest with nowhere to send it queued something anyway');
  sql.close();
  sql2.close();
});

test('AND A DIGEST THAT NAMES A CHANNEL NOBODY DELIVERS DOES NOT INSTALL', async () => {
  /* 09 §6's keys are typed and closed, and `validate` deep-checked registers and returned `null` for
     everything else — so a channel nobody has ever heard of installed cleanly and then fell through
     the send loop, silently, every week. */
  const { k, sql } = await record();
  const refusal = async (over: Record<string, unknown>) => {
    const out = await k.install([WEEKLY(over)]);
    assert.equal(out.ok, false, `${JSON.stringify(over)} installed`);
    return (out as { refusal: { code: string; fix: string; at?: string } }).refusal;
  };

  assert.equal((await refusal({ channels: ['carrier-pigeon'] })).at, 'channels');
  assert.equal((await refusal({ channels: [] })).at, 'channels');
  assert.match((await refusal({ channels: [] })).fix, /nothing it assembles would go anywhere/);

  /* A URL A DIGEST POSTS TO IS EGRESS, AND EGRESS IS DECLARED OR IT DOES NOT HAPPEN (04 §7). The
     channel without the address installed and then posted nowhere, for ever. */
  assert.equal((await refusal({ channels: ['webhook'] })).at, 'webhook');
  assert.equal((await refusal({ channels: ['webhook'], webhook: { url: 'http://plain.example' } })).at, 'webhook');
  assert.ok((await k.install([WEEKLY({ channels: ['webhook'], webhook: { url: 'https://hooks.example/x' } })])).ok);

  /* AND `prose` IS WRITTEN BY SLASH OR BY NOBODY (42 §4.11). Anything else waits behind a model that
     was never going to answer. */
  assert.equal((await refusal({ prose: 'gpt' })).at, 'prose');
  sql.close();
});

test('`urgent` INTERRUPTS, and that is what the word was for', async () => {
  /* IT WAS WRITTEN IN FOUR PLACES AND READ IN NONE. A rule declaring `{ notify: { say: "Payment
     failed", urgent: true } }` wrote a `note` event and stopped, and so did a credential expiring
     inside forty-eight hours — the two things 09 §5 names as urgent by DEFAULT. Nothing left the
     record for either. The pack install diff meanwhile told the person it "interrupts you", which
     made the diff the only honest reader of a key nothing else consumed.

     09 §4: "`true` interrupts — the `note` event plus a `notify.push` and a `notify.email` outbox
     row, at most one interrupt per hour per record". */
  const { k, sql } = await record(WEEKLY(), false);
  value(await k.install([RULE_URGENT]));
  /* THE OWNER'S PHONE, because a push is queued one per owner subscription (`push.test.ts`). */
  sql.exec(
    "INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES ('ps_1', 'p_1', 'https://fcm.googleapis.com/fcm/send/p1', 'k', 'a', ?)",
    new Date(NOW).toISOString(),
  );

  value(k.create('obligations', { what: 'Invoice 41', amount: { amount: 1_000, currency: 'GBP' }, state: 'open' }, { actor: 'p_1' }));

  const rows = outbox(sql);
  const push = rows.filter((r) => r.kind === 'notify.push');
  const mail = rows.filter((r) => r.kind === 'notify.email');
  assert.equal(push.length, 1, 'an urgent rule wrote an event and nothing left the record');
  assert.equal(mail.length, 1, 'a push carries one line and no content — the email is the half with the reason');
  assert.deepEqual(JSON.parse(push[0]!.payload), { sub: { id: 'ps_1' }, open: '/r/obligations', kind: 'money' });
  assert.match(JSON.parse(mail[0]!.payload).subject as string, /Payment failed/);
  /* AND THE EVENT TOO, always, because it is the record's own memory of the thing having happened
     and what the unread count is counted over. */
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'note' AND actor = 'rule:urgent'").length, 1);

  /* ONE AN HOUR, PER RECORD. Ten rules firing on one write is one afternoon; ten interruptions is a
     person who turns notifications off, after which the one that mattered arrives somewhere they no
     longer look. 09 §7 lists it as a thing this subsystem must never do. */
  value(k.create('obligations', { what: 'Invoice 42', amount: { amount: 2_000, currency: 'GBP' }, state: 'open' }, { actor: 'p_1' }));
  assert.equal(outbox(sql).filter((r) => r.kind === 'notify.push').length, 1, 'the second write interrupted again within the hour');
  assert.equal(
    sql.all("SELECT 1 FROM event WHERE kind = 'note' AND actor = 'rule:urgent'").length,
    2,
    'the rate limit swallowed the event as well as the interrupt',
  );
  sql.close();
});

test('AN URGENT NOTE SAYS SO ON ITS EVENT, and a person who muted its rule still hears it', async () => {
  /* A PERSON MUTES ONE RULE'S NOTES FROM SETTINGS (`notify.muted`), and what interrupts is never muted. The outbox rows an
     interrupt queued drain and go, so the event is the only place left that says which it was. */
  const { k, sql } = await record(WEEKLY(), false);
  value(
    await k.install([
      RULE_URGENT,
      { ...RULE_URGENT, id: 'rule.chase', body: { ...(RULE_URGENT.body as object), rule: 'chase', then: [{ notify: { say: 'Chase {{what}}' } }] } as never },
    ]),
  );
  value(k.create('obligations', { what: 'Invoice 41', amount: { amount: 1_000, currency: 'GBP' }, state: 'open' }, { actor: 'p_1' }));
  const notes = sql
    .all<{ actor: string; kind: string; field: string | null }>("SELECT actor, kind, field FROM event WHERE kind = 'note' ORDER BY actor")
    .map(({ actor, kind, field }) => ({ actor, kind, field }));
  assert.deepEqual(notes, [
    { actor: 'rule:chase', kind: 'note', field: null },
    { actor: 'rule:urgent', kind: 'note', field: URGENT_NOTE },
  ]);
  const muted = new Set(['rule:chase', 'rule:urgent']);
  assert.deepEqual(
    notes.map((n) => mutedFor(n, muted)),
    [true, false],
    'a muted rule kept its plain note, or its urgent one was muted',
  );
  /* ONLY NOTES: the rule's own writes to a row are the record's history, not a notice. */
  assert.equal(mutedFor({ kind: 'edit', actor: 'rule:chase', field: 'state' }, muted), false);
  assert.equal(mutedFor(notes[0]!, new Set()), false);
  sql.close();
});

test('a digest writes money in its own currency and decimals, in the email and in the note', async () => {
  const { render, headline } = await import('../src/digest.ts');
  /* `held` IS THE ROWS IN SCOPE BEFORE THE PREDICATE, and a `Reading` now requires it: the field
     landed so a tile can tell an empty register from an empty match, which are the difference
     between "add your first invoice" and "no invoices are overdue". One row matched out of one row
     held is the honest fixture here, because every section below is a figure over rows that exist. */
  const reading = (value: number, unit: string | null) => ({ value, unit, rows: 1, held: 1, delta: null, why: '', met: null, refusals: [] });
  const row = (amount: number, currency: string) =>
    ({ id: 'e_1', register: 'bills', seq: 1, fields: { what: 'Fenwick invoice', amount: { amount, currency } } }) as never;
  const sections = [
    { heading: 'Overdue to pay', source: 'metric.overdue', as: 'stat', rows: [], reading: reading(1_054_000, 'GBP'), refusals: [] },
    { heading: 'Yen owed', source: 'metric.yen', as: 'stat', rows: [], reading: reading(129_900, 'JPY'), refusals: [] },
    { heading: 'Weight', source: 'metric.kg', as: 'stat', rows: [], reading: reading(150, 'kg'), refusals: [] },
    {
      heading: 'Open bills',
      source: 'register.bills',
      as: 'table',
      rows: [row(129_900, 'GBP'), row(1_500, 'KWD')],
      columns: [{ field: 'what' }, { field: 'amount' }],
      refusals: [],
    },
  ];
  const text = render('Weekly', sections);
  assert.match(text, /Overdue to pay \| GBP 10,540\.00\n/);
  assert.match(text, /Yen owed \| JPY 129,900\n/);
  assert.match(text, /Weight \| 150 kg\n/, 'a quantity is not money');
  assert.match(text, /Fenwick invoice \| GBP 1,299\.00\n/);
  assert.match(text, /Fenwick invoice \| KWD 1\.500\n/);
  assert.equal(headline('Weekly', sections), 'Weekly: Overdue to pay GBP 10,540.00 · Yen owed JPY 129,900 · Weight 150 kg · Open bills 2');
});
