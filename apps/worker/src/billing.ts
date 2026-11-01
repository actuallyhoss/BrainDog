/**
 * Billing's four doors on the Worker: what each record you own costs and whether it is paid, a payment page for a new
 * record or for paying again, Stripe's own page for changing the card or the plan, and Stripe's webhook, which is the
 * only thing that moves a record into or out of a lapse.
 *
 * WORKER ONLY, BY DESIGN. The self-host bills nobody and hands `serveAccount` none of
 * these doors, so each of their rows answers 404 there.
 *
 * TWO PLANS, CLOUD AND CLOUD PLUS (superseding the single $12 product): a record
 * is paid for on one of them, and its allowance follows the plan it pays for. A switch is confirmed on Stripe's own page
 * and takes effect when it is confirmed; the webhook moves the record's plan when Stripe says the subscription changed.
 *
 * AND FREE BESIDE THEM, WHICH NOTHING SELLS ("Free leads"). Checkout with `plan: 'free'` for a new name
 * makes the record there and then, with no Stripe call and no billing row, on the Directory's `free` allowance; one free
 * record a person. A free record is upgraded by paying for it on Cloud or Cloud Plus, which is checkout with its `record`.
 *
 * A PAID PLAN CANCELLED MOVES THE RECORD BACK TO FREE when it fits Free: one person on it, and no other free record of
 * theirs. It stays writable and leaves the delete ladder alone; its row keeps the Stripe customer and loses the
 * subscription, which is how the list, checkout and the portal tell it apart. A record with colleagues, or an owner who
 * already has a free record, goes read-only and onto the ladder as before. This is a DEFAULT TAKEN FOR THE OWNER
 * ("Free leads"): he has not ruled on it, and `fitsFree` below is the one place to change it.
 *
 * PACKS OF SLASH CREDITS ARE SOLD BESIDE THE PLANS ("more is bought as credit packs rather than priced by the
 * ask"): paid once, for any record its owner is signed in to, Free included. A pack makes no subscription and
 * writes no billing row; the webhook adds its credits to the Directory's ledger once, and a refund takes back the rest.
 *
 * EXTRA USAGE IS SOLD BESIDE THE TWO PLANS, OFF UNTIL THE OWNER SETS A MONTHLY CAP: past the allowance a record's actions
 * go on running, at the table's price, until the month comes to the cap, and then wait with the cap named (the
 * Directory's `mayRun`). The cap is set through `extra` below, which puts the host's metered price on the record's
 * subscription; the night reports what each month came to as meter events (`reportExtra`), and Stripe charges it on the
 * next invoice. Sold only while `STRIPE_PRICE_EXTRA` and `STRIPE_METER_EXTRA` are both set, beside billing being on.
 *
 * A GIFT (`comp`) IS A ROW NO STRIPE EVENT MOVES: it has no customer and no subscription, never lapses, is
 * never charged, offers no portal, and can buy packs.
 *
 * NOTHING IS WRITTEN FOR A RECORD NOBODY PAID FOR. A record with no billing row is
 * not billed and never lapses; a row is written only when a checkout completes, and only a verified Stripe event moves
 * it after that.
 *
 * EVERY SETTING IS OPTIONAL (Rule 2). With `BILLING` empty, billing is off: the list says `open: false` and every
 * other door answers `NOT_IN_THIS_BUILD` with the sentence that names the setting. With `BILLING` set and the key
 * missing, or the two disagreeing about test and live, every door refuses, the list too, naming both settings.
 */

import { personName, type AccountDoor, type Provisioned } from '@braindog/host/auth';
import { httpStatus } from '@braindog/host';
import { verifyStripe } from '@braindog/host/stripe-sign';
import { CURRENCY, EXTRA_CAP_MOST, PACKS, PLAN_TABLE, priceOf as centsAsPrice, type Pack } from '@braindog/record/plans';
import { badSlug, type ExtraDue, type AccountUsage, type BillingAnswers, type BillingCall, type BillingRow, type BillingSet, type BillingState } from '@braindog/record/directory';
import { no, ok, refused, type Refusal, type Result, type Who } from '@braindog/ports';

import { SIGNUP_CLOSED, signupMode } from './launch.ts';
import { sendMail, type MailEnv } from './mail.ts';
import { op } from './oplog.ts';
import {
  checkoutsSince,
  customerFor,
  endSubscription,
  idAt,
  invoicesOf,
  metadataOf,
  objectAt,
  priceOnSubscription,
  sessionOfPayment,
  startCheckout,
  startPortal,
  subscriptionOf,
  subscriptionSeen,
  textAt,
  type Stripe,
  type StripeObject,
  type SubscriptionSeen,
} from './stripe.ts';

/* ── the plans ───────────────────────────────────────────────────────────── */

/**
 * The plans this Worker sells, each with the Directory's plan it meters a record under and the setting that holds its
 * Stripe price. Nothing else: the name and the price a person reads are the one table's (`PLAN_TABLE` in
 * `packages/record/src/plans.ts`), read by `planName` and `planPrice` below. What a person is charged is the
 * Stripe price the setting names, so a change of price is made in Stripe and in that table, together.
 *
 * `directory` IS THE PLAN THE DIRECTORY METERS THE RECORD UNDER: Cloud is the Directory's `hosted`, the plan every
 * hosted record was already on.
 */
export const HOSTED_PLANS = {
  cloud: { id: 'cloud', directory: 'hosted', setting: 'STRIPE_PRICE_HOSTED' },
  plus: { id: 'plus', directory: 'plus', setting: 'STRIPE_PRICE_PLUS' },
} as const;

/**
 * The free plan: its id and the Directory's plan, and no Stripe price, because nothing is sold.
 *
 * NOT IN `HOSTED_PLANS`, so no door that charges can name it: `planAsked` answers only a plan with a price, and the
 * list's `plans` are what a checkout sells.
 */
export const FREE_PLAN = { id: 'free', directory: 'free' } as const;

export type HostedPlan = keyof typeof HOSTED_PLANS;

/** A plan as the list names it: one a record is paid for on, or Free. */
export type ListedPlan = HostedPlan | 'free';

/** The Directory's name for a plan billing puts a record on: one it is paid for on, or Free. */
export type MeteredPlan = (typeof HOSTED_PLANS)[HostedPlan]['directory'] | typeof FREE_PLAN.directory;

const PLAN_IDS: readonly HostedPlan[] = ['cloud', 'plus'];

/** The Directory's plan a listed plan is metered under. */
const meteredAs = (plan: ListedPlan): MeteredPlan => (plan === 'free' ? FREE_PLAN.directory : HOSTED_PLANS[plan].directory);

/** A plan's name as a person reads it ("Cloud Plus"), from the one table of plans. */
export const planName = (plan: ListedPlan): string => PLAN_TABLE[meteredAs(plan)].name;

/** What a plan costs as the list and the checkout say it: "$12 a month", and Free's "$0", from the one table of plans. */
export const planPrice = (plan: ListedPlan): string => {
  const { price, cents } = PLAN_TABLE[meteredAs(plan)];
  return cents.month === 0 ? price.month : `${price.month} a month`;
};

/**
 * What a plan holds that a person counts, from the one table of plans: Slash questions a month, AI tools connected at
 * once, people, runs a month, and whether a second person may join. `null` is no limit. The list sends it beside each record and each plan on sale, so the
 * Billing page draws its meters and its offer against the figures the site sells, never its own copy of them.
 */
export const limitsOf = (plan: ListedPlan): { questions: number | null; tools: number | null; people: number | null; runs: number | null; teams: boolean } => {
  const row = PLAN_TABLE[meteredAs(plan)];
  return { questions: row.credits, tools: row.agents, people: row.people, runs: row.allowance?.runs ?? null, teams: row.teams };
};

/**
 * How many days after its lapse began a record is deleted: the ladder's last step, which the nightly walk takes.
 * `delete_on` in the list is that day, so the screen and the walk read one number.
 */
export const LAPSE_DELETES_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * The most payment pages one person may open in `CHECKOUT_WINDOW_MS`. Each is a
 * Stripe object and a call on this Worker's Stripe budget, so a signed-in person pressing Pay in a loop is refused
 * after five and told when to try again.
 */
const CHECKOUTS_MOST = 5;
const CHECKOUT_WINDOW_MS = 3_600_000;

/**
 * The names a new record is made under when the one asked for was taken between the checkout and the payment: the name
 * itself, then `<name>-2` to `<name>-9`. A ceiling on the Directory calls one payment
 * makes.
 */
const NAME_TRIES = 9;

/**
 * The most bytes of one webhook body read. Stripe's events are a few kilobytes; the door is public, so a larger body is
 * refused before it is held.
 */
const WEBHOOK_BODY_MAX = 1_048_576;

/**
 * The window a delivery of a webhook event claims it for, twice over (`webhook`). Chosen longer than applying one event
 * takes, which is a few Directory calls, two Stripe reads and at most `NAME_TRIES` provisions. Stripe sends an event
 * that was not answered 2xx again, later and more than once, so a claim delays a delivery that failed and never
 * shuts it out; if Stripe has stopped trying, the `held` and failure lines name the event, and resending it from
 * Stripe's dashboard applies it.
 */
const CLAIM_MS = 300_000;

/** The settings billing reads. Each is optional (Rule 2). */
export type BillingEnv = MailEnv & {
  BILLING?: string | undefined;
  STRIPE_SECRET_KEY?: string | undefined;
  STRIPE_WEBHOOK_SECRET?: string | undefined;
  STRIPE_PRICE_HOSTED?: string | undefined;
  STRIPE_PRICE_PLUS?: string | undefined;
  /** The Stripe prices of the two packs of Slash credits (`PACK_SETTINGS`). Empty, that pack is not sold. */
  STRIPE_PRICE_PACK_100?: string | undefined;
  STRIPE_PRICE_PACK_500?: string | undefined;
  /**
   * Extra usage (`sellsExtra`): the metered Stripe price a subscription carries it on, one cent a unit, and the event name
   * of the Stripe meter that price reads, which the night reports cents to. Either empty, extra usage is not sold.
   */
  STRIPE_PRICE_EXTRA?: string | undefined;
  STRIPE_METER_EXTRA?: string | undefined;
  /**
   * Stripe Tax on every checkout (`taxOn`): `on` asks for the payer's address on Stripe's page and adds the tax Stripe
   * works out. Empty, the price is the whole charge. Stripe Tax itself (the origin address and where you are registered)
   * is set in Stripe's dashboard before this is turned on.
   */
  STRIPE_TAX?: string | undefined;
  PUBLIC_HOST?: string | undefined;
  /** Who may make an account (`launch.ts`): while it is `closed`, nobody makes a free record either. */
  SIGNUP?: string | undefined;
};

/** Whether checkouts on this host ask Stripe to add tax (`STRIPE_TAX` is `on`). */
export const taxOn = (env: BillingEnv): boolean => (env.STRIPE_TAX ?? '').trim() === 'on';

/** A plan's Stripe price, or `null` while its setting is empty: that plan is not sold on this host. */
export const priceOf = (env: BillingEnv, plan: HostedPlan): string | null => {
  const price = (env[HOSTED_PLANS[plan].setting] ?? '').trim();
  return price === '' ? null : price;
};

/**
 * Whether this host sells a plan at all: the Stripe key reads, the origin reads and Cloud has a price. What
 * `/account/billing` answers as `open`, and what decides whether a refusal on Free may name a plan to move to.
 */
export const sells = (env: BillingEnv): boolean => billingKey(env).ok && originOf(env).ok && priceOf(env, 'cloud') !== null;

/** Every price that is a plan on this host, so a subscription's plan item is told from any other line on it. */
const planPrices = (env: BillingEnv): string[] => PLAN_IDS.map((p) => priceOf(env, p)).filter((p): p is string => p !== null);

/** The plan a Stripe price is, or `null` for a price that is none of this host's plans. */
export const planOfPrice = (env: BillingEnv, price: string | null): HostedPlan | null =>
  price === null ? null : (PLAN_IDS.find((p) => priceOf(env, p) === price) ?? null);

/** The plan the Directory meters a record under, as the list names it. Taken as text, so a plan it adds later reads as Cloud. */
const planOfMeter = (plan: string): ListedPlan =>
  plan === FREE_PLAN.directory ? 'free' : plan === HOSTED_PLANS.plus.directory ? 'plus' : 'cloud';

/**
 * Whether the Stripe price a plan's setting names charges what the one table of plans says:
 * `null` when it does, or the refusal that opens no payment page.
 *
 * READ AT EVERY CHECKOUT AND NOT TRUSTED FROM THE SETTING, because the list and the checkout say `planPrice`, from
 * `PLAN_TABLE`, and Stripe charges whatever the price the setting names says. A price changed in Stripe and not in the
 * table, or the other way, would charge a person a figure no screen showed them. One amount in `CURRENCY` agrees; any
 * other answer, a tiered price with no one amount among them, is refused in one sentence before a session is made.
 */
async function priceRefused(stripe: Stripe, plan: HostedPlan, price: string): Promise<Result<never> | null> {
  const got = await stripe.read(`/v1/prices/${encodeURIComponent(price)}`);
  const name = planName(plan);
  if (!got.ok) {
    op({ op: 'billing', door: 'checkout', ok: false, why: 'price', status: got.status, code: got.code }, 'error');
    if (got.status === 404)
      return no('NOT_IN_THIS_BUILD', `${HOSTED_PLANS[plan].setting} names a price Stripe does not know, so ${name} is not sold on this host until it names one.`, { at: 'plan' });
    return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
  }
  const amount = got.body['unit_amount'];
  const currency = typeof got.body['currency'] === 'string' ? got.body['currency'].toUpperCase() : '';
  const cents = PLAN_TABLE[HOSTED_PLANS[plan].directory].cents.month;
  /* AND HOW OFTEN, AND WHETHER IT IS SOLD AT ALL: the same amount once a year, every three months or
     once is not the monthly figure every screen shows, and an archived price makes a session Stripe will not charge. */
  const recurring = got.body['recurring'];
  const every = typeof recurring === 'object' && recurring !== null ? (recurring as Record<string, unknown>) : null;
  const interval = typeof every?.['interval'] === 'string' ? every['interval'] : null;
  const count = every?.['interval_count'];
  const monthly = interval === 'month' && count === 1;
  const active = got.body['active'] === true;
  if (currency === CURRENCY && amount === cents && monthly && active) return null;
  op({ op: 'billing', door: 'checkout', ok: false, why: 'price_differs' }, 'error');
  const figure = typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 ? centsAsPrice(amount) : null;
  /* AN ARCHIVED PRICE IS ITS OWN SENTENCE: "until the two agree" is wrong of one whose figure may already agree. */
  if (currency === CURRENCY && figure !== null && !active)
    return no('NOT_IN_THIS_BUILD', `${name} is ${planPrice(plan)} here and Stripe's price for it, ${figure} ${howOften(interval, count)}, is archived, so no payment page opens until it is on sale again.`, { at: 'plan' });
  const charged =
    currency !== CURRENCY
      ? `Stripe's price for it is in ${currency === '' ? 'no currency' : currency}`
      : figure === null
        ? "Stripe's price for it has no one amount"
        : `Stripe charges ${figure} ${howOften(interval, count)}`;
  return no('NOT_IN_THIS_BUILD', `${name} is ${planPrice(plan)} here and ${charged}, so no payment page opens until the two agree.`, { at: 'plan' });
}

/** How often a Stripe price charges, in words: `a month`, `every 3 months`, `every year`, or `once` where it does not recur. */
function howOften(interval: string | null, count: unknown): string {
  if (interval === null) return 'once';
  const n = typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : 1;
  if (n === 1) return interval === 'month' ? 'a month' : `every ${interval.slice(0, 12)}`;
  return `every ${String(n)} ${interval.slice(0, 12)}s`;
}

/** The plan a body asked to pay for: `cloud` when it named none. Free is never paid for, so it is refused here by name. */
function planAsked(asked: unknown): Result<HostedPlan> {
  if (asked === undefined || asked === null) return ok('cloud');
  if (asked === 'cloud' || asked === 'plus') return ok(asked);
  if (asked === 'free') return no('VALUE_MALFORMED', 'Free is not paid for, so there is no payment page for it.', { at: 'plan', allowed: PLAN_IDS });
  return no('VALUE_MALFORMED', `plan is ${PLAN_IDS.join(' or ')}.`, { at: 'plan', allowed: PLAN_IDS });
}

/* ── the packs ───────────────────────────────────────────────────────────── */

/**
 * The packs of Slash credits this Worker sells, each with the setting that holds its Stripe price. The credits and the
 * price a person reads are the one table's (`PACKS` in `packages/record/src/plans.ts`), never typed here, and a pack
 * the table no longer holds is not sold.
 */
export const PACK_SETTINGS = { 'credits-100': 'STRIPE_PRICE_PACK_100', 'credits-500': 'STRIPE_PRICE_PACK_500' } as const;
export type PackId = keyof typeof PACK_SETTINGS;
const PACK_IDS = Object.keys(PACK_SETTINGS) as PackId[];

/** A pack's figures from the one table, or `null` for one it does not hold. */
const packOf = (id: PackId): Pack | null => PACKS.find((p) => p.id === id) ?? null;

/** A pack as a person reads it: "100 Slash questions", the one word for Slash's allowance (E17). */
export const packName = (pack: Pack): string => `${String(pack.credits)} Slash questions`;

/** A pack's Stripe price, or `null` while its setting is empty: that pack is not sold on this host. */
export const packPrice = (env: BillingEnv, pack: PackId): string | null => {
  const price = (env[PACK_SETTINGS[pack]] ?? '').trim();
  return price === '' || packOf(pack) === null ? null : price;
};

/**
 * Whether this host sells a pack at all: billing is on in a mode its key agrees with (`billingKey`: off sells nothing,
 * test is Stripe's test mode), the origin reads, and at least one pack has a price.
 */
export const sellsPacks = (env: BillingEnv): boolean => billingKey(env).ok && originOf(env).ok && PACK_IDS.some((p) => packPrice(env, p) !== null);

/** The packs on sale as the list names them: `{ id, credits, price }`, empty while none is sold. */
const packsOnSale = (env: BillingEnv): { id: PackId; credits: number; price: string }[] =>
  !sellsPacks(env)
    ? []
    : PACK_IDS.flatMap((id) => {
        const pack = packOf(id);
        return pack !== null && packPrice(env, id) !== null ? [{ id, credits: pack.credits, price: centsAsPrice(pack.cents) }] : [];
      });

/** The pack a body asked to buy, refused by name when it is none of them. */
function packAsked(asked: unknown): Result<PackId> {
  if (typeof asked === 'string' && (PACK_IDS as readonly string[]).includes(asked)) return ok(asked as PackId);
  return no('VALUE_MALFORMED', `pack is ${PACK_IDS.join(' or ')}.`, { at: 'pack', allowed: PACK_IDS });
}

/**
 * Whether the Stripe price a pack's setting names charges what the table says, once: `null` when it does, or the
 * refusal that opens no payment page. The plans' check (`priceRefused`) for a payment made one time: one amount in
 * `CURRENCY`, not recurring, on sale.
 */
async function packPriceRefused(stripe: Stripe, id: PackId, pack: Pack, price: string): Promise<Result<never> | null> {
  const got = await stripe.read(`/v1/prices/${encodeURIComponent(price)}`);
  const name = packName(pack);
  if (!got.ok) {
    op({ op: 'billing', door: 'checkout', ok: false, why: 'price', pack: id, status: got.status, code: got.code }, 'error');
    if (got.status === 404) return no('NOT_IN_THIS_BUILD', `${PACK_SETTINGS[id]} names a price Stripe does not know, so ${name} are not sold on this host until it names one.`, { at: 'pack' });
    return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
  }
  const currency = typeof got.body['currency'] === 'string' ? got.body['currency'].toUpperCase() : '';
  const once = got.body['recurring'] === null || got.body['recurring'] === undefined;
  if (currency === CURRENCY && got.body['unit_amount'] === pack.cents && once && got.body['active'] === true) return null;
  op({ op: 'billing', door: 'checkout', ok: false, why: 'price_differs', pack: id }, 'error');
  return no('NOT_IN_THIS_BUILD', `${name} are ${centsAsPrice(pack.cents)} here and Stripe's price for them is not that, paid once, so no payment page opens until the two agree.`, { at: 'pack' });
}

/* ── extra usage ─────────────────────────────────────────────────────────── */

/** The metered price and the meter extra usage is sold under, each `null` while its setting is empty. */
export const extraOf = (env: BillingEnv): { price: string | null; meter: string | null } => {
  const price = (env.STRIPE_PRICE_EXTRA ?? '').trim();
  const meter = (env.STRIPE_METER_EXTRA ?? '').trim();
  return { price: price === '' ? null : price, meter: meter === '' ? null : meter };
};

/** Whether this host sells extra usage: it sells the plans (`sells`), and the metered price and the meter are both set. */
export const sellsExtra = (env: BillingEnv): boolean => {
  const { price, meter } = extraOf(env);
  return sells(env) && price !== null && meter !== null;
};

/** The sentence a door says while this host does not sell extra usage. */
const EXTRA_UNSOLD = 'Extra usage is not sold on this host yet: STRIPE_PRICE_EXTRA and STRIPE_METER_EXTRA are not both set.';

/**
 * Whether the metered price extra usage is sold under charges what is reported: one cent of `CURRENCY` a unit, metered,
 * monthly, on sale. `null` when it does; otherwise the refusal, said before anything is put on a subscription, because
 * the night reports cents and a price of any other figure would charge a person a sum no screen showed them.
 */
async function extraPriceRefused(stripe: Stripe, price: string): Promise<Result<never> | null> {
  const got = await stripe.read(`/v1/prices/${encodeURIComponent(price)}`);
  if (!got.ok) {
    op({ op: 'billing', door: 'extra', ok: false, why: 'price', status: got.status, code: got.code }, 'error');
    if (got.status === 404) return no('NOT_IN_THIS_BUILD', 'STRIPE_PRICE_EXTRA names a price Stripe does not know, so extra usage is not sold on this host until it names one.', { at: 'cap_cents' });
    return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
  }
  const currency = typeof got.body['currency'] === 'string' ? got.body['currency'].toUpperCase() : '';
  const recurring = objectAt(got.body, 'recurring');
  const metered = recurring !== null && textAt(recurring, 'usage_type') === 'metered' && textAt(recurring, 'interval') === 'month';
  const cent = got.body['unit_amount'] === 1 || got.body['unit_amount_decimal'] === '1';
  if (currency === CURRENCY && metered && cent && got.body['active'] === true) return null;
  op({ op: 'billing', door: 'extra', ok: false, why: 'price_differs' }, 'error');
  return no('NOT_IN_THIS_BUILD', `Extra usage is reported in cents, and Stripe's price for it is not one cent a unit, metered monthly in ${CURRENCY}, so it is not turned on until the two agree.`, { at: 'cap_cents' });
}

/**
 * The metered price on a subscription: `true` when it is there already or was put there now, `false` when Stripe could
 * not be asked. Put on once and left there, so what was reported while it stood is still charged after a cap is taken
 * off; a month with no usage reported charges nothing for it.
 */
const meteredOn = (stripe: Stripe, subscription: string, price: string): Promise<boolean> => priceOnSubscription(stripe, subscription, price);

/** What one night's report of extra usage came to: months owed a report, reported, and failed. */
export type ExtraReport = { due: number; reported: number; failed: number };

/**
 * Each month's extra usage told to Stripe, as meter events of the cents not yet reported: the night's call, after the
 * runs are counted. Nothing while extra usage is not sold.
 *
 * ONCE PER FIGURE: the event's `identifier` is the record, the month and the total it brings the month to, so a night
 * that reported and then failed to remember it reports the same identifier again and Stripe takes it once. The month
 * before is reported with a time inside it, so its last day still lands on it.
 *
 * NEVER A STOP: a failure is a line at `error` and the month is reported again the next night.
 */
export async function reportExtra(env: BillingEnv, deps: Pick<BillingDeps, 'billing' | 'stripe' | 'clock'>): Promise<ExtraReport> {
  const out: ExtraReport = { due: 0, reported: 0, failed: 0 };
  const key = billingKey(env);
  const { meter } = extraOf(env);
  if (!sellsExtra(env) || !key.ok || meter === null) return out;
  const due = ((await deps.billing({ op: 'extraDue' })) as ExtraDue[] | null) ?? [];
  const stripe = deps.stripe(key.value);
  for (const d of due) {
    out.due++;
    const at = Math.floor(Math.min(deps.clock(), d.ends - 1_000) / 1_000);
    const sent = await stripe.create('/v1/billing/meter_events', {
      event_name: meter,
      'payload[stripe_customer_id]': d.customer,
      'payload[value]': d.cents - d.reported,
      identifier: `${d.record}-${d.month}-${d.cents}`,
      timestamp: at,
    });
    if (!sent.ok) {
      out.failed++;
      op({ op: 'billing', did: 'extra', ok: false, rec: d.record, month: d.month, status: sent.status, code: sent.code }, 'error');
      continue;
    }
    const kept = await deps.billing({ op: 'extraReported', record: d.record, month: d.month, cents: d.cents });
    if (!kept.ok) op({ op: 'billing', did: 'extra', ok: false, why: 'row', rec: d.record, month: d.month }, 'error');
    out.reported++;
  }
  if (out.due > 0) op({ op: 'billing', did: 'extra', ok: out.failed === 0, due: out.due, reported: out.reported, failed: out.failed });
  return out;
}

/** A gift's row (`comp`): the operator's, which no Stripe event moves. */
export const isGift = (row: Pick<BillingRow, 'state'>): boolean => row.state === 'comp';

/**
 * The secret key, when billing is on and its mode and its key agree; otherwise the sentence that says which setting
 * is wrong. THE KEY'S PREFIX IS ITS MODE (`sk_test_`, `rk_test_`, `sk_live_`, `rk_live_`), so a live key on a host set
 * to `test` refuses every door rather than charging a card somebody meant as a test. The key itself is never in a
 * sentence.
 */
export function billingKey(env: BillingEnv): Result<string> {
  const mode = (env.BILLING ?? '').trim();
  if (mode === '') return no('NOT_IN_THIS_BUILD', 'Billing is off on this host: BILLING is empty. Set it to test or live, with STRIPE_SECRET_KEY to match.');
  if (mode !== 'test' && mode !== 'live') return no('NOT_IN_THIS_BUILD', 'BILLING is test or live, and on this host it is neither, so billing is off.');
  const key = (env.STRIPE_SECRET_KEY ?? '').trim();
  if (key === '') return no('NOT_IN_THIS_BUILD', `BILLING is ${mode} and STRIPE_SECRET_KEY is not set, so billing is off on this host.`);
  const keyMode = /^[sr]k_test_/u.test(key) ? 'test' : /^[sr]k_live_/u.test(key) ? 'live' : null;
  if (keyMode !== mode)
    return no(
      'NOT_IN_THIS_BUILD',
      `BILLING is ${mode} and STRIPE_SECRET_KEY is ${keyMode === null ? 'not a Stripe secret key' : `a ${keyMode} key`}, so every billing door is refused until the two agree.`,
    );
  return ok(key);
}

/** The app's own origin, or the sentence that says it is not set: every page Stripe sends a person back to is on it. */
function originOf(env: BillingEnv): Result<string> {
  const host = (env.PUBLIC_HOST ?? '').trim();
  return host === '' ? no('NOT_IN_THIS_BUILD', 'PUBLIC_HOST is not set, so there is no page to send a person back to after paying.') : ok(`https://${host}`);
}

/**
 * Stripe's subscription states, as a record's billing state. FAILS CLOSED: only the states that mean the money is in, or
 * that Stripe is still trying, keep a record writable, and any other word Stripe sends, one it adds tomorrow included,
 * is a lapse with a line at `error` naming it, so a state nobody read never leaves a paid plan running for free.
 *
 * `active` and `trialing` are paid. `past_due` is still writable: Stripe retries the card and mails the customer, and
 * the record lapses only when it gives up. `incomplete` is a first payment waiting on the person (a card that asks for
 * a check), read as `past_due` so the Billing page asks them to finish it. `unpaid`, `canceled`, `incomplete_expired`
 * and `paused` (a trial that ended with no card) are lapsed.
 */
export function stateOf(status: string): BillingState {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due' || status === 'incomplete') return 'past_due';
  if (status !== 'unpaid' && status !== 'canceled' && status !== 'incomplete_expired' && status !== 'paused')
    op({ op: 'billing', did: 'state', ok: false, why: 'unknown_status', status: status.slice(0, 40) }, 'error');
  return 'lapsed';
}

/** Stripe's event types the webhook acts on. Every other type is answered 200 and ignored. */
const ACTS: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
]);

/** The one sentence a Stripe call that failed is told as. Which call and why go in the line, never to the person. */
const STRIPE_DOWN = 'Stripe could not be reached just now, so nothing was started. Try again in a minute.';

/* ── what the doors are built from ───────────────────────────────────────── */

/**
 * What `index.ts` hands the doors: the Directory's calls, the record's lapse switch, the checks and the provisioning
 * `/auth/provision` uses, and Stripe. Every one is a function, so a test builds the doors over fakes.
 */
export type BillingDeps = {
  clock: () => number;
  /** The Directory's billing group. */
  billing: <C extends BillingCall>(call: C) => Promise<BillingAnswers[C['op']]>;
  /** The records this person owns, from the Directory's usage ledger: which records the list covers, and where a paid checkout finds a record an earlier delivery made. */
  usage: (person: string, range: { from: string; to: string }) => Promise<Result<AccountUsage>>;
  /**
   * Whether a name is free, a live record's, or a released one's (the Directory's `claimed`). NOT `resolve`, which
   * answers `null` for a released name as it does for a free one, so checkout took a name nobody is given again and the
   * payment then made the record under another.
   */
  claimed: (slug: string) => Promise<'free' | 'taken' | 'released'>;
  /** The name and zone checks a provision makes, asked before anybody pays: the zone as the record will hold it, or why not. */
  provisionable: (args: { name?: string; tz?: unknown }) => Result<string>;
  /** The record, its keys and its Directory rows, as `/auth/provision` makes them. */
  provision: (args: { slug: string; email: string; name?: string; tz: string }) => Promise<Result<Provisioned>>;
  /** The plan the Directory meters the record under, so its allowance follows what it pays for. `null` is set. */
  setPlan: (record: string, plan: MeteredPlan) => Promise<Refusal | null>;
  /** The record's own lapse switch (`Record$.setLapsed`). */
  setLapsed: (record: string, on: boolean) => Promise<void>;
  /**
   * How many people are on the record, from its own member table (suspended ones left out), or `null` when it cannot
   * say (deleted, refused by this build). Whether a cancelled record fits Free. ABSENT, a cancelled plan lapses as it
   * always did, because a record nobody counted might hold colleagues Free would shut out.
   */
  people?: (record: string) => Promise<number | null>;
  /** A Stripe client over the secret key. */
  stripe: (key: string) => Stripe;
};

/** The doors `serveAccount` is handed for billing's four rows. */
export type BillingDoors = Required<Pick<AccountDoor, 'billing' | 'checkout' | 'portal' | 'invoices' | 'extra' | 'webhook'>>;

/**
 * A row whose record went back to Free when its plan was cancelled: it keeps its customer and has no subscription. Any
 * row a payment wrote names one, so this is never a paid record. A gift has none either and is not on Free.
 */
export const backOnFree = (row: Pick<BillingRow, 'subscription' | 'state'>): boolean => row.subscription === null && row.state !== 'lapsed' && !isGift(row);

export function billingDoors(env: BillingEnv, deps: BillingDeps): BillingDoors {
  const ownedRow = async (person: string, record: unknown): Promise<BillingRow | null> => {
    if (typeof record !== 'string' || record === '') return null;
    const rows = await deps.billing({ op: 'for', person });
    return rows.find((r) => r.record === record) ?? null;
  };

  /**
   * The Stripe customer this person already pays as, from their rows, or `undefined` for none yet.
   *
   * NEVER A GIFT'S, whose row has no customer (`''`): taken as the payer, the first row being a gift sent Stripe an empty
   * customer and every payment page answered "Stripe could not be reached" (`billing-rehearsal.test.ts`, "FIX (gift
   * customer)").
   */
  const payingAs = (rows: readonly BillingRow[]): string | undefined => rows.find((r) => r.customer !== '')?.customer;

  /** The open records this person owns, from the Directory's usage ledger, as of today. */
  const ownedOpen = async (person: string): Promise<Result<AccountUsage['records']>> => {
    const today = new Date(deps.clock()).toISOString().slice(0, 10);
    const owned = await deps.usage(person, { from: today, to: today });
    return owned.ok ? ok(owned.value.records.filter((r) => !r.closed)) : owned;
  };

  /**
   * A name for a new record, with the person's name and the zone, checked the way `/auth/provision` checks them.
   *
   * THE SAME TWO SENTENCES `prepare` REFUSES WITH (`Directory$.prepare` in `index.ts`), asked here because a paid record
   * is made only after the payment, and `prepare` would refuse then what this lets through now.
   */
  const newName = async (body: Record<string, unknown>): Promise<Result<{ slug: string; name: string | null; tz: string }>> => {
    const slug = typeof body['slug'] === 'string' ? body['slug'].trim() : '';
    const wrong = badSlug(slug);
    if (wrong !== null) return no('VALUE_MALFORMED', wrong, { at: 'slug' });
    const held = await deps.claimed(slug);
    if (held === 'taken') return no('ALREADY_KNOWN', `${slug} is already somebody's BrainDog here.`, { at: 'slug' });
    if (held === 'released') return no('ALREADY_KNOWN', `${slug} was the name of another BrainDog and is never given out again.`, { at: 'slug' });
    const named = personName(body['name']);
    if (!named.ok) return named;
    const name = named.value;
    const zone = deps.provisionable({ ...(name !== null ? { name } : {}), tz: body['tz'] });
    if (!zone.ok) return zone;
    return ok({ slug, name, tz: zone.value });
  };

  /* ── POST /account/billing/checkout with plan free ────────────────────── */

  /**
   * A free record, made there and then: `{ slug, name?, tz?, plan: 'free' }`. Answers `{ url, record, slug }`, the url
   * being the new record's `/start`, so a page that goes wherever checkout says lands in it.
   *
   * NO STRIPE, NO ROW AND NO BILLING SETTING. Nothing is sold, so a host with billing off still makes one; only the
   * origin is needed, for the address to land on.
   *
   * ONE FREE RECORD A PERSON, which is Free's "one record" (`apps/site/src/lib/plans.ts`): a person who has one is told
   * which, and that a second is on a paid plan. Read from the Directory's own plans, so a free record upgraded to Cloud
   * frees the place.
   *
   * THE PLAN IS SET AFTER THE RECORD IS MADE, because `provision` makes it under the Directory's default. A refusal
   * there is a line, not a stop: the record exists and its name is taken, and refusing now would strand both.
   */
  const makeFree = async (who: Who, body: Record<string, unknown>): Promise<Result<unknown>> => {
    /* SIGN-UP CLOSED IS NO NEW RECORD FOR ANYBODY, so a person already here (invited to somebody's record) cannot make one
       through this door while the front door is shut. By invitation it is open: the code was spent making the person. */
    if (signupMode(env) === 'closed') return no('NOT_IN_THIS_BUILD', SIGNUP_CLOSED, { at: 'signup' });
    const origin = originOf(env);
    if (!origin.ok) return origin;
    if (body['record'] !== undefined) return no('VALUE_MALFORMED', 'Free is for a new record. A record already made keeps its plan.', { at: 'plan' });
    const asked = await newName(body);
    if (!asked.ok) return asked;
    const owned = await ownedOpen(who.person);
    if (!owned.ok) return owned;
    const free = owned.value.find((r) => r.plan === FREE_PLAN.directory);
    if (free !== undefined)
      return no('ALREADY_KNOWN', `${free.slug ?? 'One of your records'} is your free record. A second record is on Cloud or Cloud Plus.`, { at: 'plan' });
    const { slug, name, tz } = asked.value;
    const made = await deps.provision({ slug, email: who.email, tz, ...(name !== null ? { name } : {}) });
    if (!made.ok) return made;
    const refusal = await deps.setPlan(made.value.record, FREE_PLAN.directory);
    if (refusal !== null) op({ op: 'billing', did: 'plan', ok: false, rec: made.value.record, code: refusal.code }, 'error');
    const link = `${origin.value}/${made.value.slug}/start`;
    await sendMail(env, 'welcome', who.email, { record: made.value.slug, link });
    op({ op: 'billing', door: 'checkout', ok: true, plan: 'free' });
    return ok({ url: link, record: made.value.record, slug: made.value.slug });
  };

  /**
   * The Directory's credit ledger (`credit`, `refund`, `credits`), asked through the billing group, which forwards an op
   * whole. A Directory object of an older build answers an op it does not know with `null`, read here as no ledger.
   */
  const ledger = <C extends Extract<BillingCall, { op: 'credit' | 'refund' | 'credits' }>>(call: C): Promise<BillingAnswers[C['op']] | null> => deps.billing(call);

  /**
   * FIVE PAYMENT PAGES AN HOUR A PERSON, plans and packs together, counted by Stripe: the person pays as one Stripe
   * customer (`customerFor`), and that customer's newest checkouts are the count, so the limit holds on every Worker at
   * once. `null` when one more may be opened.
   */
  const overLimit = async (stripe: Stripe, customer: string): Promise<Result<never> | null> => {
    const now = deps.clock();
    const recent = await checkoutsSince(stripe, customer, now - CHECKOUT_WINDOW_MS, CHECKOUTS_MOST);
    if (recent === null) {
      op({ op: 'billing', door: 'checkout', ok: false, why: 'count' }, 'error');
      return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
    }
    if (recent.count < CHECKOUTS_MOST) return null;
    const wait = Math.max(1, Math.ceil(((recent.oldest ?? now) + CHECKOUT_WINDOW_MS - now) / 1000));
    const minutes = Math.ceil(wait / 60);
    return no('RATE_LIMITED', `${CHECKOUTS_MOST} payment pages an hour is the most one person can open. Try again in ${minutes === 1 ? 'a minute' : `${minutes} minutes`}.`, {
      retry_after: wait,
    });
  };

  /* ── POST /account/billing/checkout with a pack ───────────────────────── */

  /**
   * A Stripe Checkout page for a pack of Slash credits, `{ record, pack }`. Answers `{ url }`.
   *
   * ANY OPEN RECORD THIS PERSON OWNS, FREE AND A GIFT INCLUDED; a lapsed one pays for its plan first. Paid once
   * (`payment` mode) as the record's Stripe customer, or any this person already pays as, or one made now: no
   * subscription and no billing row, so nothing it does can lapse. The webhook adds the credits when the money is in.
   *
   * THE METADATA IS WHAT THE WEBHOOK READS: `{ kind: 'pack', record, pack, person }`, on the session and on its payment,
   * so a refund of the charge finds the pack it paid for.
   */
  const buyPack = async (who: Who, body: Record<string, unknown>): Promise<Result<unknown>> => {
    const key = billingKey(env);
    if (!key.ok) return key;
    const origin = originOf(env);
    if (!origin.ok) return origin;
    const asked = packAsked(body['pack']);
    if (!asked.ok) return asked;
    const id = asked.value;
    const pack = packOf(id);
    const price = packPrice(env, id);
    if (pack === null || price === null) return no('NOT_IN_THIS_BUILD', `${PACK_SETTINGS[id]} is not set, so ${pack === null ? 'that pack is' : `${packName(pack)} are`} not sold on this host.`, { at: 'pack' });

    /* THE SAME SENTENCE FOR A RECORD THAT IS NOT THIS PERSON'S AND ONE THAT DOES NOT EXIST. */
    const owned = await ownedOpen(who.person);
    if (!owned.ok) return owned;
    const record = owned.value.find((r) => r.record === body['record']);
    if (record === undefined || record.slug === null) return no('OUT_OF_BOUNDS', 'There is no record of yours to buy credits for by that id.', { at: 'record' });
    const rows = await deps.billing({ op: 'for', person: who.person });
    const row = rows.find((r) => r.record === record.record);
    if (row?.state === 'lapsed') return no('FORBIDDEN', 'Billing for this BrainDog has lapsed. Pay for its plan again, and credits can be bought for it then.', { at: 'record' });

    const stripe = deps.stripe(key.value);
    /* A GIFT'S ROW HAS NO CUSTOMER, so the record's own is taken only when it has one. */
    const paying = [row, ...rows].find((r) => r !== undefined && r.customer !== '')?.customer;
    const customer = paying ?? (await customerFor(stripe, who.person, who.email));
    if (customer === null) {
      op({ op: 'billing', door: 'checkout', ok: false, why: 'customer', pack: id }, 'error');
      return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
    }
    const tooMany = await overLimit(stripe, customer);
    if (tooMany !== null) return tooMany;
    const differs = await packPriceRefused(stripe, id, pack, price);
    if (differs !== null) return differs;

    const back = `${origin.value}/${record.slug}/settings/billing`;
    const started = await startCheckout(stripe, {
      mode: 'payment',
      customer,
      person: who.person,
      price,
      metadata: { kind: 'pack', record: record.record, pack: id, person: who.person },
      tax: taxOn(env),
      success: `${back}#credits={CHECKOUT_SESSION_ID}`,
      cancel: `${back}#cancelled`,
    });
    if ('failed' in started) {
      op({ op: 'billing', door: 'checkout', ok: false, why: 'stripe', pack: id, status: started.failed.status, code: started.failed.code }, 'error');
      return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
    }
    op({ op: 'billing', door: 'checkout', ok: true, pack: id });
    return ok({ url: started.url });
  };

  /* ── GET /account/billing ─────────────────────────────────────────────── */

  /**
   * Every open record this person owns, each paid, behind, lapsed or not billed, and the plans this host sells.
   * A free record is `unbilled` on plan `free`, with Free's price, so Settings can name it and offer the upgrade.
   *
   * OWNED, NOT REACHED, as the Directory's `usage` and `for` both are: billing is the owner's, so a member of somebody
   * else's record sees nothing of it here. A record with no row is `unbilled`, which is every record the operator made.
   * ANSWERED WHILE BILLING IS OFF, with `open: false`, because a row written while it was on still says what was paid.
   * `canMake` SAYS WHETHER THIS PERSON CAN MAKE A FREE RECORD NOW: sign-up is not closed and they own no free record.
   * Every "make another" control reads it, so none is drawn that checkout would refuse.
   * `packs` ARE THE PACKS ON SALE, `{ id, credits, price }`, empty while billing is off or no pack has a price; each
   * record says its pack `credits` left, and a gift says `gift: true`, which Settings names and offers no portal for.
   * REFUSED WHILE IT IS WRONG, as every billing door is: `BILLING` set with no key, or with a key of the other mode,
   * is a host set up by mistake, and a list that looked closed would hide that.
   */
  const billing = async (who: Who): Promise<Result<unknown>> => {
    const key = billingKey(env);
    if (!key.ok && (env.BILLING ?? '').trim() !== '') return key;
    const today = new Date(deps.clock()).toISOString().slice(0, 10);
    const owned = await deps.usage(who.person, { from: today, to: today });
    if (!owned.ok) return owned;
    const rows = await deps.billing({ op: 'for', person: who.person });
    const records = await Promise.all(
      owned.value.records
        .filter((r) => !r.closed)
        .map(async (r) => {
          /* A RECORD BACK ON FREE IS LISTED AS ONE MADE FREE, with nothing billed and no period, so it is offered the upgrade. */
          const held = rows.find((b) => b.record === r.record);
          const row = held && !(backOnFree(held) && r.plan === FREE_PLAN.directory) ? held : undefined;
          const plan: ListedPlan = planOfPrice(env, row?.price ?? null) ?? planOfMeter(r.plan);
          const lapsedAt = row?.state === 'lapsed' ? row.lapsed_at : null;
          /* THE PACK CREDITS LEFT ON IT, which a Directory without the ledger answers as none. */
          const credits = (await ledger({ op: 'credits', record: r.record }))?.packs ?? 0;
          return {
            record: r.record,
            slug: r.slug,
            state: row ? row.state : 'unbilled',
            plan,
            price: planPrice(plan),
            limits: limitsOf(plan),
            credits,
            ...(row && isGift(row) ? { gift: true } : {}),
            ...(row && row.period_end !== null ? { period_end: row.period_end } : {}),
            ...(lapsedAt !== null ? { lapsed_at: lapsedAt, delete_on: lapsedAt + LAPSE_DELETES_DAYS * DAY_MS } : {}),
          };
        }),
    );
    const sold = PLAN_IDS.filter((p) => priceOf(env, p) !== null).map((p) => ({ id: p, name: planName(p), price: planPrice(p), limits: limitsOf(p) }));
    const open = sells(env);
    const canMake = signupMode(env) !== 'closed' && !records.some((r) => r.plan === 'free');
    return ok({ records, open, plans: open ? sold : [], packs: packsOnSale(env), extra: sellsExtra(env), tax: open && taxOn(env), canMake, teams_held: (env as { TEAMS_HELD?: string }).TEAMS_HELD === '1' });
  };

  /* ── POST /account/billing/checkout ───────────────────────────────────── */

  /**
   * A Stripe Checkout page for a new record, `{ slug, name?, tz?, plan? }`, or for paying again for a lapsed one,
   * `{ record, plan? }`. Answers `{ url }`.
   *
   * THE NAME, THE PERSON'S NAME AND THE ZONE ARE CHECKED BEFORE STRIPE IS ASKED, with the Directory's grammar, its
   * live and released names, and the same checks `/auth/provision` makes, because the record is made only once the payment is in
   * and a name refused then would be a payment with nothing to show for it. A name taken between here and the payment
   * gets the first free of `<name>-2` to `<name>-9`, and the welcome letter says so.
   *
   * FIVE AN HOUR A PERSON, counted by Stripe: the person pays as one Stripe customer (`customerFor`), and that
   * customer's newest checkouts are the count, so the limit holds on every Worker at once.
   *
   * `{ record, plan? }` IS ALSO A FREE RECORD'S UPGRADE: one this person owns, open, on the Directory's `free` plan, with
   * no billing row or with the row of a plan it was cancelled from (`backOnFree`), whose customer pays again. The payment
   * writes its row and moves its plan, as paying again does.
   */
  const checkout = async (who: Who, body: Record<string, unknown>): Promise<Result<unknown>> => {
    if (body['plan'] === 'free') return makeFree(who, body);
    if (body['pack'] !== undefined) return buyPack(who, body);
    const key = billingKey(env);
    if (!key.ok) return key;
    const origin = originOf(env);
    if (!origin.ok) return origin;
    const plan = planAsked(body['plan']);
    if (!plan.ok) return plan;
    const price = priceOf(env, plan.value);
    if (price === null)
      return no('NOT_IN_THIS_BUILD', `${HOSTED_PLANS[plan.value].setting} is not set, so ${planName(plan.value)} is not sold on this host.`, { at: 'plan' });
    const stripe = deps.stripe(key.value);

    let customer: string | null;
    let metadata: Record<string, string>;
    let back: string;
    if (body['record'] !== undefined) {
      /* PAYING AGAIN FOR A LAPSE, OR PAYING FOR A FREE RECORD. The same sentence for a record that is not this person's
         and one that does not exist, so the answer says nothing about somebody else's. */
      const row = await ownedRow(who.person, body['record']);
      if (row === null || backOnFree(row)) {
        const owned = await ownedOpen(who.person);
        if (!owned.ok) return owned;
        const free = owned.value.find((r) => r.record === body['record'] && r.plan === FREE_PLAN.directory && r.slug !== null);
        if (free === undefined || free.slug === null || (row === null && (await deps.billing({ op: 'of', record: free.record })) !== null))
          return no('OUT_OF_BOUNDS', 'There is no record of yours to pay for by that id.', { at: 'record' });
        const paying = row === null ? await deps.billing({ op: 'for', person: who.person }) : [row];
        customer = payingAs(paying) ?? (await customerFor(stripe, who.person, who.email));
        metadata = { person: who.person, record: free.record, plan: plan.value };
        back = `${origin.value}/${free.slug}/settings/billing`;
      } else {
        if (row.slug === null) return no('OUT_OF_BOUNDS', 'There is no record of yours to pay for by that id.', { at: 'record' });
        if (isGift(row)) return no('ALREADY_KNOWN', 'This BrainDog is a gift from us, so there is nothing to pay for.', { at: 'record' });
        if (row.state !== 'lapsed') return no('ALREADY_KNOWN', 'This BrainDog is paid for. Manage payment changes the card or the plan.', { at: 'record' });
        customer = row.customer;
        metadata = { person: who.person, record: row.record, plan: plan.value };
        back = `${origin.value}/${row.slug}/settings/billing`;
      }
    } else {
      const asked = await newName(body);
      if (!asked.ok) return asked;
      const { slug, name, tz } = asked.value;
      const paying = await deps.billing({ op: 'for', person: who.person });
      customer = payingAs(paying) ?? (await customerFor(stripe, who.person, who.email));
      metadata = { person: who.person, email: who.email, slug, tz, plan: plan.value, ...(name !== null ? { name } : {}) };
      back = `${origin.value}/signup`;
    }
    if (customer === null) {
      op({ op: 'billing', door: 'checkout', ok: false, why: 'customer' }, 'error');
      return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
    }

    const tooMany = await overLimit(stripe, customer);
    if (tooMany !== null) return tooMany;

    /* THE PRICE STRIPE CHARGES IS THE ONE THE PAGE SAID, or no session is made. */
    const differs = await priceRefused(stripe, plan.value, price);
    if (differs !== null) return differs;

    const started = await startCheckout(stripe, {
      customer,
      person: who.person,
      price,
      metadata,
      tax: taxOn(env),
      success: `${back}#paid={CHECKOUT_SESSION_ID}`,
      cancel: `${back}#cancelled`,
    });
    if ('failed' in started) {
      op({ op: 'billing', door: 'checkout', ok: false, why: 'stripe', status: started.failed.status, code: started.failed.code }, 'error');
      return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
    }
    op({ op: 'billing', door: 'checkout', ok: true, plan: plan.value, again: body['record'] !== undefined });
    return ok({ url: started.url });
  };

  /* ── POST /account/billing/portal ─────────────────────────────────────── */

  /**
   * Stripe's own page for a record this person owns and pays for, `{ record, plan? }`. Answers `{ url }`.
   *
   * WITH `plan`, THE PAGE OPENS ON CONFIRMING THE SWITCH to that plan, which takes effect once it is confirmed. A lapsed
   * record switches by paying again on the plan it chooses, so it is sent there.
   */
  const portal = async (who: Who, body: Record<string, unknown>): Promise<Result<unknown>> => {
    const key = billingKey(env);
    if (!key.ok) return key;
    const origin = originOf(env);
    if (!origin.ok) return origin;
    const row = await ownedRow(who.person, body['record']);
    if (row === null || row.slug === null) return no('OUT_OF_BOUNDS', 'There is no record of yours with a payment to manage by that id.', { at: 'record' });
    if (isGift(row)) return no('FORBIDDEN', 'This BrainDog is a gift from us, so there is no payment to manage.', { at: 'record' });
    const stripe = deps.stripe(key.value);
    const back = `${origin.value}/${row.slug}/settings/billing`;

    let change: { subscription: string; item: string; price: string } | undefined;
    if (body['plan'] !== undefined) {
      const plan = planAsked(body['plan']);
      if (!plan.ok) return plan;
      const price = priceOf(env, plan.value);
      if (price === null)
        return no('NOT_IN_THIS_BUILD', `${HOSTED_PLANS[plan.value].setting} is not set, so ${planName(plan.value)} is not sold on this host.`, { at: 'plan' });
      if (row.state === 'lapsed') return no('FORBIDDEN', 'Billing for this BrainDog has lapsed. Pay again, on the plan you choose, and it is switched as it is paid for.', { at: 'record' });
      if (backOnFree(row)) return no('FORBIDDEN', 'This BrainDog is on Free. Pay for it on the plan you choose, and it moves as it is paid for.', { at: 'record' });
      if (row.price === price) return no('ALREADY_KNOWN', `This BrainDog is on ${planName(plan.value)} already.`, { at: 'plan' });
      const sub = row.subscription === null ? null : await subscriptionOf(stripe, row.subscription, planPrices(env));
      if (sub === null || sub.item === null) {
        op({ op: 'billing', door: 'portal', ok: false, why: 'subscription', rec: row.record }, 'error');
        return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
      }
      change = { subscription: sub.id, item: sub.item, price };
    }

    const started = await startPortal(stripe, { customer: row.customer, back, ...(change ? { change } : {}) });
    if ('failed' in started) {
      op({ op: 'billing', door: 'portal', ok: false, why: 'stripe', status: started.failed.status, code: started.failed.code }, 'error');
      return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
    }
    return ok({ url: started.url });
  };

  /* ── POST /account/billing/invoices ───────────────────────────────────── */

  /**
   * The newest invoices of the Stripe customer a record this person owns pays as, `{ record }`. Answers
   * `{ invoices }`, each `{ id, number, at, cents, currency, status, url, pdf }`, newest first.
   *
   * THE CUSTOMER'S, NOT THE RECORD'S ALONE: one person pays for every record they own as one customer, so the list is
   * theirs, and only an owner reaches it. A gift and a record never paid for have no customer and list none. Answered
   * while billing is on in a mode its key agrees with, like every door that asks Stripe.
   */
  const invoices = async (who: Who, body: Record<string, unknown>): Promise<Result<unknown>> => {
    const key = billingKey(env);
    if (!key.ok) return key;
    const row = await ownedRow(who.person, body['record']);
    if (row === null) return no('OUT_OF_BOUNDS', 'There is no record of yours with payments by that id.', { at: 'record' });
    if (isGift(row) || row.customer === '') return ok({ invoices: [] });
    const out = await invoicesOf(deps.stripe(key.value), row.customer);
    if (!Array.isArray(out)) {
      op({ op: 'billing', door: 'invoices', ok: false, status: out.status, code: out.code }, 'error');
      return no('RECORD_UNAVAILABLE', 'Your invoices could not be read from Stripe just now. Try again in a minute.');
    }
    return ok({ invoices: out });
  };

  /* ── POST /account/billing/webhook ────────────────────────────────────── */

  /** A row written through the Directory, or thrown, so the webhook answers the event as not applied. */
  const setRow = async (row: BillingSet): Promise<void> => {
    const out = await deps.billing({ op: 'set', row });
    if (!out.ok) throw new Error(`the billing row was refused: ${refused(out) ? out.refusal.code : 'refused'}`);
  };

  /**
   * The record's own lapse switch, flipped when this change moves it into or out of a lapse.
   *
   * FLIPPED BEFORE THE ROW IS WRITTEN, because the row is what the next delivery of the event reads to decide. If the
   * row is then refused, it still says what it said, so the next delivery flips the switch again (setting a flag it
   * already holds changes nothing) and writes the row. Flipped after, a failed flip left a row saying the lapse had
   * ended and a record still refusing every write, with nothing left to put it right.
   */
  const lapseSwitch = async (before: BillingRow | null, record: string, after: BillingState): Promise<void> => {
    const was = before?.state === 'lapsed';
    const now = after === 'lapsed';
    if (was !== now) await deps.setLapsed(record, now);
  };

  /** The letter saying a lapse has ended, sent once the row says so. `sendMail` never throws, so it is always last. */
  const backLetter = async (before: BillingRow | null, after: BillingState, email: string | null, slug: string | null): Promise<void> => {
    if (before?.state !== 'lapsed' || after === 'lapsed' || email === null) return;
    const origin = originOf(env);
    await sendMail(env, 'lapse.back', email, {
      ...(slug !== null ? { record: slug } : {}),
      ...(origin.ok && slug !== null ? { link: `${origin.value}/${slug}` } : {}),
    });
  };

  /**
   * The Directory's plan follows the price, when the price is one of this host's plans. A refusal is a line, not a stop.
   * ASKED BEFORE THE ROW IS WRITTEN and whether or not the price moved, so the next delivery of an event whose row was
   * refused puts the plan right too.
   */
  const planFollows = async (record: string, price: string | null): Promise<void> => {
    const plan = planOfPrice(env, price);
    if (plan === null) return;
    const refusal = await deps.setPlan(record, HOSTED_PLANS[plan].directory);
    if (refusal !== null) op({ op: 'billing', did: 'plan', ok: false, rec: record, code: refusal.code }, 'error');
  };

  /**
   * A checkout paid: a new record made and its row written, or a lapsed record's row made active again.
   *
   * ONLY ONCE THE MONEY IS IN. A card completes the session `paid`; a bank debit completes it `unpaid` and Stripe sends
   * `checkout.session.async_payment_succeeded` when the money arrives, which comes here too.
   */
  const paid = async (session: StripeObject, stripe: Stripe): Promise<string> => {
    if (textAt(session, 'mode') === 'payment') return packPaid(session);
    if (textAt(session, 'mode') !== 'subscription') return 'ignored';
    const payment = textAt(session, 'payment_status');
    if (payment !== 'paid' && payment !== 'no_payment_required') return 'waiting';
    const meta = metadataOf(session);
    const person = meta['person'] ?? '';
    /* A CHECKOUT THIS WORKER DID NOT OPEN (another product on the same Stripe account) is a line and a 200, not a
       failure: every checkout `startCheckout` makes names the person twice, and sending the event again cannot make
       one that does not. Answered 500, Stripe would send it again for days and change nothing. */
    if (person === '' || textAt(session, 'client_reference_id') !== person) {
      op({ op: 'billing', did: 'paid', ok: false, why: 'foreign' }, 'error');
      return 'foreign';
    }
    const customer = idAt(session, 'customer');
    const sub = await subscriptionOf(stripe, idAt(session, 'subscription'), planPrices(env));
    if (sub === null) throw new Error('the subscription of a paid checkout could not be read from Stripe');
    const state = stateOf(sub.status);

    const record = meta['record'];
    if (record !== undefined) {
      const before = await deps.billing({ op: 'of', record });
      if (before === null) {
        /* A FREE RECORD PAID FOR, which has no row until now. Taken only for an open record the person who paid owns,
           so a payment naming somebody else's moves nothing; the row is last, as for a new record. A second delivery
           finds the row and reads as paying again, which writes the same things. */
        const owned = await ownedOpen(person);
        if (!owned.ok) throw new Error('the records of the person who paid could not be read');
        if (!owned.value.some((r) => r.record === record)) throw new Error('a payment for a record the person who paid does not own');
        if (state === 'lapsed') await deps.setLapsed(record, true);
        await planFollows(record, sub.price);
        await setRow({ record, person, customer, subscription: sub.id, price: sub.price, state, period_end: sub.period_end });
        return 'upgraded';
      }
      /* A GIFT IS NOT PAID FOR, so no payment moves it: checkout refuses one, and a session that names it anyway is a line. */
      if (isGift(before)) {
        op({ op: 'billing', did: 'paid', ok: false, why: 'gift', rec: record }, 'error');
        return 'gift';
      }
      if (before.customer !== customer) throw new Error('a payment again for a record whose customer is another');
      await lapseSwitch(before, record, state);
      await planFollows(record, sub.price);
      await setRow({ record, subscription: sub.id, price: sub.price, state, period_end: sub.period_end });
      await backLetter(before, state, sub.email, before.slug);
      /* THE SUBSCRIPTION THIS PAYMENT REPLACED IS ENDED, so the record is never paid for twice. A failure is a line: the
         row already points at the new one, so nothing the old one says moves the record again. Once the row is written
         a later delivery reads the new subscription as the old one and ends nothing. */
      if (before.subscription !== null && before.subscription !== sub.id) {
        const ended = await endSubscription(stripe, before.subscription);
        if (ended !== true) op({ op: 'billing', did: 'end', ok: false, rec: record, status: ended.status, code: ended.code }, 'error');
      }
      return 'again';
    }

    const asked = meta['slug'] ?? '';
    const email = meta['email'] ?? sub.email ?? '';
    if (asked === '' || email === '') throw new Error('a paid checkout for a new record that names no name or no address');
    /* THE SAME SUBSCRIPTION PAID FOR ONE RECORD ALREADY is this payment arriving a second time by another event, so
       nothing more is made. */
    const known = (await deps.billing({ op: 'byCustomer', customer })).find((r) => r.subscription === sub.id);
    if (known !== undefined) return 'already';

    /* A RECORD AN EARLIER DELIVERY OF THIS PAYMENT MADE, before its row was refused, is taken up rather than made a
       second time under `<name>-2`. It is the record under the name asked for, owned by this person, open, with no row:
       the name was free when the checkout was opened (`claimed`), so a record under it now was made since. */
    const today = new Date(deps.clock()).toISOString().slice(0, 10);
    const owned = await deps.usage(person, { from: today, to: today });
    if (!owned.ok) throw new Error('the records of the person who paid could not be read');
    const billed = new Set((await deps.billing({ op: 'for', person })).map((r) => r.record));
    const earlier = owned.value.records.find((r) => r.slug === asked && !r.closed && !billed.has(r.record));

    const name = meta['name'];
    let made: Provisioned | null = earlier ? { record: earlier.record, slug: asked, person } : null;
    for (let n = 1; n <= NAME_TRIES && made === null; n++) {
      const slug = n === 1 ? asked : `${asked}-${n}`;
      const out = await deps.provision({ slug, email, tz: meta['tz'] ?? 'UTC', ...(name ? { name } : {}) });
      if (out.ok) made = out.value;
      /* ANY NO ABOUT THE NAME MOVES TO THE NEXT ONE, not only a taken name, because the payment is in either way and a
         record under the next name is better than none. A no about anything else stops here. */
      else if (!refused(out) || out.refusal.at !== 'slug') throw new Error(`the record could not be made: ${refused(out) ? out.refusal.code : 'refused'}`);
    }
    if (made === null) throw new Error('every name from the one asked for to its ninth was taken');

    /* THE ROW LAST, because it is what says this payment made its record: the lapse and the plan are set first, so a
       refusal of any of the three leaves the next delivery to find the record above and finish. */
    if (state === 'lapsed') await deps.setLapsed(made.record, true);
    await planFollows(made.record, sub.price);
    await setRow({ record: made.record, person: made.person, customer, subscription: sub.id, price: sub.price, state, period_end: sub.period_end });
    const origin = originOf(env);
    await sendMail(env, 'welcome', email, {
      record: made.slug,
      ...(origin.ok ? { link: `${origin.value}/${made.slug}/start` } : {}),
      ...(made.slug !== asked ? { asked } : {}),
    });
    return made.slug === asked ? 'made' : 'made-renamed';
  };

  /**
   * A pack paid for: its credits added to the record's ledger, once.
   *
   * ONLY ONCE THE MONEY IS IN (`payment_status: 'paid'`): a bank debit completes the session unpaid, adds nothing, and
   * comes back as `checkout.session.async_payment_succeeded` when the money arrives.
   *
   * KEYED BY THE PAYMENT'S OWN SESSION, which is what the ledger's `event` holds: every delivery of this event, and the
   * other event one payment may send, name the same session, so the credits are added once whichever arrives and however
   * often. A refund finds the same session from its charge (`refunded`).
   */
  const packPaid = async (session: StripeObject): Promise<string> => {
    const meta = metadataOf(session);
    if (meta['kind'] !== 'pack') return 'ignored';
    if (textAt(session, 'payment_status') !== 'paid') return 'waiting';
    const person = meta['person'] ?? '';
    if (person === '' || textAt(session, 'client_reference_id') !== person) {
      op({ op: 'billing', did: 'credit', ok: false, why: 'foreign' }, 'error');
      return 'foreign';
    }
    const id = textAt(session, 'id');
    const record = meta['record'] ?? '';
    const asked = packAsked(meta['pack']);
    if (id === '' || idAt(session, 'customer') === '' || record === '' || !asked.ok) {
      op({ op: 'billing', did: 'credit', ok: false, why: 'unnamed' }, 'error');
      return 'ignored';
    }
    /* A RECORD CLOSED SINCE THE CHECKOUT, or one the payer no longer owns, gets nothing: the money is in, the line says
       so, and a refund from Stripe's dashboard puts it right. Sending the event again would change nothing. */
    const owned = await ownedOpen(person);
    if (!owned.ok) throw new Error('the records of the person who paid could not be read');
    if (!owned.value.some((r) => r.record === record)) {
      op({ op: 'billing', did: 'credit', ok: false, why: 'record', rec: record }, 'error');
      return 'gone';
    }
    const out = await ledger({ op: 'credit', record, person, pack: asked.value, event: id, at: deps.clock() });
    if (out === null) throw new Error('the Directory keeps no credits in this build');
    if (!out.ok) throw new Error(`the credits were refused: ${refused(out) ? out.refusal.code : 'refused'}`);
    return out.value.added ? 'credited' : 'already';
  };

  /**
   * A charge refunded: when it paid for a pack, what is left of that pack is taken back, never below nothing.
   *
   * THE PACK IS FOUND FROM THE CHARGE'S PAYMENT, by the session that took it, and only when that session is a pack's
   * and the customer agrees: a refund of a plan's invoice has no session and changes nothing. A charge with no customer
   * changes nothing. A refund in part is still the operator's word that the pack is given back, and takes the rest.
   */
  const refunded = async (charge: StripeObject, stripe: Stripe): Promise<string> => {
    const customer = idAt(charge, 'customer');
    const payment = idAt(charge, 'payment_intent');
    if (customer === '' || payment === '') return 'ignored';
    const session = await sessionOfPayment(stripe, payment);
    if (session === null) return 'ignored';
    if ('ok' in session) throw new Error('the payment a refund names could not be read from Stripe');
    if (session.metadata['kind'] !== 'pack' || session.customer !== customer) return 'ignored';
    const out = await ledger({ op: 'refund', event: session.id });
    if (out === null) throw new Error('the Directory keeps no credits in this build');
    /* A PACK WHOSE CREDITS NEVER LANDED (its record closed before the money came in, `packPaid`'s 'gone') is the very
       refund the operator makes from Stripe's dashboard: nothing to take back, a line and a 200. Answered 500, Stripe
       would send it again for days and change nothing. */
    if (refused(out) && out.refusal.code === 'OUT_OF_BOUNDS') {
      op({ op: 'billing', did: 'refund', ok: false, why: 'uncredited' }, 'error');
      return 'none';
    }
    if (!out.ok) throw new Error(`the refund was refused: ${refused(out) ? out.refusal.code : 'refused'}`);
    return out.value.taken > 0 ? 'refunded' : 'already';
  };

  /**
   * Whether a record whose plan was cancelled goes back to Free rather than lapsing: one person on it, and no other free
   * record of its owner's, since Free is one record and one person. `false` while nobody can count the people on it.
   * A count that fails throws, so Stripe sends the event again rather than the record lapsing on a guess.
   */
  const fitsFree = async (row: BillingRow): Promise<boolean> => {
    if (deps.people === undefined) return false;
    if ((await deps.people(row.record)) !== 1) return false;
    const owned = await ownedOpen(row.person);
    if (!owned.ok) throw new Error('the records of the person who paid could not be read');
    return !owned.value.some((r) => r.record !== row.record && r.plan === FREE_PLAN.directory);
  };

  /**
   * A paid plan cancelled, for a record that fits Free: back on Free, writable, and off the ladder. DEFAULT TAKEN FOR THE
   * OWNER: a person who stops paying keeps what Free gives them instead of losing it in ninety days.
   *
   * IN THE WEBHOOK'S ORDER: the lapse switch (off, for a record already lapsed by an unpaid card), then the plan, then
   * the row last. The row keeps its customer, so the upgrade pays as the same Stripe customer, and loses its
   * subscription, price and period, so nothing the old subscription says finds it again. A row refused leaves the
   * subscription on it, and the next delivery comes back here.
   */
  const toFree = async (before: BillingRow): Promise<string> => {
    await lapseSwitch(before, before.record, 'active');
    const refusal = await deps.setPlan(before.record, FREE_PLAN.directory);
    if (refusal !== null) op({ op: 'billing', did: 'plan', ok: false, rec: before.record, code: refusal.code }, 'error');
    await setRow({ record: before.record, subscription: null, price: null, period_end: null, state: 'active' });
    return 'free';
  };

  /**
   * A subscription created, changed or ended: the row that pays by it follows its state, price and period.
   *
   * THE SUBSCRIPTION IS READ AGAIN FROM STRIPE rather than taken from the event, so events that arrive out of order all
   * write what is true now; if Stripe cannot be asked, the event's own copy is used. A subscription no row pays by is
   * one whose checkout has not completed yet, which writes the row itself, or one a payment again replaced: both are
   * left alone.
   */
  const changed = async (type: string, object: StripeObject, stripe: Stripe): Promise<string> => {
    const id = textAt(object, 'id');
    const customer = idAt(object, 'customer');
    if (id === '' || customer === '') return 'ignored';
    /* A GIFT IS NEVER FOUND HERE, whatever customer it kept: no subscription event lapses or moves it. */
    const before = (await deps.billing({ op: 'byCustomer', customer })).find((r) => r.subscription === id && !isGift(r));
    if (before === undefined) return 'unknown';
    const sub: SubscriptionSeen | null = (await subscriptionOf(stripe, id, planPrices(env))) ?? subscriptionSeen(object, planPrices(env));
    if (sub === null) return 'ignored';
    /* NO STATE READ IS NOT A STATE: a copy with no status (an invoice's, when Stripe could not be asked) moves nothing
       and is sent again, rather than read as the unknown state that lapses a record. */
    if (sub.status === '') throw new Error('the subscription named no status');
    const cancelled = type === 'customer.subscription.deleted' || sub.status === 'canceled';
    if (cancelled && (await fitsFree(before))) return toFree(before);
    const state = cancelled ? 'lapsed' : stateOf(sub.status);
    await lapseSwitch(before, before.record, state);
    await planFollows(before.record, sub.price);
    await setRow({ record: before.record, price: sub.price, period_end: sub.period_end, state });
    await backLetter(before, state, sub.email, before.slug);
    return state;
  };

  /**
   * An invoice paid: a lapsed record paid for by its subscription is active again, while that subscription is. Any other
   * row is left as it is.
   *
   * THE SUBSCRIPTION IS ASKED, NOT THE INVOICE. Stripe leaves an ended subscription's last invoice open, and paying it
   * from the hosted page sends `invoice.paid` for a subscription that stays canceled; taken on its own word, one paid
   * month brought a record back for good. Asked and not answered, nothing moves: the subscription's own event says it.
   */
  const invoicePaid = async (invoice: StripeObject, stripe: Stripe): Promise<string> => {
    const customer = idAt(invoice, 'customer');
    /* WHERE THE SUBSCRIPTION IS DEPENDS ON STRIPE'S API VERSION: on the invoice itself until March 2025, and under
       `parent.subscription_details` after. Both are read. */
    const nested = objectAt(objectAt(invoice, 'parent') ?? {}, 'subscription_details');
    const subscription = idAt(invoice, 'subscription') || (nested ? idAt(nested, 'subscription') : '');
    if (customer === '' || subscription === '') return 'ignored';
    const before = (await deps.billing({ op: 'byCustomer', customer })).find((r) => r.subscription === subscription && !isGift(r));
    if (before === undefined || before.state !== 'lapsed') return 'unchanged';
    const sub = await subscriptionOf(stripe, subscription, planPrices(env));
    if (sub === null || (sub.status !== 'active' && sub.status !== 'trialing')) return 'unchanged';
    await lapseSwitch(before, before.record, 'active');
    await setRow({ record: before.record, state: 'active' });
    const email = textAt(invoice, 'customer_email');
    await backLetter(before, 'active', email === '' ? null : email, before.slug);
    return 'active';
  };

  /**
   * An invoice whose payment failed: the subscription it bills is read again and its row follows, as a change does, so
   * a card that failed shows on the Billing page at once rather than when Stripe next sends the subscription. Stripe's
   * own retry mails go to the customer; nothing is mailed from here.
   */
  const invoiceFailed = async (invoice: StripeObject, stripe: Stripe): Promise<string> => {
    const customer = idAt(invoice, 'customer');
    const nested = objectAt(objectAt(invoice, 'parent') ?? {}, 'subscription_details');
    const subscription = idAt(invoice, 'subscription') || (nested ? idAt(nested, 'subscription') : '');
    if (customer === '' || subscription === '') return 'ignored';
    return changed('customer.subscription.updated', { id: subscription, customer }, stripe);
  };

  /**
   * Stripe saying a payment happened, handed the request exactly as it arrived.
   *
   * THE BODY IS READ ONCE, AS TEXT, AT MOST `WEBHOOK_BODY_MAX` BYTES, AND NOTHING PARSES IT BEFORE `verifyStripe`:
   * a body parsed and written out again is not the body Stripe signed. A wrong signature is 400,
   * which Stripe reads as not delivered. Then the event's mode must be this host's, then the delivery claims the event
   * (below), and only then is it applied.
   *
   * APPLYING AN EVENT TWICE CHANGES NOTHING, so a delivery that failed is put right by the next one. Each step reads
   * the row before it writes: the lapse switch and the plan are set before the row, the row is written last, a record
   * already made for the subscription is not made again, and a letter goes only when the row it reads moved. A
   * failure is a line and a 500, and Stripe sends the event again.
   *
   * ONE DELIVERY AT A TIME, AND NO DELIVERY LOST. The Directory's `seen` answers `true` to the first offer of an id and
   * never forgets it. Asked with the event's own id, a delivery that failed after asking would leave every later one
   * answered and ignored: the money taken, and no record. So it is asked instead for the event in this window of
   * `CLAIM_MS` and in the next, and a delivery goes on only when it holds both. Two deliveries at once cannot both
   * hold the window they share, so one waits for Stripe to send it again; a delivery that failed holds nothing past
   * the next window, so a later one applies the event.
   */
  const webhook = async (request: Request): Promise<Response> => {
    const key = billingKey(env);
    if (!key.ok) return answer(httpStatus(key), key);
    const secret = (env.STRIPE_WEBHOOK_SECRET ?? '').trim();
    if (secret === '') return answer(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'STRIPE_WEBHOOK_SECRET is not set, so no payment event can be checked on this host.' } });

    const raw = await bodyOf(request, WEBHOOK_BODY_MAX);
    if (raw === null) return answer(413, { ok: false, refusal: { code: 'BODY_MALFORMED', fix: `A payment event is at most ${WEBHOOK_BODY_MAX} bytes.` } });
    const now = deps.clock();
    if (!(await verifyStripe(raw, request.headers.get('stripe-signature') ?? '', secret, Math.floor(now / 1000)))) {
      op({ op: 'billing', door: 'webhook', ok: false, why: 'signature' }, 'error');
      return answer(400, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'The Stripe-Signature header does not match this body under the signing secret of this endpoint.' } });
    }

    let event: StripeObject | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      event = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as StripeObject) : null;
    } catch {
      event = null;
    }
    const id = event ? textAt(event, 'id') : '';
    const type = event ? textAt(event, 'type') : '';
    const object = event ? objectAt(objectAt(event, 'data') ?? {}, 'object') : null;
    if (event === null || id === '' || type === '' || object === null)
      return answer(400, { ok: false, refusal: { code: 'BODY_MALFORMED', fix: 'A payment event is a Stripe event: an id, a type and its object.' } });
    if ((event['livemode'] === true) !== (env.BILLING?.trim() === 'live')) {
      op({ op: 'billing', door: 'webhook', ok: false, why: 'mode', event: type }, 'error');
      return answer(400, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This event is from the other Stripe mode than BILLING names.' } });
    }
    if (!ACTS.has(type)) return answer(200, { received: true });
    const slot = Math.floor(now / CLAIM_MS);
    const held = (await deps.billing({ op: 'seen', id: `${id}@${slot}`, type })) && (await deps.billing({ op: 'seen', id: `${id}@${slot + 1}`, type }));
    if (!held) {
      op({ op: 'billing', door: 'webhook', ok: false, why: 'held', event: type, id });
      return answer(503, { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'Another delivery of this payment event is being applied. Send it again in a few minutes.' } });
    }

    const stripe = deps.stripe(key.value);
    try {
      const did =
        type === 'invoice.paid'
          ? await invoicePaid(object, stripe)
          : type === 'invoice.payment_failed'
            ? await invoiceFailed(object, stripe)
            : type === 'charge.refunded'
              ? await refunded(object, stripe)
              : type.startsWith('checkout.session.')
                ? await paid(object, stripe)
                : await changed(type, object, stripe);
      op({ op: 'billing', door: 'webhook', ok: true, event: type, did });
      return answer(200, { received: true });
    } catch (e) {
      op({ op: 'billing', door: 'webhook', ok: false, event: type, id, why: e instanceof Error ? e.message : 'unknown' }, 'error');
      return answer(500, { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'The payment event was read and could not be applied.' } });
    }
  };

  /* ── POST /account/billing/extra ──────────────────────────────────────── */

  /**
   * Extra usage on a paid record this person owns, `{ record, cap_cents }`: the monthly cap in whole cents, 0 turning
   * it off. Answers `{ record, extra }`, the record's month as the Directory reads it after.
   *
   * CLOUD AND CLOUD PLUS, PAID AND NOT LAPSED: Free sells none, a gift is never charged, and a lapsed record pays for its
   * plan first. Turning it on puts the metered price on the subscription before the cap is kept, so a cap never stands
   * on a subscription that could not be charged for it.
   */
  const extra = async (who: Who, body: Record<string, unknown>): Promise<Result<unknown>> => {
    const key = billingKey(env);
    if (!key.ok) return key;
    const { price } = extraOf(env);
    if (!sellsExtra(env) || price === null) return no('NOT_IN_THIS_BUILD', EXTRA_UNSOLD, { at: 'cap_cents' });
    const cap = body['cap_cents'];
    if (typeof cap !== 'number' || !Number.isSafeInteger(cap) || cap < 0 || cap > EXTRA_CAP_MOST)
      return no('VALUE_MALFORMED', `cap_cents is whole cents from 0, which turns extra usage off, to ${EXTRA_CAP_MOST}.`, { at: 'cap_cents' });
    const row = await ownedRow(who.person, body['record']);
    if (row === null) return no('OUT_OF_BOUNDS', 'There is no paid record of yours by that id.', { at: 'record' });
    if (isGift(row)) return no('VALUE_MALFORMED', 'This plan is a gift and is never charged, so it has no extra usage.', { at: 'record' });
    if (row.subscription === null || row.state === 'lapsed')
      return no('VALUE_MALFORMED', `Extra usage is part of ${planName('cloud')} and ${planName('plus')}, and this BrainDog is not paid for on either just now.`, { at: 'record' });
    if (cap > 0) {
      const stripe = deps.stripe(key.value);
      const differs = await extraPriceRefused(stripe, price);
      if (differs !== null) return differs;
      if (!(await meteredOn(stripe, row.subscription, price))) {
        op({ op: 'billing', door: 'extra', ok: false, why: 'item', rec: row.record }, 'error');
        return no('RECORD_UNAVAILABLE', STRIPE_DOWN);
      }
    }
    /* A DIRECTORY OF AN OLDER BUILD ANSWERS AN OP IT DOES NOT KNOW WITH `null`. */
    const set = (await deps.billing({ op: 'extraSet', record: row.record, person: who.person, cap })) as Result<unknown> | null;
    if (set === null) return no('NOT_IN_THIS_BUILD', EXTRA_UNSOLD, { at: 'cap_cents' });
    if (!set.ok) return set;
    op({ op: 'billing', door: 'extra', ok: true, rec: row.record, on: cap > 0 });
    return ok({ record: row.record, extra: set.value });
  };

  return { billing, checkout, portal, invoices, extra, webhook };
}

/* ── a record deleted while it is paid for ───────────────────────────────── */

/**
 * A record being deleted stops being paid for: the subscription its row pays by is ended now, and the row lets go of
 * it. Answers `none` when there is nothing to end (no row, a gift, a record back on Free), `ended` (one Stripe had
 * already cancelled among them, `endSubscription`), or `failed` with a line. A LAPSED ROW IS ENDED TOO: a subscription
 * Stripe gave up on can sit `unpaid`, and a card put on it later would pay for a record that is gone.
 *
 * FOUND BY THE REHEARSAL (`billing-rehearsal.test.ts`, "FIX (deleted while paid)"): nothing on the delete path asked
 * Stripe anything, so an owner who deleted a record on Cloud went on being charged for it every month. Ended at once and
 * not at the period's end, because there is nothing left to use. The row lets go of the subscription before Stripe's
 * `customer.subscription.deleted` arrives, so that event finds no row and moves nothing on a record that is gone.
 *
 * NEVER A STOP. A deletion the owner asked for goes on whatever this answers, and `failed` is an `op: 'billing'` line at
 * `error` naming the record, so the operator ends the subscription from Stripe's dashboard.
 */
export async function endForDeleted(env: BillingEnv, deps: Pick<BillingDeps, 'billing' | 'stripe'>, record: string): Promise<'none' | 'ended' | 'failed'> {
  const row = await deps.billing({ op: 'of', record });
  if (row === null || isGift(row) || row.subscription === null) return 'none';
  const key = billingKey(env);
  if (!key.ok) {
    op({ op: 'billing', did: 'end', ok: false, why: 'key', rec: record }, 'error');
    return 'failed';
  }
  const ended = await endSubscription(deps.stripe(key.value), row.subscription);
  if (ended !== true) {
    op({ op: 'billing', did: 'end', ok: false, why: 'deleted', rec: record, status: ended.status, code: ended.code }, 'error');
    return 'failed';
  }
  const out = await deps.billing({ op: 'set', row: { record, subscription: null, price: null, period_end: null } });
  /* ONE LINE A DELETION: Stripe ended it either way, so this answers `ended`, and a row that would not let go says so
     at `error` rather than beside a line that says all went well. */
  if (!out.ok) op({ op: 'billing', did: 'end', ok: false, why: 'row', rec: record, code: refused(out) ? out.refusal.code : 'refused' }, 'error');
  else op({ op: 'billing', did: 'end', ok: true, rec: record });
  return 'ended';
}

/* ── the response and the body ───────────────────────────────────────────── */

/** The webhook's own answer: JSON, never cached, never sniffed (`apps/worker/test/nostore.test.ts`). */
function answer(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: [
      ['content-type', 'application/json; charset=utf-8'],
      ['cache-control', 'no-store'],
      ['x-content-type-options', 'nosniff'],
    ],
  });
}

/**
 * The body as text, or `null` past `most` bytes. COUNTED AS IT ARRIVES, and a `Content-Length` over the ceiling is
 * refused before a byte is read, because a header is a claim and the count is the fact.
 */
async function bodyOf(request: Request, most: number): Promise<string | null> {
  const said = request.headers.get('content-length') ?? '';
  if (/^\d{1,15}$/u.test(said) && Number(said) > most) return null;
  const stream = request.body;
  if (stream === null) return '';
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > most) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const whole = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(whole);
}
