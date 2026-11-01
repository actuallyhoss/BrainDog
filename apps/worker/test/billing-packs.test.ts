/**
 * Packs of Slash credits on the Worker's billing doors ("more is bought as credit packs rather than priced by
 * the ask"), and a gift's row that no Stripe event moves. Checkout with `{ record, pack }` opens a Stripe
 * Checkout in `payment` mode for any record its owner holds, Free included; the paid session adds the pack's credits
 * once; a refund takes back the rest; the list names the packs on sale and each record's credits.
 *
 * STRIPE IS FAKED THROUGH `stripeOf`'s `send`, so every form is the one the real client would encode. The Directory's
 * billing group is a fake over the ledger's shapes (`credit`, `refund`, `credits`, state `comp`), so these tests hold
 * whichever Directory build is beside them. Billing is test mode with a made-up key and signing secret: nothing here is
 * live, and nothing charges.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result, Who } from '@braindog/ports';
import { PACKS, priceOf } from '@braindog/record/plans';

import { billingDoors, type BillingEnv } from '../src/billing.ts';
import { stripeOf, type StripeFetch } from '../src/stripe.ts';

const START = Date.UTC(2026, 9, 14, 12);
const SECRET = 'whsec_made_up_for_this_test';
const KEY = 'sk_test_made_up';

const ENV: BillingEnv = {
  BILLING: 'test',
  STRIPE_SECRET_KEY: KEY,
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_HOSTED: 'price_cloud',
  STRIPE_PRICE_PACK_100: 'price_pack_small',
  STRIPE_PRICE_PACK_500: 'price_pack_large',
  PUBLIC_HOST: 'brain.dog',
  SIGNUP: 'open',
};

const WHO: Who = { person: 'per_ada', email: 'ada@example.com', record: null, provedAt: START };

type Row = { record: string; person: string; customer: string; subscription: string | null; price: string | null; state: string; period_end: number | null; lapsed_at: number | null; told: string; updated_at: number; slug: string | null };
type Sent = { method: string; path: string; form: URLSearchParams };

/** Ada owns a free record and one given her as a gift; `rows` starts with the gift's, which has no customer. */
function world(env: BillingEnv = ENV) {
  let now = START;
  const records = [
    { record: 'rec_ada', slug: 'ada', plan: 'free', closed: false },
    { record: 'rec_gift', slug: 'ada-gift', plan: 'plus', closed: false },
  ];
  const rows = new Map<string, Row>([
    ['rec_gift', { record: 'rec_gift', person: WHO.person, customer: '', subscription: null, price: null, state: 'comp', period_end: null, lapsed_at: null, told: '', updated_at: START, slug: 'ada-gift' }],
  ]);
  const ledger = new Map<string, { record: string; credits: number; left: number }>();
  const seen = new Set<string>();
  const lapses: [string, boolean][] = [];
  const plans: [string, string][] = [];

  /* THE DIRECTORY'S BILLING GROUP, over the shapes the ledger answers in. */
  const billing = async (call: Record<string, unknown> & { op: string }): Promise<unknown> => {
    switch (call.op) {
      case 'for':
        return [...rows.values()].filter((r) => r.person === call['person']);
      case 'of':
        return rows.get(call['record'] as string) ?? null;
      case 'byCustomer':
        return call['customer'] === '' ? [] : [...rows.values()].filter((r) => r.customer === call['customer']);
      case 'set': {
        const asked = call['row'] as Partial<Row> & { record: string };
        const row = { ...(rows.get(asked.record) as Row), ...asked, updated_at: now };
        rows.set(asked.record, row);
        return { ok: true, value: row };
      }
      case 'seen':
        if (seen.has(call['id'] as string)) return false;
        seen.add(call['id'] as string);
        return true;
      case 'credit': {
        const held = ledger.get(call['event'] as string);
        if (held) return { ok: true, value: { added: false, left: held.left } };
        const pack = PACKS.find((p) => p.id === call['pack']);
        if (!pack) return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'no such pack' } };
        ledger.set(call['event'] as string, { record: call['record'] as string, credits: pack.credits, left: pack.credits });
        return { ok: true, value: { added: true, left: pack.credits } };
      }
      case 'refund': {
        /* As the real ledger answers: a payment that bought nothing here is refused, not taken from. */
        const held = ledger.get(call['event'] as string);
        if (!held) return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'No pack of Slash credits was bought by that payment.' } };
        const taken = held.left;
        held.left = 0;
        return { ok: true, value: { taken } };
      }
      case 'credits':
        return { packs: [...ledger.values()].filter((e) => e.record === call['record']).reduce((n, e) => n + e.left, 0) };
      default:
        return null;
    }
  };

  /* STRIPE, behind the real client: each request is recorded with its form, and answered from `answers`. */
  const sent: Sent[] = [];
  const payments = new Map<string, object>();
  const answers = new Map<string, object>([
    ['GET /v1/prices/price_pack_small', { id: 'price_pack_small', unit_amount: 500, currency: 'usd', recurring: null, active: true }],
    ['GET /v1/prices/price_pack_large', { id: 'price_pack_large', unit_amount: 2_000, currency: 'usd', recurring: null, active: true }],
    ['GET /v1/customers', { data: [] }],
    ['POST /v1/customers', { id: 'cus_ada' }],
    ['POST /v1/checkout/sessions', { url: 'https://checkout.stripe.com/c/pay_pack' }],
  ]);
  const send: StripeFetch = async (url, init) => {
    const u = new URL(url);
    const form = new URLSearchParams(init.method === 'GET' ? u.search : (init.body ?? ''));
    sent.push({ method: init.method, path: u.pathname, form });
    const intent = form.get('payment_intent');
    const body =
      u.pathname === '/v1/checkout/sessions' && init.method === 'GET'
        ? { data: intent === null ? [] : [payments.get(intent)].filter(Boolean) }
        : answers.get(`${init.method} ${u.pathname}`);
    return new Response(JSON.stringify(body ?? { error: { type: 'api_error' } }), { status: body ? 200 : 500 });
  };

  const doors = billingDoors(env, {
    clock: () => now,
    billing: billing as never,
    usage: async () => ({ ok: true, value: { from: '', to: '', totals: {}, records } }) as never,
    claimed: async () => 'free',
    provisionable: () => ({ ok: true, value: 'UTC' }),
    provision: async () => assert.fail('a pack makes no record'),
    setPlan: async (record, plan) => (plans.push([record, plan]), null),
    setLapsed: async (record, on) => void lapses.push([record, on]),
    stripe: (key) => stripeOf(key, () => now, send),
  });
  const later = (ms: number) => void (now += ms);
  return { doors, rows, ledger, sent, answers, payments, lapses, plans, later, now: () => now };
}

type World = ReturnType<typeof world>;

const value = <T>(r: Result<unknown>): T => {
  assert.ok(r.ok, r.ok ? '' : `${(r as { refusal: Refusal }).refusal.code}: ${(r as { refusal: Refusal }).refusal.fix}`);
  return (r as { value: T }).value;
};
const refusal = (r: Result<unknown>): Refusal => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as { refusal: Refusal }).refusal;
};

/** A webhook request Stripe would send: the body, signed at the world's now under the made-up secret. */
async function signed(w: World, event: object): Promise<Request> {
  const body = JSON.stringify(event);
  const t = Math.floor(w.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)));
  const v1 = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://brain.dog/account/billing/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${v1}` }, body });
}

/** Deliver one event and answer its status, past both claim windows of any earlier delivery. */
async function deliver(w: World, id: string, type: string, object: object): Promise<number> {
  w.later(600_001);
  const res = await w.doors.webhook!(await signed(w, { id, type, livemode: false, data: { object } }));
  return res.status;
}

/** Ada's pack session as Stripe completes it: the hundred, for her free record, paid unless said. */
const session = (payment_status = 'paid') => ({
  id: 'cs_pack_1',
  object: 'checkout.session',
  mode: 'payment',
  payment_status,
  customer: 'cus_ada',
  payment_intent: 'pi_pack1',
  client_reference_id: WHO.person,
  metadata: { kind: 'pack', record: 'rec_ada', pack: 'credits-100', person: WHO.person },
});

/** What the list says of one record. */
const listed = async (w: World, record: string) =>
  value<{ records: { record: string; state: string; credits: number; gift?: boolean }[] }>(await w.doors.billing!(WHO)).records.find((r) => r.record === record);

/** The lines billing wrote while `run` ran, so a test can say none carries a key, a secret or an address. */
async function linesOf(run: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const [log, error] = [console.log, console.error];
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  console.error = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    await run();
  } finally {
    [console.log, console.error] = [log, error];
  }
  return lines.join('\n');
}

test('A PACK IS ONE PAYMENT FOR A FREE RECORD: payment mode, the metadata on the session and its payment, back to Settings', async () => {
  const w = world();
  const out = value<{ url: string }>(await w.doors.checkout!(WHO, { record: 'rec_ada', pack: 'credits-100' }));
  assert.equal(out.url, 'https://checkout.stripe.com/c/pay_pack');
  const made = w.sent.find((s) => s.method === 'POST' && s.path === '/v1/checkout/sessions');
  assert.ok(made, 'no session was made');
  const f = made.form;
  assert.equal(f.get('mode'), 'payment');
  assert.equal(f.get('customer'), 'cus_ada');
  assert.equal(f.get('client_reference_id'), WHO.person);
  assert.equal(f.get('line_items[0][price]'), 'price_pack_small');
  for (const [k, v] of Object.entries({ kind: 'pack', record: 'rec_ada', pack: 'credits-100', person: WHO.person })) {
    assert.equal(f.get(`metadata[${k}]`), v, `metadata[${k}]`);
    assert.equal(f.get(`payment_intent_data[metadata][${k}]`), v, `payment_intent_data[metadata][${k}]`);
  }
  assert.ok(![...f.keys()].some((k) => k.startsWith('subscription_data')), 'a pack asked for a subscription');
  assert.equal(f.get('success_url'), 'https://brain.dog/ada/settings/billing#credits={CHECKOUT_SESSION_ID}');
  assert.equal(f.get('cancel_url'), 'https://brain.dog/ada/settings/billing#cancelled');
  assert.equal(w.rows.get('rec_ada'), undefined, 'a pack wrote a billing row');
});

test('BILLING OFF SELLS NO PACK, AND A PACK WITH NO PRICE SET IS REFUSED IN A SENTENCE THAT NAMES NOTHING SECRET', async () => {
  const off = world({ PUBLIC_HOST: 'brain.dog', SIGNUP: 'open', STRIPE_PRICE_PACK_100: 'price_pack_small' });
  assert.equal(refusal(await off.doors.checkout!(WHO, { record: 'rec_ada', pack: 'credits-100' })).code, 'NOT_IN_THIS_BUILD');
  assert.deepEqual(off.sent, [], 'billing off asked Stripe something');

  const unpriced = world({ ...ENV, STRIPE_PRICE_PACK_500: '' });
  const r = refusal(await unpriced.doors.checkout!(WHO, { record: 'rec_ada', pack: 'credits-500' }));
  assert.deepEqual([r.code, r.at], ['NOT_IN_THIS_BUILD', 'pack']);
  assert.equal(r.fix, 'STRIPE_PRICE_PACK_500 is not set, so 500 Slash questions are not sold on this host.');
  assert.doesNotMatch(r.fix, /sk_|whsec_|price_pack|@|—/u);
  assert.deepEqual(unpriced.sent, []);

  assert.equal(refusal(await world().doors.checkout!(WHO, { record: 'rec_ada', pack: 'credits-9' })).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await world().doors.checkout!(WHO, { record: 'rec_somebody', pack: 'credits-100' })).code, 'OUT_OF_BOUNDS');
});

test('A STRIPE PRICE THAT IS NOT THE TABLE’S, PAID ONCE, OPENS NO PAGE', async () => {
  const w = world();
  w.answers.set('GET /v1/prices/price_pack_small', { id: 'price_pack_small', unit_amount: 500, currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, active: true });
  const r = refusal(await w.doors.checkout!(WHO, { record: 'rec_ada', pack: 'credits-100' }));
  assert.equal(r.code, 'NOT_IN_THIS_BUILD');
  assert.match(r.fix, /^100 Slash questions are \$5 here/u);
  assert.ok(!w.sent.some((s) => s.method === 'POST' && s.path === '/v1/checkout/sessions'));
});

test('THE PAID SESSION SENT TWICE, AND ITS OTHER EVENT, ADD 100 ONCE', async () => {
  const w = world();
  assert.equal(await deliver(w, 'evt_pack_1', 'checkout.session.completed', session()), 200);
  assert.equal((await listed(w, 'rec_ada'))?.credits, 100);
  assert.equal(await deliver(w, 'evt_pack_1', 'checkout.session.completed', session()), 200);
  assert.equal(await deliver(w, 'evt_pack_2', 'checkout.session.async_payment_succeeded', session()), 200);
  assert.equal((await listed(w, 'rec_ada'))?.credits, 100);
  assert.equal(w.rows.get('rec_ada'), undefined, 'a pack wrote a billing row');
  assert.deepEqual([w.lapses, w.plans], [[], []], 'a pack moved a lapse or a plan');
});

test('AN UNPAID SESSION ADDS NOTHING, AND ONE NAMING NO CUSTOMER OR ANOTHER PERSON ADDS NOTHING', async () => {
  const w = world();
  assert.equal(await deliver(w, 'evt_unpaid', 'checkout.session.completed', session('unpaid')), 200);
  assert.equal(await deliver(w, 'evt_nocus', 'checkout.session.completed', { ...session(), customer: null }), 200);
  assert.equal(await deliver(w, 'evt_foreign', 'checkout.session.completed', { ...session(), client_reference_id: 'per_other' }), 200);
  assert.equal((await listed(w, 'rec_ada'))?.credits, 0);
  assert.equal(w.ledger.size, 0);
});

test('A REFUND TAKES BACK WHAT IS LEFT OF THE PACK, ONCE, AND A PLAN’S REFUND TAKES NOTHING', async () => {
  const w = world();
  assert.equal(await deliver(w, 'evt_pack_1', 'checkout.session.completed', session()), 200);
  const entry = w.ledger.get('cs_pack_1');
  assert.ok(entry, 'the credit is keyed by the payment’s session');
  entry.left = 70; /* thirty spent */
  w.payments.set('pi_pack1', session());
  const charge = { id: 'ch_1', object: 'charge', customer: 'cus_ada', payment_intent: 'pi_pack1', refunded: true };
  assert.equal(await deliver(w, 'evt_refund_1', 'charge.refunded', charge), 200);
  assert.equal((await listed(w, 'rec_ada'))?.credits, 0);
  assert.equal(await deliver(w, 'evt_refund_2', 'charge.refunded', charge), 200);
  assert.equal(entry.left, 0, 'never below nothing');

  /* A plan's invoice has no session; a charge with no customer, or another customer's, changes nothing. */
  const v = world();
  assert.equal(await deliver(v, 'evt_pack_1', 'checkout.session.completed', session()), 200);
  v.payments.set('pi_pack1', session());
  assert.equal(await deliver(v, 'evt_r1', 'charge.refunded', { ...charge, payment_intent: 'pi_plan' }), 200);
  assert.equal(await deliver(v, 'evt_r2', 'charge.refunded', { ...charge, customer: null }), 200);
  assert.equal(await deliver(v, 'evt_r3', 'charge.refunded', { ...charge, customer: 'cus_other' }), 200);
  assert.equal((await listed(v, 'rec_ada'))?.credits, 100);
});

test('THE LIST NAMES THE PACKS ON SALE AT THE TABLE’S PRICE, AND EACH RECORD’S CREDITS', async () => {
  const w = world();
  assert.equal(await deliver(w, 'evt_pack_1', 'checkout.session.completed', session()), 200);
  const list = value<{ packs: { id: string; credits: number; price: string }[]; records: { record: string; credits: number }[] }>(await w.doors.billing!(WHO));
  assert.deepEqual(list.packs, PACKS.map((p) => ({ id: p.id, credits: p.credits, price: priceOf(p.cents) })));
  assert.deepEqual(list.packs.map((p) => p.price), ['$5', '$20']);
  assert.deepEqual(list.records.map((r) => [r.record, r.credits]), [['rec_ada', 100], ['rec_gift', 0]]);

  const off = world({ PUBLIC_HOST: 'brain.dog', SIGNUP: 'open' });
  assert.deepEqual(value<{ packs: unknown[] }>(await off.doors.billing!(WHO)).packs, []);
  const unpriced = world({ ...ENV, STRIPE_PRICE_PACK_100: '', STRIPE_PRICE_PACK_500: ' ' });
  assert.deepEqual(value<{ packs: unknown[] }>(await unpriced.doors.billing!(WHO)).packs, []);
  const one = world({ ...ENV, STRIPE_PRICE_PACK_500: '' });
  assert.deepEqual(value<{ packs: { id: string }[] }>(await one.doors.billing!(WHO)).packs.map((p) => p.id), ['credits-100']);
});

test('A GIFT READS gift, OFFERS NO PORTAL, BUYS A PACK, AND A STORM OF SUBSCRIPTION EVENTS DOES NOT LAPSE IT', async () => {
  const w = world();
  const gift = await listed(w, 'rec_gift');
  assert.deepEqual([gift?.state, gift?.gift], ['comp', true]);
  assert.equal((await listed(w, 'rec_ada'))?.gift, undefined);
  assert.equal(refusal(await w.doors.portal!(WHO, { record: 'rec_gift' })).code, 'FORBIDDEN');
  assert.equal(refusal(await w.doors.checkout!(WHO, { record: 'rec_gift', plan: 'cloud' })).code, 'ALREADY_KNOWN');
  value(await w.doors.checkout!(WHO, { record: 'rec_gift', pack: 'credits-500' }));

  /* The gift keeps an old customer and subscription here, the worst case: still nothing finds it. */
  w.rows.set('rec_gift', { ...(w.rows.get('rec_gift') as Row), customer: 'cus_gift', subscription: 'sub_storm' });
  const sub = (customer: string | null) => ({ id: 'sub_storm', object: 'subscription', customer, status: 'canceled', items: { data: [] } });
  let n = 0;
  for (const customer of ['', null, 'cus_gift'])
    for (const type of ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'])
      assert.equal(await deliver(w, `evt_storm_${++n}`, type, sub(customer)), 200);
  for (const customer of ['', 'cus_gift']) assert.equal(await deliver(w, `evt_storm_${++n}`, 'invoice.paid', { id: 'in_1', customer, subscription: 'sub_storm' }), 200);
  assert.equal(w.rows.get('rec_gift')?.state, 'comp');
  assert.deepEqual([w.lapses, w.plans], [[], []]);
});

test('NO LINE CARRIES THE KEY, THE SIGNING SECRET OR AN ADDRESS', async () => {
  const w = world();
  const lines = await linesOf(async () => {
    await w.doors.checkout!(WHO, { record: 'rec_ada', pack: 'credits-100' });
    w.answers.delete('POST /v1/checkout/sessions');
    await w.doors.checkout!(WHO, { record: 'rec_ada', pack: 'credits-500' });
    await deliver(w, 'evt_pack_1', 'checkout.session.completed', session());
    await deliver(w, 'evt_refund', 'charge.refunded', { id: 'ch_1', customer: 'cus_ada', payment_intent: 'pi_missing' });
  });
  assert.match(lines, /"op":"billing"/u);
  assert.doesNotMatch(lines, new RegExp(`${KEY}|${SECRET}|ada@example\\.com`, 'u'));
});

test('OVER THE REAL DIRECTORY: the paid session twice adds 100 once, a refund takes the rest, and a gift reads gift', async () => {
  const { createDirectory } = await import('@braindog/record/directory');
  const { openSqlite } = await import('../../../packages/kernel/test/sqlite.ts');
  const sql = openSqlite();
  let now = START;
  const d = createDirectory(sql, { now: () => now });
  const person = value<{ id: string }>(d.person$('ada@example.com', 'Ada')).id;
  const record = value<{ record: string }>(d.provision({ slug: 'ada', email: 'ada@example.com' })).record;
  const who: Who = { ...WHO, person };
  const intents = new Map<string, object>();
  const send: StripeFetch = async (url, init) => {
    const u = new URL(url);
    const intent = u.searchParams.get('payment_intent');
    const body = u.pathname === '/v1/checkout/sessions' && intent !== null ? { data: [intents.get(intent)].filter(Boolean) } : null;
    return new Response(JSON.stringify(body ?? { error: { type: 'api_error' } }), { status: body ? 200 : 500 });
  };
  const doors = billingDoors(ENV, {
    clock: () => now,
    billing: async (call) => d.billing(call),
    usage: async (p, range) => d.usage(p, range),
    claimed: async (slug) => d.claimed(slug),
    provisionable: () => ({ ok: true, value: 'UTC' }),
    provision: async () => assert.fail('a pack makes no record'),
    setPlan: async () => null,
    setLapsed: async () => undefined,
    stripe: (key) => stripeOf(key, () => now, send),
  });
  const paidFor = { ...session(), metadata: { kind: 'pack', record, pack: 'credits-100', person }, client_reference_id: person };
  const w = { now: () => now, later: (ms: number) => void (now += ms), doors } as unknown as World;
  assert.equal(await deliver(w, 'evt_real_1', 'checkout.session.completed', paidFor), 200);
  assert.equal(await deliver(w, 'evt_real_1', 'checkout.session.completed', paidFor), 200);
  assert.deepEqual(d.billing({ op: 'credits', record }), { packs: 100 });
  intents.set('pi_pack1', paidFor);
  assert.equal(await deliver(w, 'evt_real_refund', 'charge.refunded', { id: 'ch_1', customer: 'cus_ada', payment_intent: 'pi_pack1' }), 200);
  assert.deepEqual(d.billing({ op: 'credits', record }), { packs: 0 });

  const gift = d.billing({ op: 'set', row: { record, person, customer: '', subscription: null, price: null, state: 'comp' } });
  assert.ok(gift.ok, JSON.stringify(gift));
  const listed = value<{ records: { record: string; state: string; gift?: boolean }[] }>(await doors.billing!(who)).records.find((r) => r.record === record);
  assert.deepEqual([listed?.state, listed?.gift], ['comp', true]);
  assert.equal(refusal(await doors.portal!(who, { record })).code, 'FORBIDDEN');

  /* A RECORD CLOSED BEFORE ITS PACK WAS PAID gets nothing, and the operator's refund of it is a 200, not days of 500s. */
  const second = value<{ record: string }>(d.provision({ slug: 'ada-two', email: 'ada@example.com' })).record;
  const late = { ...paidFor, id: 'cs_pack_late', payment_intent: 'pi_late', metadata: { ...paidFor.metadata, record: second } };
  value(d.close(second));
  assert.equal(await deliver(w, 'evt_late_paid', 'checkout.session.completed', late), 200);
  assert.deepEqual(d.billing({ op: 'credits', record: second }), { packs: 0 });
  intents.set('pi_late', late);
  assert.equal(await deliver(w, 'evt_late_refund', 'charge.refunded', { id: 'ch_2', customer: 'cus_ada', payment_intent: 'pi_late' }), 200);
  sql.close();
});

test('AN ENDED SUBSCRIPTION\'S LAST INVOICE, PAID, BRINGS NO LAPSED RECORD BACK; ONE STRIPE SAYS IS ACTIVE DOES', async () => {
  const w = world();
  w.rows.set('rec_ada', { record: 'rec_ada', person: WHO.person, customer: 'cus_ada', subscription: 'sub_old', price: null, state: 'lapsed', period_end: null, lapsed_at: START, told: '', updated_at: START, slug: 'ada' });
  w.answers.set('GET /v1/subscriptions/sub_old', { id: 'sub_old', object: 'subscription', customer: { id: 'cus_ada' }, status: 'canceled', items: { data: [] } });
  assert.equal(await deliver(w, 'evt_late_1', 'invoice.paid', { id: 'in_old', customer: 'cus_ada', subscription: 'sub_old' }), 200);
  assert.equal(w.rows.get('rec_ada')?.state, 'lapsed', 'a paid invoice of a canceled subscription made the record active');
  assert.deepEqual(w.lapses, []);

  w.answers.set('GET /v1/subscriptions/sub_old', { id: 'sub_old', object: 'subscription', customer: { id: 'cus_ada' }, status: 'active', items: { data: [] } });
  assert.equal(await deliver(w, 'evt_late_2', 'invoice.paid', { id: 'in_new', customer: 'cus_ada', subscription: 'sub_old' }), 200);
  assert.deepEqual(w.lapses, [['rec_ada', false]]);
  assert.equal(w.rows.get('rec_ada')?.state, 'active');
});
