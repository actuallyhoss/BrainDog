/**
 * A Stripe that remembers, for the billing rehearsal (LCH-A13): it answers the forms `stripeOf` sends as Stripe's API
 * does, keeps the customers, Checkout Sessions, subscriptions, invoices, payments and portal sessions those forms make,
 * and plays the buyer's half on Stripe's own pages (`pay`, `confirm`, `cancelAtEnd`) and the time between (`renew`,
 * `endPeriod`). Each of those leaves the events Stripe would send in `take()`, and `signed` turns one into the request
 * Stripe's webhook delivery is, signed under the test's made-up secret, so the webhook's signature check runs for real.
 *
 * TEST ONLY, AND TEST MODE ONLY. It answers only the key it was made with, which must be a test key, and every event it
 * mints says `livemode: false`. Nothing here reaches the network.
 *
 * STRICT WHERE STRIPE IS STRICT, because a fake that takes anything finds nothing: an unknown price is a 404, a recurring
 * price in `payment` mode and a one-time price in `subscription` mode are refused, a portal flow must name the
 * subscription's own item, and an `Idempotency-Key` sent again with another body is refused as Stripe refuses it.
 */

import type { StripeFetch } from '../src/stripe.ts';

/** Stripe's test cards by their documented numbers (docs.stripe.com/testing). */
export const TEST_CARDS = {
  /** Visa: every charge succeeds. */
  visa: '4242424242424242',
  /** Attaches to the customer, and every charge on it after that fails: the card a renewal fails on. */
  failsLater: '4000000000000341',
  /** Declined at once: the Checkout page says so and nothing is made. */
  declined: '4000000000000002',
} as const;

/** Stripe's test US bank account for a bank debit, which completes a session unpaid and settles later. */
export const TEST_BANK = { routing: '110000000', account: '000123456789' } as const;

export type FakePrice = { id: string; unit_amount: number; currency: string; recurring: { interval: string; interval_count: number } | null; active: boolean };

/** What a buyer pays with on a hosted page. */
export type PaidWith = { card: string } | { bank: typeof TEST_BANK };

type Obj = Record<string, unknown>;
/** An event as Stripe lists it: `pending_webhooks` is 1 until `delivered` says the endpoint answered it 2xx. */
export type FakeEvent = { id: string; object: 'event'; type: string; livemode: false; created: number; pending_webhooks: number; data: { object: Obj } };

const MONTH_S = 30 * 86_400;
const enc = new TextEncoder();

/** The bracketed form fields under `prefix[...]`, as one flat object: `metadata[slug]` is `{ slug }`. */
function under(form: URLSearchParams, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form) if (k.startsWith(`${prefix}[`) && k.endsWith(']') && !k.slice(prefix.length + 1, -1).includes('[')) out[k.slice(prefix.length + 1, -1)] = v;
  return out;
}

export function fakeStripe({ key, secret, now, prices }: { key: string; secret: string; now: () => number; prices: FakePrice[] }) {
  if (!/^[sr]k_test_/u.test(key)) throw new Error('the fake answers a test key only');
  let n = 0;
  /* IDS AS STRIPE WRITES THEM: a test Checkout Session's says so (`cs_test_`), every other one is letters and digits. */
  const id = (prefix: string): string => `${prefix}_${prefix === 'cs' ? 'test_' : ''}Fk${String(++n).padStart(6, '0')}`;
  const sec = (): number => Math.floor(now() / 1000);

  const price = new Map(prices.map((p) => [p.id, p]));
  const customers = new Map<string, Obj>();
  const sessions = new Map<string, Obj>();
  const subscriptions = new Map<string, Obj>();
  const invoices: Obj[] = [];
  const intents = new Map<string, Obj>();
  const portals = new Map<string, Obj>();
  /** The card each customer's charges go on, set by the buyer at Checkout and changed on the portal. */
  const cards = new Map<string, string>();
  const idempotent = new Map<string, { body: string; status: number; answer: string }>();
  const pending: FakeEvent[] = [];
  /** Every event minted, newest first, as `GET /v1/events` lists them. */
  const events: FakeEvent[] = [];
  /** Stripe's test payment methods by the cards they stand for (docs.stripe.com/testing). */
  const METHODS: Record<string, string> = { pm_card_visa: TEST_CARDS.visa, pm_card_chargeCustomerFail: TEST_CARDS.failsLater };
  const attached = new Map<string, string>();
  const asked: { method: string; path: string; form: URLSearchParams }[] = [];

  const emit = (type: string, object: Obj): void => {
    const event: FakeEvent = { id: id('evt'), object: 'event', type, livemode: false, created: sec(), pending_webhooks: 1, data: { object: structuredClone(object) } };
    pending.push(event);
    events.unshift(event);
  };
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const wrong = (status: number, type: string, code: string, message: string): Response => json(status, { error: { type, code, message } });
  const list = (data: Obj[], limit: string | null): Obj => ({ object: 'list', data: data.slice(0, Math.max(1, Math.min(100, Number(limit ?? 10) || 10))), has_more: false });

  const item = (sub: Obj): Obj => ((sub['items'] as { data: Obj[] }).data[0] as Obj);
  const subPrice = (sub: Obj): FakePrice => price.get(String((item(sub)['price'] as Obj)['id'])) as FakePrice;

  /** An invoice for a subscription, paid or failed on the card its customer pays with. */
  const invoice = (sub: Obj, amount: number, reason: string): Obj => {
    const customer = String(sub['customer']);
    const card = cards.get(customer) ?? TEST_CARDS.visa;
    const paid = card === TEST_CARDS.visa;
    const quantity = Number(item(sub)['quantity']);
    const inv: Obj = {
      id: id('in'),
      object: 'invoice',
      customer,
      customer_email: (customers.get(customer)?.['email'] as string | undefined) ?? null,
      billing_reason: reason,
      status: paid ? 'paid' : 'open',
      amount_due: amount,
      amount_paid: paid ? amount : 0,
      currency: subPrice(sub).currency,
      parent: { type: 'subscription_details', subscription_details: { subscription: sub['id'] } },
      lines: { data: [{ price: subPrice(sub).id, quantity, amount }] },
      created: sec(),
    };
    invoices.unshift(inv);
    return inv;
  };

  const route = (method: string, path: string, form: URLSearchParams): Response => {
    const at = path.split('/').filter(Boolean);
    if (method === 'GET' && at[1] === 'prices' && at[2]) {
      const p = price.get(decodeURIComponent(at[2]));
      return p ? json(200, { object: 'price', ...p }) : wrong(404, 'invalid_request_error', 'resource_missing', 'No such price');
    }
    if (path === '/v1/customers' && method === 'GET')
      return json(200, list([...customers.values()].filter((c) => c['email'] === form.get('email')).reverse(), form.get('limit')));
    if (path === '/v1/customers' && method === 'POST') {
      const c: Obj = { id: id('cus'), object: 'customer', email: form.get('email'), metadata: under(form, 'metadata'), created: sec() };
      customers.set(c['id'] as string, c);
      return json(200, c);
    }
    if (path === '/v1/checkout/sessions' && method === 'GET') {
      const all = [...sessions.values()].reverse();
      const by = form.get('payment_intent') !== null ? all.filter((s) => s['payment_intent'] === form.get('payment_intent')) : all.filter((s) => s['customer'] === form.get('customer'));
      return json(200, list(by, form.get('limit')));
    }
    if (path === '/v1/checkout/sessions' && method === 'POST') return checkout(form);
    if (at[1] === 'subscriptions' && at[2] && (method === 'GET' || method === 'DELETE')) {
      const sub = subscriptions.get(at[2]);
      if (!sub) return wrong(404, 'invalid_request_error', 'resource_missing', 'No such subscription');
      if (method === 'DELETE') {
        if (sub['status'] === 'canceled') return wrong(400, 'invalid_request_error', 'resource_missing', 'already canceled');
        sub['status'] = 'canceled';
        emit('customer.subscription.deleted', sub);
        return json(200, sub);
      }
      const copy = structuredClone(sub);
      if (form.getAll('expand[]').includes('customer')) copy['customer'] = customers.get(String(sub['customer'])) ?? sub['customer'];
      return json(200, copy);
    }
    if (path === '/v1/billing_portal/sessions' && method === 'POST') return portal(form);
    if (path === '/v1/balance' && method === 'GET') return json(200, { object: 'balance', livemode: false });
    if (at[1] === 'checkout' && at[2] === 'sessions' && at[3] && method === 'GET') {
      const one = sessions.get(at[3]);
      return one ? json(200, one) : wrong(404, 'invalid_request_error', 'resource_missing', 'No such checkout session');
    }
    if (at[1] === 'payment_methods' && at[2] && at[3] === 'attach' && method === 'POST') {
      const card = METHODS[at[2]];
      if (!card || !customers.has(form.get('customer') ?? '')) return wrong(400, 'invalid_request_error', 'resource_missing', 'No such payment method or customer');
      const pm = id('pm');
      attached.set(pm, card);
      return json(200, { id: pm, object: 'payment_method', customer: form.get('customer'), card: { last4: card.slice(-4) } });
    }
    if (at[1] === 'subscriptions' && at[2] && method === 'POST') {
      const sub = subscriptions.get(at[2]);
      if (!sub || sub['status'] === 'canceled') return wrong(404, 'invalid_request_error', 'resource_missing', 'No such subscription');
      const pm = form.get('default_payment_method');
      if (pm !== null) {
        const card = attached.get(pm);
        if (!card) return wrong(400, 'invalid_request_error', 'resource_missing', 'No such payment method');
        cards.set(String(sub['customer']), card);
      }
      if (form.get('billing_cycle_anchor') === 'now') renew(String(sub['id']));
      return json(200, sub);
    }
    if (at[1] === 'invoices' && at[2] && at[3] === 'pay' && method === 'POST') {
      const inv = invoices.find((i) => i['id'] === at[2]);
      if (!inv || inv['status'] !== 'open') return wrong(400, 'invalid_request_error', 'invoice_not_open', 'This invoice is not open');
      const subId = String((inv['parent'] as { subscription_details: Obj }).subscription_details['subscription']);
      if (cards.get(String(inv['customer'])) !== TEST_CARDS.visa) return wrong(402, 'card_error', 'card_declined', 'Your card was declined.');
      retry(subId);
      return json(200, inv);
    }
    if (path === '/v1/events' && method === 'GET') {
      const since = Number(form.get('created[gte]') ?? 0);
      return json(200, list(events.filter((e) => e.created >= since), form.get('limit')));
    }
    if (path === '/v1/invoices' && method === 'GET')
      return json(200, list(invoices.filter((i) => (form.get('status') === null || i['status'] === form.get('status')) && (form.get('customer') === null || i['customer'] === form.get('customer')) && (form.get('subscription') === null || (i['parent'] as { subscription_details: Obj }).subscription_details['subscription'] === form.get('subscription'))), form.get('limit')));
    return wrong(404, 'invalid_request_error', 'unknown_route', 'Unrecognized request URL');
  };

  /** A Checkout Session, refused where Stripe refuses one. */
  const checkout = (form: URLSearchParams): Response => {
    const mode = form.get('mode');
    const customer = form.get('customer') ?? '';
    if (mode !== 'subscription' && mode !== 'payment') return wrong(400, 'invalid_request_error', 'parameter_invalid_empty', 'mode');
    if (!customers.has(customer)) return wrong(400, 'invalid_request_error', 'resource_missing', 'No such customer');
    const p = price.get(form.get('line_items[0][price]') ?? '');
    if (!p) return wrong(400, 'invalid_request_error', 'resource_missing', 'No such price');
    if (!p.active) return wrong(400, 'invalid_request_error', 'price_inactive', 'The price is not active');
    if (mode === 'subscription' && p.recurring === null) return wrong(400, 'invalid_request_error', 'checkout_subscription_one_time', 'You must provide at least one recurring price in subscription mode');
    if (mode === 'payment' && p.recurring !== null) return wrong(400, 'invalid_request_error', 'checkout_payment_recurring', 'You specified payment mode but passed a recurring price');
    const quantity = Number(form.get('line_items[0][quantity]'));
    if (!Number.isSafeInteger(quantity) || quantity < 1) return wrong(400, 'invalid_request_error', 'parameter_invalid_integer', 'quantity');
    for (const u of ['success_url', 'cancel_url']) if (!/^https:\/\//u.test(form.get(u) ?? '')) return wrong(400, 'invalid_request_error', 'url_invalid', u);
    const made = mode === 'payment' ? 'payment_intent_data' : 'subscription_data';
    const sid = id('cs');
    const s: Obj = {
      id: sid,
      object: 'checkout.session',
      mode,
      status: 'open',
      payment_status: 'unpaid',
      customer,
      client_reference_id: form.get('client_reference_id'),
      metadata: under(form, 'metadata'),
      created: sec(),
      url: `https://checkout.stripe.com/c/pay/${sid}`,
      success_url: form.get('success_url'),
      cancel_url: form.get('cancel_url'),
      subscription: null,
      payment_intent: null,
      amount_total: p.unit_amount * quantity,
      line: { price: p.id, quantity },
      made: Object.fromEntries([...form].filter(([k]) => k.startsWith(`${made}[metadata][`)).map(([k, v]) => [k.slice(`${made}[metadata][`.length, -1), v])),
    };
    sessions.set(sid, s);
    return json(200, s);
  };

  /** A portal session: its front page, or the one plan switch a flow names, which must be the subscription's own item. */
  const portal = (form: URLSearchParams): Response => {
    const customer = form.get('customer') ?? '';
    if (!customers.has(customer)) return wrong(400, 'invalid_request_error', 'resource_missing', 'No such customer');
    let flow: Obj | null = null;
    if (form.get('flow_data[type]') !== null) {
      if (form.get('flow_data[type]') !== 'subscription_update_confirm') return wrong(400, 'invalid_request_error', 'parameter_invalid', 'flow_data[type]');
      const sub = subscriptions.get(form.get('flow_data[subscription_update_confirm][subscription]') ?? '');
      if (!sub || sub['customer'] !== customer) return wrong(400, 'invalid_request_error', 'resource_missing', 'No such subscription');
      if (form.get('flow_data[subscription_update_confirm][items][0][id]') !== item(sub)['id']) return wrong(400, 'invalid_request_error', 'resource_missing', 'No such subscription item');
      const to = price.get(form.get('flow_data[subscription_update_confirm][items][0][price]') ?? '');
      if (!to || to.recurring === null) return wrong(400, 'invalid_request_error', 'resource_missing', 'No such price');
      flow = { subscription: sub['id'], price: to.id };
    }
    const pid = id('bps');
    const page: Obj = { id: pid, object: 'billing_portal.session', customer, url: `https://billing.stripe.com/p/session/${pid}`, return_url: form.get('return_url'), flow };
    portals.set(page['url'] as string, page);
    return json(200, page);
  };

  const send: StripeFetch = async (url, init) => {
    const u = new URL(url);
    if (u.origin !== 'https://api.stripe.com') throw new Error('the fake is Stripe only');
    const form = new URLSearchParams(init.method === 'GET' ? u.search : (init.body ?? ''));
    asked.push({ method: init.method, path: u.pathname, form });
    const headers = new Headers(init.headers);
    const auth = headers.get('authorization');
    if (auth !== `Bearer ${key}`) return wrong(401, 'invalid_request_error', 'api_key_invalid', 'Invalid API Key provided');
    const ik = headers.get('idempotency-key') ?? undefined;
    if (init.method === 'POST' && ik !== undefined) {
      const held = idempotent.get(ik);
      if (held && held.body !== init.body) return wrong(400, 'idempotency_error', 'idempotency_key_in_use', 'Keys for idempotent requests can only be used with the same parameters');
      if (held) return new Response(held.answer, { status: held.status });
      const res = route(init.method, u.pathname, form);
      const answer = await res.text();
      idempotent.set(ik, { body: init.body ?? '', status: res.status, answer });
      return new Response(answer, { status: res.status });
    }
    return route(init.method, u.pathname, form);
  };

  /* ── the buyer on Stripe's pages, and the time between ─────────────── */

  const sessionAt = (url: string): Obj => {
    const s = [...sessions.values()].find((x) => x['url'] === url);
    if (!s || s['status'] !== 'open') throw new Error('no open Checkout page at that address');
    return s;
  };

  /**
   * The buyer pays on the Checkout page. A declined card leaves the page open and answers `false`. A subscription is
   * made active with its first invoice paid; a one-time payment is paid by card, or completes unpaid by bank debit
   * until `settle`.
   */
  const pay = (url: string, how: PaidWith): boolean => {
    const s = sessionAt(url);
    if ('card' in how && how.card === TEST_CARDS.declined) return false;
    const customer = String(s['customer']);
    const line = s['line'] as { price: string; quantity: number };
    const p = price.get(line.price) as FakePrice;
    if ('card' in how) cards.set(customer, how.card);
    s['status'] = 'complete';
    if (s['mode'] === 'subscription') {
      const sub: Obj = {
        id: id('sub'),
        object: 'subscription',
        customer,
        status: 'active',
        cancel_at_period_end: false,
        metadata: s['made'],
        items: { object: 'list', data: [{ id: id('si'), object: 'subscription_item', price: { id: p.id }, quantity: line.quantity, current_period_end: sec() + MONTH_S }] },
      };
      subscriptions.set(sub['id'] as string, sub);
      emit('customer.subscription.created', sub);
      s['subscription'] = sub['id'];
      s['payment_status'] = 'paid';
      emit('invoice.paid', invoice(sub, p.unit_amount * line.quantity, 'subscription_create'));
    } else {
      const pi: Obj = { id: id('pi'), object: 'payment_intent', customer, amount: p.unit_amount * line.quantity, metadata: s['made'], charge: id('ch'), refunded: false };
      intents.set(pi['id'] as string, pi);
      s['payment_intent'] = pi['id'];
      s['payment_status'] = 'card' in how ? 'paid' : 'unpaid';
    }
    emit('checkout.session.completed', s);
    return true;
  };

  /** A bank debit's money arrives: the session is paid, and Stripe says so with its own event. */
  const settle = (sessionId: string): void => {
    const s = sessions.get(sessionId);
    if (!s || s['payment_status'] !== 'unpaid' || s['status'] !== 'complete') throw new Error('no unpaid session by that id');
    s['payment_status'] = 'paid';
    emit('checkout.session.async_payment_succeeded', s);
  };

  const portalAt = (url: string): Obj => {
    const page = portals.get(url);
    if (!page) throw new Error('no portal page at that address');
    return page;
  };

  /** The buyer confirms the plan switch the portal page opened on: the item moves to the new price, the difference is invoiced. */
  const confirm = (url: string): void => {
    const flow = portalAt(url)['flow'] as { subscription: string; price: string } | null;
    if (flow === null) throw new Error('that portal page opened on no switch to confirm');
    const sub = subscriptions.get(flow.subscription) as Obj;
    const was = subPrice(sub).unit_amount;
    (item(sub)['price'] as Obj)['id'] = flow.price;
    const diff = Math.max(0, subPrice(sub).unit_amount - was) * Number(item(sub)['quantity']);
    emit('customer.subscription.updated', sub);
    emit('invoice.paid', invoice(sub, diff, 'subscription_update'));
  };

  /** The buyer cancels on the portal's front page: the plan runs to the end of the period it is paid through. */
  const cancelAtEnd = (url: string): void => {
    const customer = portalAt(url)['customer'];
    const sub = [...subscriptions.values()].find((s) => s['customer'] === customer && s['status'] !== 'canceled');
    if (!sub) throw new Error('nothing to cancel');
    sub['cancel_at_period_end'] = true;
    emit('customer.subscription.updated', sub);
  };

  /** The buyer puts another card on the portal: the customer's next charge goes on it. */
  const changeCard = (url: string, card: string): void => void cards.set(String(portalAt(url)['customer']), card);

  /** A month passes: the subscription is invoiced again on its card; a failing card leaves it `past_due` and the invoice open. */
  const renew = (subId: string): void => {
    const sub = subscriptions.get(subId);
    if (!sub || sub['status'] === 'canceled') throw new Error('no live subscription by that id');
    const inv = invoice(sub, subPrice(sub).unit_amount * Number(item(sub)['quantity']), 'subscription_cycle');
    item(sub)['current_period_end'] = Number(item(sub)['current_period_end']) + MONTH_S;
    if (inv['status'] === 'paid') {
      sub['status'] = 'active';
      emit('invoice.paid', inv);
    } else {
      sub['status'] = 'past_due';
      emit('invoice.payment_failed', inv);
    }
    emit('customer.subscription.updated', sub);
  };

  /** Stripe retries the open invoice on the customer's card now; paid, the subscription is active again. */
  const retry = (subId: string): void => {
    const sub = subscriptions.get(subId) as Obj;
    const inv = invoices.find((i) => i['status'] === 'open' && (i['parent'] as { subscription_details: Obj }).subscription_details['subscription'] === subId);
    if (!inv) throw new Error('no open invoice to retry');
    if (cards.get(String(sub['customer'])) !== TEST_CARDS.visa) {
      emit('invoice.payment_failed', inv);
      return;
    }
    inv['status'] = 'paid';
    inv['amount_paid'] = inv['amount_due'];
    sub['status'] = 'active';
    emit('invoice.paid', inv);
    emit('customer.subscription.updated', sub);
  };

  /** The period a cancelled plan was paid through ends: the subscription is deleted. */
  const endPeriod = (subId: string): void => {
    const sub = subscriptions.get(subId);
    if (!sub || sub['cancel_at_period_end'] !== true) throw new Error('that subscription was not cancelled');
    sub['status'] = 'canceled';
    emit('customer.subscription.deleted', sub);
  };

  /** The operator refunds a payment from Stripe's dashboard. */
  const refund = (paymentIntent: string): void => {
    const pi = intents.get(paymentIntent);
    if (!pi) throw new Error('no payment by that id');
    pi['refunded'] = true;
    emit('charge.refunded', { id: pi['charge'], object: 'charge', customer: pi['customer'], payment_intent: pi['id'], amount: pi['amount'], amount_refunded: pi['amount'], refunded: true });
  };

  /** The events Stripe has to send since the last `take`, oldest first. */
  const take = (): FakeEvent[] => pending.splice(0, pending.length);

  /** The endpoint answered `event` 2xx: Stripe lists it as delivered. */
  const delivered = (event: FakeEvent): void => {
    const held = events.find((e) => e.id === event.id);
    if (held) held.pending_webhooks = 0;
  };

  /** One delivery of `event` to `endpoint`, signed at `atMs` under the endpoint's signing secret, as Stripe signs it. */
  const signed = async (event: FakeEvent, endpoint: string, atMs = now()): Promise<Request> => {
    const body = JSON.stringify(event);
    const t = Math.floor(atMs / 1000);
    const hmac = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, enc.encode(`${t}.${body}`)));
    const v1 = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
    return new Request(endpoint, { method: 'POST', headers: { 'stripe-signature': `t=${String(t)},v1=${v1}`, 'content-type': 'application/json' }, body });
  };

  return { send, pay, settle, confirm, cancelAtEnd, changeCard, renew, retry, endPeriod, refund, take, delivered, signed, asked, events, customers, sessions, subscriptions, invoices, intents, portals };
}

export type FakeStripe = ReturnType<typeof fakeStripe>;
