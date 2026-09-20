/**
 * Creating a record, and the sweep that keeps it from growing forever.
 *
 * NAMING IS PROVISIONING: the object exists the moment it is addressed, so what is tested here is
 * not creation but IDENTITY — the four rows that say which record this is. A record that cannot name
 * its own timezone renders every digest in the wrong day, and a record with no owner is a record
 * nobody can open. Both are silent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
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
    fields: [{ id: 'what', type: 'text', required: true, search: true }],
  } as never,
};

const MADE = {
  id: ID,
  slug: 'the-studio',
  name: 'The Studio',
  tz: 'Europe/London',
  locale: 'en-GB',
  owner: { id: 'p_1', email: 'me@example.test', name: 'Sam' },
};

type Clockish = ReturnType<typeof fixedClock>;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
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

const meta = (sql: NodeSql, key: string) =>
  sql.one<{ value: string }>('SELECT value FROM dog_meta WHERE key = ?', key)?.value ?? null;

/* ── identity ────────────────────────────────────────────────────────────── */

test('A RECORD SAYS WHAT IT IS, WHO OWNS IT AND WHAT TIME IT IS IN, in one transaction', async () => {
  const { k, sql } = await record();
  assert.equal(k.identity(), null, 'a record named itself before anybody said');

  value(k.createRecord(MADE));

  const me = k.identity()!;
  assert.equal(me.id, ID);
  assert.equal(me.slug, 'the-studio');
  assert.equal(me.tz, 'Europe/London', 'a record with no timezone renders every digest in the wrong day');

  // The owner as a person, which is what makes an event say a name rather than an id.
  assert.equal(sql.one<{ name: string }>("SELECT name FROM person WHERE id = 'p_1'")?.name, 'Sam');
  assert.equal(sql.one<{ level: string }>("SELECT level FROM member WHERE person_id = 'p_1' AND register = '*'")?.level, 'owner');

  // And the header a `.brain` file carries, so the file says which record it is a copy of.
  assert.equal(meta(sql, 'record_slug'), 'the-studio');
  assert.equal(meta(sql, 'tz'), 'Europe/London');
  assert.equal(meta(sql, 'format'), '1', 'the format the migration wrote was overwritten');
  sql.close();
});

test('the hourly sweep is a schedule row, not a cron somewhere else', async () => {
  // One alarm per customer means the record wakes itself. A sweeper walking every tenant would wake
  // records with nothing to do in order to ask them.
  const { k, sql } = await record();
  value(k.createRecord(MADE));
  const row = sql.one<{ kind: string; key: string; state: string; due_at: string }>(
    "SELECT kind, key, state, due_at FROM schedule WHERE kind = 'purge'",
  )!;
  assert.equal(row.key, 'sweep');
  assert.equal(row.state, 'pending');
  assert.equal(Date.parse(row.due_at) - NOW, 3_600_000);
  assert.equal(k.pending().nextDueMs, NOW + 3_600_000, 'the sweep did not set the alarm');
  sql.close();
});

test('AND IT RECURS RATHER THAN FINISHING, which is the difference between hourly and once', async () => {
  const { k, sql, clock } = await record();
  value(k.createRecord(MADE));

  clock.set(NOW + 3_600_001);
  const drained = await k.drain();
  assert.equal(drained.done, 1);
  assert.equal(drained.dead, 0, 'the sweep is a kind nothing handles');

  const again = sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'purge'")!;
  assert.equal(again.state, 'pending', 'the hourly sweep ran once and stopped');
  assert.equal(Date.parse(again.due_at), NOW + 3_600_001 + 3_600_000);
  sql.close();
});

test('a second create of the same record is the same record, and of a different one is refused', async () => {
  // An object is addressed rather than created, so a retried signup arrives here as an ordinary
  // case. Silently overwriting somebody's name is not the answer to it.
  const { k, sql } = await record();
  value(k.createRecord(MADE));
  assert.deepEqual(value(k.createRecord(MADE)), { id: ID, slug: 'the-studio' });

  const other = refusal(k.createRecord({ ...MADE, id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'somebody-else' }));
  assert.equal(other.code, 'ALREADY_KNOWN');
  assert.match(other.fix, /the-studio/, 'the refusal does not say which record this object already is');
  assert.equal(k.identity()?.slug, 'the-studio');
  sql.close();
});

test('the things that are not a name, a slug or a timezone are refused with the sentence', async () => {
  const { k, sql } = await record();
  assert.equal(refusal(k.createRecord({ ...MADE, id: 'the-studio' })).at, 'id');
  assert.equal(refusal(k.createRecord({ ...MADE, slug: 'The Studio' })).at, 'slug');
  assert.equal(refusal(k.createRecord({ ...MADE, slug: '-leading' })).at, 'slug');
  assert.equal(refusal(k.createRecord({ ...MADE, name: '  ' })).at, 'name');

  /* CHECKED AGAINST THE RUNTIME'S OWN ZONE DATA, never a list shipped here: a table of timezones is
     a table that is wrong the next time a government moves one. */
  assert.equal(refusal(k.createRecord({ ...MADE, tz: 'Europe/Camelot' })).at, 'tz');
  assert.equal(refusal(k.createRecord({ ...MADE, tz: 'GMT+1' })).at, 'tz');
  value(k.createRecord({ ...MADE, tz: 'Pacific/Auckland' }));
  sql.close();
});

test('a refused create writes nothing at all', async () => {
  const { k, sql } = await record();
  refusal(k.createRecord({ ...MADE, tz: 'Europe/Camelot' }));
  assert.equal(sql.all('SELECT 1 FROM person').length, 0, 'a refused create left the owner behind');
  assert.equal(sql.all('SELECT 1 FROM member').length, 0);
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'purge'").length, 0);
  sql.close();
});

test('the wrapped keys are stored and never read', async () => {
  // The kernel holds the sealed material and has no way to open it. `12-SECURITY` puts the key that
  // could somewhere the record cannot reach, which is what makes "we cannot read your record" true.
  const { k, sql } = await record();
  const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);
  value(
    k.createRecord({
      ...MADE,
      keys: {
        record: { wrapped: b(1), nonce: b(9), kek_id: 'kek_2f' },
        signing: { wrapped: b(5), nonce: b(7), kek_id: 'kek_2f', wrapped_by: 'passphrase' },
      },
    }),
  );
  const rows = sql.all<{ purpose: string; wrapped_by: string; kek_id: string }>(
    'SELECT purpose, wrapped_by, kek_id FROM vault_key ORDER BY purpose',
  );
  assert.deepEqual(
    rows.map((r) => [r.purpose, r.wrapped_by]),
    [['record', 'kek'], ['signing', 'passphrase']],
  );
  sql.close();
});

test('AND A RECORD MADE WITHOUT THEM SAYS SO IN ITS HEADER, rather than leaving a later reader to guess', async () => {
  /* A RECORD WITH NO KEYS IS NOT A RECORD WITH A PROBLEM IT CAN REPORT: it reads, writes and signs
     people in, and it refuses only at the one moment somebody tries to seal a grant or sign an
     export, which may be weeks later. `dog_meta` is the header an export carries, and `vault_key`
     travels sealed, so this row is the one place "this record has no keys" can be read without the
     key store in front of you.

     IT IS COMPUTED FROM `vault_key` AND NOT FROM `args.keys`. A second create of the same id is the
     ordinary case here — a retried signup, a restore — and it arrives with no keys in hand, so
     writing the argument would have said `none` about a record that holds three. */
  const bare = await record();
  value(bare.k.createRecord(MADE));
  assert.equal(meta(bare.sql, 'keys'), 'none', 'a keyless record does not say that it is one');
  bare.sql.close();

  const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);
  const keyed = await record();
  value(
    keyed.k.createRecord({
      ...MADE,
      keys: {
        record: { wrapped: b(1), nonce: b(9), kek_id: 'kek_2f' },
        connector: { wrapped: b(3), nonce: b(8), kek_id: 'kek_2f' },
        signing: { wrapped: b(5), nonce: b(7), kek_id: 'kek_2f' },
      },
    }),
  );
  assert.equal(meta(keyed.sql, 'keys'), 'connector,record,signing');
  value(keyed.k.createRecord(MADE));
  assert.equal(meta(keyed.sql, 'keys'), 'connector,record,signing', 'a second create said a record holding three keys has none');
  keyed.sql.close();
});

/* ── the sweep ───────────────────────────────────────────────────────────── */

async function withRows(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const made = await record();
  assert.ok((await made.k.install([OBLIGATIONS])).ok);
  return made;
}

test('A SOFT DELETE IS NOT A DELETE, AND IT IS NOT FOREVER EITHER', async () => {
  // Thirty days is the window in which "undo" is a real word. After it, a record that only grows
  // makes every scan pay for a row whose owner moved on.
  const { k, sql, clock } = await withRows();
  value(k.create('obligations', { what: 'Recently deleted' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Long deleted' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Still here' }, { actor: 'p_1' }));

  /* WHEN A DELETE HAPPENED IS THE RECORD'S FACT, not the caller's: `deleted_at` is stamped with the
     write's own instant, and a patch that named a date would let anybody backdate a row out of its
     own undo window. So this walks the clock rather than writing a date. */
  value(k.update('obligations', 'obligations#2', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  clock.set(NOW + 31 * DAY);
  value(k.update('obligations', 'obligations#1', { deleted_at: '2026-10-06' }, { actor: 'p_1' }));

  const out = k.purge();
  assert.equal(out.rows, 1, 'the sweep took a row somebody could still undo, or left one it should not have');
  assert.equal(sql.all('SELECT 1 FROM entry').length, 2);
  assert.ok(k.get('obligations#3'), 'a live row was swept');

  // The recently deleted one is still restorable, which is the whole point of the window.
  value(k.update('obligations', 'obligations#1', { deleted_at: null }, { actor: 'p_1' }));
  assert.ok(k.get('obligations#1'));
  sql.close();
});

test('and the shadow tables go with it, because a cascade would never fire', async () => {
  // Foreign keys are off on every adapter this runs on. A search index still answering about a row
  // that is gone is a result that opens nothing.
  const { k, sql, clock } = await withRows();
  value(k.create('obligations', { what: 'Findable Halden' }, { actor: 'p_1' }));
  assert.equal(k.search('halden').length, 1);

  value(k.update('obligations', 'obligations#1', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  clock.set(NOW + 31 * DAY);
  k.purge();
  assert.equal(sql.all('SELECT 1 FROM entry_fts').length, 0, 'the index still holds a row that is gone');
  assert.equal(k.search('halden').length, 0);
  sql.close();
});

test('THE HISTORY OUTLIVES THE ROW, and the number is never reissued', async () => {
  // `event` has no foreign key to `entry` on purpose: deleting a row must not delete what happened.
  const { k, sql, clock } = await withRows();
  value(k.create('obligations', { what: 'Gone' }, { actor: 'p_1', note: 'Written in June' }));
  const id = k.get('obligations#1')!.id;
  value(k.update('obligations', 'obligations#1', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  clock.set(NOW + 31 * DAY);
  k.purge();

  assert.equal(k.get('obligations#1'), null);
  assert.ok(k.history(id).length >= 2, 'the row was purged and took its history with it');
  assert.equal(k.history(id)[0]?.note, 'Written in June');

  const next = value<{ seq: number }>(k.create('obligations', { what: 'After' }, { actor: 'p_1' }));
  assert.equal(next.seq, 2, `a purged number was reissued as ${next.seq}`);
  sql.close();
});

test('the sweep has a ceiling, and says what it did only when it did something', async () => {
  const { k, sql, clock } = await withRows();
  for (let n = 1; n <= 5; n++) {
    value(k.create('obligations', { what: `Row ${n}` }, { actor: 'p_1' }));
    value(k.update('obligations', `obligations#${n}`, { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  }
  clock.set(NOW + 31 * DAY);
  assert.equal(k.purge({ limit: 2 }).rows, 2);
  assert.equal(sql.all('SELECT 1 FROM entry').length, 3);

  const events = () => sql.all("SELECT 1 FROM event WHERE kind = 'purge'").length;
  const before = events();
  assert.equal(k.purge({ limit: 0 }).rows, 0);
  assert.equal(events(), before, 'a sweep that did nothing wrote an event saying so');
  sql.close();
});

test('daily counters older than four hundred days are pruned rather than rolled up', async () => {
  // A rolled-up figure answers a question nobody asked, and the detectors that read this table read
  // days.
  const { k, sql, clock } = await withRows();
  const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
  for (const offset of [-401, -399, -1])
    sql.exec("INSERT INTO observation (kind, subject, day, n) VALUES ('search.empty', ?, ?, 3)", `s${offset}`, day(offset));

  assert.equal(k.purge().observations, 1);
  const left = sql.all<{ day: string }>('SELECT day FROM observation ORDER BY day').map((r) => r.day);
  assert.deepEqual(left, [day(-399), day(-1)]);
  void clock;
  sql.close();
});
