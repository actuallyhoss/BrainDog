/**
 * `/in/*`: the way something gets INTO a record from outside. `33 §4`, `51 §5.4`, `49 §5.16`, `12 §3`.
 *
 * THIS ROUTE DID NOT EXIST, AND `@braindog/extract` WAS THEREFORE UNREACHABLE. Grepped on 2026-09-20
 * across `packages/host/src`, `apps/worker/src` and `apps/selfhost/src`: two mentions of `/in/`, both
 * comments saying the route is not built yet (`apps/worker/src/route.ts:52`, `apps/selfhost/src/main.ts:319`).
 * The whole ingest pipeline is built, tested and wired to nothing: a record could parse a bank SMS and
 * had no door for one to arrive at.
 *
 * AN ARRIVAL NOBODY UNDERSTANDS IS STILL STORED, and that is the one rule here worth stating twice. The
 * predecessor drops an unmatched SMS silently, so "why did that not come through" has no answer on it.
 * Here the bytes are handed to the record FIRST, whatever the verification said and whatever the payload
 * turns out to be, and the verification only decides whether the row is eligible to match (`12 §3`). A
 * wrong token is a row somebody can look at, not a 403 nobody ever sees.
 *
 * SO THE REFUSALS ABOVE THAT LINE ARE THE SECURITY, and there are exactly four: a path shape nobody
 * serves, an ingest nobody declared, a budget already spent, and a body over the ceiling. Everything
 * that gets past those four is stored. `serveIngest` cannot mint a credential, cannot read one, and
 * refuses the whole surface when a host wires no door, the way `/auth/provision` answers `off()` with
 * no operator key set.
 *
 * THE ANSWER CARRIES NOTHING. 202 and an empty body for every payload that was stored, so a stranger
 * holding a URL cannot tell a pattern that matched from one that did not, cannot count the rows they
 * wrote, and cannot use this surface to ask questions of the record. `49 §5.16` says 202 twice and
 * `51 §5.4` step 5 says 200; 202 is the one taken here, because it is the more specified of the two
 * and because the work is genuinely still to come when this returns.
 *
 * NOTHING HERE LOGS, and nothing echoes. A token is compared as a digest and never returned; a record's
 * own refusal is replaced with one sentence of this file's own, because the caller is a stranger.
 *
 * THE RECORD'S HALF LANDED ON 2026-09-20 AND THIS FILE DID NOT CHANGE FOR IT, which is what the flag
 * below was carried for. `kernel.arrive` now takes `verified`, and `false` makes the row ineligible:
 * the declarations are not read at all for one, so "unverified stays untriaged and never matches" is
 * a property of the record rather than a note on a row. Measured before the change, against the same
 * bytes sent twice: with `verified: false` the payload was matched, extracted and written into a
 * register, and three unverified arrivals of one shape queued a model draft somebody pays for.
 *
 * A PATH TOKEN OR A SIGNATURE, SINCE DOR-3. `12 §3` names a random path token and `25 §3.2` an HMAC;
 * `declare.ts` takes `verify: { kind: path }` on a webhook, and `hmac_sha256`, `stripe` and `github`
 * with `key:` naming a keychain label. For a token the record keeps the minted token's digest and answers
 * it, and `hook` digests the URL's segment and compares. For a signature the host hands `ingestVerify`
 * its opener, the record answers the key opened, and `hook` checks the raw bytes against the header:
 * `signed` for an HMAC (a GitHub door is one, under `X-Hub-Signature-256`) and `verifyStripe` for
 * Stripe's `t=,v1=`, the one Stripe check in the repository. An ingest that declares no verifier, one
 * nobody has minted a token for, or one whose key is missing or does not open is answered
 * `{ kind: 'none' }`, and every arrival at it is stored `untriaged` and matched by nothing, which is
 * `12 §3` the right way round: the pipeline is reachable, and nothing is trusted that nobody vouched
 * for. A wrong or missing signature is answered exactly as a wrong token is: stored, and never matched.
 *
 * FORWARDED MAIL IS THE OTHER CHANNEL THAT CAN BE ELIGIBLE, and `forwarderPassed` below is
 * where that whole decision lives. It has been wrong twice, once by believing a verdict the sender
 * wrote itself and once by believing a real verdict that was about somebody else's domain, and its
 * own header says what each of the two cost.
 */

import type { Refusal, Result } from '@braindog/ports';

import { AUTHSERV, verdictValue, type TxtLookup } from './dkim.ts';
import { verifyStripe } from './stripe-sign.ts';

/** The two channels this route terminates. `30 §1`'s five, minus the three that do not arrive over HTTP. */
export type IngestChannel = 'webhook' | 'email';

/**
 * A path this route serves, parsed.
 *
 * TWO WEBHOOK SHAPES, BECAUSE THE TWO HOSTS GENUINELY DIFFER. On the Cloud the URL is
 * `/in/webhook/<rec_id>/<ingest-id>/<token>`, because one Worker serves every record and the random
 * segment is the default verification (`33 §4`); a self-host serves one record and `49 §231` writes it
 * `/in/webhook/<ingest-id>`, verified by the declaration's `verify:` alone. Serving one shape would have
 * meant a route that exists in one host and not the other, which is the fault this package exists to
 * prevent, so both are parsed here and each host declines what it does not resolve.
 *
 * AND THE CLOUD SHAPE WITHOUT ITS TOKEN, `/in/webhook/<rec_id>/<ingest-id>`, for a signed door.
 * A Stripe or GitHub door is verified by the signature over its body, so a token segment there would be
 * a second secret nothing reads. At a path-token door the same shape is a missing token, stored
 * `untriaged` exactly as a wrong one is.
 */
export type IngestPath =
  | { channel: 'webhook'; ingest: string; rec?: string; token?: string }
  | { channel: 'email'; token: string };

/**
 * What proves a caller is the sender this ingest expects.
 *
 * `none` IS A REAL ANSWER AND NOT AN OVERSIGHT. An ingest may be declared with nothing to check, and the
 * honest result of checking nothing is `verified: false`: the row is stored and stays untriaged. Leaving
 * it out would have made "no verification" indistinguishable from "an ingest nobody declared", which is
 * a 404, and those two want different answers.
 *
 * `hmac_sha256` CARRIES THE KEY ALREADY UNSEALED, because unsealing is the host's: the Worker's binding
 * and the self-host's key store are the half that differs (`sealing.ts`'s own header). This file takes
 * bytes and does the comparison, once, for both.
 *
 * `path` CARRIES THE TOKEN'S SHA-256 IN HEX, which is all a record keeps (`ingestMint` in
 * `packages/record/src/index.ts`). It once carried the token itself, and measured at
 * `15a6aa33` that shape could never be answered: the record keeps no token, so it said `none` and the
 * right token posted through the Worker's door was stored `untriaged`. `hook` digests the segment and
 * compares the digests.
 *
 * THE `token` SPELLING IS STILL TAKEN, AND ONLY BY TESTS. `packages/host/test/ingest.test.ts` and
 * `apps/worker/test/ingest.test.ts` build `{ kind: 'path', token }` doors of their own, and neither file
 * was this change's to edit; it is digested on arrival here, so both spellings meet the same comparison.
 * Nothing in either host answers it, and it goes when those two tests move to `sha256`.
 *
 * `stripe` CARRIES THE SIGNING SECRET AS TEXT AND ITS WINDOW IN SECONDS, because that is what
 * `verifyStripe` takes: Stripe keys its HMAC with the `whsec_` string itself, and the window is how far
 * the signed `t=` may be from this host's clock.
 */
export type IngestVerify = (
  | { kind: 'path'; sha256: string }
  | { kind: 'path'; token: string }
  | { kind: 'hmac_sha256'; header: string; key: Uint8Array }
  | { kind: 'stripe'; header: string; secret: string; tolerance: number }
  | { kind: 'none' }
) &
  /**
   * THE DOOR IS SWITCHED OFF, and whatever verifies it is kept, because on again is the same address. An
   * arrival at it is answered 410 with no body, counted through `turnedAway`, and stored nowhere.
   */
  { off?: true };

/** An arrival the host turned away at a door that is off: which door, or which record's mailbox, and by what channel. */
export type IngestTurnedAway = { channel: IngestChannel; rec?: string; ingest?: string };

/**
 * What `inbound` answers for a mail token: the record it names, or that record with its mailbox switched off.
 *
 * THE BARE STRING IS STILL AN ANSWER, so a host written before a mailbox could be off answers as it did.
 */
export type IngestInbound = string | { rec: string; off?: true } | null;

/** One arrival, as the host hands it to the record. `kernel.arrive`'s `Arrival` plus who it is for and whether it is eligible. */
export type IngestArrival = {
  /** The record named in the path, or the one the inbound token resolved to. Absent on a host serving one record. */
  rec?: string;
  /** The declaration the URL names. Mail names none: a message is matched against every ingest on the record. */
  ingest?: string;
  channel: IngestChannel;
  /** Lower-cased names, because a header's case is a fact about a sender and not about the arrival (`30 §1`). */
  headers: Record<string, string>;
  body: string;
  sha256: string;
  /** `12 §3`: an unverified payload is stored and never matched. */
  verified: boolean;
};

/**
 * The host's half. Absent, and `/in/*` is not a route at all.
 *
 * `limit` IS REQUIRED AND THE OTHERS ARE NOT, and that is deliberate. This is the one surface a stranger
 * reaches with no credential and still gets a write out of, so a host cannot open it without having
 * decided what a sender is allowed to spend. Making it optional would have meant the first host to wire
 * this shipped an unbudgeted write endpoint, and nobody would have found out until the disk filled.
 */
export type IngestDoor = {
  /** What verifies this ingest, or `null` for one nobody declared. */
  verify(ask: { rec?: string; ingest: string }): Promise<IngestVerify | null>;
  /** Store the raw arrival. Everything after storing it is the record's. */
  arrive(arrival: IngestArrival): Promise<Result<unknown>>;
  /** Whole seconds to wait, or `null` to let this one through. */
  limit(ask: { channel: IngestChannel; key: string }): Promise<number | null>;
  /**
   * The record an inbound mail token names, by the token's SHA-256 in hex, or `null`.
   *
   * THE DIGEST AND NOT THE TOKEN, because there is no id in this URL to look a record up by: the token
   * IS the lookup key, and a lookup key passed in the clear is a credential in whatever index the host
   * keeps. The digest is the same key with the secret taken out of it, and the host compares it against
   * the digest of the one `init` wrote (`49 §5.16` step 2).
   *
   * ABSENT IS A HOST THAT TAKES NO FORWARDED MAIL, and the path then answers 404 like any other.
   */
  inbound?(tokenHash: string): Promise<IngestInbound>;
  /**
   * Count one arrival answered 410 at a door that is off (the record's `turnedAway`). Absent, the 410 is still the
   * answer and nothing is counted. A count that fails does not change the answer: the sender was turned away either way.
   */
  turnedAway?(ask: IngestTurnedAway): Promise<void>;
  /**
   * Keep one attachment in the record's file store, and answer what it was kept as, or `null` for one it does not take.
   *
   * THE HOST'S OWN STORE AND ITS OWN RULES (`/api/files`): the same sniffed types and the same ceiling a person
   * uploading the file would meet, so mail is no side door into the store for a type it refuses. A file answered `null`
   * is still named on the arrival with its size, so "there was a PDF on that message" stays true when the PDF was not kept.
   *
   * ABSENT IS A HOST WITH NO FILE STORE, and every attachment is then named and sized and nothing more.
   */
  keep?(ask: { rec: string; name: string; type: string; bytes: Uint8Array<ArrayBuffer> }): Promise<{ sha256: string; mime: string } | null>;
  /**
   * The DNS this host asks for DKIM keys, so mail posted to `POST /in/email/<token>` can be checked HERE (`dkim.ts`).
   *
   * ABSENT IS A HOST THAT CHECKS NOTHING POSTED OVER HTTP, and every message posted there is stored unverified, which is
   * the Cloud's answer: its mail arrives through Email Routing, whose handler checks the signatures itself and hands the
   * verdict over as `serveIngest`'s third argument. The self-host has no MX, so its only mail door is the HTTP one and it
   * checks the bytes it was posted. What neither host does is believe a line the message carries (SEC1).
   */
  dkim?: TxtLookup;
};

/**
 * This host's own verdict on a message, handed over beside it by the code that checked it: the value of an
 * `Authentication-Results` line (`braindog; dkim=pass header.d=bank.example`).
 *
 * AN ARGUMENT AND NEVER A HEADER, because anything in a request can be written by whoever sends it. Only code in this
 * process can pass it: the Worker's Email Routing handler (`apps/worker/src/email.ts`) does, and an HTTP request cannot.
 */
export type MailStamp = { readonly verdict: string };

/**
 * One attachment as the arrival names it, in the shape a `file` field holds (`kernel/src/coerce.ts`), less `sha256` when
 * the host did not keep the bytes. With `sha256` it is readable at `/api/files/<sha256>` by anybody who reads the record.
 */
export type IngestFile = { name: string; mime: string; bytes: number; sha256?: string };

/**
 * The header an arrival's attachments ride on, as JSON: an `IngestFile[]`.
 *
 * A HEADER BECAUSE THE ARRIVAL HAS NO OTHER PLACE FOR THEM, and the record already stores, shows and matches over the
 * headers. A sender can type this name into its own message, so any copy of it in the message is dropped before this
 * file writes its own: what the row says was attached is what this host found and kept, never what the sender claimed.
 */
export const FILES_HEADER = 'x-braindog-files';

/** `51 §5.4` step 1, and the ceiling `/mcp` already uses. */
const WEBHOOK_LIMIT = 1_048_576;
/** `01 §5`'s five mebibytes for a message. A forwarded RFC 5322 body carries its attachments inline. */
export const EMAIL_LIMIT = 5_242_880;

/**
 * A segment longer than this is not an id and not a token, and refusing it here is what keeps a
 * megabyte of URL from being handed to a host's storage as a lookup key.
 */
const SEGMENT_LIMIT = 256;

/**
 * Which of the three shapes a path is, or `null`.
 *
 * REPEATED AND TRAILING SLASHES ARE FORGIVEN, the way `servesKeys` forgives them, because a forwarding
 * webhook's URL is typed into somebody else's settings screen and `//` is what a concatenated base and
 * path produce.
 */
export function servesIngest(pathname: string): IngestPath | null {
  const segments: string[] = [];
  for (const raw of pathname.split('/')) {
    if (raw === '') continue;
    if (raw.length > SEGMENT_LIMIT) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      /* `decodeURIComponent` THROWS ON A BROKEN ESCAPE, and a URI nobody can decode is a URI nobody
         minted. Letting it through would have meant `%ZZ` reaching a host as an ingest id. */
      return null;
    }
    if (decoded === '') return null;
    segments.push(decoded);
  }
  if (segments[0] !== 'in') return null;
  const [, what, a, b, c] = segments;
  if (what === 'webhook') {
    if (segments.length === 3 && a !== undefined) return { channel: 'webhook', ingest: a };
    if (segments.length === 4 && a !== undefined && b !== undefined) return { channel: 'webhook', rec: a, ingest: b };
    if (segments.length === 5 && a !== undefined && b !== undefined && c !== undefined)
      return { channel: 'webhook', rec: a, ingest: b, token: c };
    return null;
  }
  if (what === 'email' && segments.length === 3 && a !== undefined) return { channel: 'email', token: a };
  return null;
}

/* ── the answers ─────────────────────────────────────────────────────────── */

type Header = readonly [string, string];

const HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

/**
 * 404 AND 405 CARRY NO BODY AT ALL, which is the same choice `/s/<token>` makes: a wrong capability
 * should look like nothing. A sentence saying which of the three shapes was wrong would be a way to
 * enumerate the ingests on a record one request at a time.
 */
const nothing = (status: number, extra: readonly Header[] = []): Response => {
  const headers = new Headers([['cache-control', 'no-store']]);
  for (const [k, v] of extra) headers.append(k, v);
  return new Response(null, { status, headers });
};

function refusal(status: number, refused: Refusal, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify({ ok: false, refusal: refused }), { status, headers });
}

/**
 * The record could not take it, and the sender should send it again later.
 *
 * ITS OWN SENTENCE AND NOT THE RECORD'S. A refusal is written for the person who can fix it, and the
 * caller here is a machine at a bank. "Every owner of this record is suspended" is true, useful to an
 * owner, and none of a stranger's business.
 */
const UNAVAILABLE: Refusal = {
  code: 'RECORD_UNAVAILABLE',
  fix: 'This BrainDog cannot take arrivals right now. Send it again in a few minutes.',
};

/**
 * 413 ANSWERS `BODY_MALFORMED`, WHICH IS THE NEAREST CODE IN THE REGISTRY AND NOT A NEW ONE.
 * `30 §6` has no code for "too big", and `index.ts`'s own note is the reason this does not invent one:
 * a code invented at a boundary is a code no client can look up. The status is what says it was the size.
 */
const tooBig = (limit: number): Refusal => ({
  code: 'BODY_MALFORMED',
  fix: `An arrival on this channel is at most ${limit} bytes.`,
  at: 'body',
});

/* ── the bytes ───────────────────────────────────────────────────────────── */

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => hex(await crypto.subtle.digest('SHA-256', bytes));

const utf8 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(new TextEncoder().encode(text));

/**
 * Two secrets compared without saying WHERE they differ.
 *
 * THIS IS `auth.ts`'s `sameKey` AND IS DELIBERATELY NOT AN IMPORT OF IT. `auth.ts` imports `./index.ts`
 * for `httpStatus`, and `index.ts` re-exports this file, so importing a value from `auth.ts` here would
 * close a cycle and pull the entire sign-in surface into every importer of `@braindog/host`. Eight lines
 * of duplicate is the cheaper of the two, and the shape is worth knowing anyway: digest both sides first,
 * so the loop always runs over 32 bytes and the comparison time says nothing about the length either.
 */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', utf8(a)), crypto.subtle.digest('SHA-256', utf8(b))]);
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let differ = 0;
  for (let i = 0; i < p.length; i++) differ |= (p[i] ?? 0) ^ (q[i] ?? 0);
  return differ === 0;
}

/**
 * Every header of the request, lower-cased, minus the three that may carry a credential.
 *
 * A RAW ROW IS KEPT FOREVER, WHICH IS WHAT MAKES THIS NOT A TIDINESS RULE. A sender that puts its
 * bearer on the request by mistake would otherwise have that bearer written into `inbox_raw`, read
 * back by every `where:` over the arrival, and carried out in an export. The signature header stays:
 * it is a proof over these exact bytes and is worth nothing once they have been stored.
 */
const CREDENTIAL_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);

function headersOf(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of request.headers) {
    const key = name.toLowerCase();
    if (CREDENTIAL_HEADERS.has(key)) continue;
    /* WHAT WAS ATTACHED IS THIS HOST'S TO SAY, at a webhook as at the mailbox (`FILES_HEADER`): a sender typing this name put
       any file of the record, by its hash, on the row its arrival filed. */
    if (key === FILES_HEADER) continue;
    out[key] = value;
  }
  return out;
}

/**
 * The header block of a forwarded RFC 5322 message, unfolded and lower-cased.
 *
 * THE MESSAGE IS THE BODY HERE, WHICH IS WHAT MAKES THIS NECESSARY AT ALL. On the Cloud the runtime
 * hands the Worker a parsed message; a self-host has no MX and takes the raw bytes over HTTP from a
 * forwarder (`49 §13` #3), so the same seven names a `match:` can ask about (`34 §1.9`) have to be read
 * out of the text before the record sees it. Without this, `from is "alerts@bank.example"` would be
 * false for every forwarded message and every mail rule would be silent.
 *
 * A REPEATED NAME KEEPS EVERY HOP, joined. `Authentication-Results` arrives once per forwarder and
 * `Received` once per relay; last-wins would throw away the hop that actually passed DKIM, which is the
 * one value this function exists to read.
 *
 * SINGLE PASS AND NO PATTERN. A stranger's message is exactly the input a backtracking header regex
 * turns into an outage, which is the rule `@braindog/extract` states for its own scanners.
 */
export function messageHeaders(raw: string): Record<string, string> {
  return joinHead(headLines(raw));
}

function joinHead(head: (readonly [string, string])[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of head) {
    const had = out[name];
    out[name] = had === undefined ? value : `${had}, ${value}`;
  }
  return out;
}

/**
 * The head, unfolded and lower-cased, IN THE ORDER IT ARRIVED and with the repeats still separate.
 *
 * THE ORDER IS LOAD BEARING AND THE JOINED MAP THROWS IT AWAY, which is what this function exists for.
 * Measured: a message carrying its own `Authentication-Results: x; dkim=pass` under the
 * forwarder's `dkim=fail; spf=fail` was stored `verified: true`, because eligibility was a substring
 * search over the joined value and the join cannot say which hop wrote which half. The record still
 * wants the join (a `match:` over `received` wants every relay), so both shapes are built from this one.
 */
function headLines(raw: string): (readonly [string, string])[] {
  const crlf = raw.indexOf('\r\n\r\n');
  const lf = raw.indexOf('\n\n');
  const end = crlf === -1 ? (lf === -1 ? raw.length : lf) : lf === -1 ? crlf : Math.min(crlf, lf);
  const out: (readonly [string, string])[] = [];
  let name = '';
  let value = '';
  const keep = (): void => {
    if (name !== '') out.push([name, value] as const);
  };
  for (const line of raw.slice(0, end).split('\n')) {
    const text = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (text === '') continue;
    /* A LINE STARTING WITH WHITESPACE CONTINUES THE ONE ABOVE IT, and the join is a single space: a
       folded `Authentication-Results` means one sentence and a tab in the middle of it is a fact about
       somebody's mail server. */
    if (text.startsWith(' ') || text.startsWith('\t')) {
      if (name !== '') value = `${value} ${text.trim()}`;
      continue;
    }
    const colon = text.indexOf(':');
    /* A LINE WITH NO COLON IN THE HEAD IS NOT A HEADER, and the likeliest cause is a message whose
       head and body were separated by something this function does not read. It is dropped rather
       than guessed at; the whole message is stored either way. */
    if (colon <= 0) continue;
    keep();
    name = text.slice(0, colon).trim().toLowerCase();
    value = text.slice(colon + 1).trim();
  }
  keep();
  return out;
}

/**
 * A domain out of an address, lower-cased, or `null` for text that is not one.
 *
 * THE SHAPE TEST AT THE END IS THE POINT OF THE FUNCTION. Everything this reads is a stranger's
 * typing, and the value is about to decide whether a bank alert is believed, so anything that is not
 * a plain dotted name answers `null` rather than a best guess: `bank.example>` and `bank.example (by
 * us)` and an empty string all become "no domain", and "no domain" never aligns with anything.
 */
function domainOf(address: string): string | null {
  const open = address.lastIndexOf('<');
  const close = open === -1 ? -1 : address.indexOf('>', open);
  const one = open !== -1 && close !== -1 ? address.slice(open + 1, close) : address;
  const at = one.lastIndexOf('@');
  if (at === -1) return null;
  let domain = one.slice(at + 1).trim().toLowerCase();
  /* A TRAILING DOT IS THE SAME NAME. `bank.example.` is the fully qualified spelling of one domain,
     and a sender writing it that way would otherwise fail to align with itself. */
  while (domain.endsWith('.')) domain = domain.slice(0, -1);
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

/**
 * Anything in an address line that cannot be part of an address, so what is left are the candidates.
 *
 * ANGLE BRACKETS ALONE ARE NOT ENOUGH, and the parentheses are the reason this is a character class
 * rather than a `split('<')`. `From: bot@evil.example (alerts@bank.example)` is RFC 5322's comment
 * form and spells two addresses with no angle bracket anywhere; a split that stopped at `<` and `>`
 * would have read one of them and handed the other to the record unexamined.
 */
const NOT_ADDRESS = /[^a-z0-9!#$%&'*+\-/=?^_`{|}~.@]+/gi;

/**
 * Every domain a `From:` line spells, and not only the one a mail client would deliver to.
 *
 * THE CHECK AND THE `match:` READ DIFFERENT STRINGS, WHICH IS WHAT THIS CLOSES. Alignment reads the
 * address, and a record's `match:` reads the whole header value as text, so a domain sitting in the
 * display name is invisible to the first and decisive for the second. Measured end to end on
 * 2026-09-20 against the self-host, with alignment already in place: a message signed correctly by
 * `evil.example` and carrying `From: "alerts@hsbc.example" <bot@evil.example>` aligned, because the
 * delivered address really is `evil.example`, and a pattern written `from contains
 * "alerts@hsbc.example"` then matched it and wrote EGP 9,999.00 at the attacker's merchant into the
 * register. Every domain on the line has to be covered, or the two readings disagree and the
 * disagreement is the forgery.
 *
 * A TOKEN THAT IS NOT A DOMAIN IS DROPPED AND NOT REFUSED, because a display name may hold a bare
 * `@` or a word with one in it, and quarantining every sender who writes `Bank @ Home` would cost
 * more mail than it saves. What is dropped cannot make a `pass`: only a whole dotted name is kept,
 * and every name kept has to align.
 */
function fromDomains(value: string): string[] {
  const out: string[] = [];
  for (const token of value.replace(NOT_ADDRESS, ' ').split(' ')) {
    if (!token.includes('@')) continue;
    const domain = domainOf(token);
    if (domain !== null) out.push(domain);
  }
  return out;
}

/** The identity an `Authentication-Results` property names, which may be a domain, `@domain`, or an address. */
const authDomain = (value: string | undefined): string | null =>
  value === undefined ? null : domainOf(value.includes('@') ? value : `x@${value}`);

/**
 * Whether a domain a forwarder authenticated covers the `From:` a person will read.
 *
 * RELAXED, AND IN ONE DIRECTION ONLY. A bank signs with `d=bank.example` and sends
 * `From: alerts@e.bank.example`, so the From being a subdomain of the signer has to pass or ordinary
 * bank mail is quarantined. The other direction is refused: a signature by `e.bank.example` does not
 * speak for `bank.example`, because a subdomain is the part of a name an attacker most often gets.
 */
const aligns = (auth: string | null, from: string): boolean => auth !== null && (auth === from || from.endsWith(`.${auth}`));

/**
 * Whether one authenticated identity covers EVERY domain the `From:` line spells.
 *
 * `every` AND NOT `some`, and an empty list is no. One verdict has to answer for the whole line,
 * because the record matches on the whole line: a verdict that covers one of two addresses on it
 * leaves the other one vouched for by nothing and readable by a `contains`.
 */
const covers = (auth: string | null, claimed: readonly string[]): boolean =>
  claimed.length > 0 && claimed.every((one) => aligns(auth, one));

/**
 * The parenthesised comments of a header value removed, so a verdict cannot be hidden inside one.
 *
 * RFC 8601 PUTS THE HUMAN EXPLANATION IN PARENTHESES, and a forwarder writes
 * `dkim=fail (body hash did not verify)`. Those characters are not a result and must not be scanned
 * as one. Escapes inside a comment are not handled, because the only effect of getting one wrong is
 * that a few more characters are dropped, and dropped characters cannot make a `pass` appear.
 */
function uncommented(text: string): string {
  let depth = 0;
  let out = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

type Resinfo = { method: string; result: string; props: Record<string, string> };

/**
 * One `Authentication-Results` value split into its per-method verdicts.
 *
 * THE FIRST CHUNK IS THE `authserv-id` AND IS DROPPED, which is what the `slice(1)` is. It names the
 * MTA that wrote the line and carries no verdict, and reading it as one would make a forwarder called
 * `dkim=pass.example` a verdict of its own.
 *
 * PROPERTIES AND NOT JUST RESULTS, because the result on its own is the hole this function was
 * written to close: `dkim=pass` means somebody's key signed the bytes, and `header.d` is the only
 * part that says whose.
 */
function results(value: string): Resinfo[] {
  const out: Resinfo[] = [];
  for (const chunk of uncommented(value).split(';').slice(1)) {
    const [verdict, ...rest] = chunk.trim().split(/\s+/).filter((part) => part !== '');
    if (verdict === undefined) continue;
    const eq = verdict.indexOf('=');
    if (eq <= 0) continue;
    const props: Record<string, string> = {};
    for (const part of rest) {
      const i = part.indexOf('=');
      if (i > 0) props[part.slice(0, i).toLowerCase()] = part.slice(i + 1).replaceAll('"', '').toLowerCase();
    }
    out.push({ method: verdict.slice(0, eq).toLowerCase(), result: verdict.slice(eq + 1).toLowerCase(), props });
  }
  return out;
}

/**
 * Whether this host's own verdict (`said`) says the message is who its `From:` claims to be.
 *
 * NO LINE IN THE MESSAGE IS READ AS A VERDICT, NOT EVEN THE TOP ONE (SEC1, 30 Oct). The first cut searched the joined
 * value of every hop and a sender's own `Authentication-Results: x; dkim=pass` passed; the second read only the top
 * line, as a forwarder writes it, and that still passed a stranger who posted the whole message to
 * `POST /in/email/<token>` with a top line of their own. `said` is handed in by the code that checked the signatures.
 *
 * AND THE VERDICT MUST BE ABOUT THE `From:` THAT A PERSON WILL READ, which is the forgery after that
 * one and the reason this function stopped being a substring search. DKIM says "the holder of the key
 * for `header.d` signed these bytes" and says nothing at all about the `From:` line: a stranger who
 * owns `evil.example`, signs with it correctly, and writes `From: alerts@hsbc.example` collects a
 * genuine `dkim=pass` from the forwarder. Measured end to end against the self-host,
 * that message was stored `matched`, extracted, and written into the record's register as a bank
 * debit of the attacker's chosen amount at the attacker's chosen merchant. So a verdict counts only
 * when the identity it authenticated aligns with the From domain, which is DMARC's own question.
 *
 * AND WITH EVERY DOMAIN THE LINE SPELLS, NOT ONLY THE ONE IT DELIVERS TO. Alignment against the
 * address alone reads a different string from the one a record's `match:` reads, and the gap is
 * wide enough to drive the same forgery through: measured with alignment in place,
 * `From: "alerts@hsbc.example" <bot@evil.example>` signed by `evil.example` aligned, and a pattern
 * written `from contains "alerts@hsbc.example"` matched it and wrote the attacker's amount into the
 * register. `fromDomains` reads the whole line and `covers` makes one verdict answer for all of it.
 *
 * `spf=pass` IS STILL TAKEN AND WILL ALMOST NEVER APPLY, and that is honest rather than a change of
 * mind. `49 §5.16` step 2 says either method may carry it and `51 §5.4` step 3 says both must, and
 * the self-host's own acceptance row passes `dkim=pass` with no SPF result; SPF authenticates the
 * envelope sender, a forwarding MTA rewrites it to its own bounce address, and the rewritten address
 * does not align with the From. So the rule is unchanged and the outcome is that forwarded mail is
 * carried by DKIM, which is what forwarded mail has always been carried by.
 *
 * NO `From:`, OR TWO OF THEM, IS `false`. RFC 5322 allows exactly one, and a message with two is one
 * where this function cannot say which address the alignment was against and the record cannot say
 * which one its `match:` read. An absent verdict is `false` too, and the row is stored either way.
 */
/** The host an `Authentication-Results` value names as its author (RFC 8601 `authserv-id`), lower-cased, comments dropped. */
const authservOf = (value: string): string =>
  (value.split(';')[0] ?? '')
    .replace(/\([^)]*\)/gu, ' ')
    .trim()
    .split(/\s+/u)[0]
    ?.toLowerCase() ?? '';

const forwarderPassed = (head: (readonly [string, string])[], said: string): boolean => {
  const from = head.filter(([name]) => name === 'from');
  const claimed = from.length === 1 && from[0] !== undefined ? fromDomains(from[0][1]) : [];
  if (claimed.length === 0) return false;
  return results(said).some(
    (r) =>
      r.result === 'pass' &&
      ((r.method === 'dkim' && covers(authDomain(r.props['header.d'] ?? r.props['header.i']), claimed)) ||
        (r.method === 'spf' && covers(authDomain(r.props['smtp.mailfrom'] ?? r.props['smtp.helo']), claimed))),
  );
};

/* ── the door ────────────────────────────────────────────────────────────── */

/**
 * Whether the HMAC the sender put in the named header is the one these bytes earn.
 *
 * THE `sha256=` PREFIX IS TAKEN, because that is how every sender this will meet writes it. An absent
 * header is `false` rather than a refusal: `12 §3` is that an unverified payload is stored and ignored,
 * and a sender that has not configured its signature yet should be visible in the inbox rather than
 * absent from the record.
 */
async function signed(request: Request, body: Uint8Array<ArrayBuffer>, v: Extract<IngestVerify, { kind: 'hmac_sha256' }>): Promise<boolean> {
  const said = request.headers.get(v.header);
  if (said === null) return false;
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(v.key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hex(await crypto.subtle.sign('HMAC', key, body));
  const got = said.trim().toLowerCase();
  return sameSecret(got.startsWith('sha256=') ? got.slice(7) : got, want);
}

/**
 * Whether the URL's last segment is the token whose digest the record holds.
 *
 * THE SEGMENT IS DIGESTED FIRST AND THE RECORD'S VALUE NEVER IS, and the order is the security. Comparing the
 * segment against the stored digest as it stands would make the digest the password, so a copy of a record, which
 * carries the digest in its header, would be a working URL. `sameSecret` then digests both sides again to keep
 * the comparison to 32 bytes, so the time it takes says nothing about where the two differ.
 */
async function pathToken(segment: string, v: Extract<IngestVerify, { kind: 'path' }>): Promise<boolean> {
  const want = 'sha256' in v ? v.sha256 : await digest(utf8(v.token));
  return sameSecret(await digest(utf8(segment)), want.toLowerCase());
}

/**
 * Whether Stripe signed this body, within the declared window of this host's clock.
 *
 * `verifyStripe` AND NOTHING OF THIS FILE'S OWN: the billing webhook calls the same
 * function, so the repository has one Stripe check and not two that could disagree. The text handed in is the body
 * decoded once and never parsed, the string Stripe signed. An absent header is `false`, as `signed` answers one.
 */
async function stripeSigned(request: Request, body: string, v: Extract<IngestVerify, { kind: 'stripe' }>): Promise<boolean> {
  const said = request.headers.get(v.header);
  if (said === null) return false;
  return verifyStripe(body, said, v.secret, Math.floor(Date.now() / 1000), v.tolerance);
}

/**
 * Answer one `/in/*` request.
 *
 * THE ORDER IS THE SECURITY, so it is worth reading as one list: the shape of the path, whether this
 * host has a door at all, the method, the budget, then who this ingest is for, then the size, then the
 * bytes, and only then the record. Nothing that costs storage happens before the budget, and nothing
 * that costs a database round trip happens before the path has resolved to something a host declared.
 *
 * THE BUDGET IS ASKED ON THE PATH AND NOT ON THE SENDER'S ADDRESS, because the address of a webhook is
 * whatever proxy a provider happens to be using that hour, and because a flood aimed at one ingest is
 * the failure that matters: it is the one that fills a record. A stranger guessing ids gets 404s, which
 * cost a lookup and no row.
 */
export async function serveIngest(request: Request, door: IngestDoor | undefined, stamp?: MailStamp): Promise<Response> {
  const path = servesIngest(new URL(request.url).pathname);
  if (path === null) return nothing(404);
  /* A HOST THAT WIRED NO DOOR HAS NO ROUTE, which is `auth.ts`'s answer for an unset operator key: the
     code path exists, the secret does not, and the surface is simply not there. THIS IS ASKED BEFORE
     THE METHOD, and the first cut had it after: `GET /in/webhook/x` then answered 405 with `allow: POST`
     on a host with no ingest wiring at all, which tells a scanner the endpoint is in the build and the
     operator has merely not turned it on. 405 is a statement that the resource exists. */
  if (door === undefined) return nothing(404);
  if (request.method !== 'POST') return nothing(405, [['allow', 'POST']]);

  const key = path.channel === 'email' ? await digest(utf8(path.token)) : `${path.rec ?? ''}/${path.ingest}`;
  let wait: number | null;
  try {
    wait = await door.limit({ channel: path.channel, key });
  } catch {
    return refusal(503, UNAVAILABLE);
  }
  if (wait !== null)
    return refusal(429, { code: 'RATE_LIMITED', fix: 'This ingest has had as many arrivals as it takes for now.', retry_after: wait }, [
      ['retry-after', String(wait)],
    ]);

  try {
    return path.channel === 'email' ? await mail(request, door, key, stamp) : await hook(request, door, path);
  } catch {
    /* NOTHING THROWS ACROSS THIS BOUNDARY, for the reason `serveApi` gives: a handler that threw left
       the socket open and the request hanging, and on the self-host the server then never closed. A
       sender that gets 503 retries, which is the right thing for it to do either way. */
    return refusal(503, UNAVAILABLE);
  }
}

/** The bytes, or the refusal that says they were too many. */
async function bytesOf(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | Response> {
  /* THE DECLARED LENGTH IS CHECKED FIRST, so a sender that announces ten megabytes is refused before
     ten megabytes are read into a Worker's memory. It is a courtesy and not a guard: the length below
     is the one that counts, because a sender can lie about this one. */
  const said = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(said) && said > limit) return refusal(413, tooBig(limit));
  const bytes = new Uint8Array(await request.arrayBuffer());
  /* BYTES AND NOT `text.length`, which counts UTF-16 units: a megabyte of Arabic is half as many units
     as bytes, and the ceiling is about what gets stored. */
  if (bytes.byteLength > limit) return refusal(413, tooBig(limit));
  return bytes;
}

async function hook(request: Request, door: IngestDoor, path: Extract<IngestPath, { channel: 'webhook' }>): Promise<Response> {
  const v = await door.verify({ ...(path.rec === undefined ? {} : { rec: path.rec }), ingest: path.ingest });
  if (v === null) return nothing(404);
  /* OFF IS ASKED BEFORE THE BODY IS READ, so a door that is off spends no memory on what it will not keep. */
  if (v.off === true) return away(door, { channel: 'webhook', ...(path.rec === undefined ? {} : { rec: path.rec }), ingest: path.ingest });

  const bytes = await bytesOf(request, WEBHOOK_LIMIT);
  if (bytes instanceof Response) return bytes;

  /* THE DECLARATION SAYS WHAT VERIFIES IT, AND THE URL DOES NOT. An ingest declaring an HMAC is not
     verified by a random segment somebody appended to the path, even a correct-looking one, or the
     weaker of the two checks would always be the one that ran. */
  const body = new TextDecoder().decode(bytes);
  const verified =
    v.kind === 'path'
      ? path.token !== undefined && (await pathToken(path.token, v))
      : v.kind === 'hmac_sha256'
        ? await signed(request, bytes, v)
        : v.kind === 'stripe'
          ? await stripeSigned(request, body, v)
          : false;

  return store(door, {
    ...(path.rec === undefined ? {} : { rec: path.rec }),
    ingest: path.ingest,
    channel: 'webhook',
    headers: headersOf(request),
    body,
    sha256: await digest(bytes),
    verified,
  });
}

async function mail(request: Request, door: IngestDoor, hash: string, stamp: MailStamp | undefined): Promise<Response> {
  if (door.inbound === undefined) return nothing(404);
  /* THE TOKEN ITSELF NEVER LEAVES THIS FILE. What crosses to the host is the digest the budget was
     already keyed on, so a host that keeps an index of inbound tokens keeps an index of digests. */
  const named = await door.inbound(hash);
  if (named === null) return nothing(404);
  const rec = typeof named === 'string' ? named : named.rec;
  if (typeof named !== 'string' && named.off === true) return away(door, { channel: 'email', rec });

  const bytes = await bytesOf(request, EMAIL_LIMIT);
  if (bytes instanceof Response) return bytes;

  /* THE WHOLE MESSAGE IS THE BODY, HEADERS INCLUDED, and the parsed names are handed across beside it
     rather than instead of it. `sha256` is over the bytes as they arrived, which is what makes a
     redelivery the same arrival (`kernel.arrive` is idempotent on the pair), and a head this function
     read wrongly is still a head somebody can read for themselves in the row. */
  const text = new TextDecoder().decode(bytes);
  /* THE HEAD IS SCANNED ONCE AND READ TWICE, in order for the eligibility test and joined for the row.
     The join cannot answer "which hop said this", which is the whole of `forwarderPassed`'s question.
     ITS ENCODED WORDS ARE DECODED BEFORE EITHER READS IT, and the eligibility test is why. A `From:` written
     `=?utf-8?q?alerts=40hsbc.example?= <bot@evil.example>` spells no bank domain until it is decoded, so alignment
     read raw would pass it on `evil.example`'s signature while the record's `match:` read the decoded bank address. */
  const head = headLines(text).map(([name, value]) => [name, words(value)] as const);
  /* WHOSE VERDICT IS READ (SEC1): the one handed over beside the bytes by the code that checked them, else this host's
     own DKIM check of the bytes it was posted, else none, and none is unverified. Never a line in the message: the
     token is the only thing that opens this door, it is handed to third parties by design, and anyone holding it could
     post `Authentication-Results: x; dkim=pass header.d=<bank>` above a `From:` of the bank's and have a debit filed. */
  const said =
    stamp !== undefined ? stamp.verdict : door.dkim !== undefined ? await verdictValue(bytes, door.dkim, Math.floor(Date.now() / 1000)) : null;
  const read = readMime(bytes, text);
  const files = read === null ? [] : await keepAll(door, rec, read.files);
  /* A VERDICT THIS HOST REACHED OVER HTTP IS PUT FIRST IN THE ROW'S HEAD, as the Email Routing handler puts its own on top
     of the bytes, so whoever reads the row reads this host's finding before anything the message says about itself.
     A HOST THAT CHECKED NOTHING SAYS SO THERE TOO, and A SENDER'S OWN LINE IN THIS HOST'S NAME IS DROPPED (SEC1, RD8):
     `Authentication-Results: braindog; dkim=pass header.d=bank.example` typed into a posted message was the first line
     of the row's head, or sat right under the host's real one, and an agent reading the row over MCP read a pass in
     BrainDog's own name. The Email Routing handler's own line goes too, and its verdict, handed over beside the bytes,
     is put back on top, so the one line in this host's name is always the one this host wrote. */
  const kept = head.filter(([name, value]) => name !== 'authentication-results' || authservOf(value) !== AUTHSERV);
  const shown = [['authentication-results', said ?? `${AUTHSERV}; dkim=none (not checked)`] as const, ...kept];
  const headers = joinHead(shown.filter(([name]) => name !== FILES_HEADER));
  if (files.length > 0) headers[FILES_HEADER] = JSON.stringify(files);
  return store(door, {
    rec,
    channel: 'email',
    headers,
    /* THE HEAD AS IT ARRIVED AND THE BODY AS A PERSON READS IT. A base64 or quoted-printable body, or a multipart one,
       is text no `match:` and no extraction can read, so it is replaced by its decoded text; the head above it is left
       whole, stale `Content-Transfer-Encoding` included, because it is the sender's and it is still true of the bytes
       `sha256` names. A message that was plain text already is stored exactly as it arrived. */
    body: read === null ? text : text.slice(0, bodyAt(text)) + read.text,
    sha256: await digest(bytes),
    verified: said !== null && forwarderPassed(head, said),
  });
}

/* ── the message's own encodings (RFC 2045-2047, 2231) ───────────────────── */

/** An attachment as the message carried it, before the host has said whether it keeps it. */
type MailFile = { name: string; type: string; bytes: Uint8Array<ArrayBuffer> };

/** Parts read in one message, nesting followed, and attachments named on one arrival. A message past either is read as far as that. */
const PARTS_MOST = 64;
const DEPTH_MOST = 8;
const FILES_MOST = 16;
/** A header value longer than this is not decoded, so one hostile line cannot make the word scanner quadratic. */
const WORDS_MOST = 8_192;

/** Where the body starts: after the first blank line, or the end for a message that has none. */
function bodyAt(raw: string): number {
  if (raw.startsWith('\r\n')) return 2;
  if (raw.startsWith('\n')) return 1;
  const crlf = raw.indexOf('\r\n\r\n');
  const lf = raw.indexOf('\n\n');
  if (crlf === -1 && lf === -1) return raw.length;
  return crlf !== -1 && (lf === -1 || crlf < lf) ? crlf + 4 : lf + 2;
}

/**
 * Bytes as a string of one character per byte.
 *
 * STRUCTURE IS FOUND IN BYTES AND TEXT IS MADE LAST, because a boundary or a base64 run is ASCII inside a body whose
 * charset this file has not read yet. Decoding the whole message as UTF-8 first would turn every Latin-1 byte into
 * U+FFFD before its own part could say it was Latin-1.
 */
function binary(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8_192) out += String.fromCharCode(...bytes.subarray(i, i + 8_192));
  return out;
}

const octets = (bin: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
};

/**
 * The bytes as text in the charset their part named.
 *
 * NO CHARSET, AND `us-ascii`, READ AS UTF-8. WHATWG maps the label `us-ascii` to windows-1252, which turns the UTF-8 a
 * careless sender put under it into mojibake; UTF-8 reads true ASCII identically, so it is the one guess that costs
 * nothing when the label was right. A label this runtime does not know is read as UTF-8 too, rather than refused.
 */
function inCharset(bytes: Uint8Array<ArrayBuffer>, charset: string | undefined): string {
  const label = (charset ?? '').trim().toLowerCase();
  const ascii = label === '' || label === 'us-ascii' || label === 'ascii';
  try {
    return new TextDecoder(ascii ? 'utf-8' : label).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

/** Whether a character code is in base64's alphabet, `=` aside. Codes and not a pattern, since it runs once a byte. */
const inBase64 = (code: number): boolean =>
  (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 43 || code === 47;

/** A part's body with its transfer encoding undone, still as one character per byte. */
function untransfer(bin: string, encoding: string): string {
  const how = encoding.trim().toLowerCase();
  if (how === 'base64') {
    /* LINE BREAKS AND ANYTHING ELSE OUTSIDE THE ALPHABET ARE DROPPED, and the padding is put back to what the length
       needs, because a mailer that wraps at 76 or trims its `=` has still sent readable base64. */
    let clean = '';
    for (let i = 0; i < bin.length; i++) if (inBase64(bin.charCodeAt(i))) clean += bin[i];
    const rest = clean.length % 4;
    if (rest === 1) clean = clean.slice(0, -1);
    else if (rest > 1) clean += '='.repeat(4 - rest);
    try {
      return atob(clean);
    } catch {
      return bin;
    }
  }
  if (how === 'quoted-printable') {
    let out = '';
    for (let i = 0; i < bin.length; i++) {
      const c = bin[i]!;
      if (c !== '=') {
        out += c;
        continue;
      }
      /* A SOFT LINE BREAK IS NOT TEXT: `=` at the end of a line joins it to the next. */
      if (bin[i + 1] === '\r' && bin[i + 2] === '\n') {
        i += 2;
        continue;
      }
      if (bin[i + 1] === '\n') {
        i += 1;
        continue;
      }
      const pair = bin.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(pair)) {
        out += String.fromCharCode(parseInt(pair, 16));
        i += 2;
        continue;
      }
      out += c;
    }
    return out;
  }
  return bin;
}

/**
 * The encoded words in one header value, decoded (RFC 2047): `=?utf-8?B?...?=` and `=?iso-8859-1?Q?...?=`.
 *
 * WHITESPACE BETWEEN TWO ENCODED WORDS IS NOT TEXT (§6.2), which is how a long subject is split across words without
 * spaces appearing in the middle of it. A token that only looks like a word is left exactly as it was written.
 */
function words(value: string): string {
  if (!value.includes('=?') || value.length > WORDS_MOST) return value;
  let out = '';
  let i = 0;
  let after = false;
  while (i < value.length) {
    const start = value.indexOf('=?', i);
    if (start === -1) break;
    const q1 = value.indexOf('?', start + 2);
    const q2 = q1 === -1 ? -1 : value.indexOf('?', q1 + 1);
    const end = q2 === -1 ? -1 : value.indexOf('?=', q2 + 1);
    if (end === -1) break;
    const between = value.slice(i, start);
    const charset = value.slice(start + 2, q1).split('*')[0] ?? '';
    const how = value.slice(q1 + 1, q2).toUpperCase();
    if ((how !== 'B' && how !== 'Q') || /\s/.test(charset)) {
      out += value.slice(i, start + 2);
      i = start + 2;
      after = false;
      continue;
    }
    const payload = value.slice(q2 + 1, end);
    const bin = how === 'B' ? untransfer(payload, 'base64') : untransfer(payload.replaceAll('_', ' '), 'quoted-printable');
    if (!(after && between.trim() === '')) out += between;
    out += inCharset(octets(bin), charset);
    after = true;
    i = end + 2;
  }
  return out + value.slice(i);
}

/** A structured header (`Content-Type`, `Content-Disposition`): its value lower-cased, and its parameters by name. */
type Field = { value: string; params: Record<string, string> };

/**
 * One structured header read, quotes and RFC 2231's continued and charset-tagged parameters included.
 *
 * `filename*0*=utf-8''R%C3%A9sum%C3%A9; filename*1*=.pdf` IS ONE NAME, and an attachment from a phone's mail app is as
 * likely to arrive that way as plain. A charset-tagged value wins over a plain one of the same name, as the RFC says.
 */
function fieldOf(raw: string | undefined): Field {
  const s = raw ?? '';
  /* A `;` INSIDE QUOTES IS PART OF A VALUE, so the split is a scan and not `split(';')`: `name="a;b.pdf"` is one name. */
  const segments: string[] = [];
  let text = '';
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuote) {
      if (c === '\\' && i + 1 < s.length) text += s[++i];
      else if (c === '"') inQuote = false;
      else text += c;
    } else if (c === '"') inQuote = true;
    else if (c === ';') {
      segments.push(text);
      text = '';
    } else text += c;
  }
  segments.push(text);
  const [first, ...rest] = segments;
  const params: Record<string, string> = {};
  const pieces: Record<string, { n: number; v: string; tagged: boolean }[]> = {};
  for (const seg of rest) {
    const eq = seg.indexOf('=');
    if (eq <= 0) continue;
    const key = seg.slice(0, eq).trim().toLowerCase();
    const v = seg.slice(eq + 1).trim();
    const star = /^([^*]+)\*(\d+)?(\*)?$/.exec(key);
    if (star === null) params[key] = v;
    else (pieces[star[1]!] ??= []).push({ n: Number(star[2] ?? '0'), v, tagged: star[3] !== undefined || star[2] === undefined });
  }
  for (const [key, list] of Object.entries(pieces)) {
    list.sort((a, b) => a.n - b.n);
    let charset = '';
    let bin = '';
    for (const [k, p] of list.entries()) {
      let v = p.v;
      if (k === 0 && p.tagged) {
        const a = v.indexOf("'");
        const b = a === -1 ? -1 : v.indexOf("'", a + 1);
        if (b !== -1) {
          charset = v.slice(0, a);
          v = v.slice(b + 1);
        }
      }
      bin += p.tagged ? unpercent(v) : v;
    }
    params[key] = inCharset(octets(bin), charset);
  }
  return { value: (first ?? '').trim().toLowerCase(), params };
}

/** `%XX` undone, one character per byte. */
function unpercent(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i + 1, i + 3);
    if (text[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(pair)) {
      out += String.fromCharCode(parseInt(pair, 16));
      i += 2;
    } else out += text[i];
  }
  return out;
}

/**
 * A multipart body's parts, the preamble and the epilogue dropped.
 *
 * A DELIMITER COUNTS ONLY AT THE START OF A LINE, and the line break in front of it belongs to it, so a part's text is
 * exactly what its sender wrote. Found with `indexOf`, like everything in this file that reads a stranger's bytes.
 */
function partsOf(body: string, boundary: string): string[] {
  const delim = `--${boundary}`;
  const next = (from: number): number => {
    if (from === 0 && body.startsWith(delim)) return 0;
    const k = body.indexOf(`\n${delim}`, Math.max(0, from - 1));
    return k === -1 ? -1 : k + 1;
  };
  const out: string[] = [];
  let at = next(0);
  while (at !== -1 && out.length < PARTS_MOST) {
    if (body.startsWith('--', at + delim.length)) break;
    const lineEnd = body.indexOf('\n', at);
    if (lineEnd === -1) break;
    const following = next(lineEnd + 1);
    let part = body.slice(lineEnd + 1, following === -1 ? body.length : following);
    if (following !== -1) part = part.endsWith('\r\n') ? part.slice(0, -2) : part.endsWith('\n') ? part.slice(0, -1) : part;
    out.push(part);
    at = following;
  }
  return out;
}

const BLOCK_TAGS = new Set(['br', 'p', 'div', 'tr', 'li', 'table', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr']);
const DROPPED_TAGS = new Set(['style', 'script', 'head', 'title']);
/**
 * The named references a receipt or a bank alert actually uses, by code point: the markup's own, spacing, currency
 * signs and quotes. Code points and not the characters, so this source holds no typographic dash or quote of its own.
 */
const ENTITIES: Readonly<Record<string, number>> = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, nbsp: 0x20,
  pound: 0xa3, euro: 0x20ac, yen: 0xa5, cent: 0xa2, curren: 0xa4,
  copy: 0xa9, reg: 0xae, trade: 0x2122, times: 0xd7, middot: 0xb7, bull: 0x2022, hellip: 0x2026,
  ndash: 0x2013, mdash: 0x2014, lsquo: 0x2018, rsquo: 0x2019, ldquo: 0x201c, rdquo: 0x201d, laquo: 0xab, raquo: 0xbb,
};

/**
 * An HTML part as text, for a message that sent no plain one.
 *
 * ONE PASS WITH `indexOf` AND NO TAG PATTERN. `/<[^>]*>/g` rescans to the end of the input from every `<` that has no
 * `>` after it, so a stranger's five megabytes of `<` would be an outage; here each byte is looked at a bounded number of
 * times. Block tags become line breaks, so an amount and its label in two cells stay on the lines a person saw them on.
 */
function textOfHtml(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) break;
    const name = /^\/?([a-z0-9]+)/.exec(lower.slice(lt + 1, Math.min(gt, lt + 16)))?.[1] ?? '';
    const closing = html[lt + 1] === '/';
    if (!closing && DROPPED_TAGS.has(name)) {
      const close = lower.indexOf(`</${name}`, gt);
      const shut = close === -1 ? -1 : html.indexOf('>', close);
      i = shut === -1 ? html.length : shut + 1;
      continue;
    }
    if (BLOCK_TAGS.has(name)) out += '\n';
    else if (name === 'td' || name === 'th') out += ' ';
    i = gt + 1;
  }
  const decoded = out.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (whole, what: string) => {
    if (what[0] !== '#') {
      const named = ENTITIES[what.toLowerCase()];
      return named === undefined ? whole : String.fromCodePoint(named);
    }
    const code = what[1] === 'x' || what[1] === 'X' ? parseInt(what.slice(2), 16) : parseInt(what.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
  const lines: string[] = [];
  for (const line of decoded.split('\n')) {
    /* `\s` AND NOT A LIST, because it takes the no-break space a mailer pads a table cell with, as well as tabs. */
    const tidy = line.replace(/\s+/g, ' ').trim();
    if (tidy === '' && (lines.length === 0 || lines[lines.length - 1] === '')) continue;
    lines.push(tidy);
  }
  return lines.join('\n').trim();
}

/**
 * A part's head, from its bytes, as UTF-8 text with names lower-cased.
 *
 * UTF-8 BECAUSE THAT IS WHAT EIGHT-BIT HEADERS ARE (RFC 6532), and read as text before any value is decoded, so a raw
 * UTF-8 file name and an encoded-word one come out as the same kind of string.
 */
const headOf = (bin: string): Record<string, string> => joinHead(headLines(inCharset(octets(bin), 'utf-8')));

/** What reading a message found: the text a person reads, the HTML to fall back on, and the attachments. */
type Found = { texts: string[]; html: string[]; files: MailFile[]; parts: number };

/** One part, read into `into`: text kept as text, HTML kept aside, anything else an attachment. */
function walk(bin: string, into: Found, depth: number): void {
  if (into.parts >= PARTS_MOST) return;
  into.parts += 1;
  const start = bodyAt(bin);
  const head = headOf(bin.slice(0, start));
  const body = bin.slice(start);
  const type = fieldOf(head['content-type']);
  const kind = type.value === '' ? 'text/plain' : type.value;
  const disposition = fieldOf(head['content-disposition']);
  const encoding = head['content-transfer-encoding'] ?? '';

  if (kind.startsWith('multipart/')) {
    const boundary = type.params.boundary;
    if (boundary === undefined || boundary === '' || depth >= DEPTH_MOST) return;
    /* ALTERNATIVE IS ONE MESSAGE WRITTEN TWICE, and reading both would put every amount in the body twice. The plain
       version is read when there is one, because it is the one written to be read as text. */
    const alternative = kind === 'multipart/alternative';
    const sub: Found = alternative ? { texts: [], html: [], files: into.files, parts: into.parts } : into;
    for (const part of partsOf(body, boundary)) walk(part, sub, depth + 1);
    if (alternative) {
      into.parts = sub.parts;
      if (sub.texts.length > 0) into.texts.push(...sub.texts);
      else into.html.push(...sub.html);
    }
    return;
  }

  /* A MESSAGE FORWARDED AS AN ATTACHMENT IS READ AS A MESSAGE, its sender and subject first, because "forward as
     attachment" is how most mail apps send on the very bank alert a record is waiting for. */
  if (kind === 'message/rfc822' && depth < DEPTH_MOST) {
    const inner = untransfer(body, encoding);
    const innerHead = headOf(inner.slice(0, bodyAt(inner)));
    const said = ['from', 'date', 'subject']
      .filter((name) => innerHead[name] !== undefined)
      .map((name) => `${name[0]!.toUpperCase()}${name.slice(1)}: ${words(innerHead[name]!)}`);
    if (said.length > 0) into.texts.push(said.join('\n'));
    walk(inner, into, depth + 1);
    return;
  }

  const data = untransfer(body, encoding);
  const named = words(disposition.params.filename ?? type.params.name ?? '').trim();
  const text = kind === 'text/plain' || kind === 'text/html';
  if (disposition.value === 'attachment' || named !== '' || !text) {
    if (into.files.length < FILES_MOST)
      into.files.push({ name: (named === '' ? 'attachment' : named).slice(0, 200), type: kind.slice(0, 100), bytes: octets(data) });
    return;
  }
  const decoded = inCharset(octets(data), type.params.charset);
  if (kind === 'text/html') into.html.push(decoded);
  else into.texts.push(decoded);
}

/**
 * The message's body as text, and its attachments, or `null` for a message that was plain text already.
 *
 * `null` KEEPS THE COMMON CASE BYTE FOR BYTE. A bank alert sent as one plain UTF-8 or ASCII part needs nothing done
 * to it, and anything done to it anyway (a line ending changed, a space trimmed) would move an anchor some declared
 * extraction was written against.
 */
function readMime(bytes: Uint8Array, text: string): { text: string; files: MailFile[] } | null {
  const start = bodyAt(text);
  if (start === text.length) return null;
  const head = joinHead(headLines(text.slice(0, start)));
  const type = fieldOf(head['content-type']);
  const encoding = (head['content-transfer-encoding'] ?? '').trim().toLowerCase();
  const charset = (type.params.charset ?? '').trim().toLowerCase();
  const asIs =
    (type.value === '' || type.value === 'text/plain') &&
    (encoding === '' || encoding === '7bit' || encoding === '8bit' || encoding === 'binary') &&
    (charset === '' || charset === 'utf-8' || charset === 'us-ascii' || charset === 'ascii');
  if (asIs && fieldOf(head['content-disposition']).value !== 'attachment') return null;
  try {
    const found: Found = { texts: [], html: [], files: [], parts: 0 };
    walk(binary(bytes), found, 0);
    const read = found.texts.length > 0 ? found.texts : found.html.map(textOfHtml);
    return { text: read.join('\n\n'), files: found.files };
  } catch {
    /* A MESSAGE THIS FILE CANNOT READ IS STORED AS IT ARRIVED, which is the rule at the top of the file: an arrival
       nobody understands is still an arrival somebody can look at. */
    return null;
  }
}

/** Each attachment offered to the host's store, and named on the arrival whether it was kept or not. */
async function keepAll(door: IngestDoor, rec: string, files: MailFile[]): Promise<IngestFile[]> {
  const out: IngestFile[] = [];
  for (const file of files) {
    let kept: { sha256: string; mime: string } | null = null;
    if (door.keep !== undefined) {
      try {
        kept = await door.keep({ rec, name: file.name, type: file.type, bytes: file.bytes });
      } catch {
        /* A STORE THAT FAILED IS A FILE NOT KEPT, and never a message refused: the text is what the record matches on,
           and a sender retrying for a bucket's hiccup would store the message a second time. */
        kept = null;
      }
    }
    out.push(
      kept === null
        ? { name: file.name, mime: file.type, bytes: file.bytes.byteLength }
        : { name: file.name, mime: kept.mime, bytes: file.bytes.byteLength, sha256: kept.sha256 },
    );
  }
  return out;
}

/**
 * A door that is off: 410 and no body, counted, and nothing stored.
 *
 * 410 AND NOT 404, because a sender's own retries need a clear stop: 404 is retried by some senders as a hiccup, and
 * 410 says the address is gone on purpose. It tells a stranger that the address was once real, which a guessed id
 * already learns from 202; the token is not checked here, so it says nothing about the token ("Risk").
 * THE COUNT IS BEST EFFORT. A record that cannot count still turned the arrival away, and a 503 would ask for a retry.
 */
async function away(door: IngestDoor, ask: IngestTurnedAway): Promise<Response> {
  try {
    await door.turnedAway?.(ask);
  } catch {
    /* Counted or not, the answer is the same. */
  }
  return nothing(410);
}

/**
 * Hand it to the record, and say nothing about what happened next.
 *
 * A REFUSAL BECOMES 503 AND LOSES ITS SENTENCE. Every refusal `arrive` can give a stranger is either
 * about the record's own state or about a declaration the stranger cannot see, so there is nothing here
 * a sender could act on, and repeating it would describe the inside of somebody's record to whoever
 * holds the URL. 503 is also the honest instruction: send it again.
 */
async function store(door: IngestDoor, arrival: IngestArrival): Promise<Response> {
  const out = await door.arrive(arrival);
  if (out.ok) return nothing(202);
  /* A RECORD'S HOUR SPENT IS A WAIT AND NOT A FAULT: the sender is told how long (`Retry-After`) and sends it again then. */
  if ('refusal' in out && out.refusal.code === 'RATE_LIMITED' && typeof out.refusal.retry_after === 'number')
    return refusal(429, out.refusal, [['retry-after', String(out.refusal.retry_after)]]);
  return refusal(503, UNAVAILABLE);
}
