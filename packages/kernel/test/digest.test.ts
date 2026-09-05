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

import { inQuietHours, localParts, nextOccurrence, openRecord, type Declaration, type Kernel } from '../src/index.ts';
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

async function record(digest = WEEKLY(), rows = true): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
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

const arm = (sql: NodeSql, atMs: number) =>
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'digest', 'money-weekly', ?, 'pending', 0)",
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

test('A PUSH CARRIES NO CONTENT, only how many things and where', async () => {
  // A lock screen is not a place a person chose to read their business on.
  const { k, sql, clock } = await record(WEEKLY({ channels: ['push'] }));
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const row = outbox(sql)[0]!;
  assert.equal(row.kind, 'notify.push');
  const payload = JSON.parse(row.payload) as { title: string; url: string };
  assert.match(payload.title, /Money, weekly: \d+ items/);
  assert.equal(payload.url, '/digest/money-weekly');
  assert.ok(!row.payload.includes('Invoice 41'), 'the push carried the content');
  sql.close();
});

test('`prose: spark` QUEUES ONE INFERENCE AND STOPS, so a slow model never holds the alarm', async () => {
  const { k, sql, clock } = await record(WEEKLY({ prose: 'spark' }));
  arm(sql, NOW);
  clock.set(NOW + 1000);
  await k.drain();

  const queued = outbox(sql);
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.kind, 'infer.prose', 'the digest sent itself instead of waiting for its sentence');
  const payload = JSON.parse(queued[0]!.payload) as { digest: string; channels: string[] };
  assert.equal(payload.digest, 'money-weekly');
  assert.deepEqual(payload.channels, ['email', 'in-app'], 'the ack has no idea where to send it');
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
  const next = nextOccurrence({ day: 'mon', at: '08:00' }, saturday, 'Europe/London');
  const parts = localParts(next, 'Europe/London');
  assert.equal(parts.weekday, 1, 'a Monday digest did not land on a Monday');
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 0);
  assert.ok(next > saturday && next < saturday + 4 * DAY);
});

test('and a daily one lands every day, at that hour where the customer is', () => {
  const at = nextOccurrence({ at: '08:00' }, NOW, 'Pacific/Auckland');
  assert.equal(localParts(at, 'Pacific/Auckland').hour, 8);
  assert.ok(at > NOW);

  // A different zone is a different instant for the same wall clock, which is the whole point.
  const london = nextOccurrence({ at: '08:00' }, NOW, 'Europe/London');
  assert.notEqual(at, london);
});

test('quiet hours are 22:00 to 08:00 where the customer is, not where the server is', () => {
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
