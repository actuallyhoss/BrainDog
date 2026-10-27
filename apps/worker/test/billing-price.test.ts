/**
 * Checkout charges what the page said (audit-38-39 finding 9). The list and the checkout read a plan's price from the one
 * table of plans, and Stripe charges the price a setting names, so checkout reads that price first: one amount in
 * dollars that is the table's opens the page, and any other answer is refused in one sentence before a session is made.
 *
 * Stripe is a stub that records what it was asked and answers what a test hands it. Billing is set to test with a fake
 * test key: nothing here is live, and nothing charges.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result, Who } from '@braindog/ports';
import { PLAN_TABLE } from '@braindog/record/plans';

import { billingDoors, planPrice, type BillingEnv } from '../src/billing.ts';
import type { Stripe, StripeAnswer } from '../src/stripe.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const ENV: BillingEnv = {
  BILLING: 'test',
  STRIPE_SECRET_KEY: 'sk_test_abc',
  STRIPE_PRICE_HOSTED: 'price_cloud',
  STRIPE_PRICE_PLUS: 'price_plus',
  PUBLIC_HOST: 'brain.dog',
  SIGNUP: 'open',
};

const WHO: Who = { person: 'per_ada', email: 'ada@example.com', record: null, provedAt: NOW };

/** Checkout for a new Cloud record, over a Stripe whose price for Cloud is `price`. */
function world(price: StripeAnswer) {
  const asked: string[] = [];
  const answers = new Map<string, StripeAnswer>([
    ['read /v1/prices/price_cloud', price],
    ['read /v1/customers', { ok: true, body: { data: [] } }],
    ['create /v1/customers', { ok: true, body: { id: 'cus_ada' } }],
    ['read /v1/checkout/sessions', { ok: true, body: { data: [] } }],
    ['create /v1/checkout/sessions', { ok: true, body: { url: 'https://checkout.stripe.com/c/pay_1' } }],
  ]);
  const answer = (key: string): StripeAnswer => (asked.push(key), answers.get(key) ?? { ok: false, status: 500, type: 'api_error', code: '' });
  const stripe: Stripe = { create: async (path) => answer(`create ${path}`), read: async (path) => answer(`read ${path}`), remove: async (path) => answer(`remove ${path}`) };
  const doors = billingDoors(ENV, {
    clock: () => NOW,
    billing: async () => [],
    usage: async () => ({ ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'not read here' } }) as never,
    claimed: async () => 'free',
    provisionable: () => ({ ok: true, value: 'UTC' }),
    provision: async () => assert.fail('nothing is made at checkout'),
    setPlan: async () => null,
    setLapsed: async () => undefined,
    stripe: () => stripe,
  } as unknown as Parameters<typeof billingDoors>[1]);
  const checkout = () => doors.checkout!(WHO, { slug: 'ada', plan: 'cloud' });
  return { asked, checkout };
}

const refusal = (r: Result<unknown>): Refusal => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as { refusal: Refusal }).refusal;
};

const CENTS = PLAN_TABLE.hosted.cents.month;

/** What Stripe says of a price sold every month: the fields the check now reads beside the amount. */
const MONTHLY = { recurring: { interval: 'month', interval_count: 1 }, active: true };

test('A STRIPE PRICE THAT IS THE TABLE’S OPENS THE PAYMENT PAGE', async () => {
  const w = world({ ok: true, body: { id: 'price_cloud', unit_amount: CENTS, currency: 'usd', ...MONTHLY } });
  const out = await w.checkout();
  assert.ok(out.ok, out.ok ? '' : refusal(out).fix);
  assert.deepEqual((out as { value: unknown }).value, { url: 'https://checkout.stripe.com/c/pay_1' });
  assert.ok(w.asked.includes('create /v1/checkout/sessions'));
});

test('A STRIPE PRICE AT ANOTHER AMOUNT IS REFUSED IN ONE SENTENCE, AND NO SESSION IS MADE', async () => {
  const w = world({ ok: true, body: { id: 'price_cloud', unit_amount: CENTS + 300, currency: 'usd', ...MONTHLY } });
  const r = refusal(await w.checkout());
  assert.equal(r.code, 'NOT_IN_THIS_BUILD');
  assert.equal(r.fix, `Cloud is ${planPrice('cloud')} here and Stripe charges $${(CENTS + 300) / 100} a month, so no payment page opens until the two agree.`);
  assert.ok(!w.asked.includes('create /v1/checkout/sessions'), w.asked.join('\n'));
});

test('A STRIPE PRICE IN ANOTHER CURRENCY IS REFUSED, EVEN AT THE SAME FIGURE', async () => {
  const w = world({ ok: true, body: { id: 'price_cloud', unit_amount: CENTS, currency: 'eur', ...MONTHLY } });
  const r = refusal(await w.checkout());
  assert.match(r.fix, /^Cloud is \$\d+ a month here and Stripe's price for it is in EUR, so no payment page opens until the two agree\.$/u);
  assert.ok(!w.asked.includes('create /v1/checkout/sessions'));
});

test('A TIERED PRICE WITH NO ONE AMOUNT IS REFUSED', async () => {
  const w = world({ ok: true, body: { id: 'price_cloud', unit_amount: null, currency: 'usd', ...MONTHLY } });
  assert.match(refusal(await w.checkout()).fix, /has no one amount/u);
  assert.ok(!w.asked.includes('create /v1/checkout/sessions'));
});

test('A PRICE STRIPE DOES NOT KNOW NAMES ITS SETTING, AND A STRIPE THAT IS DOWN SAYS SO', async () => {
  const gone = refusal(await world({ ok: false, status: 404, type: 'invalid_request_error', code: 'resource_missing' }).checkout());
  assert.match(gone.fix, /^STRIPE_PRICE_HOSTED names a price Stripe does not know/u);
  const down = refusal(await world({ ok: false, status: 0, type: '', code: '' }).checkout());
  assert.equal(down.code, 'RECORD_UNAVAILABLE');
});

test('NO SENTENCE CARRIES A PRICE ID OR AN EM DASH', async () => {
  for (const body of [{ unit_amount: 1, currency: 'usd' }, { unit_amount: CENTS, currency: 'gbp' }, { currency: 'usd' }, { unit_amount: CENTS, currency: 'usd', recurring: { interval: 'year', interval_count: 1 }, active: true }, { unit_amount: CENTS, currency: 'usd', ...MONTHLY, active: false }]) {
    const fix = refusal(await world({ ok: true, body: { id: 'price_cloud', ...body } }).checkout()).fix;
    assert.doesNotMatch(fix, /price_cloud|—/u, fix);
  }
});

test('A YEARLY PRICE AT THE MONTHLY AMOUNT IS REFUSED, NAMING WHAT STRIPE WOULD CHARGE', async () => {
  const w = world({ ok: true, body: { id: 'price_cloud', unit_amount: CENTS, currency: 'usd', recurring: { interval: 'year', interval_count: 1 }, active: true } });
  const r = refusal(await w.checkout());
  assert.equal(r.code, 'NOT_IN_THIS_BUILD');
  assert.equal(r.fix, `Cloud is ${planPrice('cloud')} here and Stripe charges $${CENTS / 100} every year, so no payment page opens until the two agree.`);
  assert.ok(!w.asked.includes('create /v1/checkout/sessions'), w.asked.join('\n'));
});

test('A PRICE EVERY THREE MONTHS, ONE THAT CHARGES ONCE, AND AN ARCHIVED ONE ARE REFUSED', async () => {
  const at = (extra: Record<string, unknown>) => world({ ok: true, body: { id: 'price_cloud', unit_amount: CENTS, currency: 'usd', ...MONTHLY, ...extra } });
  const quarterly = await at({ recurring: { interval: 'month', interval_count: 3 } });
  assert.match(refusal(await quarterly.checkout()).fix, /Stripe charges \$\d+ every 3 months, so/u);
  const once = await at({ recurring: null });
  assert.match(refusal(await once.checkout()).fix, /Stripe charges \$\d+ once, so/u);
  const archived = await at({ active: false });
  const fix = refusal(await archived.checkout()).fix;
  assert.equal(fix, `Cloud is ${planPrice('cloud')} here and Stripe's price for it, $${CENTS / 100} a month, is archived, so no payment page opens until it is on sale again.`);
  for (const w of [quarterly, once, archived]) assert.ok(!w.asked.includes('create /v1/checkout/sessions'));
});
