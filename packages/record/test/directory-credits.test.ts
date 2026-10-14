/**
 * Slash credits in the Directory: the packs bought, the order an ask spends them in, and a plan given as a gift.
 *
 * THE SPEND ORDER IS THE CONTRACT. The month's included credits go first, then the oldest pack, then the next; a month
 * turning gives the included back and leaves the packs alone; a payment delivered twice adds once. Each is asserted on
 * the ledger's own rows as well as on the answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARRIED, DIRECTORY_VERSION, createDirectory, type AccountUsage, type Directory } from '../src/directory.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 3, 17);
const DAY = 86_400_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  return !x.ok && x.refusal ? x.refusal : assert.fail('this was supposed to be refused');
};

/** Ada owns `the-studio`, on Free: 20 credits a month. */
function studio(): { d: Directory; sql: NodeSql; clock: ReturnType<typeof fixedClock>; ada: string; record: string } {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, { mac: new Uint8Array(32).fill(7), magic: true });
  const ada = value<{ id: string }>(d.person$('ada@example.com', 'Ada')).id;
  const record = value<{ record: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' })).record;
  value(d.setPlan(record, 'free'));
  return { d, sql, clock, ada, record };
}

/** The month's asks as the night hands them across. */
const asked = (d: Directory, record: string, asks: number, day = '2026-09-10'): void => {
  value(d.meterSlash(record, [{ day, asks, neurons: asks * 10 }]));
};

const lefts = (sql: NodeSql, record: string): Record<string, number> =>
  Object.fromEntries(sql.all<{ event: string; left: number }>('SELECT event, left FROM dir_credit WHERE record = ? ORDER BY bought_at', record).map((r) => [r.event, Number(r.left)]));

const spend = (d: Directory, record: string, at = NOW) => value<{ left: number | null }>(d.billing({ op: 'spend', record, at }));

test('AN ASK SPENDS THE MONTH FIRST, THEN THE OLDEST PACK, THEN THE NEXT', () => {
  const { d, sql, ada, record } = studio();
  value(d.billing({ op: 'credit', record, person: ada, pack: 'credits-100', event: 'evt_a', at: NOW - 2 * DAY }));
  value(d.billing({ op: 'credit', record, person: ada, pack: 'credits-500', event: 'evt_b', at: NOW - DAY }));

  /* Inside the month's twenty: no pack is touched, and `left` counts the ask just made. */
  asked(d, record, 19);
  assert.deepEqual(spend(d, record), { left: 600 });
  assert.deepEqual(lefts(sql, record), { evt_a: 100, evt_b: 500 });

  /* The month used: the oldest pack pays, down to nothing, and only then the next. */
  asked(d, record, 20);
  assert.deepEqual(spend(d, record), { left: 599 });
  assert.deepEqual(lefts(sql, record), { evt_a: 99, evt_b: 500 });
  for (let i = 0; i < 99; i++) spend(d, record);
  assert.deepEqual(lefts(sql, record), { evt_a: 0, evt_b: 500 });
  assert.deepEqual(spend(d, record), { left: 499 });
  assert.deepEqual(lefts(sql, record), { evt_a: 0, evt_b: 499 });
  assert.deepEqual(d.billing({ op: 'credits', record }), { packs: 499 });
});

test("A MONTH'S TURN GIVES THE INCLUDED BACK AND KEEPS THE PACKS", () => {
  const { d, sql, clock, ada, record } = studio();
  value(d.billing({ op: 'credit', record, person: ada, pack: 'credits-100', event: 'evt_a', at: NOW }));
  asked(d, record, 20);
  spend(d, record);
  assert.deepEqual(d.billing({ op: 'mayAsk', record, at: NOW }), { ok: true, left: 99 });

  const october = Date.UTC(2026, 9, 2, 9);
  clock.set(october);
  assert.deepEqual(d.billing({ op: 'mayAsk', record, at: october }), { ok: true, left: 20 + 99 });
  assert.deepEqual(spend(d, record, october), { left: 19 + 99 });
  assert.deepEqual(lefts(sql, record), { evt_a: 99 });
});

test('THE SAME PAYMENT SENT TWICE ADDS ONCE, AND A PACK NOBODY SELLS IS REFUSED BY NAME', () => {
  const { d, ada, record } = studio();
  const call = { op: 'credit', record, person: ada, pack: 'credits-100', event: 'evt_once', at: NOW } as const;
  assert.deepEqual(value(d.billing(call)), { added: true, left: 100 });
  assert.deepEqual(value(d.billing(call)), { added: false, left: 100 });
  assert.deepEqual(d.billing({ op: 'credits', record }), { packs: 100 });

  const unknown = refusal(d.billing({ ...call, pack: 'credits-9000', event: 'evt_other' }));
  assert.equal(unknown.code, 'ENUM_VALUE_UNKNOWN');
  assert.match(unknown.fix, /credits-9000/);
  assert.equal(unknown.at, 'pack');
  assert.equal(refusal(d.billing({ ...call, event: '' })).at, 'event');
  assert.deepEqual(d.billing({ op: 'credits', record }), { packs: 100 });
});

test('A REFUND AFTER 30 SPENT TAKES THE 70 LEFT, ONCE, AND NEVER BELOW ZERO', () => {
  const { d, sql, ada, record } = studio();
  value(d.billing({ op: 'credit', record, person: ada, pack: 'credits-100', event: 'evt_r', at: NOW }));
  asked(d, record, 20);
  for (let i = 0; i < 30; i++) spend(d, record);
  assert.deepEqual(value(d.billing({ op: 'refund', event: 'evt_r' })), { taken: 70 });
  assert.deepEqual(value(d.billing({ op: 'refund', event: 'evt_r' })), { taken: 0 });
  assert.deepEqual(lefts(sql, record), { evt_r: 0 });

  /* The payment redelivered after its refund finds its row and adds nothing back. */
  assert.deepEqual(value(d.billing({ op: 'credit', record, person: ada, pack: 'credits-100', event: 'evt_r', at: NOW })), { added: false, left: 0 });
  assert.equal(refusal(d.billing({ op: 'refund', event: 'evt_never' })).code, 'OUT_OF_BOUNDS');
});

test('WITH NOTHING LEFT, mayAsk SAYS NO, AND A PLAN WITH NO CREDITS IS ALWAYS YES', () => {
  const { d, sql, record } = studio();
  assert.deepEqual(d.billing({ op: 'mayAsk', record, at: NOW }), { ok: true, left: 20 });
  asked(d, record, 25);
  assert.deepEqual(d.billing({ op: 'mayAsk', record, at: NOW }), { ok: false, left: 0 });
  /* Asked after an ask that happened anyway: nothing to take, and it says so rather than refusing. */
  assert.deepEqual(spend(d, record), { left: 0 });
  assert.equal(Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_credit')?.n), 0);

  value(d.setPlan(record, 'selfhost'));
  assert.deepEqual(d.billing({ op: 'mayAsk', record, at: NOW }), { ok: true, left: null });
  assert.deepEqual(spend(d, record), { left: null });
  assert.equal(refusal(d.billing({ op: 'spend', record: 'rec_nobody', at: NOW })).code, 'OUT_OF_BOUNDS');
});

test("THE USAGE ANSWER'S SLASH GAINS THE MONTH'S CREDITS AND KEEPS ITS THREE", () => {
  const { d, ada, record } = studio();
  value(d.meterSlash(record, [
    { day: '2026-09-10', asks: 12, neurons: 300 },
    { day: '2026-09-20', asks: 13, neurons: 50 },
  ]));
  value(d.billing({ op: 'credit', record, person: ada, pack: 'credits-100', event: 'evt_u', at: NOW }));
  const slash = value<AccountUsage>(d.usage(ada, { from: '2026-09-01', to: '2026-09-30' })).records[0]!.slash;
  assert.deepEqual(slash, {
    included: 20,
    used: 25,
    packs: 100,
    left: 100,
    asks: 25,
    neurons: 350,
    days: [
      { day: '2026-09-10', asks: 12, neurons: 300 },
      { day: '2026-09-20', asks: 13, neurons: 50 },
    ],
  });

  /* The range is the range and the month is the month: a narrower range moves the three and not the four. */
  const narrow = value<AccountUsage>(d.usage(ada, { from: '2026-09-15', to: '2026-09-30' })).records[0]!.slash;
  assert.deepEqual([narrow.asks, narrow.neurons, narrow.days.length], [13, 50, 1]);
  assert.deepEqual([narrow.included, narrow.used, narrow.packs, narrow.left], [20, 25, 100, 100]);
});

test("A CLOSED RECORD'S CREDITS END WITH IT", () => {
  const { d, sql, ada, record } = studio();
  value(d.billing({ op: 'credit', record, person: ada, pack: 'credits-500', event: 'evt_c', at: NOW }));
  value(d.close(record));
  assert.deepEqual(d.billing({ op: 'credits', record }), { packs: 0 });
  assert.equal(Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_credit WHERE record = ?', record)?.n), 0);
  assert.equal(refusal(d.billing({ op: 'credit', record, person: ada, pack: 'credits-100', event: 'evt_late', at: NOW })).at, 'record');
});

test('A GIFT HAS NO CUSTOMER, IS NEVER DUE, AND NO STRIPE EVENT CAN FIND IT', () => {
  const { d, ada, record } = studio();
  const gift = value<{ state: string; customer: string; subscription: string | null; lapsed_at: number | null }>(
    d.billing({ op: 'set', row: { record, person: ada, state: 'comp' } }),
  );
  assert.deepEqual([gift.state, gift.customer, gift.subscription, gift.lapsed_at], ['comp', '', null, null]);
  assert.deepEqual(d.billing({ op: 'byCustomer', customer: '' }), []);
  assert.deepEqual(d.billing({ op: 'due', now: NOW + 400 * DAY }), []);
  assert.equal(d.billing({ op: 'lapsed', record }), false);

  /* A lapse cannot be written over a gift, and a gift cannot carry a customer or a subscription. */
  assert.equal(refusal(d.billing({ op: 'set', row: { record, state: 'lapsed' } })).at, 'state');
  assert.equal(refusal(d.billing({ op: 'set', row: { record, state: 'past_due' } })).at, 'state');
  assert.equal(refusal(d.billing({ op: 'set', row: { record, state: 'comp', customer: 'cus_test_1' } })).at, 'customer');
  assert.equal(refusal(d.billing({ op: 'set', row: { record, subscription: 'sub_test_1' } })).at, 'subscription');
  assert.equal(d.billing({ op: 'of', record })?.state, 'comp');

  /* A paid record that lapses is still due: the gift is the only row the night passes over. */
  const other = value<{ record: string }>(d.provision({ slug: 'books-co', email: 'ada@example.com' })).record;
  value(d.billing({ op: 'set', row: { record: other, person: ada, customer: 'cus_test_2', state: 'lapsed' } }));
  assert.deepEqual(d.billing({ op: 'due', now: NOW + DAY }).map((r) => r.record), [other]);

  /* A gift can still buy packs. */
  assert.deepEqual(value(d.billing({ op: 'credit', record, person: ada, pack: 'credits-100', event: 'evt_g', at: NOW })), { added: true, left: 100 });

  /* Taken back, the gift's row goes and the packs stay; a paid row is never removed this way. */
  assert.deepEqual(value(d.billing({ op: 'unbill', record })), { removed: true });
  assert.equal(d.billing({ op: 'of', record }), null);
  assert.deepEqual(value(d.billing({ op: 'unbill', record })), { removed: false });
  assert.deepEqual(d.billing({ op: 'credits', record }), { packs: 100 });
  assert.equal(refusal(d.billing({ op: 'unbill', record: other })).at, 'record');
  assert.equal(d.billing({ op: 'of', record: other })?.state, 'lapsed');

  /* A gift is never written over a plan still charged, nor over a lapse: the row would forget a live subscription. */
  assert.equal(refusal(d.billing({ op: 'set', row: { record: other, state: 'comp' } })).code, 'ALREADY_KNOWN');
  const paying = value<{ record: string }>(d.provision({ slug: 'paying-co', email: 'ada@example.com' })).record;
  value(d.billing({ op: 'set', row: { record: paying, person: ada, customer: 'cus_test_3', subscription: 'sub_test_3', state: 'active' } }));
  assert.equal(refusal(d.billing({ op: 'set', row: { record: paying, state: 'comp' } })).code, 'ALREADY_KNOWN');
  assert.equal(d.billing({ op: 'of', record: paying })?.subscription, 'sub_test_3');
});

test('THE LEDGER IS A NEW TABLE: THE VERSION DOES NOT MOVE, AND A COPY CARRIES IT', () => {
  const { sql } = studio();
  assert.equal(DIRECTORY_VERSION, 4);
  assert.ok(sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'dir_credit'"));
  assert.ok(sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'index' AND name = 'dir_credit_record'"));
  assert.ok((CARRIED as readonly string[]).includes('dir_credit'));
});
