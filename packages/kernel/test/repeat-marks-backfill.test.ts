/**
 * Migration 35 marks the repeats a record held before a skip kept its mark (the back-fill).
 *
 * MEASURED BEFORE: a text skipped as a repeat before 7b88e5c2 kept only "transactions#1 already says this." and no
 * `match` line, so "Held as repeats" was empty on a record that took texts then, and "It is a second one" refused each.
 * Each case below makes that record by taking the mark off and putting the old words back, then runs migration 35 again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyMigrations } from '../src/migrate.ts';
import { CARD, record, text, used } from './ingest-tail-kit.ts';

const DECLINED = { when: { field: 'body', contains: 'declined' }, reason: 'A declined charge moved no money.' };

/** A record shaped as one from before migration 35: two repeats in the old words, one by number and one by id. */
async function before35() {
  const r = await record(CARD({ dedupe: ['amount', 'account'], skip: [DECLINED] }));
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const first = text(r.k, used('1234', 'Corner Shop', '120.00', '07/10/2026')).wrote[0]!;
  const byNumber = text(r.k, used('1234', 'Corner Shop', '120.00', '08/10/2026')).raw;
  const byId = text(r.k, used('1234', 'Corner Shop', '120.00', '09/10/2026')).raw;
  const ruled = text(r.k, `${used('1234', 'Corner Shop', '5.00', '09/10/2026')} It was declined.`).raw;
  const seq = r.sql.one<{ seq: number }>('SELECT seq FROM entry WHERE id = ?', first)!.seq;
  r.sql.exec("DELETE FROM event WHERE kind = 'match' AND field = 'repeats'");
  r.sql.exec('UPDATE inbox_raw SET reason = ? WHERE id = ?', `transactions#${seq} already says this.`, byNumber);
  r.sql.exec('UPDATE inbox_raw SET reason = ? WHERE id = ?', `${first} already says this.`, byId);
  return { ...r, first, byNumber, byId, ruled };
}

/** Run migration 35 again over the record, as a deploy over an older one does. */
async function migrate35(r: Awaited<ReturnType<typeof before35>>): Promise<void> {
  r.sql.exec('DELETE FROM migration WHERE version >= 35');
  const { result } = await applyMigrations(r.sql, r.clock);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(result.value.applied, [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
}

const arrivals = (r: Awaited<ReturnType<typeof before35>>) => r.sql.all('SELECT id, state, reason FROM inbox_raw ORDER BY rowid');

test('THE OLD REPEATS GAIN THEIR MARK, by number and by id, and a text a rule set aside gains none', async () => {
  const r = await before35();
  assert.deepEqual(r.k.inboxBefore(null, 50, ['skipped'], { repeats: true }), [], 'the record is not shaped as before 35');
  const was = arrivals(r);
  await migrate35(r);
  const held = r.k.inboxBefore(null, 50, ['skipped'], { repeats: true });
  assert.deepEqual(held.map((a) => [a.id, a.repeats]).sort(), [[r.byNumber, r.first], [r.byId, r.first]].sort());
  assert.equal(r.k.inboxBefore(null, 50, ['skipped']).find((a) => a.id === r.ruled)?.repeats, undefined);
  const line = r.sql.one<Record<string, unknown>>(
    "SELECT actor, target_kind, field, from_v, to_v FROM event WHERE kind = 'match' AND target = ?",
    `inbox_raw:${r.byNumber}`,
  );
  assert.deepEqual({ ...line }, { actor: 'ingest:bank-sms', target_kind: 'inbox_raw', field: 'repeats', from_v: r.first, to_v: 'skipped' });
  /* NOTHING IS DROPPED OR REWORDED: every text keeps its state and its reason. */
  assert.deepEqual(arrivals(r), was);
  r.sql.close();
});

test('AND "IT IS A SECOND ONE" THEN FILES ONE, which it refused before', async () => {
  const r = await before35();
  assert.equal(r.k.fileAsSecond(r.byNumber).ok, false, 'a pre-35 repeat was filed without its mark');
  await migrate35(r);
  const filed = r.k.fileAsSecond(r.byNumber);
  assert.ok(filed.ok, JSON.stringify(filed));
  assert.equal(filed.value.wrote.length, 1);
  assert.deepEqual(
    r.k.inboxBefore(null, 50, ['skipped'], { repeats: true }).map((a) => a.id),
    [r.byId],
  );
  r.sql.close();
});

test('A SECOND RUN CHANGES NOTHING', async () => {
  const r = await before35();
  await migrate35(r);
  const events = r.sql.all('SELECT * FROM event ORDER BY rowid');
  await migrate35(r);
  assert.deepEqual(r.sql.all('SELECT * FROM event ORDER BY rowid'), events);
  r.sql.close();
});

test('A LIST TWO PATTERNS WITH A REPEAT CHECK FILE INTO IS LEFT AS IT IS, since the pattern cannot be known', async () => {
  const r = await before35();
  const body = JSON.parse(r.sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = 'ingest.bank-sms' AND superseded_at IS NULL")!.body);
  r.sql.exec(
    "INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES ('ingest.bank-sms-two', 1, 'ingest', ?, 'x', '2026-10-01T00:00:00.000Z')",
    JSON.stringify({ ...body, ingest: 'bank-sms-two' }),
  );
  await migrate35(r);
  assert.deepEqual(r.k.inboxBefore(null, 50, ['skipped'], { repeats: true }), []);
  r.sql.close();
});
