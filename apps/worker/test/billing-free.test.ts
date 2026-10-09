/**
 * Free on the Worker's billing doors (DIRECTION §35): checkout with `plan: 'free'` makes a record on the Directory's
 * `free` plan with no Stripe call and no billing row, one a person; the list names it; and a free record is upgraded by
 * paying for it, which the webhook turns into its first row and its paid plan. A paid plan cancelled goes back to Free
 * when the record fits it, and lapses when it does not.
 *
 * OVER A REAL DIRECTORY, in memory, so the plan, the row and the ledger are the Directory's own and not a fake's idea of
 * them. Stripe is a fake that records what it was asked and answers what a test hands it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory, type Directory } from '@braindog/record/directory';
import type { Refusal, Result, Who } from '@braindog/ports';

import { PLAN_TABLE } from '@braindog/record/plans';
import { FREE_PLAN, HOSTED_PLANS, billingDoors, planName, planPrice, type BillingEnv } from '../src/billing.ts';
import type { Form, Stripe, StripeAnswer } from '../src/stripe.ts';
import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const SECRET = 'whsec_test';

const ENV: BillingEnv = {
  BILLING: 'test',
  STRIPE_SECRET_KEY: 'sk_test_abc',
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_HOSTED: 'price_cloud',
  STRIPE_PRICE_PLUS: 'price_plus',
  PUBLIC_HOST: 'brain.dog',
  SIGNUP: 'open',
};

type Asked = { verb: 'create' | 'read' | 'remove'; path: string; form?: Form };

/** A door the doors always hand in, typed as always there: `AccountDoor` names each one optional. */
const door = <T>(f: T | undefined): T => {
  assert.ok(f, 'billingDoors left a door out');
  return f;
};

/** `people` is how many people each record has on it; leave it out for a host that cannot count them. */
function world(env: BillingEnv = ENV, people?: (record: string) => number | null) {
  const sql = openSqlite();
  const d: Directory = createDirectory(sql, { now: () => NOW });
  const ada = (d.person$('ada@example.com', 'Ada') as { ok: true; value: { id: string } }).value.id;
  const who: Who = { person: ada, email: 'ada@example.com', record: null, provedAt: NOW };
  const asked: Asked[] = [];
  const answers = new Map<string, StripeAnswer>([['read /v1/prices/price_cloud', { ok: true, body: { id: 'price_cloud', unit_amount: PLAN_TABLE.hosted.cents.month, currency: 'usd' } }], ['read /v1/prices/price_plus', { ok: true, body: { id: 'price_plus', unit_amount: PLAN_TABLE.plus.cents.month, currency: 'usd' } }]]);
  const stripe: Stripe = {
    create: async (path, form) => (asked.push({ verb: 'create', path, form }), answers.get(`create ${path}`) ?? { ok: false, status: 500, type: 'api_error', code: '' }),
    read: async (path) => (asked.push({ verb: 'read', path }), answers.get(`read ${path}`) ?? { ok: false, status: 500, type: 'api_error', code: '' }),
    remove: async (path) => (asked.push({ verb: 'remove', path }), { ok: true, body: {} }),
  };
  const refusalOf = (r: Result<unknown>): Refusal | null => (r.ok ? null : (r as { refusal: Refusal }).refusal);
  const lapses: [string, boolean][] = [];
  const all = billingDoors(env, {
    clock: () => NOW,
    billing: async (call) => d.billing(call),
    usage: async (person, range) => d.usage(person, range),
    claimed: async (slug) => d.claimed(slug),
    provisionable: (args) => ({ ok: true, value: typeof args.tz === 'string' ? args.tz : 'UTC' }),
    provision: async (args) => d.provision({ slug: args.slug, email: args.email }) as Result<{ record: string; slug: string; person: string }>,
    setPlan: async (record, plan) => refusalOf(d.setPlan(record, plan)),
    setLapsed: async (record, on) => void lapses.push([record, on]),
    ...(people ? { people: async (record: string) => people(record) } : {}),
    stripe: () => stripe,
  });
  const doors = { billing: door(all.billing), checkout: door(all.checkout), portal: door(all.portal), webhook: door(all.webhook) };
  const planOf = (record: string) => sql.one<{ plan: string }>('SELECT plan FROM dir_record WHERE id = ?', record)?.plan;
  return { d, sql, who, doors, asked, answers, planOf, lapses };
}

const value = <T>(r: Result<unknown>): T => {
  assert.ok(r.ok, r.ok ? '' : `${(r as { refusal: Refusal }).refusal.code}: ${(r as { refusal: Refusal }).refusal.fix}`);
  return (r as { value: T }).value;
};
const refusal = (r: Result<unknown>): Refusal => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as { refusal: Refusal }).refusal;
};

test('FREE IS MADE, NOT SOLD: a record on the free plan, no Stripe call, no row, and its /start to land on', async () => {
  const w = world();
  const made = value<{ url: string; record: string; slug: string }>(await w.doors.checkout(w.who, { slug: 'ada', plan: 'free', tz: 'Europe/London' }));
  assert.equal(made.url, 'https://brain.dog/app/ada/start');
  assert.equal(made.slug, 'ada');
  assert.equal(w.planOf(made.record), FREE_PLAN.directory);
  assert.deepEqual(w.asked, [], 'making a free record asked Stripe something');
  assert.equal(w.d.billing({ op: 'of', record: made.record }), null, 'a free record has a billing row');
  w.sql.close();
});

test('ONE FREE RECORD A PERSON, and a taken name or a free plan for a made record is refused', async () => {
  const w = world();
  value(await w.doors.checkout(w.who, { slug: 'ada', plan: 'free' }));
  const second = refusal(await w.doors.checkout(w.who, { slug: 'ada-two', plan: 'free' }));
  assert.deepEqual([second.code, second.at], ['ALREADY_KNOWN', 'plan']);
  assert.match(second.fix, /ada is your free record/);
  assert.equal(refusal(await w.doors.checkout(w.who, { slug: 'ada', plan: 'free' })).at, 'slug');
  assert.equal(refusal(await w.doors.checkout(w.who, { record: 'rec_x', plan: 'free' })).code, 'VALUE_MALFORMED');
  w.sql.close();
});

test('FREE NEEDS NO BILLING SETTING: a host with billing off still makes one', async () => {
  const w = world({ PUBLIC_HOST: 'brain.dog', SIGNUP: 'open' });
  const made = value<{ record: string }>(await w.doors.checkout(w.who, { slug: 'ada', plan: 'free' }));
  assert.equal(w.planOf(made.record), 'free');
  w.sql.close();
});

test('canMake SAYS WHETHER A RECORD CAN BE MADE NOW: sign-up not closed and no free record held', async () => {
  const w = world();
  assert.equal(value<{ canMake: boolean }>(await w.doors.billing(w.who)).canMake, true, 'open, and no record yet');
  value(await w.doors.checkout(w.who, { slug: 'ada', plan: 'free' }));
  assert.equal(value<{ canMake: boolean }>(await w.doors.billing(w.who)).canMake, false, 'a free record is held');
  w.sql.close();
  const invite = world({ ...ENV, SIGNUP: 'invite' });
  assert.equal(value<{ canMake: boolean }>(await invite.doors.billing(invite.who)).canMake, true, 'by invitation, the code was spent making the person');
  invite.sql.close();
});

test('SIGN-UP CLOSED IS NO NEW RECORD FOR ANYBODY: canMake is false and a free checkout is refused', async () => {
  for (const env of [{ ...ENV, SIGNUP: '' }, { ...ENV, SIGNUP: undefined }]) {
    const w = world(env);
    assert.equal(value<{ canMake: boolean }>(await w.doors.billing(w.who)).canMake, false);
    const out = refusal(await w.doors.checkout(w.who, { slug: 'ada', plan: 'free' }));
    assert.deepEqual([out.code, out.at, out.fix], ['NOT_IN_THIS_BUILD', 'signup', 'Sign-up is not open on this BrainDog yet.']);
    assert.equal(w.sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_record')?.n, 0);
    w.sql.close();
  }
});

test('NO DOOR THAT CHARGES NAMES FREE: the list sells only the paid plans, and names a free record Free', async () => {
  assert.ok(!('free' in HOSTED_PLANS));
  const w = world();
  const made = value<{ record: string }>(await w.doors.checkout(w.who, { slug: 'ada', plan: 'free' }));
  const list = value<{ records: { record: string; state: string; plan: string; price: string }[]; plans: { id: string; name: string; price: string }[] }>(await w.doors.billing(w.who));
  assert.deepEqual(list.records.map((r) => [r.record, r.state, r.plan, r.price]), [[made.record, 'unbilled', 'free', '$0']]);
  /* THE NAMES AND PRICES ARE THE ONE TABLE'S (`PLAN_TABLE`), which `HOSTED_PLANS` no longer says again. */
  assert.deepEqual(list.plans.map((p) => [p.id, p.name, p.price]), [['cloud', 'Cloud', '$12 a month'], ['plus', 'Cloud Plus', '$29 a month']]);
  for (const id of ['free', 'cloud', 'plus'] as const) {
    const figures = PLAN_TABLE[id === 'free' ? FREE_PLAN.directory : HOSTED_PLANS[id].directory];
    assert.equal(planName(id), figures.name, id);
    assert.ok(planPrice(id).startsWith(figures.price.month), `${id} reads ${planPrice(id)} and the table says ${figures.price.month}`);
  }
  w.sql.close();
});

test('A FREE RECORD IS UPGRADED BY PAYING FOR IT: a checkout for the record, and the paid event writes its row and plan', async () => {
  const w = world();
  const made = value<{ record: string }>(await w.doors.checkout(w.who, { slug: 'ada', plan: 'free' }));
  w.answers.set('read /v1/customers', { ok: true, body: { data: [] } });
  w.answers.set('create /v1/customers', { ok: true, body: { id: 'cus_ada' } });
  w.answers.set('read /v1/checkout/sessions', { ok: true, body: { data: [] } });
  w.answers.set('create /v1/checkout/sessions', { ok: true, body: { url: 'https://checkout.stripe.com/c/pay_1' } });

  const page = value<{ url: string }>(await w.doors.checkout(w.who, { record: made.record, plan: 'cloud' }));
  assert.equal(page.url, 'https://checkout.stripe.com/c/pay_1');
  const sent = w.asked.find((a) => a.path === '/v1/checkout/sessions' && a.verb === 'create')?.form ?? {};
  assert.equal(sent['metadata[record]'], made.record);
  assert.equal(sent['line_items[0][price]'], 'price_cloud');
  assert.equal(sent['success_url'], 'https://brain.dog/app/ada/settings/billing#paid={CHECKOUT_SESSION_ID}');

  /* Somebody else's free record is not Ada's to pay for. */
  assert.equal(refusal(await w.doors.checkout(w.who, { record: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', plan: 'cloud' })).code, 'OUT_OF_BOUNDS');

  w.answers.set('read /v1/subscriptions/sub_1', {
    ok: true,
    body: { id: 'sub_1', customer: { id: 'cus_ada', email: 'ada@example.com' }, status: 'active', current_period_end: NOW / 1000 + 2_592_000, items: { data: [{ id: 'si_1', price: { id: 'price_cloud' } }] } },
  });
  const event = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: { mode: 'subscription', payment_status: 'paid', customer: 'cus_ada', subscription: 'sub_1', client_reference_id: w.who.person, metadata: { person: w.who.person, record: made.record, plan: 'cloud' } } },
  };
  const res = await w.doors.webhook(await signed(JSON.stringify(event)));
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(w.planOf(made.record), HOSTED_PLANS.cloud.directory);
  const row = w.d.billing({ op: 'of', record: made.record });
  assert.deepEqual([row?.person, row?.customer, row?.subscription, row?.state], [w.who.person, 'cus_ada', 'sub_1', 'active']);

  /* The place is free again: a record upgraded is no longer Ada's free one. */
  value(await w.doors.checkout(w.who, { slug: 'ada-notes', plan: 'free' }));
  w.sql.close();
});

/** A free record of Ada's, upgraded to Cloud by a paid checkout on subscription `sub_1`. */
async function paidFor(w: ReturnType<typeof world>, slug = 'ada'): Promise<string> {
  const made = value<{ record: string }>(await w.doors.checkout(w.who, { slug, plan: 'free' }));
  w.answers.set('read /v1/subscriptions/sub_1', { ok: true, body: subscription('active') });
  const event = {
    id: `evt_paid_${slug}`,
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: { mode: 'subscription', payment_status: 'paid', customer: 'cus_ada', subscription: 'sub_1', client_reference_id: w.who.person, metadata: { person: w.who.person, record: made.record, plan: 'cloud' } } },
  };
  assert.equal((await w.doors.webhook(await signed(JSON.stringify(event)))).status, 200);
  assert.equal(w.planOf(made.record), HOSTED_PLANS.cloud.directory);
  return made.record;
}

/** Ada's Cloud subscription as Stripe answers a read of it. */
const subscription = (status: string) => ({
  id: 'sub_1',
  customer: { id: 'cus_ada', email: 'ada@example.com' },
  status,
  current_period_end: NOW / 1000 + 2_592_000,
  items: { data: [{ id: 'si_1', price: { id: 'price_cloud' } }] },
});

/** Stripe ending Ada's subscription, as it does when a cancelled plan reaches the end of its period. */
async function cancel(w: ReturnType<typeof world>, id = 'evt_cancel'): Promise<Response> {
  w.answers.set('read /v1/subscriptions/sub_1', { ok: true, body: subscription('canceled') });
  const event = { id, type: 'customer.subscription.deleted', livemode: false, data: { object: { ...subscription('canceled'), customer: 'cus_ada' } } };
  return w.doors.webhook(await signed(JSON.stringify(event)));
}

test('A PAID PLAN CANCELLED GOES BACK TO FREE when one person is on the record: writable, off the ladder, and listed as Free', async () => {
  const w = world(ENV, () => 1);
  const record = await paidFor(w);
  const res = await cancel(w);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(w.planOf(record), FREE_PLAN.directory);
  assert.deepEqual(w.lapses, [], 'a record back on Free was made read-only');
  const row = w.d.billing({ op: 'of', record });
  assert.deepEqual([row?.state, row?.subscription, row?.price, row?.lapsed_at, row?.customer], ['active', null, null, null, 'cus_ada']);
  assert.deepEqual(w.d.billing({ op: 'due', now: NOW + 100 * 86_400_000 }), [], 'a record back on Free is on the delete ladder');

  const list = value<{ records: { record: string; state: string; plan: string; price: string; delete_on?: number }[] }>(await w.doors.billing(w.who));
  assert.deepEqual(list.records.map((r) => [r.record, r.state, r.plan, r.price, r.delete_on]), [[record, 'unbilled', 'free', '$0', undefined]]);

  /* IT IS THE FREE RECORD NOW, so a second free one is refused, and it is upgraded by paying for it as the same customer. */
  assert.equal(refusal(await w.doors.checkout(w.who, { slug: 'ada-two', plan: 'free' })).at, 'plan');
  assert.equal(refusal(await w.doors.portal(w.who, { record, plan: 'plus' })).code, 'FORBIDDEN');
  w.answers.set('read /v1/checkout/sessions', { ok: true, body: { data: [] } });
  w.answers.set('create /v1/checkout/sessions', { ok: true, body: { url: 'https://checkout.stripe.com/c/pay_2' } });
  w.asked.length = 0;
  assert.equal(value<{ url: string }>(await w.doors.checkout(w.who, { record, plan: 'plus' })).url, 'https://checkout.stripe.com/c/pay_2');
  assert.ok(!w.asked.some((a) => a.path === '/v1/customers'), 'the upgrade made a second Stripe customer');
  assert.equal(w.asked.find((a) => a.verb === 'create' && a.path === '/v1/checkout/sessions')?.form?.['customer'], 'cus_ada');
  w.answers.set('read /v1/subscriptions/sub_2', { ok: true, body: { ...subscription('active'), id: 'sub_2', items: { data: [{ id: 'si_2', price: { id: 'price_plus' } }] } } });
  const again = {
    id: 'evt_paid_plus',
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: { mode: 'subscription', payment_status: 'paid', customer: 'cus_ada', subscription: 'sub_2', client_reference_id: w.who.person, metadata: { person: w.who.person, record, plan: 'plus' } } },
  };
  assert.equal((await w.doors.webhook(await signed(JSON.stringify(again)))).status, 200);
  assert.equal(w.planOf(record), HOSTED_PLANS.plus.directory);
  assert.deepEqual([w.d.billing({ op: 'of', record })?.subscription, w.d.billing({ op: 'of', record })?.state], ['sub_2', 'active']);

  /* THE OLD SUBSCRIPTION'S EVENT AGAIN FINDS NO ROW PAYING BY IT, and moves nothing. */
  assert.equal((await cancel(w, 'evt_cancel_again')).status, 200);
  assert.equal(w.planOf(record), HOSTED_PLANS.plus.directory);
  assert.deepEqual(w.lapses, []);
  w.sql.close();
});

test('A CANCELLED RECORD THAT DOES NOT FIT FREE LAPSES AS BEFORE: colleagues on it, a free record already, or nobody to count', async () => {
  for (const [why, people, second] of [
    ['colleagues', () => 2, false],
    ['a free record already', () => 1, true],
    ['nobody to count', undefined, false],
  ] as const) {
    const w = world(ENV, people);
    const record = await paidFor(w);
    if (second) value(await w.doors.checkout(w.who, { slug: 'ada-notes', plan: 'free' }));
    assert.equal((await cancel(w)).status, 200, why);
    assert.equal(w.planOf(record), HOSTED_PLANS.cloud.directory, why);
    assert.deepEqual(w.lapses, [[record, true]], why);
    const row = w.d.billing({ op: 'of', record });
    assert.deepEqual([row?.state, row?.subscription, row?.lapsed_at], ['lapsed', 'sub_1', NOW], why);
    w.sql.close();
  }
});

/** A webhook request Stripe would send: the body, signed now under the endpoint's secret. */
async function signed(body: string): Promise<Request> {
  const t = Math.floor(NOW / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  const v1 = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://brain.dog/account/billing/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${v1}` }, body });
}
