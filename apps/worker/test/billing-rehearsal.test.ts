/**
 * Checkout rehearsed from start to finish ("runs one test checkout end to end"): one
 * stranger's whole paid life through the Worker's real billing doors, against a Stripe that remembers
 * (`fake-stripe.ts`). Free; Cloud bought on the Checkout page; the plan and the allowance move; a second person joins and
 * the invoice still shows one seat; Cloud Plus confirmed on the portal and its 400 credits; packs bought, one by bank
 * debit, one refunded; a renewal that fails reads `past_due` and recovers; a cancel leaves the record read-only with its
 * one sentence; the ladder deletes it on day 90.
 *
 * OVER A REAL DIRECTORY, in memory, so the plan, the row, the credits and the ladder are the Directory's own. Every
 * event reaches the webhook as Stripe delivers it, signed under the made-up secret, so the signature check runs for
 * real. The walk's lines are read through the console, as `pay.mjs` reads the Worker's: each acted-on event type is seen,
 * and no line carries the key, the secret or an address.
 *
 * TEST MODE, A MADE-UP KEY AND SECRET, AND INVENTED NAMES. Nothing here is live and nothing charges. The steps carry the
 * names of `PAY` in `tools/drill/pay.mjs`, which runs the same walk against a host.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '@braindog/record/directory';
import { PLAN_TABLE } from '@braindog/record/plans';
import type { Refusal, Result, Who } from '@braindog/ports';

import { billingDoors, endForDeleted, LAPSE_DELETES_DAYS, type BillingEnv } from '../src/billing.ts';
import { stripeOf } from '../src/stripe.ts';
import { LAPSED_FIX, mayWrite } from '../src/lapse.ts';
import { ladder } from '../src/ladder.ts';
import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { fakeStripe, TEST_BANK, TEST_CARDS, type FakePrice } from './fake-stripe.ts';

const START = Date.UTC(2026, 9, 15, 9);
const DAY = 86_400_000;
const KEY = 'sk_test_made_up_for_the_rehearsal';
const SECRET = 'whsec_made_up_for_the_rehearsal';
const EMAIL = 'wren.hollis@example.test';
const ENDPOINT = 'https://alpha.example.test/account/billing/webhook';

const ENV: BillingEnv = {
  BILLING: 'test',
  STRIPE_SECRET_KEY: KEY,
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_HOSTED: 'price_cloud',
  STRIPE_PRICE_PLUS: 'price_plus',
  STRIPE_PRICE_PACK_100: 'price_pack_100',
  STRIPE_PRICE_PACK_500: 'price_pack_500',
  PUBLIC_HOST: 'alpha.example.test',
  SIGNUP: 'invite',
};

const monthly = (id: string, cents: number): FakePrice => ({ id, unit_amount: cents, currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, active: true });
const once = (id: string, cents: number): FakePrice => ({ id, unit_amount: cents, currency: 'usd', recurring: null, active: true });
const PRICES = [monthly('price_cloud', 1_200), monthly('price_plus', 2_900), once('price_pack_100', 500), once('price_pack_500', 2_000)];

/** Stripe's event types the webhook acts on (`ACTS` in `billing.ts`): the walk must see each of them. */
const ACTED = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
];

const value = <T>(r: Result<unknown>): T => {
  assert.ok(r.ok, r.ok ? '' : `${(r as { refusal: Refusal }).refusal.code}: ${(r as { refusal: Refusal }).refusal.fix}`);
  return (r as { value: T }).value;
};
const refusal = (r: Result<unknown>): Refusal => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as { refusal: Refusal }).refusal;
};
const dollars = (cents: unknown): string => (Number(cents) / 100).toFixed(2);

/** A stranger on a host in test mode: the real Directory, the fake Stripe, and the doors over both. */
function world(env: BillingEnv = ENV) {
  let now = START;
  const sql = openSqlite();
  const d = createDirectory(sql, { now: () => now });
  const person = value<{ id: string }>(d.person$(EMAIL, 'Wren Hollis')).id;
  const who: Who = { person, email: EMAIL, record: null, provedAt: START };
  const stripe = fakeStripe({ key: KEY, secret: SECRET, now: () => now, prices: PRICES });
  const people = new Map<string, number>();
  const lapses: [string, boolean][] = [];
  const doors = billingDoors(env, {
    clock: () => now,
    billing: async (call) => d.billing(call),
    usage: async (p, range) => d.usage(p, range),
    claimed: async (slug) => d.claimed(slug),
    provisionable: () => ({ ok: true, value: 'UTC' }),
    provision: async (args) => d.provision({ slug: args.slug, email: args.email }) as Result<{ record: string; slug: string; person: string }>,
    setPlan: async (record, plan) => {
      const out = d.setPlan(record, plan);
      return out.ok ? null : (out as { refusal: Refusal }).refusal;
    },
    setLapsed: async (record, on) => void lapses.push([record, on]),
    people: async (record) => people.get(record) ?? 1,
    stripe: (key) => stripeOf(key, () => now, stripe.send),
  });

  /** Every event Stripe has to send, delivered in order: each must be answered 200. Answers the types delivered. */
  const deliver = async (): Promise<string[]> => {
    const types: string[] = [];
    for (const event of stripe.take()) {
      const res = await doors.webhook!(await stripe.signed(event, ENDPOINT));
      assert.equal(res.status, 200, `${event.type} was answered ${String(res.status)}: ${await res.text()}`);
      types.push(event.type);
    }
    return types;
  };
  const listed = async (record: string) =>
    value<{ records: { record: string; state: string; plan: string; price: string; credits: number; lapsed_at?: number; delete_on?: number }[] }>(await doors.billing!(who)).records.find((r) => r.record === record);
  const today = () => new Date(now).toISOString().slice(0, 10);
  const usageOf = (record: string) => value<{ records: { record: string; month: { allowance: unknown }; slash: { included: number | null; left: number | null } }[] }>(d.usage(person, { from: today(), to: today() })).records.find((r) => r.record === record);
  const later = (ms: number) => void (now += ms);
  return { d, sql, who, stripe, people, lapses, doors, deliver, listed, usageOf, later, now: () => now };
}

/** The lines billing wrote while `run` ran. */
async function linesOf(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const [log, error] = [console.log, console.error];
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  console.error = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    await run();
  } finally {
    [console.log, console.error] = [log, error];
  }
  return lines;
}

test('A STRANGER’S WHOLE PAID LIFE, FREE TO DELETED, THROUGH THE REAL DOORS AND A STRIPE THAT REMEMBERS', async () => {
  const w = world();
  const delivered: string[] = [];
  let record = '';
  let sub = '';
  const lines = await linesOf(async () => {
    /* free: a record made there and then, on Free, with no Stripe call. */
    const made = value<{ record: string; slug: string; url: string }>(await w.doors.checkout!(w.who, { plan: 'free', slug: 'kiln-diary', name: 'Wren Hollis' }));
    record = made.record;
    assert.equal(made.url, 'https://alpha.example.test/kiln-diary/start');
    assert.deepEqual([(await w.listed(record))?.plan, (await w.listed(record))?.state], ['free', 'unbilled']);
    assert.equal(w.usageOf(record)?.slash.included, PLAN_TABLE.free.credits);
    assert.equal(w.stripe.asked.length, 0, 'Free asked Stripe something');

    /* upgrade: Cloud bought on Stripe's Checkout page with the test Visa. A declined card first changes nothing. */
    const page = value<{ url: string }>(await w.doors.checkout!(w.who, { record, plan: 'cloud' })).url;
    assert.match(page, /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test/u);
    assert.equal(w.stripe.pay(page, { card: TEST_CARDS.declined }), false);
    assert.deepEqual(await w.deliver(), []);
    assert.equal((await w.listed(record))?.state, 'unbilled');
    assert.equal(w.stripe.pay(page, { card: TEST_CARDS.visa }), true);
    delivered.push(...(await w.deliver()));
    const cloud = await w.listed(record);
    assert.deepEqual([cloud?.plan, cloud?.state, cloud?.price], ['cloud', 'active', '$12 a month']);
    sub = String([...w.stripe.subscriptions.values()][0]?.['id']);

    /* allowance: the Directory meters it under Cloud now. */
    assert.deepEqual(w.usageOf(record)?.month.allowance, PLAN_TABLE.hosted.allowance);
    assert.equal(w.usageOf(record)?.slash.included, PLAN_TABLE.hosted.credits);

    /* switch: Cloud Plus confirmed on the portal; the plan, its 400 credits and a 17.00 difference follow. */
    const portal = value<{ url: string }>(await w.doors.portal!(w.who, { record, plan: 'plus' })).url;
    assert.match(portal, /^https:\/\/billing\.stripe\.com\/p\/session\//u);
    w.stripe.confirm(portal);
    delivered.push(...(await w.deliver()));
    assert.deepEqual([(await w.listed(record))?.plan, (await w.listed(record))?.price], ['plus', '$29 a month']);
    assert.equal(w.usageOf(record)?.slash.included, 400);
    assert.deepEqual(w.usageOf(record)?.month.allowance, PLAN_TABLE.plus.allowance);
    assert.equal(dollars(w.stripe.invoices[0]?.['amount_paid']), '17.00');
    assert.equal(refusal(await w.doors.portal!(w.who, { record, plan: 'plus' })).code, 'ALREADY_KNOWN');

    /* invite: Teams are part of Cloud Plus, so it comes after the switch. A second person joins; nothing is asked of Stripe and the first invoice still shows one seat at 12.00. */
    const before = w.stripe.asked.length;
    w.people.set(record, 2);
    assert.equal(w.stripe.asked.length, before);
    const first = w.stripe.invoices.at(-1) as { lines: { data: { quantity: number; amount: number }[] }; amount_paid: number };
    assert.deepEqual(first.lines.data.map((l) => [l.quantity, dollars(l.amount)]), [[1, '12.00']]);
    assert.equal(dollars(first.amount_paid), '12.00');

    /* pack: 100 credits by card at 5.00; 500 by bank debit, credited only once the money settles; that one refunded. */
    const small = value<{ url: string }>(await w.doors.checkout!(w.who, { record, pack: 'credits-100' })).url;
    w.stripe.pay(small, { card: TEST_CARDS.visa });
    delivered.push(...(await w.deliver()));
    assert.equal((await w.listed(record))?.credits, 100);
    assert.equal(w.usageOf(record)?.slash.left, 500);
    const large = value<{ url: string }>(await w.doors.checkout!(w.who, { record, pack: 'credits-500' })).url;
    w.stripe.pay(large, { bank: TEST_BANK });
    delivered.push(...(await w.deliver()));
    assert.equal((await w.listed(record))?.credits, 100, 'a bank debit not yet settled added credits');
    const debit = [...w.stripe.sessions.values()].find((s) => s['url'] === large) as { id: string; payment_intent: string; amount_total: number };
    assert.equal(dollars(debit.amount_total), '20.00');
    w.stripe.settle(debit.id);
    delivered.push(...(await w.deliver()));
    assert.equal((await w.listed(record))?.credits, 600);
    w.stripe.refund(debit.payment_intent);
    delivered.push(...(await w.deliver()));
    assert.equal((await w.listed(record))?.credits, 100);
    assert.equal((await w.listed(record))?.plan, 'plus', 'a pack moved the plan');

    /* past-due: the card is changed to one that fails, the month's renewal fails, and the record stays writable. */
    w.later(31 * DAY);
    const front = value<{ url: string }>(await w.doors.portal!(w.who, { record })).url;
    w.stripe.changeCard(front, TEST_CARDS.failsLater);
    w.stripe.renew(sub);
    delivered.push(...(await w.deliver()));
    assert.equal((await w.listed(record))?.state, 'past_due');
    assert.deepEqual(w.lapses, [], 'a card Stripe still retries lapsed the record');
    w.stripe.changeCard(front, TEST_CARDS.visa);
    w.stripe.retry(sub);
    delivered.push(...(await w.deliver()));
    assert.equal((await w.listed(record))?.state, 'active');
    assert.equal(dollars(w.stripe.invoices.find((i) => i['billing_reason'] === 'subscription_cycle')?.['amount_paid']), '29.00');

    /* cancel: on the portal, at the period's end; until then it is paid for, and then read-only, two people being on it. */
    w.stripe.cancelAtEnd(value<{ url: string }>(await w.doors.portal!(w.who, { record })).url);
    delivered.push(...(await w.deliver()));
    assert.equal((await w.listed(record))?.state, 'active');
    w.later(30 * DAY);
    w.stripe.endPeriod(sub);
    delivered.push(...(await w.deliver()));
    const ended = await w.listed(record);
    assert.equal(ended?.state, 'lapsed');
    assert.deepEqual(w.lapses, [[record, true]]);
    assert.equal(ended?.delete_on, (ended?.lapsed_at ?? 0) + LAPSE_DELETES_DAYS * DAY);
    const owner = { principal: { kind: 'person', person: w.who.person, level: 'owner' }, provedAt: w.now() } as never;
    assert.equal(mayWrite('create', owner), false);
    assert.equal(mayWrite('export', owner), true);
    assert.equal(LAPSED_FIX, 'Read-only until billing resumes. Export is available.');
    assert.equal(refusal(await w.doors.checkout!(w.who, { record, pack: 'credits-100' })).code, 'FORBIDDEN');

    /* delete: the ladder's nights, its three notices on days 0, 60 and 83, and on day 90 the deletion and its letter. */
    const deleted: string[] = [];
    const letters: string[] = [];
    const lapsedAt = ended?.lapsed_at ?? 0;
    for (const night of [0, 60, 83, LAPSE_DELETES_DAYS])
      await ladder({
        due: async (at) => w.d.billing({ op: 'due', now: at }),
        owners: async () => [EMAIL],
        mail: async (kind) => (letters.push(kind), true),
        told: async (r, day) => w.d.billing({ op: 'told', record: r, day }).ok,
        lapsed: async (r) => w.d.billing({ op: 'lapsed', record: r }),
        destroy: async (r) => void (deleted.push(r), assert.ok(w.d.close(r).ok)),
        now: lapsedAt + night * DAY,
      });
    assert.deepEqual(letters, ['lapse.0', 'lapse.60', 'lapse.83', 'lapse.90']);
    assert.deepEqual(deleted, [record]);
    assert.equal(await w.listed(record), undefined);
  });

  /* EACH ACTED-ON EVENT TYPE SEEN, EACH APPLIED BY ONE LINE OF op: 'billing', AND NO LINE CARRIES A VALUE. */
  const applied = lines.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } }).filter((l) => l?.['op'] === 'billing' && l['door'] === 'webhook');
  for (const type of ACTED) assert.ok(delivered.includes(type), `${type} was never sent in the walk`);
  for (const type of ACTED) assert.ok(applied.some((l) => l?.['event'] === type && l['ok'] === true), `no billing line says ${type} was applied`);
  /* TYPE BY TYPE, not one total: a total can hide one event applied twice beside another not applied at all. An event the
     webhook acts on that this list has not heard of shows up here too, as an applied type nothing delivered. */
  const tally = (types: unknown[]) => Object.fromEntries([...new Set(types)].map((t) => [String(t), types.filter((x) => x === t).length]).sort());
  assert.deepEqual(tally(applied.filter((l) => l?.['ok'] === true).map((l) => l?.['event'])), tally(delivered.filter((t) => ACTED.includes(t))), 'an acted-on event was applied more or less than once');
  assert.ok(!applied.some((l) => l?.['ok'] === false), `a delivery failed: ${JSON.stringify(applied.find((l) => l?.['ok'] === false))}`);
  assert.doesNotMatch(lines.join('\n'), new RegExp(`${KEY}|${SECRET}|${EMAIL.replace('.', '\\.')}`, 'u'));
  w.sql.close();
});

/* ── what the rehearsal found, each fix with its case ──────────────────────── */

test('FIX (gift customer): a person whose first row is a gift pays as a real Stripe customer, for a new record and for an upgrade', async () => {
  const w = world();
  const gift = value<{ record: string }>(w.d.provision({ slug: 'kiln-gift', email: EMAIL })).record;
  assert.ok(w.d.billing({ op: 'set', row: { record: gift, person: w.who.person, customer: '', subscription: null, price: null, state: 'comp' } }).ok);
  const free = value<{ record: string }>(await w.doors.checkout!(w.who, { plan: 'free', slug: 'kiln-diary' })).record;

  /* A GIFT'S ROW HAS NO CUSTOMER: taken as the payer, every page answered "Stripe could not be reached". */
  for (const body of [{ slug: 'kiln-second', plan: 'cloud' }, { record: free, plan: 'cloud' }]) {
    const page = value<{ url: string }>(await w.doors.checkout!(w.who, body)).url;
    const session = [...w.stripe.sessions.values()].find((s) => s['url'] === page);
    assert.match(String(session?.['customer']), /^cus_/u, `${JSON.stringify(body)} paid as no customer`);
  }
  assert.equal(w.stripe.customers.size, 1, 'one person is one Stripe customer');
  w.sql.close();
});

test('FIX (ended twice): a lapsed record paid again is writable again, on the plan chosen, and its cancelled subscription is not ended again', async () => {
  const w = world();
  const record = value<{ record: string }>(await w.doors.checkout!(w.who, { plan: 'free', slug: 'kiln-diary' })).record;
  w.stripe.pay(value<{ url: string }>(await w.doors.checkout!(w.who, { record, plan: 'cloud' })).url, { card: TEST_CARDS.visa });
  await w.deliver();
  w.people.set(record, 2);
  const old = String([...w.stripe.subscriptions.values()][0]?.['id']);
  w.stripe.cancelAtEnd(value<{ url: string }>(await w.doors.portal!(w.who, { record })).url);
  w.stripe.endPeriod(old);
  await w.deliver();
  assert.equal((await w.listed(record))?.state, 'lapsed');

  w.later(5 * DAY);
  const again = value<{ url: string }>(await w.doors.checkout!(w.who, { record, plan: 'plus' })).url;
  w.stripe.pay(again, { card: TEST_CARDS.visa });
  let types: string[] = [];
  const lines = await linesOf(async () => void (types = await w.deliver()));
  assert.ok(types.includes('checkout.session.completed'));
  const failed = lines.find((l) => l.includes('"op":"billing"') && l.includes('"ok":false'));
  assert.equal(failed, undefined, 'paying again wrote a billing failure');
  const back = await w.listed(record);
  assert.deepEqual([back?.state, back?.plan, back?.lapsed_at], ['active', 'plus', undefined]);
  assert.deepEqual(w.lapses, [[record, true], [record, false]]);
  assert.equal(w.usageOf(record)?.slash.included, 400);
  assert.equal(w.stripe.customers.size, 1, 'paying again made a second customer');
  /* THE OLD ONE WAS ALREADY CANCELED, so it is read and not asked to end again. */
  assert.ok(!w.stripe.asked.some((a) => a.method === 'DELETE' && a.path === `/v1/subscriptions/${old}`), 'a cancelled subscription was asked to end again');
  w.sql.close();
});

test('FIX (deleted while paid): a record deleted on Cloud ends its subscription at once, and Stripe’s event after moves nothing', async () => {
  const w = world();
  const record = value<{ record: string }>(await w.doors.checkout!(w.who, { plan: 'free', slug: 'kiln-diary' })).record;
  w.stripe.pay(value<{ url: string }>(await w.doors.checkout!(w.who, { record, plan: 'cloud' })).url, { card: TEST_CARDS.visa });
  await w.deliver();
  const sub = [...w.stripe.subscriptions.values()][0] as { id: string; status: string };
  const deps = { billing: async (call: never) => w.d.billing(call), stripe: (key: string) => stripeOf(key, w.now, w.stripe.send) } as never;

  assert.equal(await endForDeleted(ENV, deps, record), 'ended');
  assert.equal(sub.status, 'canceled', 'the deleted record is still charged every month');
  assert.equal(w.d.billing({ op: 'of', record })?.subscription, null);
  assert.ok(w.d.close(record).ok);
  assert.deepEqual(await w.deliver(), ['customer.subscription.deleted']);
  assert.deepEqual(w.lapses, [], 'the event after the deletion lapsed a record that is gone');

  /* NOTHING TO END: asked again, and for a record with no row. */
  assert.equal(await endForDeleted(ENV, deps, record), 'none');
  assert.equal(await endForDeleted(ENV, deps, 'rec_nobody'), 'none');
  w.sql.close();
});

test('FIX (deleted while paid): with the key gone the deletion is not stopped, and the line names the record and nothing secret', async () => {
  const w = world();
  const record = value<{ record: string }>(await w.doors.checkout!(w.who, { plan: 'free', slug: 'kiln-diary' })).record;
  w.stripe.pay(value<{ url: string }>(await w.doors.checkout!(w.who, { record, plan: 'cloud' })).url, { card: TEST_CARDS.visa });
  await w.deliver();
  const deps = { billing: async (call: never) => w.d.billing(call), stripe: (key: string) => stripeOf(key, w.now, w.stripe.send) } as never;
  let said = '';
  const lines = await linesOf(async () => void (said = await endForDeleted({ ...ENV, STRIPE_SECRET_KEY: '' }, deps, record)));
  assert.equal(said, 'failed');
  assert.match(lines.join('\n'), new RegExp(`"did":"end","ok":false,"why":"key","rec":"${record}"`, 'u'));
  assert.doesNotMatch(lines.join('\n'), new RegExp(`${KEY}|${SECRET}`, 'u'));
  w.sql.close();
});
