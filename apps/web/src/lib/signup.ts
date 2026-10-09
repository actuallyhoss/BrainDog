/**
 * Signing up, from the browser's side: the three `/auth/signup/*` calls, the billing calls a new record is made or paid
 * through, and what the address says when somebody arrives from their mail or from Stripe.
 *
 * DESCRIBE, THEN BUILD (DIRECTION §37). The page asks "Who are you?" first and draws the BrainDog from the answer, and
 * only then asks for one email. The record's name is chosen from what was heard (`namesHeard`, `recordNames`,
 * `chooseName`), and the sentence waits for the link in `localStorage` (`keepSaid`, `saidKept`), so the tab the link
 * opens builds the record from it. It also rides in the link itself (`saidForLink`, read back by `arrivalOf`), so a link
 * opened on another device builds from it too.
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
 *
 * WHO MAY SIGN UP IS THE HOST'S ONE SWITCH (`mode` on the name answer: `open`, `invite` or `closed`). By invitation the
 * code arrives the same way, `#code=`, is wiped the same way, and waits in this tab's storage (`keepCode`) until `start`
 * carries it. Nobody types a code.
 */

import { playedBy } from './start/parts.ts';

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

/** Who may sign up on this host: anybody, a new address with a code, or nobody yet. */
export type SignupMode = 'open' | 'invite' | 'closed';

/**
 * What the name check answers, who may sign up (`mode`, and `open` when it is not `closed`), and the Turnstile site key
 * when the host asks for one.
 */
export type NameSeen = { slug: string; free: boolean; why: string | null; mode: SignupMode; open: boolean; turnstile: string | null };

/** What spending the mailed proof answers: who was made, and what was typed at the start. */
export type Verified = { person: string; email: string; slug: string; name: string | null; tz: string | null };

/** One record the person owns, as `/account/billing` lists it. */
export type Owned = { record: string; slug: string; state: string };

/**
 * What `/account/billing` answers that this page reads: the records, whether billing is open, the price of a record on
 * the first plan sold, and each sold plan's price by its id, so a page paying for Cloud Plus names Cloud Plus's.
 */
export type Billing = { records: Owned[]; open: boolean; price: string | null; prices: Partial<Record<Plan, string>>; canMake: boolean };

/**
 * Where somebody arrived from: their mail with a proof, an invitation with a sign-up code, Stripe with a payment, Stripe
 * without one, or nowhere.
 */
export type Arrival = { kind: 'verify'; token: string; said?: Draft } | { kind: 'code'; code: string } | { kind: 'paid' } | { kind: 'cancelled' } | null;

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

/**
 * The key a sign-up code waits under in this tab, in `sessionStorage`, between arriving by `#code=` and `start`.
 *
 * THE TAB'S AND NOT THE DEVICE'S: the code is spent on the start this tab sends, and the mailed link that follows needs
 * none, so nothing about it should outlive the tab. Beside `HELD_KEY`, under the same `braindog.signup` name.
 */
export const CODE_KEY = 'braindog.signup.code';

/** A sign-up code as the host mints one: 43 characters of base64url. Anything else is not kept. */
const CODE = /^[A-Za-z0-9_-]{43}$/;

/** Keep the code for this tab's start, or forget it (`null`). Storage may be off, and then the page asks for a link again. */
export function keepCode(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, code: string | null): void {
  try {
    if (code === null || !CODE.test(code)) storage?.removeItem(CODE_KEY);
    else storage?.setItem(CODE_KEY, code);
  } catch {
    /* Storage off: the start goes without a code, and the host says one is needed. */
  }
}

/** The code this tab kept, or `null`. */
export function codeKept(storage: Pick<Storage, 'getItem'> | null | undefined): string | null {
  try {
    const code = storage?.getItem(CODE_KEY) ?? null;
    return code !== null && CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

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
 * The list that holds what a person runs or builds ("Projects"), the only list a record's name is taken from: the one the
 * people's `projects` part links to (`start/parts.ts`), whatever it is called.
 */
const projects = (): string | null => playedBy('projects');

/** A name as two sentences would both say it: trimmed, folded to lower case, its spaces as one. */
const sameName = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').toLowerCase() : '');

/**
 * THE NAMES A SENTENCE GAVE, read off its proposal: the person's own name, and the first thing they run that the
 * sentence put in their projects ("I run Kiln Studio" is Kiln Studio, a project).
 *
 * ONLY THE PROJECTS LIST, NEVER ANOTHER. A client in People, an organisation, a payment, a bank or a service the
 * person pays is somebody else's name, and the record's name is public in its address. A project that carries the same
 * name as one of those is left out too: a project called Fenwick beside a client called Fenwick is the client's work.
 */
export function namesHeard(p: { name: string | null; rows: readonly { register: string; fields: Record<string, unknown> }[] }): HeardNames {
  const list = projects();
  const ours = (r: { register: string }): boolean => list !== null && r.register === list;
  const others = new Set(p.rows.filter((r) => !ours(r)).flatMap((r) => [sameName(r.fields.name), sameName(r.fields.what)].filter((n) => n !== '')));
  const run = p.rows.find((r) => ours(r) && sameName(r.fields.name) !== '' && !others.has(sameName(r.fields.name)));
  return { person: p.name, business: run ? String(run.fields.name).trim() : null };
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
 * is built from what was said. The words alone, never the address, and forgotten once all of it is in the record.
 */
export const SAID_KEY = 'braindog.signup.said';

/** How long a sentence kept for the mail is good for: the link's own day, and a little over. */
const SAID_MS = 26 * 60 * 60 * 1000;

/** The longest sentence kept, as the host keeps it (2,000 characters). */
export const SAID_MOST = 2000;

/** What was said, the currency chosen for it and the use case picked by hand, kept across the mail. */
export type Draft = { said: string; currency: string | null; usecase: string | null };

/**
 * Keep the sentence across the mail, or forget it (`null`). Storage may be off, and then the record asks again.
 *
 * KEPT ONLY ONCE THE MAIL IS ASKED FOR AND THE HOST SAID YES, and forgotten only once the record holds all of it: the
 * page calls this after `startSignup` answers, and with `null` after an `accept` that missed nothing.
 */
export function keepSaid(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, draft: Draft | null, now: number = Date.now()): void {
  /* FORGOTTEN WITH THE DEVICE'S COPY: the build is in, and the sentence the link carried has no more use. */
  if (draft === null) fromLink = null;
  try {
    if (draft === null || draft.said.trim() === '') storage?.removeItem(SAID_KEY);
    else storage?.setItem(SAID_KEY, JSON.stringify({ said: draft.said.slice(0, SAID_MOST), currency: draft.currency, usecase: draft.usecase, at: now }));
  } catch {
    /* Storage off: the new record's /start asks "Who are you?" again, which is the whole of the cost. */
  }
}

/**
 * The sentence kept across the mail, or `null` when none was, or it is older than the link it went with.
 *
 * ONE THAT CANNOT BE BUILT IS REMOVED AS IT IS READ: an old, broken or future-dated sentence is somebody's own words
 * in plain text, and on a shared device it would sit there for the next person to find.
 *
 * THIS DEVICE'S COPY FIRST, THEN THE LINK'S (`link`, by default what `arrivalOf` read off the address): a link opened on
 * a phone after the words were typed on a desk has no copy here, and builds from the one it carried.
 */
export function saidKept(storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined, now: number = Date.now(), link: Draft | null = fromLink): Draft | null {
  return keptHere(storage, now) ?? link;
}

function keptHere(storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined, now: number): Draft | null {
  let raw: string | null | undefined;
  try {
    raw = storage?.getItem(SAID_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let v: unknown = null;
  try {
    v = JSON.parse(raw);
  } catch {
    /* Broken, and so nothing to build: removed below with the rest. */
  }
  if (!isObj(v) || typeof v.said !== 'string' || v.said.trim() === '' || typeof v.at !== 'number' || now - v.at > SAID_MS || v.at > now) {
    try {
      storage?.removeItem(SAID_KEY);
    } catch {
      /* Storage that reads but will not write: nothing more this page can do. */
    }
    return null;
  }
  return { said: v.said.slice(0, SAID_MOST), currency: str(v.currency), usecase: str(v.usecase) };
}

/** The most of what was said that rides in the mailed link, packed: the host's own limit (`SAID_IN_LINK`). */
export const SAID_LINK_MOST = 1000;

/**
 * What a letter must not carry, so a sentence holding one stays on this device and is not sent: a web address, by its
 * scheme, `www.` or a common ending, and an email address. THE HOST'S RULES (`packages/record/src/identity.ts`,
 * `NOT_IN_LINK`), which refuse the whole start; here they only leave the sentence out of the link.
 */
const CARRIES_NOT: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /\bwww\./i,
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
  /\b[a-z0-9-]+\.(?:com|net|org|io|co|ai|app|dev|me|info|biz|xyz|ly|gl|gg|link|site|online|shop|store)\b/i,
];

/** The sentence that went with the link this page was opened from, read off its fragment by `arrivalOf`. */
let fromLink: Draft | null = null;

/**
 * WHAT WAS SAID, PACKED FOR THE LINK: the sentence and its one answer (the currency, or the use case picked), and nothing
 * else of the build. `null` when there is nothing to carry, or it holds an address the host would refuse.
 *
 * SHORTENED AT A WORD to fit `SAID_LINK_MOST`, so a long sentence still carries its start; the whole of it waits on
 * this device as before (`keepSaid`).
 */
export function saidForLink(draft: Draft | null | undefined): string | null {
  if (!draft) return null;
  const pack = (said: string): string =>
    JSON.stringify({ said, ...(draft.currency ? { currency: draft.currency } : {}), ...(draft.usecase ? { usecase: draft.usecase } : {}) });
  let words = draft.said.trim();
  if (pack(words).length > SAID_LINK_MOST) {
    /* THE LONGEST START THAT FITS PACKED, found by halves, since a quote or a line break grows when packed. */
    let fits = 0;
    for (let lo = 0, hi = words.length; lo <= hi; ) {
      const mid = (lo + hi) >> 1;
      if (pack(words.slice(0, mid)).length <= SAID_LINK_MOST) {
        fits = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const cut = words.slice(0, fits);
    const space = cut.search(/\s\S*$/);
    /* NEVER HALF A CHARACTER: a lone surrogate is a character no link can carry. */
    words = (space > 0 ? cut.slice(0, space) : cut).trimEnd().replace(/[\uD800-\uDBFF]$/, '');
  }
  const out = pack(words);
  return words === '' || CARRIES_NOT.some((r) => r.test(out)) ? null : out;
}

/** What `saidForLink` packed, read back off a link, or `null` when it is not that. */
export function saidFromLink(packed: string | null): Draft | null {
  if (packed === null) return null;
  let v: unknown = null;
  try {
    v = JSON.parse(packed);
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v.said !== 'string' || v.said.trim() === '') return null;
  return { said: v.said.slice(0, SAID_MOST), currency: str(v.currency), usecase: str(v.usecase) };
}

/**
 * WHETHER THE BUILD IS ALL IN, so the sentence kept for it can be forgotten: a press that answered, and missed nothing.
 * A press that did not answer (`null`) or came back with something refused keeps it, for Try again.
 */
export const allWritten = (out: { failed: readonly unknown[] } | null): boolean => out !== null && out.failed.length === 0;

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
  /* `mode` FIRST; A HOST A RELEASE OLDER SAYS ONLY `open`, which was open to anybody or to nobody. */
  const mode: SignupMode = v.mode === 'open' || v.mode === 'invite' || v.mode === 'closed' ? v.mode : v.open === true ? 'open' : 'closed';
  return {
    ok: true,
    value: {
      slug: typeof v.slug === 'string' ? v.slug : slug,
      free: v.free === true,
      why: str(v.why),
      mode,
      open: mode !== 'closed',
      turnstile: str(v.turnstile),
    },
  };
}

/**
 * Ask for a record: the host always answers the same for an address, and the mail says the rest. By invitation, the
 * code this tab kept rides along, and a start without a usable one is refused `at: 'code'`. What was said rides along
 * packed (`saidForLink`), and the host puts it in the mailed link's fragment.
 */
export async function startSignup(
  ask: { email: string; slug: string; name?: string; tz?: string | null; turnstile?: string | null; code?: string | null; said?: Draft | null },
  io: Io = live(),
): Promise<Asked<null>> {
  const said = saidForLink(ask.said);
  const out = await call(io, '/auth/signup/start', {
    email: ask.email.trim(),
    slug: ask.slug.trim(),
    ...(ask.name && ask.name.trim() !== '' ? { name: ask.name.trim() } : {}),
    ...(ask.tz ? { tz: ask.tz } : {}),
    ...(ask.turnstile ? { turnstile: ask.turnstile } : {}),
    ...(ask.code ? { code: ask.code } : {}),
    ...(said !== null ? { said } : {}),
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

/**
 * The records this person owns and whether billing is open, with the price a new record is sold at, and whether a free
 * record can be made now (`canMake`): only the host's own word says yes, so a host that did not say is a no.
 */
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
  return { ok: true, value: { records, open: v.open === true, price: str(plans[0]?.price), prices, canMake: v.canMake === true } };
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
 * What the address's fragment says, and a way to wipe it: `#verify=` from the mail, `#code=` from an invitation,
 * `#paid=` or `#cancelled` from Stripe.
 *
 * `clear` RUNS ONLY WHEN THERE WAS SOMETHING TO TAKE, so a plain visit leaves the address alone.
 *
 * A PROOF MAY CARRY WHAT WAS SAID after it (`#verify=<proof>&said=<words>`, put there by the host). It is taken with the
 * proof, wiped with it, and kept for this page only, where `saidKept` finds it when this device kept none.
 */
export function arrivalOf(hash: string, clear: () => void): Arrival {
  const whole = hash.startsWith('#') ? hash.slice(1) : hash;
  const amp = whole.indexOf('&');
  const h = amp === -1 ? whole : whole.slice(0, amp);
  const eq = h.indexOf('=');
  const word = eq === -1 ? h : h.slice(0, eq);
  const value = eq === -1 ? '' : h.slice(eq + 1);
  if (word === 'verify' && /^[A-Za-z0-9_-]{43}$/.test(value)) {
    clear();
    const said = amp === -1 ? null : saidFromLink(new URLSearchParams(whole.slice(amp + 1)).get('said'));
    if (said !== null) fromLink = said;
    return { kind: 'verify', token: value, ...(said !== null ? { said } : {}) };
  }
  if (word === 'code' && CODE.test(value)) {
    clear();
    return { kind: 'code', code: value };
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
