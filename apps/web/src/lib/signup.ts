/**
 * Signing up, from the browser's side: the three `/auth/signup/*` calls, the billing calls a new record is made or paid
 * through, and what the address says when somebody arrives from their mail or from Stripe.
 *
 * DESCRIBE, THEN BUILD. The page asks "Who are you?" first and draws the BrainDog from the answer, and
 * only then asks for one email. The record's name is chosen from what was heard (`namesHeard`, `recordNames`,
 * `chooseName`), and the sentence waits for the link in `localStorage` (`keepSaid`, `saidKept`), so the tab the link
 * opens builds the record from it. It also rides in the link itself (`saidForLink`, read back by `arrivalOf`), so a link
 * opened on another device builds from it too.
 *
 * FREE LEADS. The site's buttons open `/signup` with no plan, and no plan is Free: checkout with
 * `plan: 'free'` makes the record there and then and answers its `/start`. `?plan=cloud` and `?plan=plus` are the
 * site's pricing buttons, and those go to Stripe's page as before.
 *
 * PLAIN TYPESCRIPT, like `auth.ts` beside it, so a test can load it in Node with a fake `fetch` and no browser. The page
 * (`routes/signup/Signup.svelte`) and the no-record state on `/start` (`routes/start/NoRecord.svelte`) hold the runes.
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

import { USE_CASES } from '@braindog/seed/usecases';

import { GREETINGS } from './who.ts';
import { playedBy } from './start/parts.ts';
import type { Reply } from './first-run.ts';
import type { Asked as Answered, FirstAsked, SetupAsked, SetupReply } from './start/ask.ts';
import type { HeardLine, Place, Proposal } from './start/propose.ts';
import { call, checkName, isObj, live, str, type Asked, type Io, type NameSeen, type SignupMode } from './signup-door.ts';

/* THE DOOR AND ITS ENVELOPE LIVE IN `signup-door.ts`, where sign-in reads them without the rest of this file. */
export { checkName, signupMode } from './signup-door.ts';
export type { Asked, Io, NameSeen, SignupMode } from './signup-door.ts';


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

/* The words that name a mailbox and never a person: "info@", "hello@", "studio@". With them, a greeting (`GREETINGS`)
   and any word a use case this build ships listens for (its `signals`, read off it), so "shop@" is nobody either. */
const MAILBOXES: ReadonlySet<string> = new Set([
  'info', 'admin', 'contact', 'mail', 'email', 'office', 'sales', 'support', 'help', 'studio', 'store', 'billing',
  'enquiries', 'inquiries', 'noreply', 'test', 'user', 'me', 'home', 'design',
  ...GREETINGS,
  ...USE_CASES.flatMap((u) => u.signals),
]);

/**
 * THE NAME AN ADDRESS GIVES ITS PERSON, or '': the first word of its local part, capitalised, where that
 * word is letters alone, two or more of them, and not a mailbox's name. "mariam@" is Mariam, which People already calls
 * her; "info@", "j.smith@" and "x7@" give none, and the person is asked for a name where one is needed.
 */
export function nameOfAddress(email: string): string {
  const first = (email.trim().split('@')[0] ?? '').split(/[._+-]/u)[0] ?? '';
  if (!/^\p{L}{2,24}$/u.test(first) || MAILBOXES.has(first.toLowerCase())) return '';
  return first.charAt(0).toLocaleUpperCase() + first.slice(1).toLocaleLowerCase();
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
export function namesHeard(p: { name: string | null; rows: readonly { register: string; fields: Record<string, unknown> }[]; title?: string | null }): HeardNames {
  const list = projects();
  const ours = (r: { register: string }): boolean => list !== null && r.register === list;
  const others = new Set(p.rows.filter((r) => !ours(r)).flatMap((r) => [sameName(r.fields.name), sameName(r.fields.what)].filter((n) => n !== '')));
  const run = p.rows.find((r) => ours(r) && sameName(r.fields.name) !== '' && !others.has(sameName(r.fields.name)));
  /* WITH NOBODY NAMED, THE TRADE THE RECORD IS CALLED: "a small ceramics studio" is ceramics-studio, where
     the address was the email's local part. Her own trade, never anybody else's, since `titleOf` reads only "I run". */
  const trade = p.name === null && typeof p.title === 'string' && p.title.trim() !== '' ? p.title.trim() : null;
  return { person: p.name, business: run ? String(run.fields.name).trim() : trade };
}

/**
 * THE RECORD'S NAME, FROM WHAT WAS HEARD (describe, then make the account with one field). The business
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

/**
 * What was said, the currency chosen for it and the use case picked by hand, kept across the mail.
 *
 * WITH THE ANSWER TO THE ONE QUESTION (`reply`), so an answer given before the mail is not asked again on the phone the
 * link is opened on. Left out (or `null`) when nothing was asked or nothing answered.
 *
 * AND WITH THE BUILD'S OWN KEY (`key`), once a press has gone out: a reload between the call and its answer finds the
 * key here and presses under it again, so the record writes its entries once. This device's
 * only: it is never packed for the link, and one kept before there were keys reads back without it.
 *
 * AND WITH WHAT AN ANSWERED PRESS LEFT (`left`), which a reload sends in place of the whole build.
 *
 * AND WITH THE WHOLE READING THE PERSON KEPT (`reading`): the model's, read once on their press of Next, or the
 * rules'. The tab the link opens builds from it and never reads again (`readingKept`), so what is made is what was
 * shown. One kept before there were readings has none, and is read again by the rules as it always was.
 */
export type Draft = { said: string; currency: string | null; usecase: string | null; reply?: Reply | null; cut?: boolean; key?: string; left?: Left; reading?: Proposal };

/**
 * WHAT AN ANSWERED PRESS LEFT TO MAKE, kept beside the sentence with the new key its Try again goes out under:
 * the sentence's entries the record did not write (`rows`), the use case's plan still to make (`plan`, left
 * out when the press carried none), and whether the draft is on Decide already (`filed`).
 *
 * A RELOAD SENDS THIS, NOT THE WHOLE PLAN UNDER THE FIRST KEY. The record passes over only a key it holds, so what a
 * Try again wrote under its own key is unknown to the first one, and the whole plan sent again would write those
 * entries a second time. Sent as it was, under its own key and with `again`, a Try again that went in is passed over
 * and one that did not is written once. This device's only, like the key.
 */
export type Left = { key: string; rows: unknown[]; plan?: unknown[]; filed?: boolean };

/** What was left, read back off something kept, or `null` when it is not that. */
function leftOf(v: unknown): Left | null {
  if (!isObj(v)) return null;
  const key = keyOf(v.key);
  if (key === null || !Array.isArray(v.rows) || (v.plan !== undefined && !Array.isArray(v.plan))) return null;
  return { key, rows: v.rows, ...(v.plan === undefined ? {} : { plan: v.plan }), ...(v.filed === true ? { filed: true } : {}) };
}

/** What a build's key looks like, as the page makes it (`first-run-` and a UUID): short, nothing a link could misread, and no
 * longer than the record takes (64, `packages/record/src/arrange.ts` `setup`), so a key kept here is never one refused there. */
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const keyOf = (v: unknown): string | null => (typeof v === 'string' && KEY.test(v) ? v : null);

/** The one question's answer, read back off something kept, or `null` when it is not one. */
function replyOf(v: unknown): Reply | null {
  if (!isObj(v)) return null;
  const { about, value } = v;
  return (about === 'arrivesBy' || about === 'currency' || about === 'name') && (typeof value === 'string' || value === null) ? { about, value } : null;
}

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
    else {
      /* THE READING ONLY WITH THE WHOLE SENTENCE IT WAS READ FROM: a cut sentence would be built from words it no longer has. */
      const reading = draft.said.length <= SAID_MOST ? readingOf(draft.reading) : null;
      storage?.setItem(
        SAID_KEY,
        JSON.stringify({ said: draft.said.slice(0, SAID_MOST), currency: draft.currency, usecase: draft.usecase, ...(draft.reply ? { reply: draft.reply } : {}), ...(keyOf(draft.key) ? { key: draft.key } : {}), ...(reading ? { reading } : {}), at: now }),
      );
    }
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
  const key = keyOf(v.key);
  const left = leftOf(v.left);
  const reading = v.said.length <= SAID_MOST ? readingOf(v.reading) : null;
  return withReply({ said: v.said.slice(0, SAID_MOST), currency: str(v.currency), usecase: str(v.usecase), ...(key ? { key } : {}), ...(left ? { left } : {}), ...(reading ? { reading } : {}) }, v.reply);
}

/**
 * Put a build's key beside the sentence kept on this device, before its press goes out. Storage may be off, and then
 * the key lives in the page alone, as it did.
 *
 * THE SENTENCE IS NO YOUNGER FOR IT: its day still runs from when it was said. NOTHING KEPT, NOTHING WRITTEN: a key
 * with no sentence builds nothing, so a link opened on a phone (which keeps none) is as it was.
 *
 * THE FIRST KEY STAYS. A Try again of an answered press goes out under a new key, for what is left
 * alone, and that one is the page's: a reload builds the whole plan from the sentence again, and under a key the record
 * never held it would write every entry a second time. Under the first it passes over what that press wrote. A new
 * sentence is kept without a key (`keepSaid`), and so its build keeps its own first one.
 *
 * WHAT THE TRY AGAIN ITSELF WRITES is kept apart, with its own key (`keepLeft`), and a reload sends that (`pressKept`).
 */
export function keepKey(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined, key: string, now: number = Date.now()): void {
  if (keyOf(key) === null || keptHere(storage, now) === null) return;
  try {
    const kept: unknown = JSON.parse(storage?.getItem(SAID_KEY) ?? 'null');
    if (isObj(kept) && keyOf(kept.key) === null) storage?.setItem(SAID_KEY, JSON.stringify({ ...kept, key }));
  } catch {
    /* Storage off or full: a reload presses under a new key, which is what happened before there was this. */
  }
}

/**
 * Put what an answered press left beside the sentence kept on this device, in place of what an earlier one left.
 * Storage may be off or full, and then a reload presses under the first key as it did before there was this.
 *
 * NOTHING KEPT, NOTHING WRITTEN, and the sentence is no younger for it, as with `keepKey`. A new sentence is kept
 * without it (`keepSaid`), and it goes with the sentence once the build is all in.
 */
export function keepLeft(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined, left: Left, now: number = Date.now()): void {
  const fit = leftOf(left);
  if (fit === null || keptHere(storage, now) === null) return;
  try {
    const kept: unknown = JSON.parse(storage?.getItem(SAID_KEY) ?? 'null');
    if (isObj(kept)) storage?.setItem(SAID_KEY, JSON.stringify({ ...kept, left: fit }));
  } catch {
    /* Storage off or full: the first key stays the one a reload presses under. */
  }
}

/**
 * THE PRESS A RELOAD SENDS, from the build read off the sentence again (`asked`) and what this device kept for it.
 *
 * AFTER AN ANSWERED PRESS (`left`): only what is still to make, under the key its Try again took, with `again`. A
 * BUILD PRESSED FOR AND NOT ANSWERED (`key` alone): the whole of it under that key, with `again`. NEITHER: the build as
 * it is, a first press.
 */
export function pressKept<A extends { proposal: object }>(asked: A, draft: Pick<Draft, 'key' | 'left'> | null): A {
  const left = draft?.left;
  if (left) {
    return {
      ...asked,
      again: true,
      key: left.key,
      proposal: { ...asked.proposal, rows: left.rows },
      ...(left.plan === undefined ? {} : { plan: left.plan }),
      ...(left.filed ? { drafted: null } : {}),
    };
  }
  return draft?.key ? { ...asked, key: draft.key, again: true } : asked;
}

/** A draft with its answer when one was kept, and without the key at all when none was. */
function withReply(draft: Draft, kept: unknown): Draft {
  const reply = replyOf(kept);
  return reply ? { ...draft, reply } : draft;
}

/* ── the reading: asked on a press, kept beside the sentence ─────────────── */

const SPAN = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0) && v[0] <= v[1];
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const textOr = (v: unknown): v is string | null => v === null || typeof v === 'string';

function lineOf(v: unknown): HeardLine | null {
  if (!isObj(v) || typeof v.phrase !== 'string' || typeof v.became !== 'string') return null;
  if ((v.at !== undefined && !SPAN(v.at)) || (v.more !== undefined && !(Array.isArray(v.more) && v.more.every(SPAN)))) return null;
  return {
    phrase: v.phrase,
    became: v.became,
    ...(SPAN(v.at) ? { at: v.at } : {}),
    ...(v.you === true ? { you: true as const } : {}),
    ...(v.loose === true ? { loose: true as const } : {}),
    ...(Array.isArray(v.more) && v.more.length > 0 ? { more: v.more as [number, number][] } : {}),
  };
}

function placeOf(v: unknown): Place | null {
  if (!isObj(v) || (v.kind !== 'today' && v.kind !== 'module' && v.kind !== 'list') || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  if (!textOr(v.phrase) || !(v.at === null || SPAN(v.at))) return null;
  return { kind: v.kind, id: v.id, name: v.name, phrase: v.phrase, at: v.at };
}

function entryOf(v: unknown): Proposal['rows'][number] | null {
  if (!isObj(v) || typeof v.register !== 'string' || !isObj(v.fields)) return null;
  return { register: v.register, fields: v.fields, ...(Number.isInteger(v.party) ? { party: v.party as number } : {}) };
}

/**
 * A READING, READ BACK OFF SOMETHING KEPT, or `null` when it is not one: storage and a link are text anybody's page could
 * have written, so every part is held to its shape before a build is made from it. The answer to the one question is
 * not taken from it (`reply` carries that), so it is laid over once and never twice.
 */
export function readingOf(v: unknown): Proposal | null {
  if (!isObj(v)) return null;
  const { name, usecase, also, modules, currency, title } = v;
  if (!textOr(name) || !textOr(usecase) || !strs(also) || !strs(modules) || !textOr(currency) || !textOr(title)) return null;
  if (!Array.isArray(v.rows) || !Array.isArray(v.heard) || !Array.isArray(v.places)) return null;
  const rows = v.rows.map(entryOf);
  const heard = v.heard.map(lineOf);
  const places = v.places.map(placeOf);
  if (rows.includes(null) || heard.includes(null) || places.includes(null)) return null;
  const names = isObj(v.names) && Object.values(v.names).every((n) => typeof n === 'string') ? (v.names as Record<string, string>) : null;
  return {
    name,
    usecase,
    also,
    modules,
    currency,
    rows: rows as Proposal['rows'],
    heard: heard as HeardLine[],
    title,
    places: places as Place[],
    ...(v.currencyBy === 'device' ? { currencyBy: 'device' as const } : {}),
    ...(typeof v.by === 'string' && v.by !== '' ? { by: v.by } : {}),
    ...(typeof v.fell === 'string' && v.fell !== '' ? { fell: v.fell } : {}),
    ...(textOr(v.summary) ? { summary: v.summary } : {}),
    ...(textOr(v.draft) ? { draft: v.draft } : {}),
    ...(names ? { names } : {}),
    /* THE MODEL'S ONE QUESTION, held to its shape again (`askOf`), so a kept reading asks what the read asked. */
    ...(v.ask !== undefined ? { ask: askOf({ ask: v.ask }) } : {}),
  };
}

/**
 * THE READER A BUILD IS MADE WITH: the reading kept beside this very sentence, and no read at all; else `read`, the rules
 * reading the words as they always did (a draft kept before there were readings, or a link that could not carry one).
 */
export const readingKept =
  (draft: Pick<Draft, 'said' | 'reading'> | null, read: (said: string) => Promise<Proposal>) =>
  (said: string): Promise<Proposal> =>
    draft?.reading !== undefined && said === draft.said ? Promise.resolve(draft.reading) : read(said);

/** What woke a reading of the words: a key, a pause after the last one, or the person's own press of Next. */
export type ReadCause = 'key' | 'pause' | 'press';

/** The reading door before there is an account (`readAsks(origin).setup`, `lib/start/ask.ts`), or a test's. */
export type ReadDoor = (ask: FirstAsked) => Promise<Answered<SetupReply>>;

/**
 * Where the words were typed, and a fresh bot-check answer for one read: `human` answers `''` where the host asks for
 * none and `null` where none could be had. `heard` is told every answer the read came back with, the door's own.
 */
export type ReadEnv = { zone: string | null; locale: string; human: () => Promise<string | null>; heard?: (out: Answered<SetupReply>) => void };

/** The code a host with no reading door answers (501, or a bare 404): the page's own rules read, and say nothing of a model. */
export const READS_OFF = 'NOT_IN_THIS_BUILD';

/**
 * THE MODEL'S READER FOR ONE CAUSE, or `null`, and then the rules read (`proposeFirst`). ONLY A PRESS IS READ: a key or a
 * pause lights the build by the rules on this device and sends nothing, so nothing typed leaves it until the person asks.
 *
 * A FRESH BOT-CHECK ANSWER BEFORE EACH READ, since one is good once. With none to be had, the door is not asked at all:
 * the refusal is the page's own, and the rules' reading stands, as it does for any refusal or a host that answered 501.
 */
export function readerFor(cause: ReadCause, door: ReadDoor | null, env: ReadEnv): ((ask: SetupAsked) => Promise<Answered<SetupReply>>) | null {
  if (cause !== 'press' || door === null) return null;
  return async (ask) => {
    let out: Answered<SetupReply>;
    try {
      const turnstile = await env.human();
      out =
        turnstile === null
          ? { ok: false, refusal: { code: 'FORBIDDEN', fix: 'The check that you are a person did not answer, so simple rules read this.' } }
          : await door({ said: ask.said, offer: ask.offer, today: ask.today, zone: env.zone ?? 'UTC', locale: env.locale, turnstile, ...(ask.asked === undefined ? {} : { asked: ask.asked }) });
    } catch (e) {
      out = { ok: false, refusal: { code: 'UNREACHABLE', fix: e instanceof Error ? e.message : String(e) } };
    }
    env.heard?.(out);
    return out;
  };
}

/** What a question back may be about, as the reading door says it (`SetupAbout` in `@braindog/slash`). */
export type AskAbout = 'name' | 'kind' | 'things' | 'who_for' | 'currency' | 'work' | 'money' | 'people' | 'tools' | 'first';
const ABOUTS: ReadonlySet<string> = new Set<AskAbout>(['name', 'kind', 'things', 'who_for', 'currency', 'work', 'money', 'people', 'tools', 'first']);

/** The one question the model would ask back: one line, and up to four short choices to tap. */
export type ModelAsk = { about: AskAbout; question: string; choices: string[] };

/**
 * THE ONE QUESTION A READING CARRIES (`ask` on the door's answer), held to what the screen can say: one line of 120
 * characters at most, and up to four choices of 24. One that does not fit is no question, never a cut one.
 */
export function askOf(reply: unknown): ModelAsk | null {
  if (!isObj(reply) || !isObj(reply.ask)) return null;
  const { about, question, choices } = reply.ask;
  if (typeof about !== 'string' || !ABOUTS.has(about) || typeof question !== 'string') return null;
  const line = question.trim();
  if (line === '' || /[\r\n]/u.test(line) || [...line].length > 120) return null;
  const taps = Array.isArray(choices) ? choices.map((c) => (typeof c === 'string' ? c.trim() : '')) : [];
  if (taps.length > 4 || taps.some((c) => c === '' || /[\r\n]/u.test(c) || [...c].length > 24)) return null;
  return { about: about as AskAbout, question: line, choices: [...new Set(taps)] };
}

/**
 * HOW THE ANSWER TO THE MODEL'S QUESTION IS LAID OVER THE READING: as the rules' own answer (`Reply`) where it asks what
 * the rules would ask (the name, the currency), so it is kept, mailed and built as theirs; `null` for anything else,
 * which the page says back to it as words told more.
 */
export const answeredAs = (ask: ModelAsk, rules: string | null): 'name' | 'currency' | null =>
  (ask.about === 'name' || ask.about === 'currency') && ask.about === rules ? ask.about : null;

/** The key, in this tab's storage, that says the host answered 501 to a read this session. */
export const READS_KEY = 'braindog.signup.reads';

/** Whether this tab already heard the host say it has no reading door. Storage may be off, and then it was not heard. */
export function readsOffKept(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(READS_KEY) === 'off';
  } catch {
    return false;
  }
}

/** Keep, for this tab, that the host has no reading door, so the line about a model reading is not said again. */
export function keepReadsOff(storage: Pick<Storage, 'setItem'> | null | undefined): void {
  try {
    storage?.setItem(READS_KEY, 'off');
  } catch {
    /* Storage off: the page holds it in memory for as long as it is open. */
  }
}

/** The most of what was said that rides in the mailed link, packed: the host's own limit (`SAID_IN_LINK`). */
export const SAID_LINK_MOST = 1000;

/**
 * And the most it may be as the link writes it, percent-encoded: the host's `SAID_LINK_BYTES`
 * (`packages/record/src/identity.ts`). Arabic is nine bytes a letter there, so a sentence well inside
 * `SAID_LINK_MOST` can still be a link too long to arrive whole.
 */
export const SAID_LINK_BYTES = 2000;

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
 * SHORTENED AT A WORD to fit `SAID_LINK_MOST` and `SAID_LINK_BYTES`, so a long sentence still carries its start and
 * the pack says `cut: true`; the whole of it waits on this device as before (`keepSaid`).
 *
 * THE READING RIDES ONLY WHOLE, beside the whole sentence it was read from, and only where all of it fits: a link opened
 * on a phone then builds what the desk showed. Where it does not fit, the link is packed as it always was and the phone's
 * rules read the words; the reading still waits on the device that typed them.
 */
export function saidForLink(draft: Draft | null | undefined): string | null {
  if (!draft) return null;
  const pack = (said: string, cut = false, reading: Proposal | null = null): string =>
    JSON.stringify({
      said,
      ...(draft.currency ? { currency: draft.currency } : {}),
      ...(draft.usecase ? { usecase: draft.usecase } : {}),
      ...(draft.reply ? { reply: draft.reply } : {}),
      ...(reading ? { reading } : {}),
      ...(cut ? { cut: true } : {}),
    });
  const reading = draft.said === draft.said.trim() ? readingOf(draft.reading) : null;
  if (reading !== null && draft.said !== '') {
    const whole = pack(draft.said, false, reading);
    if (whole.length <= SAID_LINK_MOST && encodeURIComponent(whole).length <= SAID_LINK_BYTES && !CARRIES_NOT.some((r) => r.test(whole))) return whole;
  }
  /* BOTH OF THE HOST'S MEASURES: the characters packed, and the bytes the link writes them as. Measured with `cut`
     said, since a shortened pack says so and those words are part of what must fit. */
  const fitsLink = (said: string): boolean => {
    const packed = pack(said, true);
    return packed.length <= SAID_LINK_MOST && encodeURIComponent(packed).length <= SAID_LINK_BYTES;
  };
  let words = draft.said.trim();
  let shortened = false;
  if (pack(words).length > SAID_LINK_MOST || encodeURIComponent(pack(words)).length > SAID_LINK_BYTES) {
    shortened = true;
    /* THE LONGEST START THAT FITS PACKED, found by halves, since a quote or a line break grows when packed. */
    let fits = 0;
    for (let lo = 0, hi = words.length; lo <= hi; ) {
      const mid = (lo + hi) >> 1;
      if (fitsLink(words.slice(0, mid))) {
        fits = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const cut = words.slice(0, fits);
    const space = cut.search(/\s\S*$/);
    /* NEVER HALF A CHARACTER: a lone surrogate is a character no link can carry. */
    words = (space > 0 ? cut.slice(0, space) : cut).trimEnd().replace(/[\uD800-\uDBFF]$/, '');
  }
  const out = pack(words, shortened);
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
  /* `cut` IS READ WHOEVER SHORTENED IT: this page before sending, or the host fitting the link (`saidFitted`). A cut
     sentence never keeps a reading of the words it lost. */
  const reading = v.cut === true ? null : readingOf(v.reading);
  return withReply({ said: v.said.slice(0, SAID_MOST), currency: str(v.currency), usecase: str(v.usecase), ...(v.cut === true ? { cut: true } : {}), ...(reading ? { reading } : {}) }, v.reply);
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


/**
 * Ask for a record: the host always answers the same for an address, and the mail says the rest. By invitation, the
 * code this tab kept rides along, and a start without a usable one is refused `at: 'code'`. What was said rides along
 * packed (`saidForLink`), and the host puts it in the mailed link's fragment.
 */
export async function startSignup(
  ask: { email: string; slug: string; name?: string; tz?: string | null; turnstile?: string | null; code?: string | null; said?: Draft | null },
  io: Io = live(),
): Promise<Asked<{ proof: string | null }>> {
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
  /* WITH AN INVITATION MAILED TO THIS ADDRESS THE HOST SENDS NO SECOND MAIL and hands the proof back to spend now. */
  return out.ok ? { ok: true, value: { proof: isObj(out.value) ? str(out.value.proof) : null } } : out;
}

/** Spend the mailed proof, once: the person is made and this browser is signed in as them. */
export async function verifySignup(token: string, io: Io = live()): Promise<Asked<Verified>> {
  const out = await call(io, '/auth/signup/verify', { token });
  /* A LINK THE HOST WILL NOT TAKE IS ITS ONE 401, "That did not sign you in.", which under "That link did not work" said
     the same thing twice and nothing of why: it leaves the fix to the page, "A link works once, within a day". */
  if (!out.ok) return out.kind === 'refused' && out.code === 'UNAUTHORIZED' ? { ok: false, kind: 'refused', fix: null } : out;
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

/** Open a record in this browser (`/auth/switch`): the session moves to it, and the bare address opens on it from now on. */
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

/** The key a spent sign-up link is remembered under on this device, in `localStorage` (`keepSpent`). */
export const SPENT_KEY = 'braindog.signup.spent';

/** How long a spent link is remembered: a week, longer than any link lives. */
const SPENT_MS = 7 * 24 * 3600 * 1000;

/** A sign-up link spent on this device: who it was for and the name it made, never the link itself. */
export type Spent = { email: string; slug: string };

/** The link as it is remembered: the first half of its SHA-256, so the link itself is never kept. */
async function linkMark(token: string): Promise<string | null> {
  try {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
    return [...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Remember that this link was spent here, and for whom (first hour audit, E15).
 *
 * A LINK WORKS ONCE, AND A SECOND OPEN SENT HER TO MAKE A SECOND BRAINDOG. Somebody who closed the tab at "Your email
 * is confirmed" and opened the mail again read "That link did not work … Start again". The host says the same 401 for
 * every link it will not take, rightly, so the device that spent it is the one that can say it was used.
 */
export async function keepSpent(storage: Pick<Storage, 'setItem'> | null | undefined, token: string, spent: Spent, now: number = Date.now()): Promise<void> {
  const mark = await linkMark(token);
  if (mark === null) return;
  try {
    storage?.setItem(SPENT_KEY, JSON.stringify({ mark, email: spent.email, slug: spent.slug, until: now + SPENT_MS }));
  } catch {
    /* Storage off: a second open says only that the link did not work, as before. */
  }
}

/** Whether this very link was spent on this device, and for whom; `null` for any other link, or once a week has gone. */
export async function spentFor(storage: Pick<Storage, 'getItem'> | null | undefined, token: string, now: number = Date.now()): Promise<Spent | null> {
  try {
    const raw = storage?.getItem(SPENT_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!isObj(v) || typeof v.mark !== 'string' || typeof v.email !== 'string' || typeof v.slug !== 'string') return null;
    if (typeof v.until !== 'number' || v.until < now) return null;
    return v.mark === (await linkMark(token)) ? { email: v.email, slug: v.slug } : null;
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
