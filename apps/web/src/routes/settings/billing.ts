/**
 * The one sentence Settings > Billing says, chosen by the host that answered and not by the build.
 *
 * ON THE CLOUD IT SAID "This record runs on your own machine." `loop/research-first-sign-in.md`
 * friction 5, read off a record provisioned and claimed on the Worker run the way production runs
 * it. The branch was `DEPLOYMENT.kind`, the sample's host (now `lib/record/fixtures/sample.ts`), which followed a
 * build flag that every shipped bundle set to nothing: it read `self-host` on the Cloud build, so every production
 * record was told it was on his laptop.
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
 * AND THERE IS NO THIRD CASE FOR THE SAMPLE ANY MORE (DIRECTION 26). A shell with no record behind it
 * was answered from `DEPLOYMENT.kind`, the variant the sample was built as: "This record runs on your
 * own machine" in every shipped bundle, and on the gates' Cloud build `copy.billingCloud`, "Payment is
 * up to date", over no record and no payment. A refused shell names no host and Billing never asks its
 * door, so it is told the one sentence true on both hosts, as a record that has said nothing is.
 */

import { copy } from '../../lib/copy.ts';

export const words = {
  /* TRUE ON BOTH HOSTS, which is why it is the default: a self-host is not charged either. */
  notChargedYet: 'BrainDog does not charge for this record yet.',
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
 * on this record" while the Worker holds a hosted record's runs at `ALLOWANCE.hosted`, 15,000 a month, and sends nothing past it
 * (`loop/research-batch-forty-eight-audit.md` section 2).
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

/* ── what the Cloud says each record costs (OPS-18) ─────────────────────────────────────────────────────────────── */

/** One record the person owns, as `GET /account/billing` answers it (`apps/worker/src/billing.ts`). Times are epoch ms. */
export type BilledRecord = {
  record: string;
  slug: string | null;
  state: 'active' | 'past_due' | 'lapsed' | 'unbilled';
  plan: string;
  /** The Worker's own words for the price, "$12 a month", so no figure is written twice. */
  price: string;
  periodEnd: number | null;
  lapsedAt: number | null;
  deleteOn: number | null;
};

/** The whole answer: each owned record, and whether this host takes payment at all. */
export type BillingAnswer = { records: BilledRecord[]; open: boolean };

/** The one fetch these calls need, so a test hands in its own and nothing here reaches for the page's. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const STATES = new Set(['active', 'past_due', 'lapsed', 'unbilled']);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Read one record's row, or nothing when the row is not one.
 *
 * A ROW THIS SCREEN CANNOT READ IS LEFT OUT, NOT GUESSED. A state it does not know drawn as "paid" would be the one lie
 * Billing must never tell, so a host newer than this bundle loses that row from the list until the bundle catches up.
 */
function billedOf(v: unknown): BilledRecord | null {
  if (!isObj(v) || typeof v.record !== 'string' || typeof v.state !== 'string' || !STATES.has(v.state)) return null;
  return {
    record: v.record,
    slug: typeof v.slug === 'string' ? v.slug : null,
    state: v.state as BilledRecord['state'],
    plan: typeof v.plan === 'string' ? v.plan : 'cloud',
    price: typeof v.price === 'string' ? v.price : '',
    periodEnd: num(v.period_end),
    lapsedAt: num(v.lapsed_at),
    deleteOn: num(v.delete_on),
  };
}

/** Parse the answer's `value`, or `null` when it is not the shape the Worker sends. */
export function billingOf(v: unknown): BillingAnswer | null {
  if (!isObj(v) || !Array.isArray(v.records)) return null;
  return { records: v.records.map(billedOf).filter((r): r is BilledRecord => r !== null), open: v.open === true };
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
  return answer ? { ok: true, value: answer } : { ok: false, refusal: { code: 'HTTP_200', fix: copy.billingUnread } };
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
): Promise<Said<string>> {
  const out = await door(io, `/account/billing/${kind}`, { record });
  if (!out.ok) return out;
  const url = isObj(out.value) && typeof out.value.url === 'string' ? out.value.url : null;
  return url && /^https:\/\//u.test(url) ? { ok: true, value: url } : { ok: false, refusal: { code: 'HTTP_200', fix: copy.billingUnread } };
}

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
  if (r.state === 'unbilled') return copy.billingNotBilled;
  if (r.state === 'past_due') return copy.billingPastDue;
  if (r.state === 'lapsed')
    return r.lapsedAt !== null && r.deleteOn !== null
      ? copy.billingLapsedSince(dayOf(r.lapsedAt, now), dayOf(r.deleteOn, now))
      : copy.billingLapsed;
  return r.periodEnd !== null ? copy.billingPaidThrough(dayOf(r.periodEnd, now)) : copy.billingPaid;
}

/** The plan in the person's words: "Hosted, $12 a month". */
export function planLine(r: BilledRecord): string {
  return copy.billingPlan(r.plan === 'plus' ? copy.billingPlanPlus : copy.billingPlanHosted, r.price);
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
