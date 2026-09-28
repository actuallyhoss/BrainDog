/**
 * Signing up, from the browser's side: the three `/auth/signup/*` calls, the billing calls a new record is paid through,
 * and what the address says when somebody arrives from their mail or from Stripe (`loop/finish/ops.md` OPS-17).
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

/** An answer, or the one thing the screen needs to say instead. `fix` is the host's sentence when it sent one. */
export type Asked<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'refused'; fix: string | null }
  | { ok: false; kind: 'locked'; retryAfter: number }
  | { ok: false; kind: 'unreachable' };

/** What the name check answers, and whether sign-up is open at all, and the Turnstile site key when the host asks for one. */
export type NameSeen = { slug: string; free: boolean; why: string | null; open: boolean; turnstile: string | null };

/** What spending the mailed proof answers: who was made, and what was typed at the start. */
export type Verified = { person: string; email: string; slug: string; name: string | null; tz: string | null };

/** One record the person owns, as `/account/billing` lists it. */
export type Owned = { record: string; slug: string; state: string };

/** What `/account/billing` answers that this page reads: the records, whether billing is open, and the price of a record. */
export type Billing = { records: Owned[]; open: boolean; price: string | null };

/** Where somebody arrived from: their mail with a proof, Stripe with a payment, Stripe without one, or nowhere. */
export type Arrival = { kind: 'verify'; token: string } | { kind: 'paid' } | { kind: 'cancelled' } | null;

/** What the page keeps across the round trip to Stripe, in this tab only: the name asked for, the person's name, the zone. */
export type Held = { slug: string; name: string | null; tz: string | null };

/** The key the round trip is kept under, in `sessionStorage`. */
export const HELD_KEY = 'braindog.signup';

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
    return { ok: false, kind: 'refused', fix: str(refusal?.fix) };
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
  return { ok: true, value: { records, open: v.open === true, price: str(plans[0]?.price) } };
}

/**
 * A Stripe Checkout page for a new record, as an address to go to.
 *
 * ONLY AN `https:` ADDRESS IS GONE TO. The host builds it from Stripe's answer, and a page that followed whatever came
 * back would follow a `javascript:` one as readily.
 */
export async function checkout(held: Held, io: Io = live()): Promise<Asked<string>> {
  const out = await call(io, '/account/billing/checkout', {
    slug: held.slug,
    ...(held.name ? { name: held.name } : {}),
    ...(held.tz ? { tz: held.tz } : {}),
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
    return { slug: v.slug, name: str(v.name), tz: str(v.tz) };
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
