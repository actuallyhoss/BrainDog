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
 * WHAT IS STILL NOT HERE IS THE MATERIAL A `verify` ANSWERS WITH. `25 §3.2` writes a webhook ingest's
 * `verify: { kind: hmac_sha256, header, grant }` and `12 §3` names a random path token as the other
 * form; grepped on 2026-09-20, no `verify` key exists in `packages/kernel/src/declare.ts` or in
 * `packages/declare`, so no declaration in this build can carry one. Both hosts therefore answer
 * `{ kind: 'none' }` for an ingest somebody declared, every webhook arrival is stored `untriaged`,
 * and none is matched. That is `12 §3` applied to a record that has declared no verifier, and it is
 * the right way round: the pipeline is reachable, and nothing is trusted that nobody vouched for.
 *
 * SO FORWARDED MAIL IS THE ONLY CHANNEL THAT CAN BE ELIGIBLE TODAY, and `forwarderPassed` below is
 * where that whole decision lives. It has been wrong twice, once by believing a verdict the sender
 * wrote itself and once by believing a real verdict that was about somebody else's domain, and its
 * own header says what each of the two cost.
 */

import type { Refusal, Result } from '@braindog/ports';

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
 */
export type IngestVerify =
  | { kind: 'path'; token: string }
  | { kind: 'hmac_sha256'; header: string; key: Uint8Array }
  | { kind: 'none' };

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
  inbound?(tokenHash: string): Promise<string | null>;
};

/** `51 §5.4` step 1, and the ceiling `/mcp` already uses. */
const WEBHOOK_LIMIT = 1_048_576;
/** `01 §5`'s five mebibytes for a message. A forwarded RFC 5322 body carries its attachments inline. */
const EMAIL_LIMIT = 5_242_880;

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
  fix: 'This record cannot take arrivals right now. Send it again in a few minutes.',
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
 * Measured on 2026-09-20: a message carrying its own `Authentication-Results: x; dkim=pass` under the
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
 * Whether a forwarder said this message is who it claims to be.
 *
 * THE TOP `Authentication-Results` AND ONLY THE TOP ONE, because every line below it was typed by
 * somebody this record has no reason to trust. Measured on 2026-09-20 against the first cut, which
 * searched the joined value of every hop: a message whose own head carried
 * `Authentication-Results: anything-the-sender-typed; dkim=pass`, forwarded by an MTA that had just
 * written `dkim=fail ... spf=fail` above it, was stored `verified: true`.
 *
 * AND THE VERDICT MUST BE ABOUT THE `From:` THAT A PERSON WILL READ, which is the forgery after that
 * one and the reason this function stopped being a substring search. DKIM says "the holder of the key
 * for `header.d` signed these bytes" and says nothing at all about the `From:` line: a stranger who
 * owns `evil.example`, signs with it correctly, and writes `From: alerts@hsbc.example` collects a
 * genuine `dkim=pass` from the forwarder. Measured on 2026-09-20 end to end against the self-host,
 * that message was stored `matched`, extracted, and written into the record's register as a bank
 * debit of the attacker's chosen amount at the attacker's chosen merchant. So a verdict counts only
 * when the identity it authenticated aligns with the From domain, which is DMARC's own question.
 *
 * AND WITH EVERY DOMAIN THE LINE SPELLS, NOT ONLY THE ONE IT DELIVERS TO. Alignment against the
 * address alone reads a different string from the one a record's `match:` reads, and the gap is
 * wide enough to drive the same forgery through: measured on 2026-09-20 with alignment in place,
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
const forwarderPassed = (head: (readonly [string, string])[]): boolean => {
  const from = head.filter(([name]) => name === 'from');
  const claimed = from.length === 1 && from[0] !== undefined ? fromDomains(from[0][1]) : [];
  if (claimed.length === 0) return false;
  const said = head.find(([name]) => name === 'authentication-results')?.[1];
  if (said === undefined) return false;
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
export async function serveIngest(request: Request, door: IngestDoor | undefined): Promise<Response> {
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
    return path.channel === 'email' ? await mail(request, door, key) : await hook(request, door, path);
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

  const bytes = await bytesOf(request, WEBHOOK_LIMIT);
  if (bytes instanceof Response) return bytes;

  /* THE DECLARATION SAYS WHAT VERIFIES IT, AND THE URL DOES NOT. An ingest declaring an HMAC is not
     verified by a random segment somebody appended to the path, even a correct-looking one, or the
     weaker of the two checks would always be the one that ran. */
  const verified =
    v.kind === 'path'
      ? path.token !== undefined && (await sameSecret(path.token, v.token))
      : v.kind === 'hmac_sha256'
        ? await signed(request, bytes, v)
        : false;

  return store(door, {
    ...(path.rec === undefined ? {} : { rec: path.rec }),
    ingest: path.ingest,
    channel: 'webhook',
    headers: headersOf(request),
    body: new TextDecoder().decode(bytes),
    sha256: await digest(bytes),
    verified,
  });
}

async function mail(request: Request, door: IngestDoor, hash: string): Promise<Response> {
  if (door.inbound === undefined) return nothing(404);
  /* THE TOKEN ITSELF NEVER LEAVES THIS FILE. What crosses to the host is the digest the budget was
     already keyed on, so a host that keeps an index of inbound tokens keeps an index of digests. */
  const rec = await door.inbound(hash);
  if (rec === null) return nothing(404);

  const bytes = await bytesOf(request, EMAIL_LIMIT);
  if (bytes instanceof Response) return bytes;

  /* THE WHOLE MESSAGE IS THE BODY, HEADERS INCLUDED, and the parsed names are handed across beside it
     rather than instead of it. `sha256` is over the bytes as they arrived, which is what makes a
     redelivery the same arrival (`kernel.arrive` is idempotent on the pair), and a head this function
     read wrongly is still a head somebody can read for themselves in the row. */
  const body = new TextDecoder().decode(bytes);
  /* THE HEAD IS SCANNED ONCE AND READ TWICE, in order for the eligibility test and joined for the row.
     The join cannot answer "which hop said this", which is the whole of `forwarderPassed`'s question. */
  const head = headLines(body);
  return store(door, {
    rec,
    channel: 'email',
    headers: joinHead(head),
    body,
    sha256: await digest(bytes),
    verified: forwarderPassed(head),
  });
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
  return out.ok ? nothing(202) : refusal(503, UNAVAILABLE);
}
