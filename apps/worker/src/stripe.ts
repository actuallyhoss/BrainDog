/**
 * Stripe's REST API, the few calls billing makes, over `fetch` and form encoding and nothing else.
 *
 * NO SDK (`12 §8`'s dependency rule): each call is one request and one JSON answer, and an SDK is a dependency the
 * lockfile does not hold, for a client that would make the same requests with more code in the bundle.
 *
 * THE KEY NEVER LEAVES THIS FILE'S HEADER. It is read once into `stripeOf` and written only into the `authorization`
 * header of a request to `api.stripe.com`; no line, refusal or answer carries it, and a failure is described by the
 * status and Stripe's own error `type` and `code`, never by its `message`, which may quote an address or an id the
 * caller typed.
 *
 * EVERY CREATE CARRIES AN `Idempotency-Key`: the hash of the path and the exact form sent, and the minute it was sent
 * in. A second press of the same button inside that minute is the same request to Stripe, which answers it with the
 * session the first press made rather than making another; a different request, or the same one a minute later, is a
 * new key and a new object.
 *
 * WHAT STRIPE ANSWERS IS READ FIELD BY FIELD AND CHECKED, because it is JSON from outside this Worker: each reader
 * below takes what it needs and answers `null` where Stripe sent something else, rather than trusting a shape.
 */

/** Where every call goes. */
const API = 'https://api.stripe.com';

/** How long one call may take before it is given up, in milliseconds. One call, one attempt: the caller decides whether to ask again. */
export const STRIPE_WAIT_MS = 15_000;

/**
 * The most characters of one answer this file parses. Stripe's answers to these calls are a few kilobytes; a longer
 * one is not Stripe's and is read as no object, so `JSON.parse` is never asked to build a tree from a broken proxy's or
 * a misrouted request's page. The text is still read whole before it is measured.
 */
const ANSWER_MAX = 1_048_576;

/** A form's fields, already flattened to Stripe's bracketed names (`metadata[slug]`, `line_items[0][price]`). Absent values are left out. */
export type Form = Record<string, string | number | boolean | undefined>;

/** A JSON object Stripe answered with. */
export type StripeObject = Record<string, unknown>;

/**
 * What one call came back with: the object, or why not. `status` is 0 when no answer arrived at all (a timeout, a
 * refused connection); `type` and `code` are Stripe's own words for the failure when it sent any, and empty otherwise.
 */
export type StripeAnswer = { ok: true; body: StripeObject } | StripeFault;

/** A call that did not come back with an object. */
export type StripeFault = { ok: false; status: number; type: string; code: string };

/** An answer that came back without the page address it was asked for: the call worked and gave nothing to send a person to. */
const NO_URL: StripeFault = { ok: false, status: 200, type: 'answer', code: 'no_url' };

/** The `fetch` this client sends through: the platform's, or a test's. */
export type StripeFetch = (url: string, init: { method: string; headers: [string, string][]; body?: string; signal?: AbortSignal }) => Promise<Response>;

/** The verbs billing needs. `create` is a POST with an idempotency key; `read` is a GET; `remove` is a DELETE. */
export type Stripe = {
  create(path: string, form: Form): Promise<StripeAnswer>;
  read(path: string, query?: Form): Promise<StripeAnswer>;
  remove(path: string): Promise<StripeAnswer>;
};

/** A form as `application/x-www-form-urlencoded`, in the order its keys were written. */
export const formOf = (form: Form): string =>
  Object.entries(form)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

const hex = (buffer: ArrayBuffer): string => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * A client over one secret key. `now` is the clock the idempotency minute is read from.
 *
 * `send` IS THE PLATFORM'S `fetch` UNLESS A TEST HANDS ONE IN, and redirects are never followed: Stripe does not send
 * one, and a redirect would be a request carrying the key somewhere this file did not name.
 */
export function stripeOf(key: string, now: () => number, send: StripeFetch = (url, init) => fetch(url, { ...init, redirect: 'manual' })): Stripe {
  const call = async (method: 'GET' | 'POST' | 'DELETE', path: string, body: string, idempotency: string | null): Promise<StripeAnswer> => {
    const headers: [string, string][] = [
      ['authorization', `Bearer ${key}`],
      ['accept', 'application/json'],
    ];
    if (method === 'POST') headers.push(['content-type', 'application/x-www-form-urlencoded']);
    if (idempotency !== null) headers.push(['idempotency-key', idempotency]);
    const url = method === 'GET' && body !== '' ? `${API}${path}?${body}` : `${API}${path}`;
    let res: Response;
    try {
      res = await send(url, { method, headers, ...(method === 'POST' ? { body } : {}), signal: AbortSignal.timeout(STRIPE_WAIT_MS) });
    } catch {
      return { ok: false, status: 0, type: 'network', code: '' };
    }
    let parsed: unknown = null;
    try {
      const text = await res.text();
      if (text.length <= ANSWER_MAX) parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const object = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as StripeObject) : null;
    if (res.ok && object !== null) return { ok: true, body: object };
    const error = object !== null ? objectAt(object, 'error') : null;
    return { ok: false, status: res.status, type: error ? textAt(error, 'type') : '', code: error ? textAt(error, 'code') : '' };
  };
  return {
    async create(path, form) {
      const body = formOf(form);
      const minute = Math.floor(now() / 60_000);
      const digest = hex(await crypto.subtle.digest('SHA-256', Uint8Array.from(new TextEncoder().encode(`${path}\n${body}`))));
      return call('POST', path, body, `braindog-${digest.slice(0, 40)}-${minute}`);
    },
    read(path, query = {}) {
      return call('GET', path, formOf(query), null);
    },
    remove(path) {
      return call('DELETE', path, '', null);
    },
  };
}

/* ── reading what Stripe answered ────────────────────────────────────────── */

/** A text field, or `''` when it is absent or not text. */
export const textAt = (o: StripeObject, key: string): string => {
  const v = o[key];
  return typeof v === 'string' ? v : '';
};

/** An object field, or `null` when it is absent or not an object. */
export const objectAt = (o: StripeObject, key: string): StripeObject | null => {
  const v = o[key];
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as StripeObject) : null;
};

/** An id field that Stripe writes either as the id or, when expanded, as the object carrying it. */
export const idAt = (o: StripeObject, key: string): string => {
  const v = o[key];
  if (typeof v === 'string') return v;
  return typeof v === 'object' && v !== null && typeof (v as StripeObject)['id'] === 'string' ? ((v as StripeObject)['id'] as string) : '';
};

/** A list's `data`, each entry an object; anything else in it is dropped. */
export const listOf = (o: StripeObject): StripeObject[] => {
  const data = o['data'];
  return Array.isArray(data) ? data.filter((d): d is StripeObject => typeof d === 'object' && d !== null && !Array.isArray(d)) : [];
};

/** Stripe's `metadata`, as the text values it always holds. */
export const metadataOf = (o: StripeObject): Record<string, string> => {
  const m = objectAt(o, 'metadata');
  const out: Record<string, string> = {};
  if (m) for (const [k, v] of Object.entries(m)) if (typeof v === 'string') out[k] = v;
  return out;
};

/** A whole number of seconds Stripe wrote as a time, as epoch milliseconds, or `null`. */
const msAt = (o: StripeObject, key: string): number | null => {
  const v = o[key];
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v * 1000 : null;
};

/* ── the calls ───────────────────────────────────────────────────────────── */

/**
 * A subscription as billing reads it: its state, the price it is on, the item that price sits in, when it is paid
 * through, and the payer's address.
 *
 * `plans` NAMES THE PRICES THAT ARE A PLAN, so the item read is the plan's and never another line the subscription may
 * carry. With none of them on it, the first item's price is read, and billing then keeps the record's plan as it was.
 *
 * `period_end` IS READ FROM THE SUBSCRIPTION AND, FAILING THAT, FROM THE ITEM, because Stripe moved
 * `current_period_end` from the one to the other in its API of March 2025 and this file does not pin a version: both
 * are read, and whichever the account's version writes is the one found.
 */
export type SubscriptionSeen = {
  id: string;
  customer: string;
  status: string;
  price: string | null;
  item: string | null;
  period_end: number | null;
  email: string | null;
};

/**
 * A subscription as Stripe fetched it, or `null` when it could not be. `expand[]=customer` brings the payer's address
 * in the same call, which the letter after a lapse is sent to.
 */
export async function subscriptionOf(stripe: Stripe, id: string, plans: readonly string[]): Promise<SubscriptionSeen | null> {
  if (!/^sub_[A-Za-z0-9]{1,250}$/u.test(id)) return null;
  const got = await stripe.read(`/v1/subscriptions/${id}`, { 'expand[]': 'customer' });
  return got.ok ? subscriptionSeen(got.body, plans) : null;
}

/**
 * A subscription object read as billing reads it: one Stripe answered, or the one an event carried. An event's copy
 * holds the customer as an id and never its address, so `email` is `null` there.
 */
export function subscriptionSeen(sub: StripeObject, plans: readonly string[]): SubscriptionSeen | null {
  const id = textAt(sub, 'id');
  if (id === '') return null;
  const items = listOf(objectAt(sub, 'items') ?? {});
  const priced = items.map((item) => ({ item, price: idAt(item, 'price') }));
  const chosen = priced.find((p) => p.price !== '' && plans.includes(p.price)) ?? priced[0];
  const customer = objectAt(sub, 'customer');
  const email = customer ? textAt(customer, 'email') : '';
  return {
    id,
    customer: idAt(sub, 'customer'),
    status: textAt(sub, 'status'),
    price: chosen && chosen.price !== '' ? chosen.price : null,
    item: chosen ? textAt(chosen.item, 'id') || null : null,
    period_end: msAt(sub, 'current_period_end') ?? (chosen ? msAt(chosen.item, 'current_period_end') : null),
    email: email === '' ? null : email,
  };
}

/**
 * A price on a subscription as one more item: `true` when it is there already or was put there now, `false` when Stripe
 * could not be asked or would not. Extra usage's metered price, which carries no quantity.
 */
export async function priceOnSubscription(stripe: Stripe, subscription: string, price: string): Promise<boolean> {
  if (!/^sub_[A-Za-z0-9]{1,250}$/u.test(subscription)) return false;
  const got = await stripe.read(`/v1/subscriptions/${subscription}`);
  if (!got.ok) return false;
  if (listOf(objectAt(got.body, 'items') ?? {}).some((item) => idAt(item, 'price') === price)) return true;
  return (await stripe.create('/v1/subscription_items', { subscription, price })).ok;
}

/** The most customers one address is looked through for this person's, a ceiling on one read. */
const CUSTOMERS_READ = 10;

/**
 * The customer this person pays as: the one Stripe already holds for their address with their id in its metadata, or
 * a new one. `null` when Stripe could not be asked.
 *
 * FOUND BY ADDRESS AND PROVED BY ID. Stripe's list filters by the exact address, and the id in `metadata[person]` is
 * what makes a customer this person's rather than anybody's who once typed the same address into another product on
 * the same account. At most `CUSTOMERS_READ` are looked at.
 */
export async function customerFor(stripe: Stripe, person: string, email: string): Promise<string | null> {
  const found = await stripe.read('/v1/customers', { email, limit: CUSTOMERS_READ });
  if (!found.ok) return null;
  const mine = listOf(found.body).find((c) => metadataOf(c)['person'] === person && textAt(c, 'id') !== '');
  if (mine) return textAt(mine, 'id');
  const made = await stripe.create('/v1/customers', { email, 'metadata[person]': person });
  return made.ok && textAt(made.body, 'id') !== '' ? textAt(made.body, 'id') : null;
}

/**
 * How many checkouts this customer started since `since` (epoch milliseconds), counting at most `most`, and when the
 * oldest of those began. `null` when Stripe could not be asked.
 *
 * STRIPE'S OWN LIST IS THE COUNTER, newest first, so the limit holds across every Worker and needs no store of its own.
 * Only the newest `most` are read, and the times are compared here: the list's own `created` filter is not relied on.
 */
export async function checkoutsSince(stripe: Stripe, customer: string, since: number, most: number): Promise<{ count: number; oldest: number | null } | null> {
  const got = await stripe.read('/v1/checkout/sessions', { customer, limit: most });
  if (!got.ok) return null;
  const times = listOf(got.body)
    .map((s) => msAt(s, 'created'))
    .filter((t): t is number => t !== null && t >= since);
  return { count: times.length, oldest: times.length === 0 ? null : Math.min(...times) };
}

/**
 * What a checkout is for and where it returns to. `metadata` goes on the session and on what it makes: the
 * subscription, or in `payment` mode (a pack of credits, paid once) the payment, so its charge says what it bought.
 * `mode` is `subscription` when it is left out.
 */
export type CheckoutAsk = {
  customer: string;
  person: string;
  price: string;
  metadata: Record<string, string>;
  success: string;
  cancel: string;
  mode?: 'subscription' | 'payment';
  /**
   * Stripe Tax on this checkout (`STRIPE_TAX` on the host): Stripe works out the tax from the address it asks for, adds
   * it to the price, and keeps the address and any tax id on the customer for the invoices after. Off, the price is the
   * whole charge, as it always was.
   */
  tax?: boolean;
};

/**
 * A subscription ended now, when a payment again has replaced it: `true` when Stripe ended it, and the failure
 * otherwise, which the caller writes as a line. One that had already ended is `true`, and is not asked to end again.
 *
 * WITHOUT THIS A RECORD COULD BE PAID FOR TWICE: a subscription Stripe gave up on can sit `unpaid` rather than
 * `canceled`, and a card later put on it would pay its old invoices beside the new subscription's.
 */
export async function endSubscription(stripe: Stripe, id: string): Promise<true | StripeFault> {
  if (!/^sub_[A-Za-z0-9]{1,250}$/u.test(id)) return { ok: false, status: 0, type: 'id', code: '' };
  /* ONE ALREADY ENDED IS NOTHING TO DO, which is every record that lapsed by a cancel and is paid for again: asked to
     end it, Stripe refuses, and each such payment wrote a failure line that was not one (`billing-rehearsal.test.ts`,
     "FIX (ended twice)"). A read that fails goes on to the end, which says for itself whether it worked. */
  const seen = await stripe.read(`/v1/subscriptions/${id}`);
  if (seen.ok && (textAt(seen.body, 'status') === 'canceled' || textAt(seen.body, 'status') === 'incomplete_expired')) return true;
  const out = await stripe.remove(`/v1/subscriptions/${id}`);
  return out.ok ? true : out;
}

/** A page Stripe made: its address, which is always `https`, or why there is none. */
export type StripePage = { url: string } | { failed: StripeFault };

const pageOf = (a: StripeAnswer): StripePage => {
  if (!a.ok) return { failed: a };
  const url = textAt(a.body, 'url');
  return url.startsWith('https://') ? { url } : { failed: NO_URL };
};

/** A Stripe Checkout Session for one plan's subscription, or for one pack paid once: its page's address, or the failure. */
export async function startCheckout(stripe: Stripe, ask: CheckoutAsk): Promise<StripePage> {
  const mode = ask.mode ?? 'subscription';
  const form: Form = {
    mode,
    customer: ask.customer,
    client_reference_id: ask.person,
    'line_items[0][price]': ask.price,
    'line_items[0][quantity]': 1,
    success_url: ask.success,
    cancel_url: ask.cancel,
  };
  if (ask.tax === true) {
    /* THE ADDRESS IS ASKED ON STRIPE'S PAGE AND KEPT ON THE CUSTOMER, because tax is worked out from it and a customer
       made by `customerFor` holds only an address to mail. */
    form['automatic_tax[enabled]'] = true;
    form['billing_address_collection'] = 'required';
    form['customer_update[address]'] = 'auto';
    form['customer_update[name]'] = 'auto';
    form['tax_id_collection[enabled]'] = true;
  }
  const made = mode === 'payment' ? 'payment_intent_data' : 'subscription_data';
  for (const [k, v] of Object.entries(ask.metadata)) {
    form[`metadata[${k}]`] = v;
    form[`${made}[metadata][${k}]`] = v;
  }
  return pageOf(await stripe.create('/v1/checkout/sessions', form));
}

/**
 * The Checkout Session that took a payment, as a refund finds what it gave back: its id, customer and metadata.
 * `null` for a payment no session took (a subscription's invoice), and the failure when Stripe could not be asked, so
 * the caller tells "not a pack" from "ask again".
 */
export async function sessionOfPayment(stripe: Stripe, payment: string): Promise<{ id: string; customer: string; metadata: Record<string, string> } | null | StripeFault> {
  if (!/^pi_[A-Za-z0-9]{1,250}$/u.test(payment)) return null;
  const got = await stripe.read('/v1/checkout/sessions', { payment_intent: payment, limit: 1 });
  if (!got.ok) return got;
  const session = listOf(got.body)[0];
  if (session === undefined || textAt(session, 'id') === '') return null;
  return { id: textAt(session, 'id'), customer: idAt(session, 'customer'), metadata: metadataOf(session) };
}

/**
 * A Customer Portal session: its page's address, or the failure.
 *
 * WITH `change`, THE PORTAL OPENS ON CONFIRMING ONE PLAN SWITCH (Stripe's `subscription_update_confirm` flow): the
 * subscription, its plan item and the price to move it to, and back to `back` once confirmed. The switch takes effect
 * when the person confirms it, with the proration the portal's configuration sets, and the webhook moves the record's
 * plan when Stripe says the subscription changed. IF STRIPE REFUSES THE FLOW (a portal configured without plan
 * changes, or an API that does not know the flow), the portal's front page is opened instead, where the same switch is
 * one more press; the person still lands where they can make it.
 */
export async function startPortal(
  stripe: Stripe,
  ask: { customer: string; back: string; change?: { subscription: string; item: string; price: string } },
): Promise<StripePage> {
  const front: Form = { customer: ask.customer, return_url: ask.back };
  if (ask.change) {
    const flowed = await stripe.create('/v1/billing_portal/sessions', {
      ...front,
      'flow_data[type]': 'subscription_update_confirm',
      'flow_data[subscription_update_confirm][subscription]': ask.change.subscription,
      'flow_data[subscription_update_confirm][items][0][id]': ask.change.item,
      'flow_data[subscription_update_confirm][items][0][price]': ask.change.price,
      'flow_data[after_completion][type]': 'redirect',
      'flow_data[after_completion][redirect][return_url]': ask.back,
    });
    if (flowed.ok || flowed.status !== 400) return pageOf(flowed);
  }
  return pageOf(await stripe.create('/v1/billing_portal/sessions', front));
}

/**
 * One invoice as the Billing page lists it: when, how much in which currency, whether it is paid, and Stripe's own
 * pages for it (the hosted invoice and its PDF), each `null` when Stripe sent none.
 */
export type InvoiceSeen = {
  id: string;
  number: string | null;
  at: number;
  cents: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  url: string | null;
  pdf: string | null;
};

/** The most invoices one read lists, a year of a monthly plan. */
export const INVOICES_MOST = 12;

/**
 * A customer's newest invoices, at most `INVOICES_MOST`, drafts left out: what they were billed and Stripe's page for
 * each. The failure when Stripe could not be asked.
 */
export async function invoicesOf(stripe: Stripe, customer: string): Promise<InvoiceSeen[] | StripeFault> {
  if (!/^cus_[A-Za-z0-9]{1,250}$/u.test(customer)) return [];
  const got = await stripe.read('/v1/invoices', { customer, limit: INVOICES_MOST });
  if (!got.ok) return got;
  const https = (v: string): string | null => (v.startsWith('https://') ? v : null);
  return listOf(got.body).flatMap((i): InvoiceSeen[] => {
    const status = textAt(i, 'status');
    const at = msAt(i, 'created');
    const cents = i['total'];
    if (status !== 'paid' && status !== 'open' && status !== 'void' && status !== 'uncollectible') return [];
    if (at === null || typeof cents !== 'number' || !Number.isSafeInteger(cents)) return [];
    return [
      {
        id: textAt(i, 'id'),
        number: textAt(i, 'number') || null,
        at,
        cents,
        currency: textAt(i, 'currency').toUpperCase(),
        status,
        url: https(textAt(i, 'hosted_invoice_url')),
        pdf: https(textAt(i, 'invoice_pdf')),
      },
    ];
  });
}
