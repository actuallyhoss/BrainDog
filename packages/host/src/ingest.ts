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
 * WHAT IS NOT HERE: the record's half. `kernel.arrive` takes `{ channel, headers, body, sha256 }` and
 * has no `verified` on it, so "unverified stays untriaged and never matches" has a host side and no
 * record side yet. The door below carries the flag so that the half which lands next has somewhere to
 * read it from rather than a signature change to negotiate.
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
 * Whether a forwarder said this message is who it claims to be.
 *
 * `dkim=pass` OR `spf=pass`, WHICH IS `49 §5.16` step 2 AND NOT `51 §5.4` step 3, and the two specs
 * disagree: the Worker's says both must pass, the self-host's says either, and the self-host's own
 * acceptance row (`49 §770`) passes a message carrying `dkim=pass` and no SPF result at all. Either is
 * taken here, because a forwarding MTA rewrites the envelope sender and SPF therefore fails for
 * perfectly good mail: requiring both would quarantine the ordinary case this route exists for.
 *
 * THE TOP ONE AND ONLY THE TOP ONE, because every `Authentication-Results` below it was typed by
 * somebody this record has no reason to trust. Measured on 2026-09-20 against the first cut, which
 * searched the joined value of every hop: a message whose own head carried
 * `Authentication-Results: anything-the-sender-typed; dkim=pass`, forwarded by an MTA that had just
 * written `dkim=fail ... spf=fail` above it, was stored `verified: true`. `12 §3` makes that flag the
 * difference between a row that gets matched and one that sits untriaged, so the hole was a stranger
 * who knows the address a record forwards from getting a fake bank alert triaged as a real one. The
 * first line of the head is the last MTA to touch the message, which is the forwarder we configured;
 * an absent one is `false`, and the row is stored and left untriaged either way.
 */
const forwarderPassed = (head: (readonly [string, string])[]): boolean => {
  const said = (head.find(([name]) => name === 'authentication-results')?.[1] ?? '').toLowerCase();
  return said.includes('dkim=pass') || said.includes('spf=pass');
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
