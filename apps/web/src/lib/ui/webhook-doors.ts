/**
 * The webhook doors screen: the record's own list of the addresses it takes things in at, one press at
 * `POST /api/ingestMint` per door, and the address built from what that press answers.
 *
 * IT REPLACES A SCREEN THAT NAMED ONE USE CASE. `shortcut-door.ts` held `SHORTCUT_INGEST = 'bank-from-out-sms'` and an
 * iPhone recipe, so the only door this app could mint for was a bank's text, and a record that declared a door for a
 * form, a build server or a price feed had no way to get its token short of a POST typed by hand. That broke
 * the rule: the code ships the door, and what arrives through it is the record's business. So nothing here
 * names an ingest. The list is the record's answer to `doors`, and the id each press sends is the id that answer gave.
 *
 * THROUGH THE CLIENT, AS THE OLD SCREEN WAS. `doors` and `ingestMint` are record methods in `ROUTES`, so `client.call`
 * sends them with the verb the server reads from the same table. Both are ADMIN, and the cookie is the whole of what
 * either authenticates with: the client is built without a bearer, because `ingestMint` refuses a token of any kind.
 *
 * NOTHING HERE LOGS AND NOTHING HERE KEEPS. A mint's answer carries the only copy of a credential there will ever be
 * (the record keeps its SHA-256 and nothing reads it back), and `webhook-doors.test.ts` asserts this file and the
 * component hold no logging call and no browser storage. The old test failed once on its own header, which named the
 * call it forbids, so this one does not.
 */

import { createClient } from '@braindog/client';
import { sinceWords } from 'braindog-render';
import type { Fetch } from '../record/boot-live.ts';
import { copy } from '../copy.ts';
import { isProof } from '../reauth/ask.ts';

type Refusal = { code: string; fix: string };
type Answered = { ok: true; value: unknown } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/**
 * What the screen sends a method through.
 *
 * A PARAMETER, SO A TEST CAN ANSWER `doors` BEFORE A HOST DOES. The client refuses a name missing from `ROUTES` with
 * `ROUTE_UNKNOWN` before it fetches anything, so a fetch double cannot stand in for a read the host table does not
 * list yet, and this screen was written alongside the read it lists.
 */
export type Call = (name: string, args?: Record<string, unknown>) => Promise<Answered>;

/** The client's own `call`, at `base`, with no bearer. */
export const callerAt = (base: string, io?: Fetch): Call =>
  createClient({ base, ...(io ? { fetch: io } : {}) }).call as unknown as Call;

/**
 * One door as the screen draws it.
 *
 * `id` IS SENT AND NEVER SHOWN. It is the declaration's own id, which the person did not choose words for, so the row
 * reads `description` and the id goes back to `ingestMint` untouched. It is shown only when the declaration wrote no
 * description, because two unnamed rows with one Mint each are worse than a row named by its id.
 *
 * `mintable` IS WHETHER THE DOOR IS CHECKED BY A TOKEN IN ITS PATH. `ingestMint` refuses every other kind with
 * `VALUE_MALFORMED`, so a button that could only be refused is not drawn.
 */
export type Door = {
  id: string;
  name: string;
  register: string | null;
  mintable: boolean;
  held: boolean;
  /**
   * WHETHER THE DOOR TAKES ARRIVALS, or `null` from a host whose `doors` predates the switch. `null` draws no
   * switch, because a press there could only be refused.
   */
  on: boolean | null;
  /** When it went off, ISO 8601, while it is off. */
  offSince: string | null;
  /** The newest arrival the record filed through it, ISO 8601. */
  lastArrival: string | null;
  /** Arrivals filed in the last seven days, and arrivals turned away while it was off, in the same seven. */
  arrivals: number;
  turnedAway: number;
};

/** What the list says. Every arm but `doors` is a sentence rather than a failure. */
export type Listed =
  | { kind: 'doors'; doors: Door[] }
  | { kind: 'signin'; fix: string }
  | { kind: 'refused'; fix: string };

/* `verify` IS READ IN BOTH SPELLINGS A DECLARATION USES. The ingest declares `verify: { kind: path }`, and a read that
   flattens it to the kind alone is as likely; a door that answers neither is not one a token opens. */
const verifiedByPath = (verify: unknown): boolean =>
  verify === 'path' || (typeof verify === 'object' && verify !== null && (verify as { kind?: unknown }).kind === 'path');

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** A refusal as either screen says it. */
function refusedAs(out: Answered): { kind: 'signin'; fix: string } | { kind: 'refused'; fix: string } {
  /* A conflict cannot come back from either method, which read no row; it is here so the type is whole. */
  const refusal: Refusal = !out.ok && 'refusal' in out ? out.refusal : { code: 'VALUE_MALFORMED', fix: copy.doorsNoToken };
  /* THE RECORD'S OWN SENTENCE, VERBATIM (`13 §6`). It says whether the sign-in is stale or the host was started without
     `BRAINDOG_TOKEN`, and a paraphrase here would say that worse. A 401 WITH NO SLUG IN THE ADDRESS was the sample, and
     the screen drew the demo's sentence about having no account; there is no sample now, so it is a
     person not signed in, and the section's sign-in button is the way forward wherever they are. An unreachable host
     falls through to `refused` with the client's sentence, as it already did under a slug. */
  /* A STALE SIGN-IN WAS ASKED FOR IN PLACE ALREADY (`lib/reauth`); what comes back is the plain line for a Cancel. */
  if (isProof(refusal)) return { kind: 'refused', fix: refusal.fix };
  if (refusal.code === 'UNAUTHORIZED' || refusal.code === 'NEEDS_BROWSER_SESSION') return { kind: 'signin', fix: refusal.fix };
  return { kind: 'refused', fix: refusal.fix };
}

/** What the record's `doorFacts` answers for one door, beside the row `doors` already gave (`door-switch.ts`). */
type Facts = { on?: unknown; offSince?: unknown; lastArrival?: unknown; arrivals?: unknown; turnedAway?: unknown };

const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0);
const instant = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

/** A door's on or off and its counts, read as tolerantly as the rest of the row. */
function factsOf(d: Facts): Pick<Door, 'on' | 'offSince' | 'lastArrival' | 'arrivals' | 'turnedAway'> {
  const on = typeof d.on === 'boolean' ? d.on : null;
  return { on, offSince: on === false ? instant(d.offSince) : null, lastArrival: instant(d.lastArrival), arrivals: count(d.arrivals), turnedAway: count(d.turnedAway) };
}

/** The record's answer to `doors`, as the rows the screen draws. */
export function doorsOf(out: Answered): Listed {
  if (!out.ok) {
    /* A HOST THAT PREDATES THE READ. The client's own sentence, "There is no method called doors.", is true and says
       nothing the person can act on, so the screen says what it means for this section. */
    if ('refusal' in out && out.refusal.code === 'ROUTE_UNKNOWN') return { kind: 'refused', fix: copy.doorsNoRead };
    return refusedAs(out);
  }
  if (!Array.isArray(out.value)) return { kind: 'refused', fix: copy.doorsNoRead };
  const doors: Door[] = [];
  for (const raw of out.value as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const d = raw as { id?: unknown; description?: unknown; verify?: unknown; held?: unknown; register?: unknown } & Facts;
    /* A ROW WITH NO ID CANNOT BE MINTED FOR, so it is left out rather than drawn with a button that sends nothing. */
    const id = text(d.id);
    if (id === null) continue;
    doors.push({ id, name: text(d.description) ?? id, register: text(d.register), mintable: verifiedByPath(d.verify), held: d.held === true, ...factsOf(d) });
  }
  return { kind: 'doors', doors };
}

/** Read the record's webhook doors. */
export async function listDoors(call: Call): Promise<Listed> {
  return doorsOf(await call('doors'));
}

/**
 * Where a sender posts, from the path the mint answered.
 *
 * THE RECORD BUILDS THE PATH AND THIS ONLY PUTS A HOST IN FRONT OF IT. The old screen spelled the five segments itself,
 * which is one more place that has to agree with both doors' parsers; the mint now answers the path they read, so
 * the shape lives where it is served. THE TRAILING SLASH IS TAKEN OFF for `mailUrl`'s reason: a host typed by hand
 * carries one, and `//in/webhook` is a path neither door parses.
 */
export const doorUrl = (base: string, path: string): string => `${base.replace(/\/+$/, '')}${path}`;

/** What the screen shows after a press. Every arm but `minted` is a sentence rather than a failure. */
export type Said =
  | { kind: 'minted'; token: string; url: string | null }
  | { kind: 'signin'; fix: string }
  | { kind: 'refused'; fix: string };

/** One answer to `ingestMint`, as the screen says it. The answer is `{ ingest, token, rec, path }`. */
export function saidOf(out: Answered, base: string): Said {
  if (out.ok) {
    const v = (out.value ?? {}) as { token?: unknown; path?: unknown };
    /* A SUCCESS WITH NOTHING IN IT IS A HOST THIS SCREEN DOES NOT RECOGNISE. Printing `undefined` into an address is
       worse than saying so. */
    if (typeof v.token !== 'string' || v.token === '') return { kind: 'refused', fix: copy.doorsNoToken };
    /* A PATH THAT DOES NOT START WITH ONE SLASH IS NOT SHOWN AS AN ADDRESS. An older host answers none, and one
       starting `//` would be read by anything that follows it as a different host. The token is still the only copy
       there will be, so it is shown on its own with the sentence that says why. */
    const path = typeof v.path === 'string' && /^\/(?!\/)/u.test(v.path) ? v.path : null;
    return { kind: 'minted', token: v.token, url: path === null ? null : doorUrl(base, path) };
  }
  return refusedAs(out);
}

/**
 * Mint the token for one door. It replaces whatever the record held, and the token is answered once.
 *
 * `ingest` IS THE ID THE `doors` ANSWER GAVE, passed back as it came. Nothing in this app spells one.
 */
export async function mintDoor(call: Call, base: string, ingest: string): Promise<Said> {
  return saidOf(await call('ingestMint', { ingest }), base);
}

/**
 * Whether a press asks before it mints.
 *
 * A HELD TOKEN IS A SENDER THAT STOPS WORKING. Minting again replaces the digest in the same statement, so whatever
 * was posting to the old address is turned away from that moment, and the old screen minted on the first press with
 * the only warning a line of grey text under the button.
 */
export const asksFirst = (door: Door): boolean => door.held;

/* ── on and off ─────────────────────────────────────────────── */

/**
 * A day as the row says it: "3 October", with the year only when it is not this year's.
 *
 * `Intl` AND NOT A TABLE OF MONTHS, because it is the browser's own and adds nothing to what the screen loads. `tz` is
 * the reader's zone unless a caller names one, which a test does so the day is the same on every machine.
 */
export function dayWords(iso: string, now: number, tz?: string): string {
  const at = new Date(iso);
  const zone = tz === undefined ? {} : { timeZone: tz };
  const year = (d: Date) => new Intl.DateTimeFormat('en-GB', { year: 'numeric', ...zone }).format(d);
  const same = year(at) === year(new Date(now));
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', ...(same ? {} : { year: 'numeric' }), ...zone }).format(at);
}

/** "Off since 3 October. 12 turned away." for a door that is off, and `null` for one that is on. */
export function offLine(door: Pick<Door, 'on' | 'offSince' | 'turnedAway'>, now: number, tz?: string): string | null {
  if (door.on !== false) return null;
  const since = door.offSince === null ? 'Off.' : `Off since ${dayWords(door.offSince, now, tz)}.`;
  return `${since} ${door.turnedAway === 0 ? 'Nothing turned away.' : `${door.turnedAway} turned away.`}`;
}

/** "Last arrival 14 October, 9 in the last 7 days." or that nothing has arrived. */
export function lastLine(door: Pick<Door, 'lastArrival' | 'arrivals'>, now: number, tz?: string): string {
  if (door.lastArrival === null) return 'Nothing has arrived yet.';
  const week = door.arrivals === 0 ? 'none in the last 7 days' : `${door.arrivals} in the last 7 days`;
  return `Last arrival ${dayWords(door.lastArrival, now, tz)}, ${week}.`;
}

/** One web address that has fed this record, as What comes in lists it beside the scheduled fetches. */
export type Feed = { id: string; name: string; said: string };

/**
 * THE ADDRESSES THAT FEED THIS RECORD, newest arrival first, each with how long ago its last one came ("Last arrival 5
 * hours ago"). What comes in listed only the scheduled fetches under "Where new items come in from", and said "Nothing
 * feeds this record yet" while card texts were posted to a door every hour. A door that
 * has never been posted to feeds nothing, and is left to the doors' own tile.
 */
export function feedsOf(doors: readonly Pick<Door, 'id' | 'name' | 'lastArrival'>[], now: number): Feed[] {
  return doors
    .filter((d): d is typeof d & { lastArrival: string } => d.lastArrival !== null)
    .sort((a, b) => Date.parse(b.lastArrival) - Date.parse(a.lastArrival))
    .map((d) => ({ id: d.id, name: d.name, said: `Last arrival ${sinceWords(d.lastArrival, now)}` }));
}

/**
 * The switch's own name, for a reader who hears it: what pressing it does to which door. A description is often a
 * sentence, so its closing stop is left off, or the name would be heard to end before "takes arrivals".
 */
export const switchLabel = (door: Pick<Door, 'name'>): string => `${door.name.replace(/[.\s]+$/u, '')} takes arrivals`;

/** What a press on the switch answered. Every arm but `switched` is a sentence rather than a failure. */
export type Switched =
  | { kind: 'switched'; facts: Pick<Door, 'on' | 'offSince' | 'lastArrival' | 'arrivals' | 'turnedAway'> }
  | { kind: 'signin'; fix: string }
  | { kind: 'refused'; fix: string };

/** One answer to `doorSwitch`, as the row says it. */
export function switchedOf(out: Answered): Switched {
  if (out.ok) {
    const facts = factsOf((out.value ?? {}) as Facts);
    if (facts.on === null) return { kind: 'refused', fix: 'The door answered in a way this screen does not know. Read the list again.' };
    return { kind: 'switched', facts };
  }
  /* A HOST WITHOUT THE SWITCH. The client's "There is no method called doorSwitch." names a method, not a door. */
  if ('refusal' in out && out.refusal.code === 'ROUTE_UNKNOWN') return { kind: 'refused', fix: 'This BrainDog cannot switch a door off yet. Nothing was changed.' };
  return refusedAs(out);
}

/**
 * Switch one door off or on. Its address and its token are kept either way, so on again is the same address.
 *
 * `ingest` IS THE ID THE `doors` ANSWER GAVE, as `mintDoor` takes it.
 */
export async function switchDoor(call: Call, ingest: string, on: boolean): Promise<Switched> {
  return switchedOf(await call('doorSwitch', { ingest, on }));
}

/** The row with what a switch answered laid over it. */
export const switched = (door: Door, facts: Extract<Switched, { kind: 'switched' }>['facts']): Door => ({ ...door, ...facts });
