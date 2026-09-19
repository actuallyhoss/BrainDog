/**
 * `@braindog/connect` — one leased `pull.fetch` row, one run against somebody else's API.
 *
 * `47-SPEC-CONNECT` is the specification and this file is its types, its refusals and the arithmetic
 * every other file in the package shares. The run itself is `run.ts`, `probe.ts`, the paginators and
 * the write-time reducer; what is here is the half that can be got right without a network: what a
 * declaration says, what a request resolves to, and what a refusal is called.
 *
 * WHAT THIS PACKAGE IS FOR, in one line: a `fetch:` block is a DECLARATION and never a program.
 * Five placeholders, substituted; no expression, no loop, no branch. `25 §3.1` draws that line and
 * every refusal in here is a place somebody could have crossed it.
 *
 * THE ORIGIN CHECK IS THE ONE THAT CANNOT BE DELEGATED. Lint refuses a `base:` that is not a literal
 * `https://` origin, so a declaration cannot ask for a foreign host. What lint cannot see is the
 * VALUE substituted into a path at run time: `{grant.account}` holding `../admin`, or `@evil.example`,
 * or a whole URL. So `resolveRequest` re-parses and compares `url.origin` with `base` every single
 * time, and that is the one check in this package written twice on purpose.
 *
 * THE ADDRESS CHECK IS NOT HERE AND MUST NOT BE. A private or link-local address is refused by the
 * `Http` adapter, after resolution, because only the adapter knows which machine it is on — on a
 * self-host `localhost:3000` is the record itself (`47 §8`, `37 §2.2`).
 *
 * NOTHING FROM `node:` OR `cloudflare:`, and no bare `fetch`. WebCrypto, `TextEncoder`, `URL` and
 * `Intl` are the whole platform (`31 §1`); the request goes out through the `Http` port.
 */

import { REFUSAL_CODES, type Clock, type Http, type KeyStore, type RefusalCode } from '@braindog/ports';
import type { Json } from '@braindog/where';

/* TYPE-ONLY, AND SO NOT THE CYCLE IT LOOKS LIKE. `auth.ts` imports this file for its declaration
   types; this one names two of its shapes in the payload the host hands across. A type import
   erases to nothing, so there is no import at run time in either direction. */
import type { Sealed, WrappedDek } from './auth.ts';

export type { Json };

/** A leaf of a declaration: what a `query:` value or an `expect:` literal may be. */
export type Scalar = string | number | boolean | null;

/** `<int>(s|m|h|d)` — `6s`, `15m`, `24h`, `31d`. Parsed by `parseDuration`. */
export type Duration = string;

/* ── What a declaration says ─────────────────────────────────────────────────────────────────── */

export const GRAINS = ['hour', 'day', 'month'] as const;
export type Grain = (typeof GRAINS)[number];

/**
 * The eight ways a run proves who it is (`47 §4.5`).
 *
 * The crypto and `applyAuth` are `auth.ts`'s. What this file owns is the SHAPE and the closed set of
 * SECRET field names below it, because `resolveRequest` has to refuse a placeholder naming one
 * before a single byte leaves — and that refusal is about the declaration, not about the token.
 */
export type AuthDecl =
  | { kind: 'none' }
  | { kind: 'bearer'; grant: string; require_scopes?: string[] }
  | { kind: 'basic'; grant: string; require_scopes?: string[] }
  | { kind: 'header'; grant: string; name: string; require_scopes?: string[] }
  | { kind: 'query_param'; grant: string; name: string; require_scopes?: string[] }
  | { kind: 'oauth2_refresh'; grant: string; token_url: string; scope?: string; require_scopes?: string[] }
  | {
      kind: 'jwt_rs256'; grant: string; mode: 'exchange' | 'present'; aud: string; scope?: string;
      token_url?: string; ttl_s?: number; require_scopes?: string[];
    }
  | { kind: 'aws_sigv4'; grant: string; region: string; service: string };

export type AuthKind = AuthDecl['kind'];

/**
 * One thing the response must be true of (`47 §4.1`, `§5.4`).
 *
 * `on_fail` DEFAULTS TO `review` AND NOT TO `fail`, which is the whole posture: a provider that
 * clamped or thresholded an answer has not broken — it has answered a different question — and the
 * right move is to write nothing, keep the body and put it in front of a person (`25 §5.1`).
 */
export type Operator =
  | { eq: Scalar } | { ne: Scalar } | { is: Scalar } | { is_not: Scalar }
  | { present: true } | { absent: true }
  | { contains: string } | { starts: string } | { ends: string }
  | { len_lte: number } | { len_gte: number };

export type Expect = { path: string; on_fail?: 'warn' | 'review' | 'fail' } & Operator;

/**
 * An `on_error` test: a status list, or the same operators over a body path.
 *
 * THE OPERATORS ARE A TYPE OF THEIR OWN AND NOT AN `Omit<Expect, 'on_fail'>`, which is what this was
 * and what silently narrowed it to `{ path: string }`: `Omit` over an intersection with a union
 * keeps only the keys every arm shares, so `{ path: 'errors', present: true }` stopped compiling and
 * every other operator stopped being a condition at all. A condition has no `on_fail` because there
 * is nothing to grade — it either describes the answer or it does not.
 */
export type Cond = { status_in: number[] } | ({ path: string } & Operator);

export type PageDecl =
  | { kind: 'none' }
  | { kind: 'cursor_param'; param: string; from: string; more?: Expect }
  | { kind: 'offset'; param: string; size: number; more?: Expect }
  | { kind: 'page_number'; param: string; start?: number; more?: Expect }
  | { kind: 'keyset'; param: string; from: string }
  | { kind: 'link_header'; stop_when: { param: string; is: string } };

/**
 * The `fetch:` block, as `declare` canonicalised it at install (`47 §4.1`).
 *
 * EVERY KEY IS HERE EVEN WHERE NOTHING READS IT YET, because this is the shape the record already
 * stores in the outbox payload. A type carrying only the keys today's code touches would be a
 * second, smaller declaration, and the first thing a reader would do with it is believe it.
 */
export type FetchDecl = {
  /** `^https://[a-z0-9.-]+(:[0-9]+)?$` — an origin, no path, no placeholder. Lint's rule; `§8`'s too. */
  base: string;
  /** Starts with `/`. Placeholders allowed. */
  path: string;
  method?: 'GET' | 'POST';
  /** Values may carry placeholders. The reserved names are refused again at run — `isReservedHeader`. */
  headers?: Record<string, string>;
  /** An array repeats the key: `expand[]=a&expand[]=b`. */
  query?: Record<string, Scalar | Scalar[]>;
  /** POST only. JSON. Placeholders in string leaves only. */
  body?: { [k: string]: Json };
  auth: AuthDecl;
  schedule: { every: Duration; at?: string; tz?: 'record'; jitter?: 'auto' };
  window?: { grain: Grain; start: string; lookback?: Duration; max_span?: Duration };
  /** Lint only (`42`); no run-time role. */
  source_retention?: Duration;
  /** Exactly one, never chained. `read` is name → response path. */
  probe?: { path: string; read: Record<string, string> };
  page?: PageDecl;
  /** Implicitly all. */
  expect?: Expect[];
  /** Response path to the list. Absent means the body is the list. */
  read?: { rows: string };
  limits?: { response_bytes?: number; rows_per_run?: number; timeout?: Duration; max_pages?: number };
  on_error?: { error_when?: Cond[]; fatal_when?: Cond[]; honour?: 'retry_after' };
};

/**
 * Which of a grant's fields are the secret, per kind — `47 §4.5`'s bold column, closed.
 *
 * WHY A TABLE AND NOT A NAMING RULE. `{grant.<name>}` exists so a declaration can put an account id
 * or a zone tag or a site id in a path without anybody typing it into a file, and what makes it safe
 * is that the set of names it may NOT reach is decided here rather than guessed from the spelling.
 * `token`, `password`, `secret_access_key`, `private_key`, `refresh_token`, `client_secret` and
 * `session_token` are the whole of it; `client_id`, `username`, `iss`, `kid` and `access_key_id` are
 * not secrets and a declaration may name them.
 *
 * A KIND WITH NO SECRET IS STILL A ROW. `none` maps to an empty list rather than being absent, so a
 * lookup cannot answer `undefined` and be read as "nothing is secret here".
 */
export const SECRET_FIELDS: Readonly<Record<AuthKind, readonly string[]>> = {
  none: [],
  bearer: ['token'],
  basic: ['password'],
  header: ['token'],
  query_param: ['token'],
  oauth2_refresh: ['client_secret', 'refresh_token'],
  jwt_rs256: ['private_key'],
  aws_sigv4: ['secret_access_key', 'session_token'],
};

/** Whether a grant field is the secret for this kind of auth, and therefore unnameable. */
export const isSecretField = (kind: AuthKind, field: string): boolean => SECRET_FIELDS[kind].includes(field);

/**
 * The headers a declaration may not set, whatever lint did (`47 §8`).
 *
 * TWICE ON PURPOSE. `declare` refuses an `authorization:` header at install, and this refuses it
 * again at run, because the two answer different questions: lint reads the file somebody wrote, and
 * this reads the canonical body the outbox handed over. Between them sits a database. `Authorization`
 * is set in exactly one place — `applyAuth` — so a declaration that spells it is a declaration trying
 * to put a credential in a file.
 *
 * `X-Forwarded-*` IS A PREFIX AND THE REST ARE NAMES, which is why this is a predicate rather than a
 * set: a connector that could set `X-Forwarded-For` would be one a provider trusts about an address
 * it never observed.
 */
export const RESERVED_HEADERS = ['authorization', 'cookie', 'host', 'content-length', 'referer', 'origin'] as const;

/** Whether a header name is one the declaration may not set. Case-insensitive; `x-forwarded-` by prefix. */
export const isReservedHeader = (name: string): boolean => {
  const lower = name.trim().toLowerCase();
  return (RESERVED_HEADERS as readonly string[]).includes(lower) || lower.startsWith('x-forwarded-');
};

/* ── What a run holds ────────────────────────────────────────────────────────────────────────── */

/** Half-open `[since, until)`, in milliseconds. */
export type Window = { since: number; until: number };

export type PageState =
  | { kind: 'cursor_param' | 'keyset'; value: string }
  | { kind: 'offset' | 'page_number'; value: number }
  | { kind: 'link_header'; url: string }
  | { kind: 'none' };

/**
 * What a connector remembers between runs (`47 §4.4`).
 *
 * TWO FIELDS AND THEY ANSWER DIFFERENT QUESTIONS. `watermark` is the exclusive end of COMPLETE
 * coverage — everything before it has been fetched and written, and it never reaches into a grain
 * that is still filling. `window` is present exactly when the last run ended `partial`, and it is
 * the half-finished range with the page it stopped on.
 *
 * ONE OR THE OTHER, NEVER BOTH MEANING THE SAME THING. A resumed run reads `window` verbatim rather
 * than recomputing it from the watermark, because recomputing would re-fetch pages that already
 * landed — and for a `flow` series that is every one of their values counted twice.
 */
export type Cursor = {
  watermark: string | null;
  window?: { since: string; until: string; page: PageState | null; n: number; rows: number };
};

/**
 * A connector grant, opened, for the length of one run.
 *
 * NEVER SERIALISED, and that is an invariant a test checks rather than a habit: `PullResult`, every
 * `applyPull` argument and every log line are grepped for a grant field. `fields` is plaintext.
 */
export type Grant = { id: string; version: number; fields: Record<string, string> };

/** One concrete request, ready for the `Http` port. */
export type ResolvedRequest = { url: URL; method: 'GET' | 'POST'; headers: Record<string, string>; body?: string };

/** What failed a check, in the three parts a person needs: where, what was there, what was wanted. */
export type Failed = { at: string; found: unknown; wanted: string };

export type ExpectOutcome =
  | { ok: true; warnings: Failed[] }
  | { ok: false; failed: Failed; severity: 'review' | 'fail'; warnings: Failed[] };

/* ── Refusals ────────────────────────────────────────────────────────────────────────────────── */

/**
 * The codes a run raises — `30 §6`'s connector family, NARROWED rather than copied.
 *
 * `47 §2` writes this as its own `as const` array of seven. It is not one here, and the reason is
 * `30 §2`: *two copies of one list is one list and a memory of it*. The seven already live in
 * `@braindog/ports`' `REFUSAL_CODES`, because `30 §6` is the corpus every package answers from and
 * a caller branching on a code must find it there. A second literal here would be the copy that
 * drifts — and it would drift silently, because both would compile.
 *
 * `WRONG_KEY` IS IN THE TYPE AND DOES NOT START WITH `PULL_`. It is the root key having rotated
 * under a sealed grant: a refusal a run raises and does not invent. It belongs to the vault family,
 * and it is named here because a caller of this package has to handle it.
 */
export type PullCode = Extract<RefusalCode, `PULL_${string}`> | 'WRONG_KEY';

const isPullCode = (code: string): code is PullCode => code.startsWith('PULL_');

/** The seven, in `30 §6`'s order. Derived, so the count cannot disagree with the corpus. */
export const PULL_CODES: readonly PullCode[] = REFUSAL_CODES.filter(isPullCode);

/**
 * What a person reads when a run refuses (`47 §6`).
 *
 * `<at>`, `<found>`, `<wanted>` and `<base>` are filled from the refusal's own fields. The sentences
 * are here rather than at each `throw` for the reason `QUEUE_COSTS` is in one place: eight throw
 * sites writing their own wording is eight wordings, and which one a person saw would depend on
 * which line of which file happened to fire.
 */
export const PULL_FIXES: Readonly<Record<PullCode, string>> = {
  WRONG_KEY: 'The root key changed; re-wrap the connector key and retry.',
  PULL_AUTH_REJECTED: 'Reconnect the credential — the provider rejected it; the connector is paused until you do.',
  PULL_PROVIDER_UNAVAILABLE: 'Nothing to do; the next attempt is scheduled.',
  PULL_REQUEST_REFUSED: 'Fix the declaration — the provider refused the request as declared.',
  PULL_EXPECT_FAILED: 'The server did not do what was asked: <at> was <found>, expected <wanted>; nothing was written.',
  PULL_SHAPE_MISMATCH: 'The response shape changed; check <at> against a recent response.',
  PULL_ORIGIN_REFUSED: 'The connector may only call <base>; a redirect or a foreign link was not followed.',
  PULL_LEASE_EDGE: 'The run was longer than its lease; it continues at the next attempt.',
};

const say = (v: unknown): string => (typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v)));

/**
 * One refusal, thrown by the pure functions and folded into the result by the run.
 *
 * A THROW HERE AND A VALUE THERE looks like two minds and is one: `resolveRequest` and `expect` are
 * pure and have nowhere to put a second return, while `runPull` answers a `PullResult` for every
 * provider behaviour because a caller draining an outbox must never have to catch. The seam is
 * `runPull`, and nothing else in the package catches.
 */
export class PullError extends Error {
  code: PullCode;
  /** The declaration key or response path the refusal is about: `fetch.path`, `fetch.page.from`. */
  at: string;
  found?: unknown;
  wanted?: string;
  fix: string;
  /** Milliseconds. `Retry-After` honoured, capped at six hours. */
  notBefore?: number;

  constructor(
    code: PullCode,
    at: string,
    detail: { found?: unknown; wanted?: string; base?: string; notBefore?: number } = {},
  ) {
    const fix = PULL_FIXES[code]
      .replace('<at>', at)
      .replace('<found>', say(detail.found))
      .replace('<wanted>', detail.wanted ?? '')
      .replace('<base>', detail.base ?? '');
    super(`${code} at ${at}: ${fix}`);
    this.name = 'PullError';
    this.code = code;
    this.at = at;
    this.fix = fix;
    if ('found' in detail) this.found = detail.found;
    if (detail.wanted !== undefined) this.wanted = detail.wanted;
    if (detail.notBefore !== undefined) this.notBefore = detail.notBefore;
  }
}

/* ── The arithmetic everything shares ────────────────────────────────────────────────────────── */

const DURATION = /^(\d+)([smhd])$/u;
const PER = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/**
 * `15m` → 900000. `null` for anything that is not `<int>(s|m|h|d)`.
 *
 * SECONDS ARE IN THE GRAMMAR BECAUSE `limits.timeout` IS DECLARED IN THEM (`§13` D20). `47 §4.1`
 * writes the type as `<int>(m|h|d)` and, four rows below, gives `limits.timeout` a default of `6s`
 * and a range of `1s`–`30s` — so every timeout a declaration could legally state was unreadable
 * here, fell through to the default, and did it silently. A run whose provider is slow and whose
 * declaration says `30s` would have been abandoned at ten.
 */
export const parseDuration = (d: Duration): number | null => {
  const m = DURATION.exec(d.trim());
  return m === null ? null : Number(m[1]) * PER[m[2] as 's' | 'm' | 'h' | 'd'];
};

/**
 * `Intl` RATHER THAN ARITHMETIC, because a day boundary is a political fact and not a modulus: Cairo
 * moved its clocks in 2023 after nine years of not doing so. `41 §10` keeps the kernel out of time
 * zones entirely, so these lines are the only place in the package that knows one exists. `en-CA`
 * would hand back `YYYY-MM-DD` directly and is not used — a locale is a preference somebody can set,
 * and the parts are the fact.
 */
const FORMATS = new Map<string, Intl.DateTimeFormat>();

const fieldsOf = (ms: number, tz: string): Record<string, string> => {
  let f = FORMATS.get(tz);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    FORMATS.set(tz, f);
  }
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(ms)) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
};

/** `YYYY-MM-DD` of an instant in the record's time zone. */
export const dayOf = (ms: number, tz: string): string => {
  const f = fieldsOf(ms, tz);
  return `${f.year}-${f.month}-${f.day}`;
};

/**
 * Where a point sits once it is bucketed: `YYYY-MM-DDTHH:00:00Z`, `YYYY-MM-DD` or `YYYY-MM`.
 *
 * THE `Z` ON THE HOURLY FORM IS `25 §8`'s SHAPE AND NOT A CLAIM ABOUT UTC. The hour is the record's
 * hour; the suffix is what the column's format says. A reader comparing two records in two zones is
 * comparing two records, which is what `tz: record` means.
 */
export const startOfGrain = (ms: number, grain: Grain, tz: string): string => {
  const f = fieldsOf(ms, tz);
  if (grain === 'month') return `${f.year}-${f.month}`;
  if (grain === 'day') return `${f.year}-${f.month}-${f.day}`;
  return `${f.year}-${f.month}-${f.day}T${f.hour}:00:00Z`;
};

/* ── What the host and the record hand across ────────────────────────────────────────────────── */

/**
 * The ingest declaration, as much of it as a connector reads.
 *
 * DECLARED STRUCTURALLY, like `RecordApi` below and for the same reason (`46 §4.6`'s pattern): the
 * whole declaration is `43 §4.2`'s, and importing it would put an edge from rank 14 to a package
 * that is unbuilt. What connect reads is `id`, `fetch` and `writes`, and naming exactly those is
 * also a statement that it reads nothing else.
 */
export type IngestDecl = {
  id: string;
  fetch: FetchDecl;
  writes:
    | { register: string | { by: string[]; to: { when: string[]; register: string }[] }; confidence?: 'exact' | 'proposed' }
    | { series: string; kind: SeriesKind; unit: string };
};

/** `08 §3`'s five. A sixth is a migration. */
export const SERIES_KINDS = ['gauge', 'flow', 'cumulative', 'unique', 'fact'] as const;
export type SeriesKind = (typeof SERIES_KINDS)[number];

/** Whether this declaration writes a series rather than register rows. */
export const isSeries = (decl: IngestDecl): decl is IngestDecl & { writes: { series: string; kind: SeriesKind; unit: string } } =>
  'series' in decl.writes;

/** One bucketed reading. `47 §4.7`; the record upserts it. */
export type MetricPoint = { series: string; grain: Grain; at: string; value: number; unit: string; n: number | null };

/** `43 §4.1`'s row, declared here rather than imported, for the reason `IngestDecl` gives. */
export type ExtractedRow = {
  fields: Record<string, Json>;
  confidence: 'exact' | 'proposed' | 'needs-review';
  outcome: Record<string, string>;
  register?: string;
};

/** `43 §4.1`'s `Extraction`, the part of it a run reads. */
export type Extraction = { rows: ExtractedRow[]; confidence: 'exact' | 'proposed' | 'needs-review'; skipped?: string; reason?: string };

/** `43 §4.1`'s arrival, as a pull builds one: one page, as it came. */
export type RawArrival = { id: string; ts: string; channel: 'pull'; headers: Record<string, string>; body: string };

/** The extractor, injected. `43 §4.1`'s `extract(decl, raw, ctx)`, with the context a run supplies. */
export type ExtractFn = (
  decl: IngestDecl,
  raw: RawArrival,
  ctx: { currencies: Record<string, { exponent: number; symbol?: string }>;
         lookup: (register: string, by: string) => { id: string; value: string }[];
         now: number; tz: string; maxRows?: number },
) => Extraction;

/** One page, written. `47 §4.4`. */
export type PullPage = {
  outbox: string;
  n: number;
  raw: { sha256: string; headers: Record<string, string>; bytes: number; body: string | null; state: 'matched' | 'review'; reason?: string };
  rows: ExtractedRow[];
  cursor: Cursor;
};

/** What the ack carries back at the end of a run. `47 §4.4`. */
export type PullFinish = {
  outcome: PullOutcome;
  points: MetricPoint[];
  cursor: Cursor;
  due_at: string | null;
  slot: string;
  warnings: Failed[];
  error?: PullResult['error'];
  needs_review: number;
  rotated_grant?: Sealed;
};

export const PULL_OUTCOMES = ['ok', 'partial', 'review', 'failed', 'paused'] as const;
export type PullOutcome = (typeof PULL_OUTCOMES)[number];

/** The `outbox.payload` of a `pull.fetch` row (`47 §4.4`, `§13` D1). */
export type PullPayload = {
  ingest: string;
  decl: IngestDecl;
  declaration_version: number;
  grant: Sealed | null;
  dek: WrappedDek | null;
  record: { id: string; tz: string };
  cursor: Cursor;
  slot: string;
};

/**
 * What a run reports. `47 §4.4`, and every invariant a test checks is about what is NOT here:
 * no header value, no URL, no grant field, and never the `Grant` itself.
 */
export type PullResult = {
  ingest: string;
  outbox: string;
  outcome: PullOutcome;
  pages: number;
  rows: number;
  points: number;
  bytes: number;
  ms: number;
  window: { since: string; until: string } | null;
  cursor: Cursor;
  warnings: Failed[];
  error?: { code: PullCode; at: string; found?: unknown; wanted?: string; fix: string; notBefore?: number };
};

/**
 * What this package asks of the record: two INTERNAL methods, declared structurally (`47 §13` D1).
 *
 * THE RECORD DERIVES THE ACTOR FROM ITS OWN OUTBOX PAYLOAD and never from a caller, which is why
 * neither method takes one. A connector that could name who it was writing as would be a connector
 * that could write as somebody.
 */
export interface RecordApi {
  applyPull(args: PullPage): Promise<{ wrote: number; kept: number }>;
  ackOutbox(id: string, state: 'done' | 'failed', result?: PullFinish, error?: string): Promise<void>;
}

/** One leased row of the outbox. */
export type OutboxRow<K extends string> = { id: string; kind: K; payload: PullPayload; leased_until: string; attempts: number };

/** Everything a run needs that is not in its payload. */
export type ConnectDeps = {
  http: Http;
  keys: KeyStore;
  clock: Clock;
  record: RecordApi;
  extract: ExtractFn;
  currencies: Record<string, { exponent: number; symbol?: string }>;
  lookup: (register: string, by: string) => { id: string; value: string }[];
};

/* The request half: placeholders in, one concrete request out, and what a response must be true of. */
export { expect, FORMATS, holdsExpect, matchesCond, readGrantField, resolveRequest, substitute } from './request.ts';
export type { Format, SubCtx } from './request.ts';

/* And the paging half: where the next page is, and every reason there is not one. */
export { firstPage, nextCursor, parseLink } from './page.ts';
export type { LinkRef } from './page.ts';

/* And the credential: the one place in this package that sets `Authorization`, and the two
   functions that open a sealed grant (`47 §4.5`, `§4.6`). */
export { applyAuth, b64, b64url, grantFields, openSealed, seal, tokenStep, unb64url } from './auth.ts';
export type { Sealed, TokenStep, WrappedDek } from './auth.ts';

/* What a provider's answer means, before anything is read from it (`47 §5.1` steps 6.3, 6.4, 6.6). */
export { classify, classifyBody, portFault, retryAfterMs } from './status.ts';
export type { Answered } from './status.ts';

/* And the two single requests that are not part of a page loop. */
export { probe, proveScopes } from './probe.ts';

/* Extracted rows as bucketed readings — `08 §3`'s five kinds and their one reducer each. */
export { writeSeries } from './series.ts';

/* When a run is due, and what range of time it asks for (`47 §4.8`, `§5.1` step 3). */
export { jitterSeconds, nextDue, rfc3339, startOfGrainMs, wallAt, wallClock, watermarkAfter, windowFor, zonedToMs } from './when.ts';
export type { Wall } from './when.ts';

/* One leased row, run: the loop that puts the two halves together (`47 §5.1`). */
export { runPull } from './run.ts';
