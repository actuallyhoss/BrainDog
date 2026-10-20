/**
 * The Directory's account state: who pays for which record, the lapse and its ladder, the Stripe events already
 * applied, and the `lapsed` flag a session answer carries.
 *
 * THE TRANSITIONS ARE THE CONTRACT. Entering `lapsed` starts the ladder once, staying there does not restart it, and
 * paying again ends it; the webhook and the night are built against exactly that, so each step is asserted on the row
 * rather than on the answer alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { CARRIED, DIRECTORY_VERSION, LEFT_OUT, createDirectory, type AuthConfig, type BillingRow, type Directory } from '../src/directory.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 3, 17);
const DAY = 86_400_000;

const config = (): AuthConfig => ({ mac: new Uint8Array(32).fill(7), magic: true });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  return !x.ok && x.refusal ? x.refusal : assert.fail('this was supposed to be refused');
};

function ok<B>(r: AuthResult<B>) {
  if (r.status !== 200) assert.fail(`expected 200, got ${r.status}${'refusal' in r ? ` ${r.refusal.code}` : ''}`);
  return r;
}

/** A Directory with Ada, who owns `the-studio`, and Bo, who is on it and owns nothing. */
function studio(): { d: Directory; sql: NodeSql; clock: ReturnType<typeof fixedClock>; ada: string; bo: string; record: string } {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, config(), { sells: false });
  const ada = value<{ id: string }>(d.person$('ada@example.com', 'Ada')).id;
  const bo = value<{ id: string }>(d.person$('bo@example.com', 'Bo')).id;
  const record = value<{ record: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' })).record;
  value(d.join(record, bo));
  return { d, sql, clock, ada, bo, record };
}

const row = (d: Directory, record: string): BillingRow => d.billing({ op: 'of', record }) ?? assert.fail('no billing row');

const count = (sql: NodeSql, table: string): number => Number(sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0);

/** Ada signs in by a link, as the Cloud's own way in, and the session opens on the record she owns. */
async function signedIn(d: Directory): Promise<string> {
  const started = ok(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: '203.0.113.9' }));
  const linkToken = started.mail && 'linkToken' in started.mail ? started.mail.linkToken : assert.fail('no link');
  const signed = ok(await d.auth({ flow: 'magic.redeem', linkToken, ip: '203.0.113.9' }));
  return signed.session && signed.session !== 'clear' ? signed.session.sid : assert.fail('no session');
}

test('THE THREE TABLES ARRIVE WITH THE VERSION WHERE IT WAS, AND EACH IS CARRIED OR LEFT OUT ON PURPOSE', () => {
  // A bump would make an older Worker refuse the one Directory every record shares, so the tables arrive by
  // `CREATE TABLE IF NOT EXISTS` alone.
  const { sql } = studio();
  assert.equal(DIRECTORY_VERSION, 4);
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dir_meta WHERE key = 'version'")?.value, '4');
  for (const table of ['dir_pending', 'dir_billing', 'dir_stripe_event'])
    assert.ok(sql.one('SELECT 1 AS x FROM sqlite_master WHERE type = ? AND name = ?', 'table', table), `${table} was not made`);
  assert.ok((CARRIED as readonly string[]).includes('dir_billing'));
  assert.ok((CARRIED as readonly string[]).includes('dir_stripe_event'));
  assert.ok((LEFT_OUT as readonly string[]).includes('dir_pending'));
});

test('A RECORD WITH NO BILLING ROW IS NOT BILLED AND NEVER LAPSES', async () => {
  const { d, ada, record } = studio();
  assert.equal(d.billing({ op: 'of', record }), null);
  assert.equal(d.billing({ op: 'lapsed', record }), false);
  assert.deepEqual(d.billing({ op: 'for', person: ada }), []);
  assert.deepEqual(d.billing({ op: 'due', now: NOW + 365 * DAY }), []);

  const sid = await signedIn(d);
  const who = ok(await d.auth({ flow: 'session', sid })).body as { record: string | null; lapsed?: boolean };
  assert.equal(who.record, record);
  assert.equal('lapsed' in who, false, 'an unbilled record answered a lapse flag');
});

test('THE FIRST ROW NAMES WHO PAID AND THEIR CUSTOMER, IS ACTIVE, AND A REFUSED ONE WRITES NOTHING', () => {
  const { d, sql, ada, record } = studio();
  assert.equal(refusal(d.billing({ op: 'set', row: { record, customer: 'cus_1' } })).at, 'person');
  assert.equal(refusal(d.billing({ op: 'set', row: { record, person: ada } })).at, 'customer');
  assert.equal(refusal(d.billing({ op: 'set', row: { record: 'rec_nobody', person: ada, customer: 'cus_1' } })).code, 'OUT_OF_BOUNDS');
  assert.equal(refusal(d.billing({ op: 'set', row: { record, person: 'p_nobody', customer: 'cus_1' } })).code, 'OUT_OF_BOUNDS');
  const wrongState = { record, person: ada, customer: 'cus_1', state: 'paused' } as unknown as { record: string };
  assert.equal(refusal(d.billing({ op: 'set', row: wrongState })).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(count(sql, 'dir_billing'), 0, 'a refused set wrote a row');

  const made = value<BillingRow>(d.billing({ op: 'set', row: { record, person: ada, customer: 'cus_1', price: 'price_1', period_end: NOW + 30 * DAY } }));
  assert.deepEqual(made, {
    record,
    person: ada,
    customer: 'cus_1',
    subscription: null,
    price: 'price_1',
    state: 'active',
    period_end: NOW + 30 * DAY,
    lapsed_at: null,
    told: '',
    updated_at: NOW,
    slug: 'the-studio',
  });

  // A later event names only what it knows, and the rest of the row stays as it was.
  const moved = value<BillingRow>(d.billing({ op: 'set', row: { record, subscription: 'sub_1' } }));
  assert.equal(moved.subscription, 'sub_1');
  assert.equal(moved.price, 'price_1');
  assert.equal(moved.customer, 'cus_1');
  assert.equal(moved.period_end, NOW + 30 * DAY);
});

test('ENTERING A LAPSE STARTS THE LADDER ONCE, STAYING THERE DOES NOT RESTART IT, AND PAYING ENDS IT', () => {
  const { d, clock, ada, record } = studio();
  value(d.billing({ op: 'set', row: { record, person: ada, customer: 'cus_1' } }));

  // past_due is the warning before a lapse: nothing is set yet.
  clock.advance(DAY);
  const warned = value<BillingRow>(d.billing({ op: 'set', row: { record, state: 'past_due' } }));
  assert.equal(warned.lapsed_at, null);
  assert.equal(d.billing({ op: 'lapsed', record }), false);

  clock.advance(DAY);
  const lapsedAt = clock.now();
  const lapsed = value<BillingRow>(d.billing({ op: 'set', row: { record, state: 'lapsed' } }));
  assert.equal(lapsed.lapsed_at, lapsedAt);
  assert.equal(lapsed.told, '');
  assert.equal(d.billing({ op: 'lapsed', record }), true);

  value(d.billing({ op: 'told', record, day: 0 }));
  assert.equal(row(d, record).told, '0');

  // The same event again, or another saying the same thing, moves neither the start of the lapse nor the ladder.
  clock.advance(DAY);
  const again = value<BillingRow>(d.billing({ op: 'set', row: { record, state: 'lapsed' } }));
  assert.equal(again.lapsed_at, lapsedAt);
  assert.equal(again.told, '0');

  // A notice twice is written once, and the days stay in their order.
  value(d.billing({ op: 'told', record, day: 60 }));
  value(d.billing({ op: 'told', record, day: 60 }));
  assert.equal(row(d, record).told, '0,60');
  assert.equal(refusal(d.billing({ op: 'told', record, day: 30 as unknown as 0 })).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(row(d, record).told, '0,60');

  // Paying again clears both, and `lapsed` answers no.
  const paid = value<BillingRow>(d.billing({ op: 'set', row: { record, state: 'active' } }));
  assert.equal(paid.lapsed_at, null);
  assert.equal(paid.told, '');
  assert.equal(d.billing({ op: 'lapsed', record }), false);

  // A notice for a record paid for since the walk read it records nothing.
  value(d.billing({ op: 'told', record, day: 83 }));
  assert.equal(row(d, record).told, '');

  // And a second lapse is a new ladder from its own day.
  clock.advance(10 * DAY);
  const second = value<BillingRow>(d.billing({ op: 'set', row: { record, state: 'lapsed' } }));
  assert.equal(second.lapsed_at, clock.now());
  assert.equal(second.told, '');
});

test('A LAPSE UNDER WAY IS KEPT THROUGH PAST_DUE, AND RE-ENTERING LAPSED STARTS THE NOTICES AGAIN', () => {
  const { d, clock, ada, record } = studio();
  value(d.billing({ op: 'set', row: { record, person: ada, customer: 'cus_1', state: 'lapsed' } }));
  const began = clock.now();
  value(d.billing({ op: 'told', record, day: 0 }));

  clock.advance(DAY);
  const warned = value<BillingRow>(d.billing({ op: 'set', row: { record, state: 'past_due' } }));
  assert.equal(warned.lapsed_at, began);
  assert.equal(warned.told, '0');
  assert.equal(d.billing({ op: 'lapsed', record }), false);

  clock.advance(DAY);
  const back = value<BillingRow>(d.billing({ op: 'set', row: { record, state: 'lapsed' } }));
  assert.equal(back.lapsed_at, began, 'the lapse restarted its clock');
  assert.equal(back.told, '');
});

test('OWNED, BY CUSTOMER, AND DUE: WHAT THE ACCOUNT DOOR AND THE NIGHT READ', () => {
  const { d, clock, ada, bo, record } = studio();
  const other = value<{ record: string }>(d.provision({ slug: 'books-co', email: 'ada@example.com' })).record;
  value(d.billing({ op: 'set', row: { record, person: ada, customer: 'cus_1' } }));
  value(d.billing({ op: 'set', row: { record: other, person: ada, customer: 'cus_1', state: 'lapsed' } }));

  // Billing is the owner's: Bo is on the studio and sees none of it.
  assert.deepEqual(d.billing({ op: 'for', person: ada }).map((r) => r.slug).sort(), ['books-co', 'the-studio']);
  assert.deepEqual(d.billing({ op: 'for', person: bo }), []);
  assert.deepEqual(d.billing({ op: 'byCustomer', customer: 'cus_1' }).map((r) => r.record).sort(), [record, other].sort());
  assert.deepEqual(d.billing({ op: 'byCustomer', customer: 'cus_nobody' }), []);

  // Only lapsed rows are due, with the address the notice goes to and the name it is about.
  assert.deepEqual(d.billing({ op: 'due', now: clock.now() }), [
    { record: other, person: ada, email: 'ada@example.com', slug: 'books-co', lapsed_at: NOW, told: '' },
  ]);
  // A lapse that begins after `now` is not due yet.
  assert.deepEqual(d.billing({ op: 'due', now: NOW - 1 }), []);
});

test('AN EVENT ID IS NEW ONCE, AND IS FORGOTTEN AFTER FORTY DAYS', () => {
  const { d, sql, clock } = studio();
  assert.equal(d.billing({ op: 'seen', id: 'evt_1', type: 'invoice.paid' }), true);
  assert.equal(d.billing({ op: 'seen', id: 'evt_1', type: 'invoice.paid' }), false);
  assert.equal(d.billing({ op: 'seen', id: 'evt_2', type: 'invoice.payment_failed' }), true);
  assert.equal(d.billing({ op: 'seen', id: '', type: 'invoice.paid' }), false, 'an event with no id was let through to be applied');
  assert.equal(count(sql, 'dir_stripe_event'), 2);

  clock.advance(41 * DAY);
  assert.equal(d.billing({ op: 'seen', id: 'evt_3', type: 'invoice.paid' }), true);
  assert.equal(count(sql, 'dir_stripe_event'), 1, 'ids older than forty days were kept');
});

test('A SESSION ON A LAPSED RECORD SAYS SO, WITH THE PATH NAMING IT OR NOT, AND STOPS SAYING SO ONCE PAID', async () => {
  const { d, ada, record } = studio();
  const sid = await signedIn(d);
  value(d.billing({ op: 'set', row: { record, person: ada, customer: 'cus_1', state: 'lapsed' } }));

  const bare = ok(await d.auth({ flow: 'session', sid })).body as { record: string | null; lapsed?: boolean };
  assert.equal(bare.record, record);
  assert.equal(bare.lapsed, true);
  const named = ok(await d.auth({ flow: 'session', sid, slug: 'the-studio' })).body as { record: string | null; lapsed?: boolean };
  assert.equal(named.lapsed, true);

  // Only `session` carries it: `methods` answers who is signed in and nothing about billing.
  const methods = ok(await d.auth({ flow: 'methods', sid })).body as { me: { lapsed?: boolean } | null };
  assert.equal(methods.me !== null && 'lapsed' in methods.me, false);

  value(d.billing({ op: 'set', row: { record, state: 'active' } }));
  const paid = ok(await d.auth({ flow: 'session', sid })).body as { lapsed?: boolean };
  assert.equal('lapsed' in paid, false);
});

test('A DIRECTORY DUMPED AND LOADED KEEPS ITS BILLING ROWS AND APPLIED EVENTS, AND NO PENDING MAILBOX', () => {
  const from = studio();
  value(from.d.billing({ op: 'set', row: { record: from.record, person: from.ada, customer: 'cus_1', subscription: 'sub_1', state: 'lapsed' } }));
  value(from.d.billing({ op: 'told', record: from.record, day: 0 }));
  assert.equal(from.d.billing({ op: 'seen', id: 'evt_1', type: 'invoice.payment_failed' }), true);
  from.sql.exec(
    'INSERT INTO dir_pending (hash, purpose, email, expires, created_at) VALUES (?, ?, ?, ?, ?)',
    'f'.repeat(64),
    'signup',
    'cy@example.com',
    NOW + DAY,
    NOW,
  );

  const lines = from.d.dump();
  assert.ok(!lines.includes('#table dir_pending'), 'a pending mailbox travelled in the copy');

  const to = createDirectory(openSqlite(), fixedClock(NOW), config(), { sells: false });
  value(to.load(lines));
  assert.deepEqual(to.billing({ op: 'of', record: from.record }), from.d.billing({ op: 'of', record: from.record }));
  assert.equal(to.billing({ op: 'lapsed', record: from.record }), true);
  assert.equal(to.billing({ op: 'seen', id: 'evt_1', type: 'invoice.payment_failed' }), false, 'a redelivered event would be applied twice after a restore');
});
