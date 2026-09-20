/**
 * The nightly ledger row: what the whole position was on a night, written down.
 *
 * NOTHING WROTE ONE, SO THE HISTORY WAS A LINE WITH ONE POINT ON IT. `register.snapshots` shipped in
 * money-core 1.2.0, the Ledger page draws "Night by night" from it, and an exhaustive read of the
 * four candidate writers found none: `declare.ts`'s eight kinds schedule nothing into a register,
 * `rules.ts`'s `create:` fills its fields with `fill()`, which reads the triggering row and nothing
 * else, the `snapshot` schedule arm writes `metric_point`, and `digest.ts` writes one event row and
 * sends. So a record could run for a year and the table would say *No night has been recorded yet*.
 *
 * FOUR FIGURES OR NONE. The register declares `cash`, `owed_to_me`, `owed_by_me` and `net`, and only
 * `cash` is required — so a partial write would have been accepted and drawn a chart with a hole in
 * it that reads as a zero. Every test below that expects no row is testing that refusal.
 *
 * AND THE CURRENCY IS THE TRAP. A `money` field holds ONE amount and ONE code, so a position held in
 * three currencies has no honest shape in this row unless every part of it converts into one. A
 * screen that cannot add two currencies says so and asks; a row cannot, because by the time anybody
 * reads it the night is over and the rates have moved. So the night is skipped, and the gap is the
 * answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 20, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/**
 * CAIRO, WHICH IS THREE AHEAD OF UTC IN SEPTEMBER. Egypt brought summer time back in 2023, so five
 * past midnight on the 21st is 21:05 UTC on the 20th, and a record whose day boundary is UTC's would
 * stamp every night here with the wrong date. The zone is the point of the fixture, not decoration.
 */
const MADE = {
  id: ID,
  slug: 'the-studio',
  name: 'The Studio',
  tz: 'Africa/Cairo',
  locale: 'en-GB',
  owner: { id: 'p_1', email: 'me@example.test', name: 'Sam' },
};

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'balance', type: 'money', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
      { id: 'liquid', type: 'bool', default: true },
    ],
  } as never,
};

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Money',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], index: true, required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', index: true, required: true },
      { id: 'state', type: 'enum', values: ['open', 'part', 'paid', 'written_off'], default: 'open', index: true, required: true },
    ],
  } as never,
};

const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

/** money-core's own, field for field: four money fields, a unique night, and a title in words. */
const SNAPSHOTS: Declaration = {
  id: 'register.snapshots',
  kind: 'register',
  body: {
    id: 'snapshots',
    name: 'Snapshots',
    title: 'what',
    fields: [
      { id: 'what', label: 'Night', type: 'text', required: true, search: true },
      { id: 'on', label: 'Date', type: 'day', unique: true, required: true },
      { id: 'cash', label: 'Cash', type: 'money', required: true },
      { id: 'owed_to_me', label: 'Owed to you', type: 'money' },
      { id: 'owed_by_me', label: 'Owed by you', type: 'money' },
      { id: 'net', label: 'Net', type: 'money' },
      { id: 'taken', label: 'Taken', type: 'enum', values: ['nightly', 'typed'], default: 'nightly', index: true, required: true },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const OPEN = 'state is open or part';

const metric = (id: string, source: string, where: string, field: string, target: object): Declaration => ({
  id: `metric.${id}`,
  kind: 'metric',
  body: { metric: id, name: id, source, where, value: { sum: field }, format: 'money.GBP', target, window: '30d', compare: 'none' } as never,
});

const CASH = metric('cash-now', 'register.accounts', 'liquid is true', 'balance', { gte: 0 });
const TO_YOU = metric('owed-to-you', 'register.obligations', `${OPEN}, direction is owed to me`, 'amount', { lte: 2_000_000 });
const BY_YOU = metric('owed-by-you', 'register.obligations', `${OPEN}, direction is owed by me`, 'amount', { lte: 6_000_000 });

type Clockish = ReturnType<typeof fixedClock>;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record with Money's four registers, its three money figures, and the rows below. */
async function ledger(rows: { accounts?: object[]; obligations?: object[] } = {}): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(k.createRecord(MADE));
  value(await k.install([ACCOUNTS, OBLIGATIONS, FX, SNAPSHOTS, CASH, TO_YOU, BY_YOU]));
  for (const row of rows.accounts ?? [{ name: 'Barclays', balance: { amount: 1_200_000, currency: 'GBP' }, as_of: '2026-09-18', liquid: true }])
    value(k.create('accounts', row as never, { actor: 'p_1' }));
  for (const row of rows.obligations ?? [])
    value(k.create('obligations', row as never, { actor: 'p_1' }));
  return { k, sql, clock };
}

const armed = (sql: NodeSql) =>
  sql.one<{ key: string; due_at: string; state: string; payload: string }>("SELECT key, due_at, state, payload FROM schedule WHERE kind = 'snapshot'");

const nights = (sql: NodeSql): Record<string, unknown>[] =>
  sql
    .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'snapshots' AND deleted_at IS NULL ORDER BY json_extract(fields, '$.on')")
    .map((r) => JSON.parse(r.fields) as Record<string, unknown>);

const OWED = [
  { what: 'Invoice 41', direction: 'owed_to_me', amount: { amount: 480_000, currency: 'GBP' }, due: '2026-09-30', state: 'open' },
  { what: 'Invoice 38', direction: 'owed_to_me', amount: { amount: 100_000, currency: 'GBP' }, due: '2026-08-01', state: 'paid' },
  { what: 'Illustration', direction: 'owed_by_me', amount: { amount: 135_000, currency: 'GBP' }, due: '2026-09-25', state: 'open' },
  { what: 'Studio rent', direction: 'owed_by_me', amount: { amount: 65_000, currency: 'GBP' }, due: '2026-09-28', state: 'part' },
];

test('DECLARING THE REGISTER ARMS THE NIGHT, or nothing ever writes a row into it', async () => {
  const { sql } = await ledger();
  const row = armed(sql);
  assert.ok(row, 'register.snapshots installed and no nightly row was armed, so the ledger has no history');
  /* THE BARE ID IS THE KEY, like a digest's. `forgetPack` deletes schedule rows by
     `substr(id, instr(id, '.') + 1)`, so anything else here is a row an uninstall could never take. */
  assert.equal(row.key, 'snapshots');
  assert.equal(row.state, 'pending');
  assert.deepEqual(JSON.parse(row.payload), { register: 'snapshots' });
  /* FIVE PAST MIDNIGHT IN CAIRO, which is 21:05 UTC the day before. */
  assert.equal(new Date(row.due_at).toISOString(), '2026-09-20T21:05:00.000Z');
  sql.close();
});

test('THE NIGHT IT FIRES IT WRITES FOUR FIGURES, and the fourth is the arithmetic over the other three', async () => {
  const { k, sql, clock } = await ledger({ obligations: OWED });
  clock.set(Date.parse(armed(sql)!.due_at));
  await k.drain();

  const rows = nights(sql);
  assert.equal(rows.length, 1, 'the nightly row fired and wrote no snapshot');
  const [night] = rows as [Record<string, unknown>];
  assert.equal(night.on, '2026-09-20', 'the row is the night that has just ended, not the day that has just begun');
  /* THE TITLE IS THE NIGHT IN WORDS, the way every surface in this product prints a day. `on` holds
     the ISO form nothing can find by typing what it sees, which is why the register has both. */
  assert.equal(night.what, '20 Sep 2026');
  assert.equal(night.taken, 'nightly');
  assert.deepEqual(night.cash, { amount: 1_200_000, currency: 'GBP' });
  assert.deepEqual(night.owed_to_me, { amount: 480_000, currency: 'GBP' }, 'the paid invoice is not owed to anybody');
  assert.deepEqual(night.owed_by_me, { amount: 200_000, currency: 'GBP' }, 'a part-paid row is still owed');
  assert.deepEqual(night.net, { amount: 1_480_000, currency: 'GBP' }, 'cash plus what is owed to you less what you owe');

  /* AND THE NEXT NIGHT IS ARMED. A one-shot here is a history with exactly two points on it. */
  const next = armed(sql)!;
  assert.equal(next.state, 'pending');
  assert.equal(new Date(next.due_at).toISOString(), '2026-09-21T21:05:00.000Z');
  sql.close();
});

test('AND A SECOND DRAIN THE SAME NIGHT WRITES NOTHING, because `on` is unique and a doubled line is a lie', async () => {
  const { k, sql, clock } = await ledger({ obligations: OWED });
  clock.set(Date.parse(armed(sql)!.due_at));
  await k.drain();
  /* The row a platform redelivers, or a second alarm five seconds later: re-arm it and fire again. */
  sql.exec("UPDATE schedule SET state = 'pending', due_at = ? WHERE kind = 'snapshot'", new Date(clock.now()).toISOString());
  const out = await k.drain();
  assert.equal(out.failed, 0, 'a night already taken walked the retry ladder instead of doing nothing');
  assert.equal(nights(sql).length, 1);
  sql.close();
});

/**
 * AND A NIGHT SOMEBODY DELETED IS NOT PUT BACK, which is the only thing the read at the top of
 * `writeNight` does that the register cannot do for itself.
 *
 * MEASURED, AND IT IS WHY THIS TEST EXISTS. Deleting that read outright and running the eight tests
 * written with it left all eight green: the uniqueness of `on` refuses the second write on its own,
 * `UNIQUE_VIOLATION` is swallowed, and the test above sees the one row and the zero failures it
 * expects either way. So the guard was carrying one behaviour and nothing was holding it.
 *
 * THE INDEX IS PARTIAL ON `deleted_at IS NULL`, so a removed row frees the day again and the write
 * below IS accepted. Without the guard this record answers a person who deleted a night by writing
 * it again the next time the alarm is redelivered, which is the record arguing with its owner about
 * their own ledger.
 */
test('AND A NIGHT SOMEBODY DELETED IS NOT PUT BACK, because the unique day came free when they deleted it', async () => {
  const { k, sql, clock } = await ledger({ obligations: OWED });
  clock.set(Date.parse(armed(sql)!.due_at));
  await k.drain();
  sql.exec("UPDATE entry SET deleted_at = ? WHERE register = 'snapshots'", new Date(clock.now()).toISOString());
  assert.deepEqual(nights(sql), [], 'the fixture did not delete the night it was about to test');

  sql.exec("UPDATE schedule SET state = 'pending', due_at = ? WHERE kind = 'snapshot'", new Date(clock.now()).toISOString());
  const out = await k.drain();
  assert.equal(out.failed, 0);
  const all = sql.all<{ x: number }>("SELECT 1 AS x FROM entry WHERE register = 'snapshots'").length;
  assert.equal(all, 1, 'the deleted night was written again, over a row its owner took out on purpose');
  sql.close();
});

test('A POSITION IN TWO CURRENCIES WITH NO RATE IS NOT WRITTEN, because a money field holds one code', async () => {
  const { k, sql, clock } = await ledger({
    accounts: [
      { name: 'Barclays', balance: { amount: 1_200_000, currency: 'GBP' }, as_of: '2026-09-18', liquid: true },
      { name: 'CIB', balance: { amount: 5_200_000, currency: 'EGP' }, as_of: '2026-09-18', liquid: true },
    ],
    obligations: OWED,
  });
  clock.set(Date.parse(armed(sql)!.due_at));
  await k.drain();
  /* GBP 12,000 and EGP 52,000 are not GBP 64,000 and not EGP 64,000, and there is no rate to make
     them one number. A gap in the chart is honest; a row adding two currencies is wrong for ever. */
  assert.deepEqual(nights(sql), []);
  /* AND THE ROW DID NOT FAIL. A night nobody can record is not a defect in the record, and walking
     the retry ladder over it would open a suggestion every night until somebody typed a rate. */
  assert.equal(armed(sql)!.state, 'pending');
  sql.close();
});

test('WITH A HOME CURRENCY AND RATES IT IS WRITTEN CONVERTED, and the row says so', async () => {
  const { k, sql, clock } = await ledger({
    accounts: [
      { name: 'Barclays', balance: { amount: 1_200_000, currency: 'GBP' }, as_of: '2026-09-18', liquid: true },
      { name: 'CIB', balance: { amount: 5_200_000, currency: 'EGP' }, as_of: '2026-09-18', liquid: true },
    ],
    obligations: OWED,
  });
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  value(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }));
  value(k.create('fx', { currency: 'GBP', base: 'EGP', rate: 65, as_of: '2026-09-15' } as never, { actor: 'p_1' }));

  clock.set(Date.parse(armed(sql)!.due_at));
  await k.drain();

  const [night] = nights(sql) as [Record<string, unknown>];
  assert.ok(night, 'every amount had a rate into the home currency and the night was still skipped');
  /* GBP 12,000 at 65 is EGP 780,000, plus the EGP 52,000 already held. */
  assert.deepEqual(night.cash, { amount: 78_000_000 + 5_200_000, currency: 'EGP' });
  assert.deepEqual(night.owed_to_me, { amount: 480_000 * 65, currency: 'EGP' });
  assert.deepEqual(night.owed_by_me, { amount: 200_000 * 65, currency: 'EGP' });
  assert.deepEqual(night.net, { amount: 78_000_000 + 5_200_000 + 480_000 * 65 - 200_000 * 65, currency: 'EGP' });
  /* A CONVERTED READING SAYS IT IS ONE. Without this the row reads as money held in Egyptian pounds,
     and nobody looking at it in a year can tell that a rate, not a balance, moved the line. */
  assert.equal(night.note, 'Converted to EGP at rates as of 2026-09-15.');
  sql.close();
});

test('A MACHINE ASLEEP AT MIDNIGHT MISSES THE NIGHT, and does not stamp the morning on it', async () => {
  const { k, sql, clock } = await ledger({ obligations: OWED });
  const due = Date.parse(armed(sql)!.due_at);
  /* Awake at half past nine in the morning, Cairo. Account balances are not reconstructible — the
     record holds what is in the bank NOW, not what was in it nine hours ago — so a reading taken
     here is a reading of the 21st, and writing it against the 20th would put a morning of movement
     on the wrong day. */
  clock.set(due + 9.5 * 3_600_000);
  const out = await k.drain();
  assert.equal(out.failed, 0);
  assert.deepEqual(nights(sql), [], 'a night the record slept through was written from the next morning');
  assert.equal(new Date(armed(sql)!.due_at).toISOString(), '2026-09-21T21:05:00.000Z', 'the missed night ended the row instead of arming the next one');
  sql.close();
});

test('A RECORD THAT HOLDS NO ACCOUNT HAS NO CASH POSITION, and zero is not the same answer', async () => {
  const { k, sql, clock } = await ledger({ accounts: [], obligations: OWED });
  /* THE CURRENCY IS CHOSEN, so what is tested here is the row count and not the missing code. */
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  value(k.setPackConfig('money-core', { home_currency: 'GBP' }, { actor: 'p_1' }));
  clock.set(Date.parse(armed(sql)!.due_at));
  await k.drain();
  /* `cash-now` over no accounts is a sum over nothing, which is zero. A night written from it says
     this person had nothing in the bank on the 20th, and the truth is that nobody has told the
     record what they have. That is the whole-row version of the hole a missing figure draws. */
  assert.deepEqual(nights(sql), []);
  sql.close();
});

/**
 * AND AN EMPTY RECORD WITH NO CURRENCY CHOSEN EITHER, which is the same refusal reached the same way.
 *
 * THE TITLE THIS TEST WAS WRITTEN UNDER CLAIMED MORE THAN IT HOLDS, and the difference was measured
 * rather than read: replacing the `currency === null` refusal in `writeNight` with a fallback code
 * leaves this test green, because the empty account book returns one guard earlier, at `rows === 0`.
 * So what is pinned here is that leaving the currency unchosen does not route an empty record around
 * that guard, which is worth a line and is not the same statement as the old name made.
 *
 * NO CONFIGURATION REACHES THE CURRENCY REFUSAL ITSELF, on the evidence available here. A money
 * figure is added up `into` the home currency or, when none is chosen, into the currency its own
 * `format:` declares, and all three of these figures declare one. So a figure that comes back at all
 * comes back in that one code, and the pair of guards below `read` are insurance against a money
 * figure declared with no format rather than a case a record can be put into today.
 */
test('AND AN EMPTY RECORD WITH NO CURRENCY CHOSEN WRITES NOTHING EITHER, for the reason above it', async () => {
  const { k, sql, clock } = await ledger({ accounts: [] });
  clock.set(Date.parse(armed(sql)!.due_at));
  await k.drain();
  assert.deepEqual(nights(sql), []);
  sql.close();
});
