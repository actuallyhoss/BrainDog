/**
 * The nine an adversarial pass found, each with the probe that found it.
 *
 * They are together in one file on purpose. Every one of them was a place where the code was
 * CONFIDENTLY WRONG — it returned, it reported `ok`, nothing threw, and the record was quietly not
 * doing the thing its own comments said it did. A test named after the symptom is what stops that
 * class coming back, and the symptom is what somebody would have noticed weeks later, if ever.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  expandRepeat,
  openRecord,
  registerOfIndex,
  remindersFor,
  type Declaration,
  type Kernel,
  type OutboxKind,
} from '../src/index.ts';
import { fixedClock, openSqlite, recordingScheduler, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const MINUTE = 60_000;
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const ALL: OutboxKind[] = ['notify.email', 'notify.push', 'infer.embed', 'export.r2'];

const reg = (id: string, fields: unknown[], extra: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title: (fields[0] as { id: string }).id, fields, ...extra } as never,
});

type Clockish = ReturnType<typeof fixedClock>;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  return { k: await openRecord(sql, clock), sql, clock };
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

const indexes = (sql: NodeSql) =>
  sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry' ORDER BY name")
    .map((r) => r.name)
    /* The register indexes only — the schema's own (`entry_live`, `entry_state`, `entry_created_by`)
       are not a declaration's to drop, and one appearing in this list would be its own finding. */
    .filter((n) => registerOfIndex(n) !== null);

/* ── 1 · a failed delivery arms its retry ────────────────────────────────── */

test('A FAILED DELIVERY ARMS THE ALARM, or the retry waits for an unrelated write', async () => {
  /* `ack` wrote a `retry` schedule row and nobody re-armed, so on an idle record `pendingWork()`
     reported work to do and the scheduler held `null`. The belt does not rescue it either: a lease
     never takes a `failed` row. The notification simply stopped, and the record knew. */
  const { k, sql } = await record();
  const scheduler = recordingScheduler();
  const id = k.outbox('notify.email', { to: 'p_1' });
  k.leaseOutbox(ALL, 10);
  value(k.ackOutbox({ id, state: 'failed', error: 'smtp said 550' }));

  await k.tail(scheduler);
  assert.equal(scheduler.armed, k.pending().nextDueMs, 'the alarm and the earliest pending row disagree');
  assert.ok(scheduler.armed !== null, 'a failed delivery armed nothing');
  sql.close();
});

/* ── 2 · a lease that is never acked runs out of ladder ──────────────────── */

test('AN ABANDONED LEASE IS AN ATTEMPT, and the eighth one is dead rather than a ninth delivery', async () => {
  /* The reclaim branch did not touch `attempts`, so a deliverer that crashed — or was simply slower
     than the sixty-second window — was handed the same job forever. The probe that found this got
     forty deliveries, `attempts` still 0, no ceiling and no visible item. In the self-host it is one
     slow `deliver()` and a ticker: the customer gets the same email twice. */
  const { k, sql, clock } = await record();
  const id = k.outbox('notify.email', { to: 'p_1', subject: 'Invoice 41' });

  let handed = 0;
  for (let n = 0; n < 20; n++) {
    handed += k.leaseOutbox(ALL, 10).length;
    clock.set(NOW + (n + 1) * 61_000);
  }

  assert.ok(handed <= 8, `the same job was handed out ${handed} times`);
  const row = sql.one<{ state: string; attempts: number }>('SELECT state, attempts FROM outbox WHERE id = ?', id)!;
  assert.equal(row.state, 'dead');
  assert.equal(row.attempts, 8);

  // And the ladder ends where every other one does: one visible item, naming what could not be sent.
  const items = sql.all<{ body: string; opened_by: string }>('SELECT body, opened_by FROM suggestion');
  assert.equal(items.length, 1, `${items.length} items for one job`);
  assert.equal(items[0]?.opened_by, 'system');
  assert.match(items[0]?.body ?? '', /lease expired without an ack/);
  sql.close();
});

test('and a first claim is not an attempt, because nothing has failed yet', async () => {
  const { k, sql } = await record();
  const id = k.outbox('notify.email', {});
  assert.equal(k.leaseOutbox(ALL, 10)[0]?.attempts, 0);
  assert.equal(sql.one<{ attempts: number }>('SELECT attempts FROM outbox WHERE id = ?', id)?.attempts, 0);
  sql.close();
});

/* ── 3 · the tail reads after the await ──────────────────────────────────── */

test('TWO OVERLAPPING TAILS LEAVE THE ALARM ON THE EARLIEST ROW, not on the older one they each saw', async () => {
  /* `pendingWork` was read BEFORE `await scheduler.get()`, so two tails — a drain's `finally` and a
     request's write, which on a Durable Object is an ordinary pair — each wrote the minimum it had
     seen before the other's rows existed. Whichever resumed last won. The probe ended with an alarm
     four months later than the earliest pending row: the reminder fired that late. */
  const { k, sql } = await record();
  assert.ok((await k.install([reg('renewals', [{ id: 'what', type: 'text', required: true }, { id: 'on', type: 'day', remind: ['0d'] }])])).ok);
  value(k.create('renewals', { what: 'Far', on: new Date(NOW + 120 * DAY).toISOString().slice(0, 10) }, { actor: 'p_1' }));

  let release = (): void => {};
  const parked = new Promise<void>((r) => (release = r));
  let first = true;
  const base = recordingScheduler();
  const slow = {
    ...base,
    async get() {
      const at = await base.get();
      /* The first tail parks inside the platform's own async read — which is what `getAlarm()` is. */
      if (first) {
        first = false;
        await parked;
      }
      return at;
    },
  };

  const one = k.tail(slow);
  // While it is parked, a write adds a sooner reminder and its own tail completes.
  value(k.create('renewals', { what: 'Soon', on: new Date(NOW + 1 * DAY).toISOString().slice(0, 10) }, { actor: 'p_1' }));
  await k.tail(slow);
  release();
  await one;

  assert.equal(base.armed, k.pending().nextDueMs, 'the alarm is not the earliest pending row');
  sql.close();
});

/* ── 4 · `unique:` on a value the record stores in halves ────────────────── */

test('`unique:` ON MONEY IS REFUSED, rather than built as two plain indexes over an unwritable register', () => {
  /* `f.unique && !part` is never true for a parted type, so the UNIQUE came out as an ordinary index
     wearing the `entry_u_` name: the rule was enforced nowhere. And the write path then bound the
     whole object into its clash query and threw a raw TypeError out of `create` — across the
     boundary this package says in bold nothing throws over. Both symptoms, one declaration. */
  return record().then(async ({ k, sql }) => {
    const out = refusal(await k.install([reg('bills', [{ id: 'ref', type: 'text' }, { id: 'amount', type: 'money', unique: true }])]));
    assert.equal(out.code, 'DECLARATION_INVALID');
    assert.equal(out.at, 'amount');
    assert.match(out.fix, /two halves/);

    // A quantity is the same shape and the same refusal; a text field is fine.
    assert.equal(refusal(await k.install([reg('b2', [{ id: 'r', type: 'text' }, { id: 'q', type: 'quantity', unique: true }])])).at, 'q');
    assert.ok((await k.install([reg('b3', [{ id: 'r', type: 'text', unique: true }])])).ok);
    sql.close();
  });
});

/* ── 5 · a second create still names its owner ───────────────────────────── */

test('CREATING A RECORD THAT ALREADY HAS THAT ID STILL WRITES ITS OWNER', async () => {
  /* "Restore this file and make me the owner" reported `ok` and wrote no `person` and no `member`
     row: the early return on a matching id skipped the whole transaction. The new owner was locked
     out of a record that had just told them it was theirs. */
  const { k, sql } = await record();
  value(k.createRecord({ id: ID, slug: 'studio-a', name: 'Studio A', tz: 'UTC', locale: 'en', owner: { id: 'p_a', name: 'A' } }));
  value(
    k.createRecord({
      id: ID,
      slug: 'studio-b',
      name: 'Studio B',
      tz: 'Europe/London',
      locale: 'en-GB',
      owner: { id: 'p_b', email: 'b@example.test', name: 'B' },
    }),
  );

  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM member WHERE person_id = 'p_b'")?.n, 1, 'the new owner has no membership');
  assert.equal(sql.one<{ name: string }>("SELECT name FROM person WHERE id = 'p_b'")?.name, 'B');
  // And the record says what the second call said it was.
  assert.equal(k.identity()?.slug, 'studio-b');
  assert.equal(k.identity()?.tz, 'Europe/London');
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'record_slug'")?.value, 'studio-b');
  // One record row, still.
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM record')?.n, 1);
  sql.close();
});

/* ── 6 · a membership needs the record it is about ───────────────────────── */

test('A GOVERNANCE-ONLY FILE DOES NOT HAND SOMEBODY A MEMBERSHIP', async () => {
  /* `member` is governance, so it travels; `notEmpty` waves the `record` row through as identity.
     Importing one record's governance into another therefore made the source's owner an OWNER of the
     target — a grant nobody issued, from a file that was never about that record. */
  const source = await record();
  value(
    source.k.createRecord({ id: ID, slug: 'studio-a', name: 'Studio A', tz: 'UTC', locale: 'en', owner: { id: 'p_a', name: 'A' } }),
  );
  const governance = value<string[]>(await source.k.export({ sections: ['governance'] }));
  assert.ok(governance.some((l) => l.startsWith('#table member ')), 'the file carries no members, so this proves nothing');
  assert.ok(!governance.some((l) => l.startsWith('#table record ')), 'a governance-only file carried the record row');

  const sql = openSqlite();
  const target = await openRecord(sql, fixedClock(NOW));
  value(await target.import(governance));
  assert.equal(sql.all('SELECT 1 FROM member').length, 0, "the file's owner became an owner here");
  assert.equal(sql.all('SELECT 1 FROM person').length, 0);

  // A full file carries the record row, and then its members travel with it — which is the point.
  const full = value<string[]>(await source.k.export());
  const other = openSqlite();
  const whole = await openRecord(other, fixedClock(NOW));
  value(await whole.import(full));
  assert.equal(other.one<{ n: number }>('SELECT count(*) AS n FROM member')?.n, 1);
  assert.equal(whole.identity()?.slug, 'studio-a');

  sql.close();
  other.close();
  source.sql.close();
});

/* ── 7 · one register's install leaves another's indexes alone ───────────── */

test('AN INSTALL DROPS ITS OWN INDEXES AND NOT THE ONES OF A REGISTER ITS NAME IS A PREFIX OF', async () => {
  /* Two attempts at the drop were wrong in the same direction. `LIKE 'entry_i_a__%'` is wrong because
     `_` is a LIKE wildcard; a string-prefix match is wrong because `__` is the separator, so
     `entry_i_a__b__code` starts with register `a`'s prefix. The name is parsed now — and a register
     id may no longer contain `__` at all, because a name that cannot be parsed back is a name that
     will be parsed back wrongly. */
  const { k, sql } = await record();
  assert.ok((await k.install([reg('invoiced', [{ id: 'code', type: 'text', unique: true }])])).ok);
  assert.deepEqual(indexes(sql), ['entry_u_invoiced__code']);

  // `invoice` is a prefix of `invoiced` with no separator between them.
  assert.ok((await k.install([reg('invoice', [{ id: 'tag', type: 'text', index: true }])])).ok);
  assert.deepEqual(
    indexes(sql),
    ['entry_i_invoice__tag', 'entry_u_invoiced__code'],
    "installing `invoice` took `invoiced`'s index",
  );

  // And the ambiguity itself is refused, rather than parsed one of the two ways.
  const out = refusal(await k.install([reg('a__b', [{ id: 'code', type: 'text' }])]));
  assert.equal(out.code, 'DECLARATION_INVALID');
  assert.equal(refusal(await k.install([reg('ok_one', [{ id: 'a__b', type: 'text' }])])).at, 'fields');
  // A single underscore is still an ordinary identifier.
  assert.ok((await k.install([reg('ok_two', [{ id: 'a_b', type: 'text', index: true }])])).ok);
  sql.close();
});

test('and an index name says which register it belongs to, by its separator', () => {
  assert.equal(registerOfIndex('entry_i_a__tag'), 'a');
  assert.equal(registerOfIndex('entry_u_a_b__code'), 'a_b');
  assert.equal(registerOfIndex('entry_i_obligations__amount__amount'), 'obligations');
  assert.equal(registerOfIndex('schedule_due'), null);
  assert.equal(registerOfIndex('entry_i___x'), null, 'a register with no name is not a register');
});

/* ── 8 · retire, then reinstall ──────────────────────────────────────────── */

test('A RETIRED REGISTER TAKES ITS INDEXES WITH IT, and reinstalling brings it and them back', async () => {
  /* Two failures in one place. `retire` left the unique index behind, so a register nobody can look
     up went on refusing duplicates. And the `active` lookup filtered `retired = 0`, so the retired
     row was never stamped `superseded_at` — leaving two rows claiming to be current, which a `.dog`
     replay reads to decide what shape a two-year-old event was written under. */
  const { k, sql } = await record();
  const notes = reg('notes', [{ id: 'code', type: 'text', unique: true }]);
  assert.ok((await k.install([notes])).ok);
  assert.deepEqual(indexes(sql), ['entry_u_notes__code']);

  value(await k.retire(['register.notes']));
  assert.deepEqual(indexes(sql), [], 'a retired register kept enforcing a rule nobody can look up');

  // The same bytes come back: a version, not a no-op, because the shape has a new period of life.
  const again = value<{ id: string; changed: boolean }[]>(await k.install([notes]));
  assert.equal(again[0]?.changed, true, 'reinstalling a retired register did nothing at all');
  assert.deepEqual(indexes(sql), ['entry_u_notes__code'], 'the indexes did not come back');
  assert.ok(k.register('notes'), 'the register is still retired');

  const live = sql.all<{ version: number }>("SELECT version FROM declaration WHERE id = 'register.notes' AND superseded_at IS NULL");
  assert.equal(live.length, 1, `${live.length} declaration rows claim to be current`);
  sql.close();
});

/* ── 9 · a repeat that started long ago ──────────────────────────────────── */

test('A REPEAT ANCHORED YEARS AGO STILL REMINDS ANYBODY', () => {
  /* The walk began at the anchor and stopped at five hundred occurrences, all of which had already
     happened — and `remindersFor` drops anything past, so it derived NOTHING. A daily standup set up
     in 2023, or a yearly renewal from 2019, simply stopped reminding, silently, on a record that
     otherwise worked. */
  const old = Date.UTC(2023, 0, 1, 12);
  const daily = expandRepeat(old, { freq: 'day' }, NOW);
  assert.ok(daily.length > 0);
  assert.ok(daily.some((at) => at >= NOW), `every one of ${daily.length} occurrences is in the past`);
  assert.ok(daily[0]! >= NOW - DAY, 'the walk still starts three years ago');

  const monthly = expandRepeat(Date.UTC(2019, 2, 31, 12), { freq: 'month' }, NOW);
  assert.ok(monthly.some((at) => at >= NOW), 'a monthly repeat from 2019 reminds nobody');
  // And the clamp still holds where it lands: no 31st rolled into the 1st of the next month.
  for (const at of monthly) assert.notEqual(new Date(at).getUTCDate(), 1, `${new Date(at).toISOString()} overflowed`);

  // A `count:` is a numbered series somebody asked for, and skipping into it would change what they
  // asked for — so it is left alone, past or not.
  assert.equal(expandRepeat(old, { freq: 'day', count: 3 }, NOW).length, 3);
  assert.equal(new Date(expandRepeat(old, { freq: 'day', count: 3 }, NOW)[0]!).toISOString().slice(0, 10), '2023-01-01');
});

test('and the reminders it derives are the ones still to come', () => {
  const field = { id: 'on', type: 'day', remind: ['-1d'], repeat: { freq: 'day' as const } };
  const out = remindersFor(
    { id: 'e1', register: 'r', fields: { on: '2023-01-01' }, deleted: false },
    field,
    NOW,
  );
  assert.ok(out.length > 0, 'a daily repeat from 2023 derived no reminders at all');
  for (const r of out) assert.ok(Date.parse(r.dueAt) >= NOW, `${r.dueAt} is already past`);
});
