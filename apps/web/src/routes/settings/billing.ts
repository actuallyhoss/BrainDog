/**
 * The one sentence Settings > Billing says, chosen by the host that answered and not by the build.
 *
 * ON THE CLOUD IT SAID "This record runs on your own machine.", read
 * off a record provisioned and claimed on the Worker run the way production runs
 * it. The branch was a host baked into the build, which followed a build flag that every shipped bundle set to
 * nothing: it read `self-host` on the Cloud build, so every production record was told it was on his laptop. It
 * reads the host the record's own `boot` names now.
 * `inbound-door.ts` records the same trap for the mail door.
 *
 * `billingCloud` WAS NOT THE ANSWER EITHER. It says "Payment is up to date", and nothing on the
 * Cloud takes a payment yet, so a record that has never been billed would be told its bill is paid.
 *
 * WHAT THE HOST CAN BE ASKED TODAY IS ONE DOOR. `boot` names the record, the caller and whether
 * anybody signs in (`signIn`), and nothing about which host is serving it; `/auth/methods` says
 * which ways in exist, and a self-host and the Worker can answer it identically. The one answer that
 * only one host gives is `mintsMail`'s: 404 `ROUTE_UNKNOWN` at `/api/inbound/mint`, which the
 * self-host's `serveApi` answers and the Worker, whose mail door is real, never does. So a live
 * record keeps the self-host's sentence exactly where its host said it has no Cloud door, and every
 * other live record is told the thing that is true on both hosts.
 *
 * `host` MAKES IT A READ, AND THE INFERENCE IS NOW THE FALLBACK. `boot` carries the host's own word
 * (`Build.host` in `@braindog/record`), so a self-host is one before its mail door has been asked,
 * and a Cloud host is not taken for one because a read of that door failed. A host older than the
 * field sends none, and is judged by the door as before.
 *
 * AND THERE IS NO THIRD CASE FOR THE SAMPLE ANY MORE. A shell with no record behind it
 * was answered from `DEPLOYMENT.kind`, the variant the sample was built as: "This record runs on your
 * own machine" in every shipped bundle, and on the gates' Cloud build `copy.billingCloud`, "Payment is
 * up to date", over no record and no payment. A refused shell names no host and Billing never asks its
 * door, so it is told the one sentence true on both hosts, as a record that has said nothing is.
 */

import { copy } from '../../lib/copy.ts';
import { centsSaid, words as usageWords, type Meter } from '../../lib/record/actions.ts';

export const words = {
  /* TRUE ON BOTH HOSTS, which is why it is the default: a self-host is not charged either. */
  notChargedYet: 'BrainDog does not charge for this yet.',
  /* SLASH CREDIT PACKS, SAID AS QUESTIONS: one credit is one question, and "questions" is the one word the site and the
     app use for Slash's allowance (E17). The heading over the buttons, each button's own words, and what is left. */
  buyCredits: 'More Slash questions',
  packButton: (credits: number, price: string) => `${credits.toLocaleString('en-GB')} questions, ${price}`,
  /** The button's whole name for a screen reader, which keeps the words it shows. */
  packSaid: (credits: number, price: string) => `Buy ${credits.toLocaleString('en-GB')} more Slash questions, ${price}`,
  creditsLeft: (n: number) => `Extra questions from packs: ${n.toLocaleString('en-GB')}. They do not run out at the month's end.`,
  /* A PLAN THAT IS A GIFT: said where the plan's price is, and when it ends if it does. */
  gift: (plan: string) => `${plan}, a gift from BrainDog`,
  giftUntil: (day: string) => `Given until ${day}.`,
  /* WHAT A PLAN HOLDS, in the site's words: Slash questions and AI tools (N1, E17). */
  questionsMonth: (n: number) => `${n.toLocaleString('en-GB')} Slash questions a month`,
  toolsAtOnce: (n: number) => `${n.toLocaleString('en-GB')} AI tools`,
  secondPerson: 'room for a second person',
  questionsBar: (used: number, of: number) => `Slash questions · ${used.toLocaleString('en-GB')} of ${of.toLocaleString('en-GB')}`,
  toolsBar: (used: number, of: number) => `AI tools connected · ${used.toLocaleString('en-GB')} of ${of.toLocaleString('en-GB')}`,
  /* A LIMIT REACHED, KINDLY: what stops, what still works, and when it comes back. The way on is the buttons beside it. */
  questionsFull: (resets: string) => `This month's Slash questions are used. Slash comes back on ${resets}; until then your own rules still read what you tell it.`,
  questionsNear: (left: number) => `${left === 1 ? '1 Slash question is' : `${left.toLocaleString('en-GB')} Slash questions are`} left this month.`,
  toolsFull: 'Every AI tool this plan connects is connected. Disconnect one in Settings > Agents to connect another.',
  meterFull: (noun: string, resets: string) => `This month's ${noun} are used, so automations wait until ${resets}. Nothing you made is touched.`,
  /* INVOICES, under the record's plan. */
  invoicesTitle: 'Invoices',
  invoicesNone: 'No invoices yet. Each payment adds one here.',
  invoicesUnread: 'Your invoices could not be read just now. Try again in a minute.',
  invoiceOpen: 'Not paid yet',
  invoiceVoid: 'Cancelled',
  invoiceUnpaid: 'Unpaid',
  invoiceView: 'View',
  invoicePdf: 'PDF',
  invoicesAll: 'All invoices and receipts are on Stripe’s page.',
  taxAdded: 'Tax is worked out on Stripe’s page from your address.',
};

export type Billed = {
  /** The shell's `live`: a record answered `boot`. */
  live: boolean;
  /** The shell's `host`: what `boot` said the host is, absent when it did not say. It wins over `mintsMail`. */
  host?: 'cloud' | 'self-host' | undefined;
  /** `mintsMail`'s answer, `null` until the host has been asked. `false` is the self-host saying so. */
  mintsMail: boolean | null;
};

export function billingLine(b: Pick<Billed, 'host' | 'mintsMail'>): string {
  const selfHost = b.host === undefined ? b.mintsMail === false : b.host === 'self-host';
  return selfHost ? copy.billingSelfHost : words.notChargedYet;
}

/**
 * Whether this record's scheduled calls are counted against the hosted allowance, which is what `<CallsOut hosted>` asks.
 *
 * FIVE PROPS ANSWERED IT FROM THE BUILD, AND A SIXTH FROM NOTHING AT ALL. The Packs screen's diff and offer, a shared
 * plan, the Settings plan and the Decide gate passed `DEPLOYMENT.kind !== 'self-host'`, which is `false` in the bundle
 * production serves, and the automation builder passed `false`. So on the Cloud `estimateOf` said "with no monthly limit
 * on this record" while the Worker holds a hosted record's runs at `ALLOWANCE.hosted`, 15,000 a month, and sends nothing past it.
 *
 * A LIVE RECORD WITH NO `host` IS NOT HOSTED. Every Worker at HEAD sends one, so a host that sends none is a self-host
 * older than the field, and telling it about an allowance it does not have would be the same mistake the other way.
 * The mail door `billingLine` falls back to is not asked here either: the only host that sends no `host` is a
 * self-host, and the door could only say so again.
 *
 * AND A SHELL WITH NO RECORD IS NOT HOSTED EITHER. It was answered from the build, `DEPLOYMENT.kind`, so the gates'
 * Cloud variant counted calls against an allowance on a screen with no record to hold one. What was asked of the build
 * is asked of the host now, and a host that did not answer `boot` has said nothing.
 */
export function hostedHere(shell: Pick<Billed, 'live' | 'host'>): boolean {
  return shell.live && shell.host === 'cloud';
}

/* ── what the Cloud says each record costs ──────────────────────────────────────────────────────────────────────── */

/** One record the person owns, as `GET /account/billing` answers it (`apps/worker/src/billing.ts`). Times are epoch ms. */
export type BilledRecord = {
  record: string;
  slug: string | null;
  state: 'active' | 'past_due' | 'lapsed' | 'unbilled';
  /** `free`, `cloud` or `plus`. A free record is `unbilled` and on `free`: nothing is sold for it. */
  plan: string;
  /** The Worker's own words for the price, "$12 a month", so no figure is written twice. */
  price: string;
  periodEnd: number | null;
  lapsedAt: number | null;
  deleteOn: number | null;
  /** Slash credits left from packs, `null` from a host older than packs. They do not end with the month. */
  credits: number | null;
  /** The operator gave this plan: never charged, nothing at Stripe to manage. */
  gift: boolean;
  /** What the plan holds, the one table's figures as the Worker sends them; `null` from a host older than the field. */
  limits: Limits | null;
};

/**
 * What a plan holds that a person counts: Slash questions a month, AI tools connected at once, people, runs a month,
 * and whether a second person may join (Cloud Plus). `null` in a field is no limit. The Worker's `limitsOf`, read off the one table of plans.
 */
export type Limits = { questions: number | null; tools: number | null; people: number | null; runs: number | null; teams: boolean };

/** A plan this host sells, in the Worker's own words: `{ id: 'cloud', name: 'Cloud', price: '$12 a month' }`. */
export type SoldPlan = { id: string; name: string; price: string; limits: Limits | null };

/** A pack of Slash credits this host sells: `{ id: 'credits-100', credits: 100, price: '$5' }`, the price in its words. */
export type SoldPack = { id: string; credits: number; price: string };

/** The whole answer: each owned record, whether this host takes payment at all, and the plans and packs it sells. */
export type BillingAnswer = {
  records: BilledRecord[];
  open: boolean;
  plans: SoldPlan[];
  packs: SoldPack[];
  teamsHeld: boolean;
  /** Whether this host sells extra usage past the allowance. Absent from a host older than it, which sells none. */
  extra?: boolean;
  /** Whether Stripe adds tax at checkout on this host. */
  tax?: boolean;
};

/** The one fetch these calls need, so a test hands in its own and nothing here reaches for the page's. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/* `comp` IS THE DIRECTORY'S WORD FOR A GIFT, read as a plan that is on and given, so a host that sends it loses no row. */
const STATES = new Set(['active', 'past_due', 'lapsed', 'unbilled', 'comp']);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

/** A plan's limits as the Worker sent them, or `null` when it sent none. */
const limitsOf = (v: unknown): Limits | null =>
  isObj(v) ? { questions: whole(v.questions), tools: whole(v.tools), people: whole(v.people), runs: whole(v.runs), teams: v.teams === true } : null;

/**
 * Read one record's row, or nothing when the row is not one.
 *
 * A ROW THIS SCREEN CANNOT READ IS LEFT OUT, NOT GUESSED. A state it does not know drawn as "paid" would be the one lie
 * Billing must never tell, so a host newer than this bundle loses that row from the list until the bundle catches up.
 */
function billedOf(v: unknown): BilledRecord | null {
  if (!isObj(v) || typeof v.record !== 'string' || typeof v.state !== 'string' || !STATES.has(v.state)) return null;
  const credits = num(v.credits);
  return {
    record: v.record,
    slug: typeof v.slug === 'string' ? v.slug : null,
    state: v.state === 'comp' ? 'active' : (v.state as BilledRecord['state']),
    plan: typeof v.plan === 'string' ? v.plan : 'cloud',
    price: typeof v.price === 'string' ? v.price : '',
    periodEnd: num(v.period_end),
    lapsedAt: num(v.lapsed_at),
    deleteOn: num(v.delete_on),
    credits: credits === null ? null : Math.max(0, Math.floor(credits)),
    gift: v.gift === true || v.state === 'comp',
    limits: limitsOf(v.limits),
  };
}

/** One pack on sale, or nothing: a pack with no whole number of credits or no price is not offered. */
const packOf = (v: unknown): SoldPack | null =>
  isObj(v) && typeof v.id === 'string' && v.id && Number.isInteger(v.credits) && (v.credits as number) > 0 && typeof v.price === 'string' && v.price
    ? { id: v.id, credits: v.credits as number, price: v.price }
    : null;

/** One sold plan, or nothing when it is not one: a plan with no name or no price is not offered. */
const soldOf = (v: unknown): SoldPlan | null =>
  isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.price === 'string' && v.name && v.price
    ? { id: v.id, name: v.name, price: v.price, limits: limitsOf(v.limits) }
    : null;

/**
 * Parse the answer's `value`, or `null` when it is not the shape the Worker sends. A host older than `plans` sells none,
 * and a host older than `packs` sells no credits, so its answer draws the screen as it was before packs.
 */
export function billingOf(v: unknown): BillingAnswer | null {
  if (!isObj(v) || !Array.isArray(v.records)) return null;
  return {
    records: v.records.map(billedOf).filter((r): r is BilledRecord => r !== null),
    open: v.open === true,
    teamsHeld: v.teams_held === true,
    extra: v.extra === true,
    tax: v.tax === true,
    plans: Array.isArray(v.plans) ? v.plans.map(soldOf).filter((p): p is SoldPlan => p !== null) : [],
    packs: Array.isArray(v.packs) ? v.packs.map(packOf).filter((p): p is SoldPack => p !== null) : [],
  };
}

type Refusal = { ok: false; refusal: { code: string; fix: string; detail?: string | undefined } };
export type Said<T> = { ok: true; value: T } | Refusal;

/**
 * One call to an `/account/billing` door, answered in the shape `read()` takes (`lib/data/read.ts`).
 *
 * THE NETWORK FAILING IS `UNREACHABLE`, the one code `read()` draws as offline with Retry, and a host that answers
 * with something that is not its envelope is refused with the screen's own sentence rather than drawn as empty.
 */
async function door(io: Fetch, path: string, body?: Record<string, unknown>): Promise<Said<unknown>> {
  let res: Response;
  try {
    res = await io(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    return { ok: false, refusal: { code: 'UNREACHABLE', fix: copy.billingUnread, detail: e instanceof Error ? e.message : String(e) } };
  }
  const env: unknown = await res.json().catch(() => undefined);
  if (isObj(env) && env.ok === true) return { ok: true, value: env.value };
  const r = isObj(env) && isObj(env.refusal) ? env.refusal : null;
  return {
    ok: false,
    refusal: {
      code: r && typeof r.code === 'string' ? r.code : `HTTP_${res.status}`,
      fix: r && typeof r.fix === 'string' && r.fix ? r.fix : copy.billingUnread,
    },
  };
}

/** Each record this person owns, and what the Cloud says it costs. Only the Cloud has the door; a self-host answers 404. */
export async function readBilling(io: Fetch = (u, i) => globalThis.fetch(u, i)): Promise<Said<BillingAnswer>> {
  const out = await door(io, '/account/billing');
  if (!out.ok) return out;
  const answer = billingOf(out.value);
  return answer ? { ok: true, value: answer } : { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: copy.billingUnread } };
}

/**
 * Ask for the page a payment is made or managed on, and answer its address.
 *
 * `portal` IS STRIPE'S OWN PAGE for a record already paid for, and `checkout` WITH `record` IS PAYING AGAIN for one that
 * lapsed. Both answer `{ url }` and the screen sends the person there; nothing here claims a payment was made.
 */
export async function paymentPage(
  kind: 'portal' | 'checkout',
  record: string,
  io: Fetch = (u, i) => globalThis.fetch(u, i),
  /** The plan to pay for: a free record's upgrade names it, and paying again leaves it to the Worker's default. */
  plan?: string,
): Promise<Said<string>> {
  return pageOf(await door(io, `/account/billing/${kind}`, { record, ...(plan ? { plan } : {}) }));
}

/** The most a monthly cap on extra usage may be, in cents: the Worker's `EXTRA_CAP_MOST`, the one table's. */
export const EXTRA_CAP_MOST = 100_000;

/**
 * Whether this record may turn extra usage on: the host sells it, and the record is paid for on Cloud or Cloud Plus and
 * not lapsed. A gift is never charged, and Free has none.
 */
export const extraOffered = (r: BilledRecord | null, answer: BillingAnswer | null): boolean =>
  r !== null && answer !== null && answer.extra === true && !r.gift && (r.state === 'active' || r.state === 'past_due') && (r.plan === 'cloud' || r.plan === 'plus');

/**
 * A cap typed in whole currency units ("20", "12.50") as cents, or `null` when it is not one: a sum from a cent to
 * `EXTRA_CAP_MOST`, at most two places. Turning extra usage off is its own press, never a typed 0.
 */
export function capCents(typed: string): number | null {
  const t = typed.trim().replace(/^\$/u, '');
  if (!/^\d{1,4}(?:\.\d{1,2})?$/u.test(t)) return null;
  const [whole = '0', part = ''] = t.split('.');
  const cents = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  return cents >= 1 && cents <= EXTRA_CAP_MOST ? cents : null;
}

/**
 * Set the monthly cap on a record's extra usage, in cents, or turn it off with 0. Answers the Worker's own refusal when
 * it will not: the host does not sell it, the plan has none, or Stripe could not be reached.
 */
export async function setExtraCap(record: string, cents: number, io: Fetch = (u, i) => globalThis.fetch(u, i)): Promise<Said<unknown>> {
  return door(io, '/account/billing/extra', { record, cap_cents: cents });
}

/**
 * Ask for Stripe's page that sells one pack of Slash credits to this record, and answer its address.
 *
 * THE SAME CHECKOUT DOOR, NAMING A PACK AND NO PLAN, so the Worker starts a one-off payment and no subscription. The
 * credits are added by Stripe's webhook, never by this screen: coming back only reads billing again.
 */
export async function packPage(record: string, pack: string, io: Fetch = (u, i) => globalThis.fetch(u, i)): Promise<Said<string>> {
  return pageOf(await door(io, '/account/billing/checkout', { record, pack }));
}

/** A door's `{ url }` as the address to go to, and only Stripe's kind of address: `https`, never a path or a script. */
/** One invoice as `POST /account/billing/invoices` lists it (`InvoiceSeen` in `apps/worker/src/stripe.ts`). */
export type Invoice = {
  id: string;
  number: string | null;
  at: number;
  cents: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  url: string | null;
  pdf: string | null;
};

const INVOICE_STATES = new Set(['paid', 'open', 'void', 'uncollectible']);
const httpsOr = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://') ? v : null);

/** One invoice, or nothing when it is not one the screen can say truly. */
function invoiceOf(v: unknown): Invoice | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.status !== 'string' || !INVOICE_STATES.has(v.status)) return null;
  const at = num(v.at);
  const cents = num(v.cents);
  if (at === null || cents === null || !Number.isInteger(cents)) return null;
  return {
    id: v.id,
    number: typeof v.number === 'string' && v.number ? v.number : null,
    at,
    cents,
    currency: typeof v.currency === 'string' && /^[A-Z]{3}$/u.test(v.currency) ? v.currency : 'USD',
    status: v.status as Invoice['status'],
    url: httpsOr(v.url),
    pdf: httpsOr(v.pdf),
  };
}

/** The newest invoices of the customer a record this person owns pays as, newest first. */
export async function readInvoices(record: string, io: Fetch = (u, i) => globalThis.fetch(u, i)): Promise<Said<Invoice[]>> {
  const out = await door(io, '/account/billing/invoices', { record });
  if (!out.ok) return out;
  const list = isObj(out.value) && Array.isArray(out.value.invoices) ? out.value.invoices : null;
  if (list === null) return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: words.invoicesUnread } };
  return { ok: true, value: list.map(invoiceOf).filter((i): i is Invoice => i !== null) };
}

/** An invoice's amount as a person reads it: the plans' currency by the one writer, any other by its code. */
export const invoiceAmount = (i: Pick<Invoice, 'cents' | 'currency'>, home: string | null = null): string =>
  i.currency === 'USD' ? centsSaid(i.cents, home) : `${(i.cents / 100).toFixed(2)} ${i.currency}`;

/** An invoice's state in a word or two, said only when it is not simply paid. */
export const invoiceState = (i: Pick<Invoice, 'status'>): string | null =>
  i.status === 'paid' ? null : i.status === 'open' ? words.invoiceOpen : i.status === 'void' ? words.invoiceVoid : words.invoiceUnpaid;

function pageOf(out: Said<unknown>): Said<string> {
  if (!out.ok) return out;
  const url = isObj(out.value) && typeof out.value.url === 'string' ? out.value.url : null;
  return url && /^https:\/\//u.test(url) ? { ok: true, value: url } : { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: copy.billingUnread } };
}

/**
 * Whether this address is the one Stripe sends a person back to after paying: `#paid=…` (the checkout's success
 * address), or `#credits=…` should the pack's checkout name its own. The screen then reads billing again once the
 * webhook has had a moment, because the person may land before the credits do.
 */
export const backFromCheckout = (hash: string): boolean => /^#(?:paid|credits|pack)=/u.test(hash);

/**
 * A day as Billing says it: "24 October", with the year only when it is not this one.
 *
 * UTC, BECAUSE THE WORKER COUNTS IN UTC. A period that ends at midnight UTC read in a zone behind it would be told as
 * ending the day before, which on the lapse sentence is a day of deletion said wrong.
 */
export function dayOf(ms: number, now: number): string {
  const d = new Date(ms);
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * The state of one record's bill in one sentence, which is all Billing says about it.
 *
 * EACH STATE SAYS WHAT HAPPENS NEXT, because a bill that is fine needs no action and every other one needs a specific
 * one: a failed payment is retried by Stripe and fixed by a new card, and a lapsed record is read-only with a date it
 * goes, and can always be exported. A record with no row was made by the operator and is not billed.
 */
export function stateLine(r: BilledRecord, now: number): string {
  /* A GIFT HAS NO BILL TO STAND ANYWHERE: it says when it ends, and nothing when it does not, never "Paid". */
  if (r.gift) return r.periodEnd !== null ? words.giftUntil(dayOf(r.periodEnd, now)) : '';
  if (r.state === 'unbilled') return copy.billingNotBilled;
  if (r.state === 'past_due') return copy.billingPastDue;
  if (r.state === 'lapsed')
    return r.lapsedAt !== null && r.deleteOn !== null
      ? copy.billingLapsedSince(dayOf(r.lapsedAt, now), dayOf(r.deleteOn, now))
      : copy.billingLapsed;
  return r.periodEnd !== null ? copy.billingPaidThrough(dayOf(r.periodEnd, now)) : copy.billingPaid;
}

/**
 * The plan in the person's words: "Cloud, $12 a month", a free record's "Free" with no price beside it, and a gift's
 * "Cloud, a gift from BrainDog", where a price would only say what is never charged.
 */
export function planLine(r: BilledRecord): string {
  if (r.plan === 'free') return copy.billingPlanFree;
  const name = r.plan === 'plus' ? copy.billingPlanPlus : copy.billingPlanHosted;
  return r.gift ? words.gift(name) : copy.billingPlan(name, r.price);
}

/** What a record's line says beside its name: its plan, or that it is not billed (a record the operator made). */
export function planShown(r: BilledRecord): string {
  return r.plan === 'free' || r.gift || r.state !== 'unbilled' ? planLine(r) : copy.billingNotBilled;
}

/** Whether Stripe's own page has anything to manage for this record: a gift and a record with no row have nothing there. */
export const managedAtStripe = (r: BilledRecord, answer: BillingAnswer): boolean => answer.open && r.state !== 'unbilled' && !r.gift;

/**
 * What a record says of Slash credit packs: what is left of them, and the packs it can buy, or nothing at all.
 *
 * NOTHING IS OFFERED WHILE THE HOST SELLS NO PACK, so an answer from a host older than packs, or one with billing off
 * or no pack price set, draws the screen as it was. The Worker sends `packs` only while it sells them, which needs no
 * plan price, so `open` (which is the plans') is not asked: a host that sells packs and no plan still sells packs. A
 * lapsed record is offered none: the checkout refuses it until it is paid. The credits left are said whenever there are some.
 */
export function packsOf(r: BilledRecord, answer: BillingAnswer): { left: string | null; buy: { pack: SoldPack; label: string; said: string }[] } {
  const left = r.credits !== null && r.credits > 0 ? words.creditsLeft(r.credits) : null;
  const buy =
    r.state !== 'lapsed'
      ? answer.packs.map((pack) => ({ pack, label: words.packButton(pack.credits, pack.price), said: words.packSaid(pack.credits, pack.price) }))
      : [];
  return { left, buy };
}

/**
 * The paid plan a free record is offered, and the one sentence that offers it, or `null` when there is none.
 *
 * ONE OFFER, CALMLY: the first plan the host sells, which is Cloud, said once under the record with its
 * price in the Worker's words. Nothing is offered while the host takes no payment, because the button could only fail.
 */
export function upgradeOf(r: BilledRecord, answer: BillingAnswer): { plan: SoldPlan; line: string; also: SoldPlan | null } | null {
  /* A GIFT IS OFFERED NOTHING TO PAY FOR: the checkout refuses one, so the button could only fail. */
  if (r.plan !== 'free' || r.gift || !answer.open) return null;
  const plan = answer.plans[0];
  return plan ? { plan, line: copy.billingFreeOffer(plan.name, plan.price, moreOf(plan.limits)), also: answer.plans[1] ?? null } : null;
}

/** What a plan holds, said for an offer: "80 Slash questions a month and 15 AI tools", or `null` with no figures. */
export function moreOf(l: Limits | null): string | null {
  if (l === null) return null;
  const parts = [
    l.questions !== null ? words.questionsMonth(l.questions) : null,
    l.tools !== null ? words.toolsAtOnce(l.tools) : null,
    l.teams ? words.secondPerson : null,
  ].filter((x): x is string => x !== null);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
}

/**
 * The plan above a paid record's, offered as a switch on Stripe's own page: Cloud to Cloud Plus. `null` on the top plan,
 * a gift, a lapsed record (which pays again on the plan it picks) and while the host takes no payment.
 */
export function moveUpOf(r: BilledRecord, answer: BillingAnswer): SoldPlan | null {
  if (!answer.open || r.gift || r.state === 'lapsed' || r.state === 'unbilled' || r.plan !== 'cloud') return null;
  return answer.plans.find((p) => p.id === 'plus') ?? null;
}

/* ── the meters a plan is held to ── */

/** One bar on the Plan and usage tile. */
export type LimitBar = { label: string; value: number; tone?: 'ink' | 'danger' };

/** The share past which a meter is near its limit, as `/usage` says it. */
const NEAR = 0.8;

/**
 * The tile's bars: Slash questions and AI tools first, against the plan's own figures, because those are the two the site
 * sells; then the ledger's four meters (runs, requests, data fetched, run time). And the limits reached, each said once.
 *
 * `questions` IS THIS MONTH'S QUESTIONS AS SLASH COUNTED THEM, `tools` the AI tools connected now; either `null` when it
 * could not be read, and then that bar is left out rather than drawn at nothing. A limit of `null` is no limit and draws
 * no bar. A full meter is red, the nearest of the rest is ink, the others grey.
 */
export function limitBars(args: { limits: Limits | null; questions: number | null; tools: number | null; meters: readonly Meter[]; resets: string }): {
  bars: LimitBar[];
  full: string[];
  near: string[];
} {
  const out: { bar: LimitBar; share: number; full: string | null; near: string | null }[] = [];
  const l = args.limits;
  if (l !== null && l.questions !== null && args.questions !== null) {
    const share = l.questions > 0 ? args.questions / l.questions : 1;
    out.push({
      bar: { label: words.questionsBar(args.questions, l.questions), value: Math.min(1, share) },
      share,
      full: share >= 1 ? words.questionsFull(args.resets) : null,
      near: share >= NEAR && share < 1 ? words.questionsNear(l.questions - args.questions) : null,
    });
  }
  if (l !== null && l.tools !== null && args.tools !== null) {
    const share = l.tools > 0 ? args.tools / l.tools : 1;
    out.push({ bar: { label: words.toolsBar(args.tools, l.tools), value: Math.min(1, share) }, share, full: share >= 1 ? words.toolsFull : null, near: null });
  }
  for (const [i, b] of meterBars(args.meters).entries()) {
    const m = args.meters[i]!;
    out.push({ bar: { label: b.label, value: b.value }, share: m.share, full: m.share >= 1 ? words.meterFull(usageWords.meterNoun[m.key] ?? m.key, args.resets) : null, near: null });
  }
  const top = out.filter((o) => o.share < 1).sort((a, b) => b.share - a.share)[0];
  const bars = out.map((o) => (o.share >= 1 ? { ...o.bar, tone: 'danger' as const } : o === top && o.share > 0 ? { ...o.bar, tone: 'ink' as const } : o.bar));
  return { bars, full: out.flatMap((o) => (o.full ? [o.full] : [])), near: out.flatMap((o) => (o.near ? [o.near] : [])) };
}

/**
 * How many AI tools a record has connected now, from its keys: live (not revoked, not past their life, not ended by the
 * operator) and an agent's, which leaves out a report key and a run's own key, as the kernel's `liveAgents` counts them.
 */
export function toolsConnected(keys: readonly { label: string | null; expires_at: string | null; revoked_at: string | null; ended_by?: string }[], now: number): number {
  return keys.filter(
    (k) =>
      k.revoked_at === null &&
      k.ended_by === undefined &&
      (k.expires_at === null || Date.parse(k.expires_at) > now) &&
      !(k.label ?? '').startsWith('report:') &&
      !(k.label ?? '').startsWith('job:'),
  ).length;
}

/**
 * What the shell's banner says over a lapsed record: the Worker's own refusal, and the day it is deleted when known.
 *
 * THE SAME WORDS AS A REFUSED WRITE, because a person who has just been refused and then reads the banner should read
 * one fact about one record. `null` for any record that is not lapsed, which is every record the banner stays out of.
 */
export function lapseLines(r: BilledRecord | null, now: number): { fix: string; deletes: string | null } | null {
  if (r?.state !== 'lapsed') return null;
  return { fix: copy.lapsedFix, deletes: r.deleteOn !== null ? copy.lapseDeletes(dayOf(r.deleteOn, now)) : null };
}

/** The one owned record the shell is on, when the answer has it: the banner and the area each find it by address. */
export function thisRecord(answer: BillingAnswer | null, slug: string | null | undefined): BilledRecord | null {
  if (!answer || !slug) return null;
  return answer.records.find((r) => r.slug === slug) ?? null;
}

/* ── what the Settings tiles draw: the meters, the nightly strip and the doors ────────────────────── */

/*
 * PURE, AND HERE, so `node --test` holds every sentence a tile says. The areas draw the tiles; what each tile means is
 * worked out below from the record's own answers, and a tile with nothing true to say is not drawn.
 */

/** The words the Settings tiles add. A sentence another screen already says is read from there, never typed twice. */
export const tileWords = {
  planTitle: 'Plan and usage',
  /** When a limit comes back, where the ledger has not said the day. */
  nextMonth: 'the 1st of next month',
  /** The tile's meta: where the month is, and the day it starts again. */
  monthMeta: (day: number, of: number, resets: string) => `day ${day} of ${of} · resets ${resets}`,
  /** What the bars are, read out before the bars themselves. */
  metersSubject: "This month's allowance, used",
  copiesTitle: 'Nightly copies',
  copiesMeta: (kept: number) => `every night · last ${kept} kept`,
  /** The strip's right-hand end, under it. */
  /* THE RIGHT-HAND SQUARE IS TODAY, and a copy taken this morning is today's (AI22). */
  stripTo: 'today',
  everyNight: (n: number) => `Every one of the last ${n} nights was copied.`,
  sinceFirst: (n: number, first: string) =>
    n === 1 ? `The first copy was taken on ${first}.` : `A copy on each of the last ${n} nights, since the first on ${first}.`,
  missed: (m: number, n: number, last: string) =>
    m === 1 ? `1 of the last ${n} nights has no copy: ${last}.` : `${m} of the last ${n} nights have no copy, the last on ${last}.`,
  /** The strip read aloud, which the reading line under it then explains. */
  stripSaid: (copied: number, n: number, missed: number) =>
    `A copy on ${copied} of the last ${n} nights` + (missed > 0 ? `, and ${missed} with none` : '') + '.',
};

/** Where this month is, in UTC as the Worker counts it: the 29th of a 30-day month is `{ day: 29, of: 30 }`. */
export function monthDay(now: number): { day: number; of: number } {
  const d = new Date(now);
  return { day: d.getUTCDate(), of: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() };
}

/** A share as the chart writes it: `53%`, and `<1%` for a little, never `0%` for something. */
export const shareOf = (share: number): string =>
  !Number.isFinite(share) || share <= 0 ? '0%' : share < 0.01 ? '<1%' : `${Math.floor(Math.min(share, 1) * 100)}%`;

/**
 * One bar per meter: the meter's short name and what it has used ("Runs · 18,400 of 75,000"), and its share.
 *
 * THE NEAREST ONE IS INK AND THE REST ARE GREY: the binding meter is the one the month turns on. The figures are
 * `Meter.line` without the name it starts with, so they are the ledger's own and never counted twice.
 */
export function meterBars(meters: readonly Meter[]): { label: string; value: number; note?: string; tone?: 'ink' }[] {
  return meters.map((m) => {
    const name = usageWords.meterName[m.key] ?? m.key;
    const note = m.line.startsWith(`${name} `) ? m.line.slice(name.length + 1) : undefined;
    /* THE FIGURES IN THE LABEL, BESIDE THE BAR: drawn as the bar's note they sat on the empty
       track of a month that had barely started, and the bar ran behind them. */
    return {
      label: note ? `${name} · ${note}` : name,
      value: Math.min(1, Math.max(0, m.share)),
      ...(m.binding ? { tone: 'ink' as const } : {}),
    };
  });
}

/* ── the nightly copies, one square a night ── */

/** What one night of the strip is: copied, missed after the first copy, before the first copy kept, or not due yet. */
export type NightState = 'copied' | 'missed' | 'before' | 'due';
export type Night = { day: string; state: NightState };

/**
 * THE HOUR (UTC) BY WHICH A NIGHT'S COPY HAS RUN. The Cloud copies at 03:17 UTC and a self-host between 02:00 and 03:00
 * (`Backups.svelte` says where each is written), so before six this morning's copy is due rather than missed.
 */
export const NIGHT_DUE_HOUR = 6;

const DAY_MS = 86_400_000;
const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * The last `n` nights, oldest first, each marked by whether a copy was kept that night.
 *
 * A GAP IS ONLY A MISS AFTER THE FIRST COPY KEPT. A record made a week ago has no copies from the three weeks before
 * it existed, and a host that prunes the oldest copy first keeps no copy of a night older than the ones it holds;
 * neither is a failure, so every night before the first copy kept is `before` and drawn quiet. A night after it with no
 * copy really had none, since pruning never takes a newer copy than one it keeps.
 */
export function nightsOf(copies: readonly { at: string }[], now: number, n = 30): Night[] {
  const kept = new Set<string>();
  for (const c of copies) {
    const ms = Date.parse(c.at);
    if (Number.isFinite(ms)) kept.add(dayKey(ms));
  }
  const first = [...kept].sort()[0];
  const today = dayKey(now);
  const early = new Date(now).getUTCHours() < NIGHT_DUE_HOUR;
  const nights: Night[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = dayKey(now - i * DAY_MS);
    const state: NightState = kept.has(day)
      ? 'copied'
      : first === undefined || day < first
        ? 'before'
        : day === today && early
          ? 'due'
          : 'missed';
    nights.push({ day, state });
  }
  return nights;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A night as the tile says it: `24 Sep`, the way a copy's own day is written in the list under it. */
export const nightWords = (day: string): string => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/u.exec(day);
  return m ? `${Number(m[2])} ${SHORT_MONTHS[Number(m[1]) - 1] ?? m[1]}` : day;
};

export type NightTone = 'ink' | 'g2' | 'g4' | 'danger';

/**
 * The strip as the waffle takes it: one part per run of nights in one state, in order, so thirty squares in one row
 * read left to right as the thirty nights. A copied night is grey and the newest copy ink; a
 * miss is the red of what needs him; a night before the first copy, or not due yet, is the quietest grey.
 */
export function nightParts(nights: readonly Night[]): { label: string; value: number; tone: NightTone }[] {
  const newest = nights.map((x) => x.state).lastIndexOf('copied');
  const parts: { label: string; value: number; tone: NightTone }[] = [];
  nights.forEach((night, i) => {
    const tone: NightTone = i === newest ? 'ink' : night.state === 'copied' ? 'g2' : night.state === 'missed' ? 'danger' : 'g4';
    const last = parts[parts.length - 1];
    if (last && last.tone === tone && tone !== 'ink') last.value++;
    else parts.push({ label: night.state, value: 1, tone });
  });
  return parts;
}

/** The strip read aloud: how many nights have a copy and how many have none. */
export function nightsSaid(nights: readonly Night[]): string {
  const copied = nights.filter((x) => x.state === 'copied').length;
  const missed = nights.filter((x) => x.state === 'missed').length;
  return tileWords.stripSaid(copied, nights.length, missed);
}

/** The one line under the strip, saying what it means. */
export function nightsLine(nights: readonly Night[]): string {
  const copied = nights.filter((x) => x.state === 'copied');
  const missed = nights.filter((x) => x.state === 'missed');
  const lastMissed = missed[missed.length - 1];
  if (lastMissed) return tileWords.missed(missed.length, copied.length + missed.length, nightWords(lastMissed.day));
  if (nights.some((x) => x.state === 'before') && copied[0]) return tileWords.sinceFirst(copied.length, nightWords(copied[0].day));
  return tileWords.everyNight(copied.length);
}

/* ── the doors a record takes things in at ── */

/** The words the Doors tile adds: its title, and one short state a door is in. */
export const doorWords = {
  title: 'Doors',
  on: 'On',
  off: 'Off',
  otherCheck: 'Checked another way',
  allOn: (n: number) => (n === 1 ? 'The door has an address in use, so it takes things in.' : `All ${n} doors have an address in use, so each takes things in.`),
  someOff: (off: number, of: number) =>
    off === 1 && of === 1
      ? 'The door has no address yet, so nothing arrives through it.'
      : `${off} of ${of} doors ${off === 1 ? 'has' : 'have'} no address yet, so nothing arrives through ${off === 1 ? 'it' : 'them'}.`,
  noneMade: 'Every door here checks its senders another way, so there is no address to make.',
};

/** A door as the tile says it: on while an address is in use, off with none, or checked some other way. */
export const doorState = (d: { mintable: boolean; held: boolean }): 'on' | 'off' | 'other' => (!d.mintable ? 'other' : d.held ? 'on' : 'off');

/** The one line under the doors, saying how many take things in and what an unused one means. */
export function doorsLine(doors: readonly { mintable: boolean; held: boolean }[]): string {
  const minted = doors.filter((d) => d.mintable);
  const off = minted.filter((d) => !d.held).length;
  if (minted.length === 0) return doorWords.noneMade;
  return off === 0 ? doorWords.allOn(minted.length) : doorWords.someOff(off, minted.length);
}
