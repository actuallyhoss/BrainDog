/**
 * Signing up, from the browser's side: the three `/auth/signup/*` calls, the billing calls a new record is made or paid
 * through, and what the address says when somebody arrives from their mail or from Stripe.
 *
 * DESCRIBE, THEN BUILD (DIRECTION §37). The page asks "Who are you?" first and draws the BrainDog from the answer, and
 * only then asks for one email. The record's name is chosen from what was heard (`namesHeard`, `recordNames`,
 * `chooseName`), and the sentence waits for the link in `localStorage` (`keepSaid`, `saidKept`), so the tab the link
 * opens builds the record from it.
 *
 * FREE LEADS (DIRECTION §35). The site's buttons open `/signup` with no plan, and no plan is Free: checkout with
 * `plan: 'free'` makes the record there and then and answers its `/start`. `?plan=cloud` and `?plan=plus` are the
 * site's pricing buttons, and those go to Stripe's page as before.
 *
 * PLAIN TYPESCRIPT, like `auth.ts` beside it, so a test can load it in Node with a fake `fetch` and no browser. The page
 * (`routes/signup/+page.svelte`) and the no-record state on `/start` (`routes/start/NoRecord.svelte`) hold the runes.
 *
 * EVERY CALL IS AT THE ROOT, under no slug, as `/auth/switch` and `/account/records` are: sign-up and billing are the
 * person's, not a record's, and there is no record yet to name.
 *
 * THE PROOF IN THE LINK IS READ OFF THE FRAGMENT AND THEN WIPED FROM THE ADDRESS (`arrivalOf` and its `clear`), as a
 * sign-in link is, so it never reaches a server log, a `Referer` or the tab's history.
 */

/** The world the calls reach, so a test needs no socket. */
export type Io = { fetch: (url: string, init: RequestInit) => Promise<Response> };

/**
 * An answer, or the one thing the screen needs to say instead. `fix` is the host's sentence when it sent one, and `at`
 * the field it was about, so a free record refused for its plan is not offered the name to try again.
 */
export type Asked<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'refused'; fix: string | null; at?: string }
  | { ok: false; kind: 'locked'; retryAfter: number }
  | { ok: false; kind: 'unreachable' };

/** What the name check answers, and whether sign-up is open at all, and the Turnstile site key when the host asks for one. */
export type NameSeen = { slug: string; free: boolean; why: string | null; open: boolean; turnstile: string | null };

/** What spending the mailed proof answers: who was made, and what was typed at the start. */
export type Verified = { person: string; email: string; slug: string; name: string | null; tz: string | null };

/** One record the person owns, as `/account/billing` lists it. */
export type Owned = { record: string; slug: string; state: string };

/**
 * What `/account/billing` answers that this page reads: the records, whether billing is open, the price of a record on
 * the first plan sold, and each sold plan's price by its id, so a page paying for Cloud Plus names Cloud Plus's.
 */
export type Billing = { records: Owned[]; open: boolean; price: string | null; prices: Partial<Record<Plan, string>> };

/** Where somebody arrived from: their mail with a proof, Stripe with a payment, Stripe without one, or nowhere. */
export type Arrival = { kind: 'verify'; token: string } | { kind: 'paid' } | { kind: 'cancelled' } | null;

/** The plans a new record can start on: Free, which nothing sells, or one paid for on Stripe's page. */
export type Plan = 'free' | 'cloud' | 'plus';

/**
 * What the page keeps across the round trip to Stripe, in this tab only: the name asked for, the person's name, the zone,
 * and the plan. No `plan` is the checkout's own default, Cloud, which is what a record paid for without one is on.
 */
export type Held = { slug: string; name: string | null; tz: string | null; plan?: Plan };

/** The key the round trip is kept under, in `sessionStorage`. */
export const HELD_KEY = 'braindog.signup';

/**
 * The key the plan is kept under across the mail, in `localStorage`.
 *
 * NOT THE TAB'S STORAGE, because the link in the mail opens a new tab, and a person who chose Cloud Plus on the site
 * would come back to a tab that never heard of it and be made a free record. The plan alone, nothing they typed.
 */
export const PLAN_KEY = 'braindog.signup.plan';

const PLANS: readonly Plan[] = ['free', 'cloud', 'plus'];
const planIn = (v: unknown): Plan | null => (PLANS.includes(v as Plan) ? (v as Plan) : null);

/** The plan the address asks for (`?plan=`), Free when it names none or one this page does not know. */
export function planOf(search: string): Plan {
  return planIn(new URLSearchParams(search).get('plan')) ?? 'free';
}

/** The plan kept across the mail, or `null`. Storage may be off, and then nothing was kept. */
export function planKept(storage: Pick<Storage, 'getItem'> | null | undefined): Plan | null {
  try {
    return planIn(storage?.getItem(PLAN_KEY));
  } catch {
    return null;
  }
}

/** Keep the plan across the mail, or forget it once the record is made (`null`). */
export function keepPlan(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, plan: Plan | null): void {
  try {
    if (plan === null) storage?.removeItem(PLAN_KEY);
    else storage?.setItem(PLAN_KEY, plan);
  } catch {
    /* Storage off: the page falls back to Free after the mail, which is still a record, and Settings upgrades it. */
  }
}

/** Fifteen minutes, the lockout's own length, for a 429 that does not say how long. */
const LOCK_SECONDS = 900;

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function live(): Io {
  return { fetch: (url, init) => globalThis.fetch(url, init) };
}

/** One call in the `/auth` envelope. A body makes it a POST, sent as JSON because the host refuses anything else. */
async function call(io: Io, path: string, body?: Record<string, unknown>): Promise<Asked<unknown>> {
  let res: Response;
  try {
    res = await io.fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { ok: false, kind: 'unreachable' };
  }
  const said: unknown = await res.json().catch(() => undefined);
  const env = isObj(said) ? said : null;
  if (res.status === 429) {
    const n = typeof env?.retryAfter === 'number' ? env.retryAfter : Number(res.headers.get('retry-after') ?? Number.NaN);
    return { ok: false, kind: 'locked', retryAfter: Number.isFinite(n) && n > 0 ? Math.ceil(n) : LOCK_SECONDS };
  }
  if (res.ok && env?.ok === true) return { ok: true, value: env.value };
  if (env?.ok === false || (res.status >= 400 && res.status < 500)) {
    const refusal = isObj(env?.refusal) ? env.refusal : null;
    const at = str(refusal?.at);
    return { ok: false, kind: 'refused', fix: str(refusal?.fix), ...(at !== null ? { at } : {}) };
  }
  return { ok: false, kind: 'unreachable' };
}

/**
 * A record name as it would be typed into the address: lower-case, spaces and anything else as one hyphen, no hyphen
 * first, at most thirty-two characters.
 *
 * A HYPHEN LAST IS KEPT, because this runs on every keystroke and `kiln-` is how `kiln-studio` is typed. The Directory's
 * grammar is the check, asked through `checkName`, and it says a name does not end with one; this only turns
 * "Kiln Studio" into `kiln-studio` as it is typed, so most people never meet the rule.
 */
export function nameOf(typed: string): string {
  return typed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 32);
}

/**
 * A name the Directory could hand out, as far as this side can tell without asking: a letter first, two to thirty-two
 * of lower-case letters, digits and hyphens, no hyphen last, and not the shape of a spoken id such as `d41`. The
 * Directory's own check (`checkName`) still has the last word, on its reserved words too.
 */
const HANDABLE = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;
const SPOKEN = /^[a-z]{1,3}[0-9]+$/;

/** A typed name as a whole record name, or `null`: `nameOf`, then no leading digit and no hyphen last. */
function wholeName(typed: string): string | null {
  const n = nameOf(typed).replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 32).replace(/-+$/, '');
  return HANDABLE.test(n) && !SPOKEN.test(n) ? n : null;
}

/** What the first sentence named: the person, and the business or project they run, as `propose` heard them. */
export type HeardNames = { person: string | null; business: string | null };

/**
 * THE NAMES A SENTENCE GAVE, read off its proposal: the person's own name, and the first thing they run that the
 * sentence put in a list ("I run Kiln Studio" is Kiln Studio, a project). A person, a payment or a client is not the
 * business, so only an entry with a `name` that is not a person counts.
 */
export function namesHeard(p: { name: string | null; rows: readonly { register: string; fields: Record<string, unknown> }[] }): HeardNames {
  const run = p.rows.find((r) => r.register !== 'people' && typeof r.fields.name === 'string' && r.fields.name.trim() !== '');
  return { person: p.name, business: run ? String(run.fields.name) : null };
}

/**
 * THE RECORD'S NAME, FROM WHAT WAS HEARD (DIRECTION §37: describe, then make the account with one field). The business
 * first, since a record is mostly about what somebody runs; then the person; then the address's own name, so there is
 * always one to try. Each at most once, in that order.
 */
export function recordNames(heard: HeardNames, email: string): string[] {
  const local = email.trim().split('@')[0] ?? '';
  const out: string[] = [];
  for (const typed of [heard.business, heard.person, local]) {
    const n = typed === null ? null : wholeName(typed);
    if (n !== null && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * The first name the Directory says is free: each name heard as it is, then the first one with `-2` to `-9`, the way a
 * paid record taken between checkout and payment is made (`madeFor`). `null` when none is free or the host did not
 * answer, and the person is asked to choose one.
 */
export async function chooseName(names: readonly string[], check: (slug: string) => Promise<Asked<NameSeen>> = checkName): Promise<string | null> {
  const first = names[0];
  if (first === undefined) return null;
  const tries = [...names, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${first.slice(0, 29).replace(/-+$/, '')}-${n}`)];
  for (const slug of tries) {
    const out = await check(slug);
    if (!out.ok) return null;
    if (out.value.free && out.value.slug === slug) return slug;
  }
  return null;
}

/**
 * The key the first sentence is kept under while the mail travels, in `localStorage`.
 *
 * NOT THE TAB'S STORAGE, for the reason the plan is not (`PLAN_KEY`): the link opens a new tab, and the record it makes
 * is built from what was said. The words alone, never the address, and forgotten once the record is made.
 */
export const SAID_KEY = 'braindog.signup.said';

/** How long a sentence kept for the mail is good for: the link's own day, and a little over. */
const SAID_MS = 26 * 60 * 60 * 1000;

/** The longest sentence kept, as the host keeps it (2,000 characters). */
export const SAID_MOST = 2000;

/** What was said, the currency chosen for it and the use case picked by hand, kept across the mail. */
export type Draft = { said: string; currency: string | null; usecase: string | null };

/** Keep the sentence across the mail, or forget it (`null`). Storage may be off, and then the record asks again. */
export function keepSaid(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, draft: Draft | null, now: number = Date.now()): void {
  try {
    if (draft === null || draft.said.trim() === '') storage?.removeItem(SAID_KEY);
    else storage?.setItem(SAID_KEY, JSON.stringify({ said: draft.said.slice(0, SAID_MOST), currency: draft.currency, usecase: draft.usecase, at: now }));
  } catch {
    /* Storage off: the new record's /start asks "Who are you?" again, which is the whole of the cost. */
  }
}

/** The sentence kept across the mail, or `null` when none was, or it is older than the link it went with. */
export function saidKept(storage: Pick<Storage, 'getItem'> | null | undefined, now: number = Date.now()): Draft | null {
  try {
    const raw = storage?.getItem(SAID_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!isObj(v) || typeof v.said !== 'string' || v.said.trim() === '' || typeof v.at !== 'number' || now - v.at > SAID_MS || v.at > now) return null;
    return { said: v.said.slice(0, SAID_MOST), currency: str(v.currency), usecase: str(v.usecase) };
  } catch {
    return null;
  }
}

/** This browser's time zone, or `null` where the runtime will not say. */
export function zone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Whether a name is free, and whether sign-up is open here at all. An empty name asks only the second. */
export async function checkName(slug: string, io: Io = live()): Promise<Asked<NameSeen>> {
  const out = await call(io, `/auth/signup/name?slug=${encodeURIComponent(slug)}`);
  if (!out.ok) return out;
  const v = isObj(out.value) ? out.value : {};
  return {
    ok: true,
    value: {
      slug: typeof v.slug === 'string' ? v.slug : slug,
      free: v.free === true,
      why: str(v.why),
      open: v.open === true,
      turnstile: str(v.turnstile),
    },
  };
}

/** Ask for a record: the host always answers the same for an address, and the mail says the rest. */
export async function startSignup(
  ask: { email: string; slug: string; name?: string; tz?: string | null; turnstile?: string | null },
  io: Io = live(),
): Promise<Asked<null>> {
  const out = await call(io, '/auth/signup/start', {
    email: ask.email.trim(),
    slug: ask.slug.trim(),
    ...(ask.name && ask.name.trim() !== '' ? { name: ask.name.trim() } : {}),
    ...(ask.tz ? { tz: ask.tz } : {}),
    ...(ask.turnstile ? { turnstile: ask.turnstile } : {}),
  });
  return out.ok ? { ok: true, value: null } : out;
}

/** Spend the mailed proof, once: the person is made and this browser is signed in as them. */
export async function verifySignup(token: string, io: Io = live()): Promise<Asked<Verified>> {
  const out = await call(io, '/auth/signup/verify', { token });
  if (!out.ok) return out;
  const v = isObj(out.value) ? out.value : null;
  if (!v || typeof v.person !== 'string' || typeof v.email !== 'string' || typeof v.slug !== 'string') return { ok: false, kind: 'refused', fix: null };
  return { ok: true, value: { person: v.person, email: v.email, slug: v.slug, name: str(v.name), tz: str(v.tz) } };
}

/** The records this person owns and whether billing is open, with the price a new record is sold at. */
export async function billing(io: Io = live()): Promise<Asked<Billing>> {
  const out = await call(io, '/account/billing');
  if (!out.ok) return out;
  const v = isObj(out.value) ? out.value : {};
  const records = (Array.isArray(v.records) ? v.records : [])
    .filter(isObj)
    .filter((r) => typeof r.record === 'string' && typeof r.slug === 'string')
    .map((r) => ({ record: r.record as string, slug: r.slug as string, state: typeof r.state === 'string' ? r.state : 'unbilled' }));
  const plans = Array.isArray(v.plans) ? v.plans.filter(isObj) : [];
  const prices: Partial<Record<Plan, string>> = {};
  for (const p of plans) {
    const id = planIn(p.id);
    const price = str(p.price);
    if (id !== null && price !== null) prices[id] = price;
  }
  return { ok: true, value: { records, open: v.open === true, price: str(plans[0]?.price), prices } };
}

/**
 * A new record's next address: Stripe's Checkout page for a paid plan, or, for Free, the record's own `/start`, because
 * the host makes a free record there and then.
 *
 * ONLY AN `https:` ADDRESS IS GONE TO. The host builds it from Stripe's answer or its own name, and a page that followed
 * whatever came back would follow a `javascript:` one as readily.
 */
export async function checkout(held: Held, io: Io = live()): Promise<Asked<string>> {
  const out = await call(io, '/account/billing/checkout', {
    slug: held.slug,
    ...(held.name ? { name: held.name } : {}),
    ...(held.tz ? { tz: held.tz } : {}),
    ...(held.plan ? { plan: held.plan } : {}),
  });
  if (!out.ok) return out;
  const url = isObj(out.value) ? str(out.value.url) : null;
  return url !== null && url.startsWith('https://') ? { ok: true, value: url } : { ok: false, kind: 'refused', fix: null };
}

/** Open a record in this browser (`/auth/switch`): the session moves to it, and `/app` opens on it from now on. */
export async function openOwned(slug: string, io: Io = live()): Promise<Asked<null>> {
  const out = await call(io, '/auth/switch', { slug });
  return out.ok ? { ok: true, value: null } : out;
}

/**
 * The record a payment made, among the ones this person owns, or `null` while it is not made yet.
 *
 * THE NAME ASKED FOR, OR THE FIRST FREE ONE AFTER IT. A name taken between checkout and the payment is made as
 * `<name>-2` to `<name>-9` (`/account/billing/checkout`), and the welcome letter says so; the page finds it the same way.
 */
export function madeFor(records: readonly Owned[], slug: string): Owned | null {
  const exact = records.find((r) => r.slug === slug);
  if (exact) return exact;
  return records.find((r) => new RegExp(`^${slug.replace(/[^a-z0-9-]/g, '')}-[2-9]$`).test(r.slug)) ?? null;
}

/**
 * What the address's fragment says, and a way to wipe it: `#verify=` from the mail, `#paid=` or `#cancelled` from Stripe.
 *
 * `clear` RUNS ONLY WHEN THERE WAS SOMETHING TO TAKE, so a plain visit leaves the address alone.
 */
export function arrivalOf(hash: string, clear: () => void): Arrival {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const eq = h.indexOf('=');
  const word = eq === -1 ? h : h.slice(0, eq);
  const value = eq === -1 ? '' : h.slice(eq + 1);
  if (word === 'verify' && /^[A-Za-z0-9_-]{43}$/.test(value)) {
    clear();
    return { kind: 'verify', token: value };
  }
  if (word === 'paid') {
    clear();
    return { kind: 'paid' };
  }
  if (word === 'cancelled') {
    clear();
    return { kind: 'cancelled' };
  }
  return null;
}

/** What this tab kept across the round trip to Stripe, or `null`. Storage may be off, and then nothing was kept. */
export function heldOf(storage: Pick<Storage, 'getItem'> | null | undefined): Held | null {
  try {
    const raw = storage?.getItem(HELD_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!isObj(v) || typeof v.slug !== 'string' || v.slug === '') return null;
    const plan = planIn(v.plan);
    return { slug: v.slug, name: str(v.name), tz: str(v.tz), ...(plan ? { plan } : {}) };
  } catch {
    return null;
  }
}

/** Keep what the page needs when Stripe sends the person back. A tab that cannot keep it asks for the name again. */
export function hold(storage: Pick<Storage, 'setItem'> | null | undefined, held: Held): void {
  try {
    storage?.setItem(HELD_KEY, JSON.stringify(held));
  } catch {
    /* Storage off, or full: the page asks for the name again after the payment, which is the whole of the cost. */
  }
}
