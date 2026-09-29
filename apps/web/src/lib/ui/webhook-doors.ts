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
import type { Fetch } from '../record/boot-live.ts';
import { copy } from '../copy.ts';

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
export type Door = { id: string; name: string; register: string | null; mintable: boolean; held: boolean };

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
  if (refusal.code === 'UNAUTHORIZED' || refusal.code === 'NEEDS_BROWSER_SESSION') return { kind: 'signin', fix: refusal.fix };
  return { kind: 'refused', fix: refusal.fix };
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
    const d = raw as { id?: unknown; description?: unknown; verify?: unknown; held?: unknown; register?: unknown };
    /* A ROW WITH NO ID CANNOT BE MINTED FOR, so it is left out rather than drawn with a button that sends nothing. */
    const id = text(d.id);
    if (id === null) continue;
    doors.push({ id, name: text(d.description) ?? id, register: text(d.register), mintable: verifiedByPath(d.verify), held: d.held === true });
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
