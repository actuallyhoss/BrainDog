# 47 · `packages/connect` — specification

`@braindog/connect`, private, zero runtime dependencies. The twelfth package: the `fetch:` block of an `ingest`
with `channel: pull` ([25-CONNECTORS](25-CONNECTORS.md)), run as the consumer of the `pull.fetch` outbox kind
([30-BLUEPRINT](30-BLUEPRINT.md) §8), writing `metric_point` rows or register rows through the record.

---

## 1 · Purpose and boundary

**Does.** Takes one leased `pull.fetch` row and performs one run: opens the connector grant, sends at most one
probe, pages the declared endpoint inside the 300 s lease, checks every `expect:`, parses rows through
`@braindog/extract`, hands rows and points to the record, advances the cursor only for pages that passed, and
acks. Everything a run decides is a `PullResult`; a provider's behaviour is never an exception.

**Refuses to do.** Evaluate anything — five placeholders, substituted, never computed (25 §3.1). Build a URL whose
origin is not the literal `base:`. Follow a redirect. Chain probes. Fan out over a fetched list. Write outside the
declaration's `writes:`. Delete a row or a point — a partial refresh is never an empty one (25 §9). Touch the
schedule ladder — retry policy lives in 30 §8 alone. Hold a plaintext credential past the run, or put one in a
log, a result or an RPC argument.

**Where it runs.** In the Worker's queue consumer and the self-host's outbox poller — never in the record, which
makes no outbound call ([12-SECURITY](12-SECURITY.md) §4) and never sees a plaintext credential (ADR-062).
`mode: agent` never reaches this package: the record opens the suggestion when the `pull` row fires (25 §6).

**May import.** `@braindog/ports` (types: `Http`, `KeyStore`, `Clock`) and `@braindog/extract` (`extract()`,
`ExtractCtx`). The record's surface it calls is declared **here**, structurally, as `RecordApi` — the pattern
46 §4.6 set — so no edge to `record` exists. Nothing imports connect except `apps/*` ([31-STACK](31-STACK.md) §2).

## 2 · Public API

```ts
// index.ts — the whole surface; the exports map names nothing else
import type { Http, KeyStore, Clock } from '@braindog/ports';
import type { ExtractCtx } from '@braindog/extract';

/** What this package asks of the record — two INTERNAL methods, declared structurally (§13 D1). The host
 *  passes the record stub; the record derives the actor from its own outbox payload, never from a caller. */
export interface RecordApi {
  applyPull(args: PullPage): Promise<{ wrote: number; kept: number }>;                // one page: raw + rows + cursor
  ackOutbox(id: string, state: 'done' | 'failed', result?: PullFinish, error?: string): Promise<void>;
}
export type OutboxRow<K extends string> = { id: string; kind: K; payload: PullPayload; leased_until: string; attempts: number };

export type ConnectDeps = {
  http: Http; keys: KeyStore; clock: Clock;
  record: RecordApi;
  extract: Pick<ExtractCtx, 'currencies' | 'lookup'>;    // the host builds `lookup` over the record's `list` (43 §4.1)
};

/** One leased pull.fetch row → one run: open grant, probe once, page, write, finish, ack.
 *  Resolves with a PullResult for every provider behaviour. Rejects only on a programming error. */
export function runPull(job: OutboxRow<'pull.fetch'>, deps: ConnectDeps): Promise<PullResult>;

/** The single preflight: GET base + probe.path with the run's auth → the named values (25 §5.3). */
export function probe(decl: FetchDecl, grant: Grant, token: string | null,
                      deps: Pick<ConnectDeps, 'http' | 'clock'>): Promise<Record<string, Scalar>>;

/** Placeholders → one concrete request. Pure. Throws PullError PULL_ORIGIN_REFUSED when the URL leaves base. */
export function resolveRequest(decl: FetchDecl, page: PageState | null, grant: Grant,
                               probe: Record<string, Scalar>, window: Window, tz: string): ResolvedRequest;

/** Every expect: and every body-path on_error condition against one parsed page. Pure. */
export function expect(decl: FetchDecl, json: Json, window: Window, tz: string): ExpectOutcome;

/** The paginator's next state, or null after the last page. Pure. Throws PULL_ORIGIN_REFUSED on a foreign Link. */
export function nextCursor(decl: FetchDecl, json: Json, rows: Json[], res: { headers: Headers; url: URL },
                           page: PageState | null): PageState | null;

/** Extracted rows → metric points: bucket at to the grain, scale, reduce by the series kind (08 §3). Pure. */
export function writeSeries(decl: IngestDecl, rows: ExtractedRow[], tz: string): MetricPoint[];

/** Bind time (25 §7 rule 6): one authenticated probe — or page 1 — with a candidate grant. */
export function proveScopes(decl: FetchDecl, grant: Grant, deps: Pick<ConnectDeps, 'http' | 'clock'>)
  : Promise<{ ok: boolean; proven: string[] | null; status: number }>;

/** Deterministic jitter (25 §9) and the next due instant. Pure. */
export function jitterSeconds(recordId: string, ingestId: string, everyS: number): number;
export function nextDue(decl: FetchDecl, slot: number, now: number, recordId: string, ingestId: string, tz: string)
  : { slot: number; dueAt: number };

/** The Worker's grant crypto (12 §6): unwrap the connector DEK, derive the grant key, AES-GCM. The reveal
 *  route of apps/worker and apps/selfhost reuses these two — one implementation of one key hierarchy. */
export function openSealed(sealed: Sealed, dek: WrappedDek, recordId: string, keys: KeyStore): Promise<Uint8Array>;
export function seal(plain: Uint8Array, grantId: string, version: number, dek: WrappedDek, recordId: string,
                     keys: KeyStore): Promise<Sealed>;

export const PULL_CODES = ['PULL_AUTH_REJECTED', 'PULL_PROVIDER_UNAVAILABLE', 'PULL_REQUEST_REFUSED',
  'PULL_EXPECT_FAILED', 'PULL_SHAPE_MISMATCH', 'PULL_ORIGIN_REFUSED', 'PULL_LEASE_EDGE'] as const;   // seven — §6
export type PullCode = (typeof PULL_CODES)[number] | 'WRONG_KEY';
export class PullError extends Error {
  code: PullCode; at: string; found?: unknown; wanted?: string; fix: string;
  notBefore?: number;                  // ms — Retry-After honoured, capped at 6 h
}
```

Error contract: the pure functions throw `PullError`; `runPull` catches every `PullError` and folds it into the
`PullResult` and the ack. Anything else thrown is a defect and propagates. Types are §4.

## 3 · Files

```
packages/connect/
├── package.json            name @braindog/connect · private · exports { ".": "./src/index.ts" } · no dependencies
├── src/
│   ├── index.ts            runPull, probe, proveScopes, jitterSeconds, nextDue, the window arithmetic, the two
│   │                       Intl tz helpers (dayOf, startOfGrain), parseDuration, all types, RecordApi,
│   │                       PULL_CODES, PullError                                                    ~240 lines
│   ├── request.ts          placeholder grammar, response-path grammar (readPath), resolveRequest, expect,
│   │                       the on_error classifier                                                  ~200 lines
│   ├── auth.ts             the eight auth.kinds → applyAuth; refresh, signJwt, sigv4; openSealed, seal  ~240 lines
│   ├── page.ts             five paginators + none, Link-header parse, nextCursor, the stop rules     ~110 lines
│   └── write.ts            one extract() per page, bucketing, the kind reducer (writeSeries), PullPage shaping ~100 lines
└── test/
    ├── request.test.ts · auth.test.ts · page.test.ts · write.test.ts · run.test.ts · fixtures.test.ts
    ├── origin.property.test.ts     fast-check: no placeholder value moves a URL off its origin
    ├── seeds/                      every failing { seed, path } of the property test, committed
    └── fixtures/<api>/             decl.json · pages/*.json · expected.json — the nine APIs of 25 §4, invented
```

Five source files, counted. No YAML parser: a declaration arrives as the canonical JSON body `declare`
produced at install, inside the outbox payload.

## 4 · Data structures

### 4.1 · The declaration, as connect receives it

```ts
type Duration  = string;                       // <int>(m|h|d) — 15m · 24h · 31d; parsed by kernel's duration helper
type Scalar    = string | number | boolean | null;
type Json      = Scalar | Json[] | { [k: string]: Json };
type SeriesKind = 'gauge' | 'flow' | 'cumulative' | 'unique' | 'fact';                        // 08 §3

type IngestDecl = {
  ingest: string; channel: 'pull';
  fetch: FetchDecl;
  map: Record<string, Mapping>;                 // 43 §4.2's Mapping: { path, type, from?, minor?, currency?, format?, values?, other?, scale? }
  writes: { register: string; confidence: 'exact' | 'proposed' }
        | { series: string; kind: SeriesKind; unit: string };   // unit: count | ms | bytes | money.<CUR> | pct.bp — §13 D13
  dedupe?: Dedupe;                              // 43 §4.2's Dedupe; register only
  on_conflict?: 'skip' | 'update' | 'new';      // default update
};

type FetchDecl = {
  base: string;                                 // ^https://[a-z0-9.-]+(:[0-9]+)?$ — an origin, no path, no placeholder
  path: string;                                 // starts with '/'; placeholders allowed
  method?: 'GET' | 'POST';                      // default GET
  headers?: Record<string, string>;             // values may carry placeholders; reserved names refused — §8
  query?: Record<string, Scalar | Scalar[]>;    // an array repeats the key
  body?: { [k: string]: Json };                 // POST only; JSON; placeholders in string leaves only
  auth: AuthDecl;
  schedule: { every: Duration; at?: string; tz?: 'record'; jitter?: 'auto' };   // every ≥ 15m; at = HH:MM, needs every % 24h = 0
  window?: { grain: 'hour' | 'day' | 'month'; start: string; lookback?: Duration; max_span?: Duration };
  source_retention?: Duration;                  // lint only (42); no run-time role
  probe?: { path: string; read: Record<string, string> };      // exactly one; read = name → response path
  page?: PageDecl;                              // default { kind: 'none' }
  expect?: Expect[];                            // implicitly all
  read?: { rows: string };                      // response path to the list; default: the body is the list
  limits?: { response_bytes?: number; rows_per_run?: number; timeout?: Duration; max_pages?: number };
  on_error?: { error_when?: Cond[]; fatal_when?: Cond[]; honour?: 'retry_after' };
  for_each?: never;                             // v1: lint refuses a value — §13 D7
};

type AuthDecl =
  | { kind: 'none' }
  | { kind: 'bearer';         grant: string; require_scopes?: string[] }
  | { kind: 'basic';          grant: string; require_scopes?: string[] }
  | { kind: 'header';         grant: string; name: string; require_scopes?: string[] }
  | { kind: 'query_param';    grant: string; name: string; require_scopes?: string[] }
  | { kind: 'oauth2_refresh'; grant: string; token_url: string; scope?: string; require_scopes?: string[] }
  | { kind: 'jwt_rs256';      grant: string; mode: 'exchange' | 'present'; aud: string; scope?: string;
                              token_url?: string; ttl_s?: number; require_scopes?: string[] }   // exchange needs token_url
  | { kind: 'aws_sigv4';      grant: string; region: string; service: string };

type PageDecl =
  | { kind: 'none' }
  | { kind: 'cursor_param'; param: string; from: string; more?: Expect }               // Stripe: starting_after ← data[-1].id
  | { kind: 'offset';       param: string; size: number; more?: Expect }               // next = offset + size
  | { kind: 'page_number';  param: string; start?: number; more?: Expect }             // default start 1
  | { kind: 'keyset';       param: string; from: string }                              // next = last row's key
  | { kind: 'link_header';  stop_when: { param: string; is: string } };                // Sentry: results="false"

type Expect = { path: string; on_fail?: 'warn' | 'review' | 'fail' } & (                // default on_fail: review
  | { eq: Scalar } | { ne: Scalar } | { is: Scalar } | { is_not: Scalar } | { present: true } | { absent: true }
  | { contains: string } | { starts: string } | { ends: string } | { len_lte: number } | { len_gte: number });
type Cond = { status_in: number[] } | Omit<Expect, 'on_fail'>;                          // 25 §6: error_when on a body path
```

Defaults and closed lists, in one table:

| Key | Type | Default | Closed list / bound |
|---|---|---|---|
| `method` | enum | `GET` | `GET POST` — the `Http` port takes nothing else |
| `auth.kind` | enum | — (required) | the eight above |
| `schedule.every` | duration | — (required) | ≥ `15m`; lint refuses coarser than half `source_retention` |
| `schedule.jitter` | enum | `auto` | `auto` only — jitter is mandatory (25 §9) |
| `schedule.tz` | enum | `record` | `record` only in v1 |
| `window.grain` | enum | `day` | `hour day month` |
| `window.lookback` | duration | `0` | ≤ `max_span` |
| `window.max_span` | duration | `31d` | ≤ `366d` |
| `page.kind` | enum | `none` | `cursor_param offset page_number keyset link_header` + `none` |
| `limits.max_pages` | int | 40 | 1–50; `lease_size × max_pages ≤ 200` (25 §9) |
| `limits.response_bytes` | int | 2,000,000 | ≤ 2,000,000 — the row/BLOB ceiling and the `Http` cap |
| `limits.rows_per_run` | int | 5,000 | ≤ 5,000 |
| `limits.timeout` | duration | `6s` | `1s`–`30s` |
| `on_error.error_when` | list | `[{ status_in: [429, 500, 502, 503, 504] }]` | a status list or a body-path test |
| `on_error.fatal_when` | list | `[{ status_in: [400, 404] }]` | 401 and 403 are `PULL_AUTH_REJECTED` regardless |
| `expect[].on_fail` | enum | `review` | `warn review fail` (25 §5.1) |
| `expect[]` string operators | string | — | `contains starts ends` ≤ 40 bytes — the `where:` cap |
| `writes.confidence` | enum | `exact` | `exact proposed` — a pull never writes `needs-review` rows; it *receipts* them |
| `writes.kind` | enum | — (required for a series) | the five series kinds, 08 §3 |
| `on_conflict` | enum | `update` | `skip update new` (07 §3) |

Every list here is checked at install by `declare` (42); connect re-checks only the two that are security
(§8) and otherwise trusts the canonical body.

### 4.2 · Placeholders — five, closed

```ebnf
placeholder = "{" name [ ":" format ] "}" ;          (* anything else between braces is literal text *)
name        = "since" | "until" | "page" | "probe." ident | "grant." ident ;
format      = "date" | "instant" | "epoch_s" | "epoch_ms" | "int" ;
ident       = [a-z] { [a-z0-9_] } ;
```

| Placeholder | Value | Default format | Legal formats |
|---|---|---|---|
| `{since}` | the window's first instant (ms) | `instant` | the five |
| `{until}` | the window's exclusive end (ms) | `instant` | the five |
| `{page}` | the paginator's next value | as-is | `int` |
| `{probe.<name>}` | one value read by the single probe | as-is | `int` on a number |
| `{grant.<name>}` | a non-secret field of the grant's plaintext (§4.6) | as-is | none |

Formats: `date` → `YYYY-MM-DD` of the instant in the record's tz · `instant` → RFC 3339 UTC, `Z`, milliseconds ·
`epoch_s` → `floor(ms / 1000)` · `epoch_ms` → `ms` · `int` → the integer part. Resolution rules, as a test reads
them: a token that does not match the grammar exactly is literal (so a GraphQL `query { … }` body survives); a
substituted value is percent-encoded with `encodeURIComponent` in `path` and `query`, raw in a header value and a
body leaf; a body leaf that is exactly one placeholder formatted `int`, `epoch_s` or `epoch_ms` becomes a JSON
number; a `{grant.<name>}` naming a secret key, or an unknown name, is `PULL_REQUEST_REFUSED` at `fetch.<key>`.
The URL is then re-parsed and its `origin` compared with `base` — the one check that cannot be delegated to lint.

### 4.3 · Response paths

```ebnf
path  = seg { "." seg } ;
seg   = key { index } ;
key   = [A-Za-z_] { [A-Za-z0-9_-] } ;
index = "[" integer "]" | "[-1]" | "[]" ;            (* [] = every element; legal at most once *)
```

`readPath(json, path)` returns the value, `undefined` when any step is missing, and a list when `[]` was used.
An `expect:` operator over a list applies to every element (a list is implicitly `all`). This covered every
response shape of 25 §4; there is no wildcard key, no filter, no function.

### 4.4 · Run-time types

```ts
type Window    = { since: number; until: number };                          // ms, half-open [since, until)
type PageState = { kind: 'cursor_param' | 'keyset'; value: string } | { kind: 'offset' | 'page_number'; value: number }
               | { kind: 'link_header'; url: string } | { kind: 'none' };
type Cursor    = { watermark: string | null;                                // RFC 3339 — exclusive end of complete coverage
                   window?: { since: string; until: string; page: PageState | null; n: number; rows: number } };
type ResolvedRequest = { url: URL; method: 'GET' | 'POST'; headers: Record<string, string>; body?: string };
type ExtractedRow = import('@braindog/extract').ExtractedRow;   // { fields, confidence, outcome } — 43 §4.1
type PullPage   = { outbox: string; n: number; raw: { sha256: string; headers: Record<string, string>; bytes: number; body: string | null;
                    state: 'matched' | 'review'; reason?: string }; rows: ExtractedRow[]; cursor: Cursor };
type PullFinish = { outcome: PullResult['outcome']; points: MetricPoint[]; cursor: Cursor; due_at: string | null; slot: string;
                    warnings: Failed[]; error?: PullResult['error']; needs_review: number; rotated_grant?: Sealed };
type MetricPoint = { series: string; grain: 'hour' | 'day' | 'month'; at: string; value: number; unit: string; n: number | null };
type ExpectOutcome = { ok: true; warnings: Failed[] } | { ok: false; failed: Failed; severity: 'review' | 'fail' };
type Failed = { at: string; found: unknown; wanted: string };

type Grant  = { id: string; version: number; fields: Record<string, string> };   // plaintext, run-scoped, never serialised
type Sealed = { ciphertext: string; nonce: string; kek_id: string; grant_id: string; version: number };   // base64url
type WrappedDek = { wrapped: string; nonce: string; kek_id: string };                                   // vault_key 'connector'

type PullPayload = {                          // outbox.payload for kind pull.fetch — §13 D1
  ingest: string; decl: IngestDecl; declaration_version: number;
  grant: Sealed | null; dek: WrappedDek | null;   // null for auth.kind none
  record: { id: string; tz: string }; cursor: Cursor; slot: string;
};

type PullResult = {
  ingest: string; outbox: string;
  outcome: 'ok' | 'partial' | 'review' | 'failed' | 'paused';
  pages: number; rows: number; points: number; bytes: number; ms: number;
  window: { since: string; until: string } | null; cursor: Cursor;
  warnings: Failed[]; error?: { code: PullCode; at: string; found?: unknown; wanted?: string; fix: string; notBefore?: number };
};
```

Invariants a test checks: `cursor.watermark` never exceeds the start of the current grain; `cursor.window` is
present exactly when the last run ended `partial`; `PullResult` contains no header value, no URL and no grant
field; `Grant` is never a property of anything that leaves `runPull`.

### 4.5 · The eight `auth.kind`s — what goes where

| Kind | Puts | Where | Grant keys (secret in bold) |
|---|---|---|---|
| `none` | nothing | — | — |
| `bearer` | `Authorization: Bearer <token>` | header | **token** |
| `basic` | `Authorization: Basic base64(username ":" password)` | header | username, **password** |
| `header` | `<name>: <token>` | header `name` (§8 reserved names refused) | **token** |
| `query_param` | `<name>=<token>` | query, appended after placeholders | **token** |
| `oauth2_refresh` | `Authorization: Bearer <access_token>` after one POST to `token_url`: `grant_type=refresh_token&refresh_token=…&client_id=…&client_secret=…[&scope=…]`, form-encoded; reads `access_token`, and `refresh_token` when the provider rotated it | header | client_id, **client_secret**, **refresh_token** |
| `jwt_rs256` | header `{ alg: RS256, typ: JWT[, kid] }`, claims `{ iss, aud, iat, exp = iat + ttl_s[, scope] }`, RSASSA-PKCS1-v1_5/SHA-256 over `base64url(header).base64url(claims)`. `present`: `Authorization: Bearer <jwt>`. `exchange`: POST `token_url` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>` → `Authorization: Bearer <access_token>` | header | iss, kid, **private_key** (PKCS#8 PEM) |
| `aws_sigv4` | `Authorization: AWS4-HMAC-SHA256 Credential=<access_key_id>/<date>/<region>/<service>/aws4_request, SignedHeaders=host;x-amz-date[;x-amz-security-token], Signature=<hex>` plus `x-amz-date` and, with a session token, `x-amz-security-token` | headers | access_key_id, **secret_access_key**, **session_token** |

SigV4 steps, as the reference states them (§13 D2): (1) canonical request = method, canonical URI, canonical
query (keys and values RFC 3986-encoded, sorted by key then value), canonical headers (lower-cased, values
trimmed, sorted, each `name:value` + LF), signed headers, `hex(sha256(body or the empty string))`; (2) string to
sign = `AWS4-HMAC-SHA256` LF `<x-amz-date>` LF `<date>/<region>/<service>/aws4_request` LF `hex(sha256(canonical
request))`; (3) signing key = `HMAC(HMAC(HMAC(HMAC("AWS4" + secret, date), region), service), "aws4_request")`;
(4) signature = `hex(HMAC(signing key, string to sign))`. All hashing is WebCrypto; `ttl_s` default 3,600.

### 4.6 · The grant's plaintext, and the key hierarchy in bytes

A connector grant decrypts to a UTF-8 JSON object of string fields (§4.5's keys). The secret keys per kind are
the closed set in bold above; every other key is a non-secret field `{grant.<name>}` may name. The crypto
(12 §6, made byte-exact — §13 D9):

| Step | Algorithm |
|---|---|
| Unwrap the connector DEK | `AES-256-GCM.decrypt(kek = KeyStore.byId(dek.kek_id), iv = dek.nonce (12 bytes), aad = utf8(record_id ‖ 0x1F ‖ "connector"), dek.wrapped)` → 32 bytes; a null key is `WRONG_KEY` |
| Derive the grant key | `HKDF-SHA-256(ikm = DEK, salt = empty, info = utf8(grant_id), L = 32)` → AES-256-GCM key |
| Decrypt the grant | `AES-256-GCM.decrypt(grant key, iv = nonce (12 bytes), aad = utf8(record_id ‖ 0x1F ‖ grant_id ‖ 0x1F ‖ version), ciphertext)` |
| Seal (a rotated refresh token) | the mirror, with `version + 1` in the AAD and a fresh 12-byte nonce |

### 4.7 · `metric_point` and the write-time reducer

The row is 25 §8's `(series, grain, at, value, unit, n, source, wrote_at)`, primary key `(series, grain, at)`, the
upsert `INSERT … ON CONFLICT DO UPDATE` performed by the record. Connect's half is the shape:

| Field | Rule |
|---|---|
| `at` | the mapped `at` (a `day` or an `instant`) bucketed in the record's tz: `hour` → `YYYY-MM-DDTHH:00:00Z`, `day` → `YYYY-MM-DD`, `month` → `YYYY-MM` |
| `value` | the mapped `value` × `scale` (default 1), rounded half away from zero; must fit `int` (34 §3), else the row is a miss |
| `n` | the mapped `n`, or NULL |
| `unit` | `writes.unit`, verbatim |

The reducer folds every row of a run that lands in one bucket; kinds from 08 §3:

| Kind | Two rows in one bucket become | Because |
|---|---|---|
| `flow` | `sum(value)`; `n = sum(n)` | an accumulator adds |
| `gauge` · `cumulative` · `unique` · `fact` | the row with the greatest source `at`, then the later one in response order; with `n` present: `value = round(Σ value·n / Σ n)`, `n = Σ n` | a level, a counter's level, a day's distinct count and a fact are readings — the latest revision wins; `unique` is pinned to its day and never widened |

A missing bucket gets no row — absence is the gap (08 §3, 25 §8); connect never emits a zero it did not read.

### 4.8 · Jitter and the due instant

`jitterSeconds(recordId, ingestId, everyS)` = `u32be(sha256(utf8(recordId ‖ 0x1F ‖ ingestId))[0..4]) mod window`,
`window = clamp(everyS / 10, 30, 900)`. Stable, so *"why the gap at 04:00"* has an answer; spread, so twenty
hourly connectors land across six minutes. `nextDue`: `slot` is the unjittered slot the run was due for; the
next slot is `slot + every` advanced while `≤ now` (or the next `at` in the record's tz when `at` is declared);
`dueAt = slot + jitter × 1000`. The first due at install is `now` — the first run happens on install (§13 D8).

## 5 · Algorithms

### 5.1 · A run — `runPull`

The host has already leased: `leaseOutbox(['pull.fetch'], 5)` set `leased_until = now + 300 s` (30 §8) and runs
the leased rows concurrently, one `runPull` each. Then, per row:

1. **Unpack.** `payload: PullPayload` from `job.payload`; `decl`, `cursor`, `slot`, `record.tz`; `t0 = clock.now()`;
   `edge = leased_until − (timeout + 10 s)` — the instant after which no new page starts.
2. **Open the grant.** `auth.kind = none` → skip. Else `openSealed(payload.grant, payload.dek, record.id, keys)` per
   §4.6 → `Grant`. A null KEK is `WRONG_KEY`: ack `failed` (the ladder retries after a key rotation lands), no stale mark —
   nothing here is the provider's fault.
3. **The window.** `cursor.window` present → resume it (`since`, `until`, `page`). Else compute:
   `watermark = cursor.watermark ?? window.start`; `since = max(window.start, watermark − lookback)`;
   `until = min(since + max_span, end of the current grain in tz)`. No `window:` declared → `since = until = slot`,
   and `{since}`/`{until}` are refused at lint. `since ≥ until` → outcome `ok`, nothing to fetch, step 10.
4. **The token step.** `oauth2_refresh`, or `jwt_rs256` with `mode: exchange`: build the JWT or the form body
   (§4.5), one `http.fetch(token_url, { method: 'POST', timeoutMs })`. Classify the status by step 7; a rotated
   `refresh_token` is remembered for step 10. `present` and the static kinds need no request.
5. **Probe, once.** `probe:` declared → `GET base + probe.path` with auth applied; classify by step 7; each
   `read` path → `probe.<name>`; a missing path is `PULL_SHAPE_MISMATCH` at `fetch.probe.read.<name>`.
6. **Page loop** while `page.n < max_pages`, `rows < rows_per_run`, `clock.now() < edge`, and the paginator has a next:
   1. `req = resolveRequest(decl, page, grant, probe, window, tz)` — substitute §4.2, build `URL(base + path)`, add
      `query` (arrays repeat), `body` as JSON; **assert `req.url.origin === decl.fetch.base`**, else
      `PULL_ORIGIN_REFUSED` at `fetch.path`.
   2. `applyAuth(req, decl.fetch.auth, grant, token)` — the header, query or signature of §4.5; `Authorization` set
      here and nowhere else.
   3. `res = await http.fetch(req.url, { method, headers, body, timeoutMs })`; the port's own refusals map:
      private range → `PULL_ORIGIN_REFUSED`, too large → `PULL_REQUEST_REFUSED`, timeout or network →
      `PULL_PROVIDER_UNAVAILABLE`.
   4. **Status.** `3xx` → `PULL_ORIGIN_REFUSED` (never followed). `401` or `403` → `PULL_AUTH_REJECTED`. A status
      in `error_when` → `PULL_PROVIDER_UNAVAILABLE`, `notBefore` from `Retry-After` when `honour: retry_after`
      (seconds or HTTP-date, capped 6 h). `2xx` → continue. Anything else → `PULL_REQUEST_REFUSED`.
   5. `text = await res.text()`; `bytes += text.length`; `sha = hex(sha256(text))`; `json = JSON.parse(text)` —
      a parse failure is `PULL_SHAPE_MISMATCH` at `fetch.read`.
   6. **Body-path conditions**, then **`expect:`** — `expect(decl, json, window, tz)`: every `Cond` with a `path`
      in `error_when` / `fatal_when` is evaluated first (true → the matching code); then each `Expect` in order.
      `on_fail: warn` collects; `review` or `fail` stops the run with `PULL_EXPECT_FAILED` naming `at`, `found`,
      `wanted`. **The cursor does not move for a failed page** — the load-bearing half of 25 §5.1.
   7. `list = read.rows ? readPath(json, read.rows) : json`; not an array → `PULL_SHAPE_MISMATCH` at `fetch.read.rows`.
   8. `extraction = extract(decl, { id, ts, channel: 'pull', headers, body: text }, { ...deps.extract, now, tz,
      maxRows: rows_per_run − rows })` — 43's one call per arrival, `n` rows for a pull (§13 D4). A row whose
      `confidence` is `needs-review` — a missing `at`, `value` or `dedupe` field — is counted, never written.
   9. Register → `record.applyPull({ outbox, n, raw: { sha256, headers, bytes, body: null, state: 'matched' },
      rows: extraction.rows, cursor })` with `cursor.window.page` already advanced to `nextCursor(...)`. Series →
      the same call with `rows: []`, and `extraction.rows` appended to the run's buffer.
   10. `page = nextCursor(decl, json, list, res, page)`; `null` ends the loop. For `link_header` the next URL is
       parsed and its `origin` compared with `base` — a foreign Link is `PULL_ORIGIN_REFUSED` at `fetch.page`.
7. **Classify** — every `PullError` thrown inside the loop ends it and sets the outcome:

   | Code | Outcome | Cursor | Ack |
   |---|---|---|---|
   | `PULL_AUTH_REJECTED` | `paused` | unchanged | `done` — the schedule row is paused by the record, not retried |
   | `PULL_PROVIDER_UNAVAILABLE` · `PULL_LEASE_EDGE` | `failed` | pages that passed kept | `failed`, `notBefore` in `result.error` → the ladder |
   | `PULL_REQUEST_REFUSED` · `PULL_ORIGIN_REFUSED` · `PULL_SHAPE_MISMATCH` | `review` | unchanged for this page | `done` — retrying will not fix a declaration |
   | `PULL_EXPECT_FAILED`, `review` | `review` | unchanged | `done`; the raw page keeps its body, `state = 'review'`, `reason = at` |
   | `PULL_EXPECT_FAILED`, `fail` | `failed` | unchanged | `failed` — counts toward the ladder (25 §5.1) |
   | `WRONG_KEY` | `failed` | unchanged | `failed`, no stale mark |

8. **The edge.** The loop condition `clock.now() < edge` stopped it with pages left → `PULL_LEASE_EDGE`, outcome
   `failed`, `cursor.window` kept with `page` set; the ladder's first retry (2 min) resumes at that page. The cap
   `max_pages` or `rows_per_run` reached with pages left → outcome `partial`, `cursor.window` kept, `dueAt = now + 60 s`.
9. **Series completion rule.** Points are written **only when the window completed** (`ok`): a page boundary
   can split a bucket, so the buffer is reduced once, at the end (§4.7). A series run that ends `partial` or
   `failed` writes no points and restarts the window from page 1 next time (`page: null`) — the item names the
   fix (*raise `max_pages` or lower `max_span`*). Register rows are idempotent upserts and do resume mid-window.
10. **Finish.** `points = writeSeries(decl, buffer, tz)` when `ok`; `watermark = min(until, start of the current
    grain)` when `ok`, else unchanged; `{ slot, dueAt } = nextDue(...)` (or `now + 60 s` for `partial`; `null` for
    `paused`). The `PullFinish` rides the ack — `record.ackOutbox(outbox, 'done' | 'failed', finish, error?.code)`
    — the shape 51 §13 D9 and 46 §13 D6 already give `ackOutbox.result`. The record, in the ack's transaction
    (§13 D1): upserts the points; writes the receipts (`confidence = warnings.length ? 'needs-review' :
    extraction.confidence`); one `pull` event, `actor = ingest:<id>`, `note = "<n> points|rows · <since>…<until> ·
    <pages> pages · <ms>"`; stores the cursor, `slot` and `due_at` on the `pull` schedule row; for `paused`:
    `grant.stale_at = now`, the row `state = 'paused'`, one urgent notification `{ tone: bad, say, because:
    ingest.<id>, key: [ingest, day], urgent: true }` (09 §4); for a rotated grant: `ciphertext → prev_ciphertext`,
    version + 1, one `grant.rotate` event; for `failed`: the ladder row, `due_at = max(ladder, result.error.notBefore)`.
11. **Return** the `PullResult`. The plaintext `Grant` goes out of scope here; nothing above stored it.

### 5.2 · `resolveRequest` — substitution

1. Scan each of `path`, every `query` value, every `headers` value and every string leaf of `body` for tokens
   matching §4.2; a non-matching brace pair is left as text.
2. Resolve: `since`/`until` from `window`; `page` from `PageState.value` (a `link_header` state replaces the whole
   URL, so `{page}` is refused with it at lint); `probe.<name>`; `grant.<name>` only for a non-secret key.
3. Format per §4.2; encode: `encodeURIComponent` in `path` and `query`; raw elsewhere; a header value outside
   visible ASCII is `PULL_REQUEST_REFUSED`.
4. `url = new URL(base + path)`; append query pairs; `url.origin !== base` → `PULL_ORIGIN_REFUSED`; a `..`
   segment in `url.pathname` → the same code.
5. Return `{ url, method, headers, body }`.

### 5.3 · `nextCursor` — the five paginators

| Kind | Next value | Stops when |
|---|---|---|
| `none` | — | after page 1 |
| `cursor_param` | `readPath(json, from)` (Stripe `data[-1].id`) | `more` fails, `from` is missing, or rows are empty |
| `offset` | `value + size` | rows `< size`, or `more` fails |
| `page_number` | `value + 1` | rows are empty, or `more` fails |
| `keyset` | `readPath(rows[-1], from)` | rows are empty or the key is missing |
| `link_header` | the `rel="next"` URL of the `Link` header, RFC 8288 | no `next` link, **or** the link carries `stop_when.param` equal to `stop_when.is` — Sentry's `results="false"` (25 §4); presence alone never decides |

Every kind also stops at `max_pages` and `rows_per_run` (step 8). A next value equal to the current one is a loop
and stops with `PULL_SHAPE_MISMATCH` at `fetch.page.from`.

### 5.4 · `expect` — the operators

`eq`/`ne` compare after placeholder substitution in the literal (`eq: "{since:date}"` is npm's clamp check);
`is`/`is_not` compare a bare literal with no substitution (`is: list` is the string `"list"` — Stripe's `object`);
`present`/`absent` test `readPath !== undefined`; `contains`/`starts`/`ends` are byte-wise on strings, literal
≤ 40 bytes; `len_lte`/`len_gte` apply to strings and lists. A list value from `[]` passes only when every element
passes. Numbers compare as numbers, everything else as strings; `null` equals only `null`.

### 5.5 · Complexity and what is measured

One page in memory at a time; the series buffer is ≤ `rows_per_run` rows. `readPath` is `O(depth)`; the reducer
is one `Map` pass. Measured on every run and written into the `pull` event's note: `pages`, `rows` or `points`,
`bytes`, `ms`. The fixtures test (§9) asserts a forty-page run over the memory `Http` completes in under 2 s of
wall time on the CI runner; the 300 s budget is the table in §7.

## 6 · Refusals and errors

Install-time refusals of a `fetch:` block — a placeholder in `base`, a spelled `Authorization` or a key-prefix
literal (`SECRET_IN_PACK`, 42 §4), `every` coarser than half `source_retention`, a chained probe, a fetched
`for_each`, an unknown kind — are `declare`'s (42, from 25 §7); extraction's outcomes are 43 §6's. Connect raises
**eight codes at run time**: `WRONG_KEY` from the corpus (30 §6) and seven new ones, recorded in §13 D6 for the
30 §6 table and the `refusal-fixtures` gate:

| Code | Raised when | `fix` a person reads |
|---|---|---|
| `WRONG_KEY` | `KeyStore.byId(kek_id)` is null — the root key rotated | "The root key changed; re-wrap the connector key and retry." |
| `PULL_AUTH_REJECTED` | the provider answered 401 or 403 to the token step, the probe or a page | "Reconnect the credential — the provider rejected it; the connector is paused until you do." |
| `PULL_PROVIDER_UNAVAILABLE` | a status in `error_when`, a timeout, a network failure, a body-path `error_when` | "Nothing to do; the next attempt is scheduled." |
| `PULL_REQUEST_REFUSED` | a status in `fatal_when` or any unlisted non-2xx, a body over `response_bytes`, a header value outside ASCII, a placeholder naming a secret or an unknown name | "Fix the declaration — the provider refused the request as declared." |
| `PULL_EXPECT_FAILED` | an `expect:` or the `more:` test failed with `on_fail: review` or `fail` | "The server did not do what was asked: `<at>` was `<found>`, expected `<wanted>`. Nothing was written." |
| `PULL_SHAPE_MISMATCH` | the body is not JSON, `read.rows` is not a list, a `probe.read` or `page.from` path is missing, the paginator repeated a value | "The response shape changed; check `<at>` against a recent response." |
| `PULL_ORIGIN_REFUSED` | a 3xx, a resolved URL or Link off `base`, a `..` segment, the `Http` port's private-range refusal | "The connector may only call `<base>`; a redirect or a foreign link was not followed." |
| `PULL_LEASE_EDGE` | the loop stopped before the 300 s edge with pages left, or the record found the lease no longer this runner's on `applyPull` | "The run was longer than its lease; it continues at the next attempt." |

Eight, counted. Every code has a fixture under `fixtures/refusals/<kebab-case>.yaml`; the shape is 30 §6's
`{ code, at, found, wanted, fix }`. A run's log line carries the code, the ingest id, the status and the page
number — never a URL, a header, a body or a grant field (35 §2, 12 §6 rule 5).

## 7 · Performance budget

| Number | Value | Measured how |
|---|---|---|
| Lease per `pull.fetch` row | 300 s (30 §8) | the record sets `leased_until`; connect reads it |
| Runs per host invocation | ≤ 5, concurrent | the host's `leaseOutbox(…, 5)` |
| Pages per run | 40 default, 50 max | `limits.max_pages`; `5 × 40 = 200` subrequests per invocation, under the 1,000 Paid ceiling with headroom (25 §9) |
| Requests per run | ≤ 1 token + 1 probe + `max_pages` = 42 | counted in `PullResult.pages` plus two |
| Bytes per page | ≤ 2,000,000 | the `Http` port refuses above it before buffering; connect counts `text.length` |
| Bytes per run, worst | 80 MB fetched, one page resident (~12 MB parsed) | the loop holds one page; the 128 MB Worker ceiling is never approached |
| Rows per run | ≤ 5,000 | `limits.rows_per_run`; stops the loop, keeps the window |
| Timeout per request | 6 s default, 30 s max | `Http.fetch.timeoutMs` |
| Worst-case wall, 40 pages | 40 × 6 s = 240 s + 40 RPCs ≈ 250 s | inside the lease; the edge check at `leased_until − 16 s` stops a slower provider |
| Typical wall, 40 pages | 40 × 0.3–0.8 s ≈ 12–32 s | `PullResult.ms`, on the `pull` event note |
| Fixture run, 40 pages, memory `Http` | < 2 s wall | `fixtures.test.ts`, asserted |
| Points per run | ≤ 5,000 → ≤ 5,000 upserts in one record transaction | the record's `applyPull`; 25 §8's ~120 B/row |
| `metric_point` growth | 20 connectors × 5 series × 365 ≈ 36,500 rows ≈ 4.4 MB/year | 25 §8 |
| Jitter window | `clamp(every / 10, 30 s, 15 min)` | `jitterSeconds`; twenty hourly connectors spread over 6 min |
| Minimum interval | 15 min (25 §9) | lint |

## 8 · Security

**Trust boundaries crossed.** The provider (untrusted, 25 §7 rule 8) → connect → the record (trusted, INTERNAL).
The KEK (a Worker secret) → `openSealed` → a plaintext grant in run-scoped memory. Nothing crosses in the other
direction: the record never sees the plaintext, the provider never sees anything but the declared request.

| Threat | Defence, and where |
|---|---|
| SSRF by declaration — `base: {grant.host}` | refused at lint: `base` is a literal `https://` origin (25 §7 rule 4). Re-asserted at run: `url.origin === base` after substitution, for every request and every Link (§5.2, §5.3) |
| SSRF by response — `302 → http://169.254.169.254/` | the `Http` port runs `redirect: 'manual'` and refuses private and link-local ranges after resolution (33 §1); connect treats every 3xx as `PULL_ORIGIN_REFUSED`. On the self-host `localhost:3000` is right there (25 §7 rule 5) — which is why the port, not connect, holds the address check |
| Path traversal by placeholder — `{grant.account}` = `../admin` | `encodeURIComponent` on every substituted value in `path` and `query`; a `..` segment after parsing is `PULL_ORIGIN_REFUSED`; the property test in §9 fuzzes this |
| A secret spelled into a file — `headers: { Authorization: … }` | lint refuses an `authorization` header and any literal with a known key prefix as `SECRET_IN_PACK` (42 §4, from 25 §7 rules 2–3); connect refuses `Authorization`, `Cookie`, `Host`, `Content-Length`, `Referer`, `Origin` and `X-Forwarded-*` again at run and sets `Authorization` only in `applyAuth` |
| A secret leaking through a placeholder — `{grant.token}` | the secret keys per kind are closed (§4.6); naming one is `PULL_REQUEST_REFUSED` before any request |
| A secret in a log | a log line carries code, ingest id, status, page — never a URL (a `query_param` token lives there), header, body or grant field. The `secret-grep` gate (33 §8) walks connect's log calls |
| A secret in the record | `PullResult`, `applyPull` arguments and the `pull` event carry no grant field; a rotated refresh token travels only as `Sealed` ciphertext |
| The credential decrypts with nobody present | ADR-052: connector grants live under the `connector` DEK, KEK-wrapped even when the vault passphrase is on. **The cost is the row 12 §7 carries** — *your connector credentials: we can read them, passphrase on or off* — and the bind screen says it in words at the moment the grant is attached. This package is why that row exists |
| A stolen `.brain` or R2 backup | `grant` rows and `vault_key` travel sealed; a KEK-wrapped DEK opens nothing without the KEK (12 §8). Connect adds no new plaintext at rest |
| The response as an instruction | every page is untrusted content in `inbox_raw`, so 12 §5 applies unchanged; a pull writes rows only through the declaration's `map:` and `writes:`, and never a `secret` or a `file` |
| A clamped or thresholded answer (npm, GA4) | `expect:` with `on_fail: review` — no write and no watermark move (25 §5.1) |
| A full-access key on a read-only connector | `proveScopes` at bind: `require_scopes` must be a subset of what the provider states; when it states nothing, `proven = null` and the bind screen says *"this token may do more than read"* (25 §7 rule 6) |
| Twenty connectors waking at once | deterministic jitter and the 5-run lease (25 §9); the subrequest bound is a table row (§7), not a hope |

What is not defended, stated: a compromised Worker holds the KEK and can decrypt every connector grant — the
same trade 12 §6.1 records for the vault, made once more here.

## 9 · Tests and gates

`node --test` over `test/**/*.test.ts`; `node:assert/strict`; a memory `Http` that serves fixture pages by URL and
records every request; a stub `RecordApi` that records every `applyPull` and `ackOutbox`; an injected `Clock`.

**Recorded fixtures — the nine APIs of 25 §4, responses invented, one directory each** (`fixtures.test.ts`):

| Fixture | Exercises | Expected |
|---|---|---|
| `npm-downloads` | `none` auth, `{since:date}:{until:date}` in `path`, `page: none`, series `flow` | 7 points; a second fixture with `start` clamped → `PULL_EXPECT_FAILED`, `outcome: review`, cursor unchanged, raw body kept |
| `github-traffic` | `bearer`, `link_header` with an opaque cursor, `unique` kind | the next URL taken verbatim from `Link`; a Link on another host → `PULL_ORIGIN_REFUSED` |
| `stripe-ledger` | `bearer`, `cursor_param` (`starting_after ← data[-1].id`, `more: has_more`), `expect: object is list`, register `writes`, `dedupe: [id]` | 3 pages, 250 rows, `applyPull page` × 3 with `dedupe` fields present; cursor advances per page |
| `cloudflare-graphql` | `bearer`, POST with a JSON body containing `{grant.zone}` and `{since:instant}`, `probe:` reading `settings`, `error_when: { path: errors, present: true }` on a 200 | one probe then pages; the 200-with-`errors` body → `PULL_PROVIDER_UNAVAILABLE` |
| `plausible` | `bearer`, POST with a JSON body carrying `{since:date}`/`{until:date}` and `{grant.site_id}`, `gauge` kind | body exact; two rows in one day → the later `at` wins |
| `posthog-endpoints` | `header` auth with `name: X-Api-Key`, `offset` paging with `size`; a sibling case with `name: Authorization` | header exact; stops when a page returns fewer than `size` rows; the sibling is `PULL_REQUEST_REFUSED` |
| `ga4` | `jwt_rs256` mode `exchange`: RS256 signature verified with the fixture's public key, one POST to `token_url`, then `Bearer <access_token>`; `expect: metadata.subjectToThresholding is_not true` | exact claim set `{ iss, scope, aud, iat, exp }`; a thresholded page → `review` |
| `sentry` | `link_header` with `stop_when: { param: results, is: "false" }` | stops on `results="false"` although a `next` link is present — never loops |
| `vercel` | `bearer`, `keyset` paging, `cumulative` kind | next = last row's key; empty rows end the loop |
| `enable-banking` (tenth, for the second `jwt_rs256` customer) | mode `present`, `kid` from the grant | `Authorization: Bearer <jwt>` with `kid` in the header, no token step |
| `aws-cost` (eleventh, the eighth kind) | `aws_sigv4` against the reference vector | the exact `Authorization` string and `x-amz-date` of the published example |

**Unit cases — input → expected** (one row per case; the file is named):

| File | Input | Expected |
|---|---|---|
| `request` | `path: /v1/{grant.account}/x` with account `acme` | `/v1/acme/x` |
| | account `../admin` | `PULL_ORIGIN_REFUSED` |
| | `{since:epoch_s}` with since `2026-01-01T00:00Z` | `1767225600` |
| | `{until:date}` in tz `Africa/Cairo`, until `2026-01-01T22:00Z` | `2026-01-02` |
| | body leaf `"{page:int}"` with page 3 | JSON number `3` |
| | body `query { viewer { zones(filter: {zoneTag: "{grant.zone}"}) } }` | only `{grant.zone}` substituted |
| | `{grant.token}` | `PULL_REQUEST_REFUSED` at `fetch.path` |
| | `{probe.missing}` | `PULL_REQUEST_REFUSED` |
| | header value `Stripe-Account: {grant.account}` | substituted raw, not encoded |
| | `query: { "expand[]": [a, b] }` | `expand%5B%5D=a&expand%5B%5D=b` |
| `request` — `expect` | `{ path: start, eq: "{since:date}" }`, start `2025-02-27`, since `2024-01-01` | fail, `found: 2025-02-27`, `wanted: 2024-01-01` |
| | `{ path: object, is: list }` on `"object": "list"` | pass |
| | `{ path: data[].status, is: ok }` with one `pending` | fail |
| | `{ path: meta.sampled, is_not: true, on_fail: warn }` sampled | pass with one warning |
| | `contains` literal of 41 bytes | thrown at construction — lint's job, asserted here too |
| `auth` | each of the eight kinds with a fixed grant and clock | the exact header set or query pair of §4.5, byte for byte |
| | `header` with `name: Cookie` | `PULL_REQUEST_REFUSED` |
| | `oauth2_refresh` response with a new `refresh_token` | `rotated_grant` sealed with version + 1, decrypts to the new token |
| | `openSealed` with a wrong `kek_id` | `WRONG_KEY` |
| | `openSealed` with a ciphertext moved to another grant id | throws (AAD mismatch) |
| `page` | Stripe page with `has_more: false` | `null` |
| | `link_header` with `rel="next"` and `results="false"` | `null` |
| | `link_header` next on `https://evil.example` | `PULL_ORIGIN_REFUSED` |
| | `cursor_param` yielding the same value twice | `PULL_SHAPE_MISMATCH` |
| `write` | `flow`, rows `(d1, 3)`, `(d1, 4)`, `(d2, 5)` | points `(d1, 7)`, `(d2, 5)` |
| | `gauge`, rows `(t1, 10)`, `(t2, 12)` same day | `(day, 12)` |
| | `unique`, hourly rows in one day | one point, the latest — never a sum |
| | `cumulative`, `fact` | the latest |
| | `ms` with `n`: `(100, n 2)`, `(200, n 6)` | `(175, n 8)` |
| | `value 3.14159` with `scale 100` | `314`; `value 2^54` → a miss |
| | instant `2026-01-01T22:30Z`, grain `day`, tz `Africa/Cairo` | `at = 2026-01-02` |
| `run` | 401 on page 1 | `outcome: paused`, ack `done` whose `result.error.code = PULL_AUTH_REJECTED` and `due_at = null`, cursor unchanged |
| | 429 with `Retry-After: 120` on page 2 of a register pull | page 1 kept, `failed`, ack `failed` whose `result.error.notBefore = now + 120 s`, `cursor.window.page` = page 2 |
| | 500 on page 3 of 5, series | no points written, `failed`, `cursor.window.page = null` |
| | 500 on page 3 of 5, register | pages 1–2 applied, no deletion is possible — the stub has no delete; `cursor.window.page` = page 3 |
| | `expect` fails on page 2 with `review` | `applyPull page` for page 2 carries the body and `state: review`; cursor at page 2; ack `done` |
| | forty pages, clock advanced 7 s per page | `PULL_LEASE_EDGE` at the edge; `failed`; `cursor.window.page` set; ack `failed` |
| | `max_pages: 2` over a 5-page window, register | `partial`, `due_at = now + 60 s`, `cursor.window` kept |
| | a complete window | `watermark = min(until, start of today)`; `window` absent; `nextDue` = the next slot + jitter |
| | human-set-wins | the stub answers `applyPull page` with `{ kept: 1 }`; the finish note carries `1 kept`; the rule itself is the record's step 2b and 45's fixture `human-only` — cited, not re-tested |
| | `PullResult` and every `applyPull` argument | contain no grant field, no `Authorization`, no URL (a `JSON.stringify` grep) |
| `index` — jitter | `jitterSeconds('rec_A', 'npm', 3600)` twice | equal; within `[0, 360)` |
| | twenty ingest ids, `every 1h` | at least 15 distinct seconds |
| | `nextDue` with `at: "04:10"`, tz `Africa/Cairo`, slot yesterday 04:10 | today 04:10 Cairo + jitter, as UTC |
| | `nextDue` with `every: 15m`, slot 40 min ago | the first slot after now |

**Property** (`origin.property.test.ts`, fast-check 4.9.0, 1,000 runs, seeds committed): for any declaration
with `base` fixed and any grant, probe and page values drawn from strings containing `/ .. @ % ? # \ :` and
non-ASCII, `resolveRequest` either throws `PULL_ORIGIN_REFUSED` or returns a URL with `origin === base`.

**Gates** (33 §8): `refusal-fixtures` — the seven `PULL_*` fixtures exist and each is produced by `run.test.ts`;
`secret-grep` — connect's log lines; `graph` — connect imports only `ports`, `extract`, `kernel`, `record`;
`closed-lists` — `PULL_CODES` has seven members and this document says seven; `conformance-count` is unaffected.

## 10 · Deliberate ceilings

- `ponytail:` series points are buffered per run and written once; a window that does not complete writes nothing
  and restarts. Merge-on-resume when a real series needs more than 40 pages a day.
- `ponytail:` `for_each` is refused in v1 — it needs a sixth placeholder. Add `{each}` when a third connector wants
  it; today two declarations do the job.
- `ponytail:` no `conditional: etag` — a windowed daily URL rarely repeats. Add when a provider's rate limit binds
  and its conditional requests are free (GitHub's are).
- `ponytail:` `on_error.backoff` and `pause_after` are not keys — the schedule's one ladder (30 §8) is the policy.
  A per-ingest cap when a provider's documented floor is above 6 h.
- `ponytail:` the access token is exchanged once per run and never cached — a run is ≤ 300 s, a token ≥ 3,600 s.
  Cache in the cursor when a provider rate-limits its token endpoint.
- `ponytail:` no retry inside a run — a 5xx ends it and the ladder retries from the cursor. Per-page retry when a
  provider is flaky per page rather than per hour.
- `ponytail:` `tz: record` only. Per-connector IANA when a provider's day boundary provably differs from the record's.
- `ponytail:` RS256 only, `kid` and `iss` from the grant, no JWKS. ES256 when a provider requires it.
- `ponytail:` SigV4 always hashes the body; no `UNSIGNED-PAYLOAD`, no chunked signing — reads only.
- `ponytail:` a passed page drops its body (`inbox_raw.body = NULL`, `sha256` and headers kept). `keep_raw: true`
  when a provider dispute needs the bytes.
- `ponytail:` `partial` continues one minute later; no pacing beyond that.
- `ponytail:` runs in one invocation are `Promise.all` over ≤ 5 rows. A work queue when `lease_size` grows.
- `ponytail:` `proveScopes` reads two headers (`X-OAuth-Scopes`, `X-Accepted-GitHub-Permissions`) and otherwise
  returns `null` — no per-provider table. Add a provider when its scope endpoint is machine-readable and asked for.

## 11 · Dependencies

| Kind | Package | Version | Used for |
|---|---|---|---|
| runtime, external | — | — | none |
| runtime, workspace | `@braindog/extract` | `workspace:*` | `extract(decl, raw, ctx)` once per page — §13 D4 |
| types only | `@braindog/ports` | `workspace:*` | `Http KeyStore Clock` |
| dev | `typescript` | 6.0.3 | type-check |
| dev | `@types/node` | 24.13.0 | `node:test` types |
| dev | `fast-check` | 4.9.0 | the one property test |

WebCrypto (`crypto.subtle`: AES-GCM, HKDF, RSASSA-PKCS1-v1_5, HMAC, SHA-256), `TextEncoder`, `URL` and
`Intl` are the platform surface 31 §1 permits; nothing from `node:*` or `cloudflare:*`. The kernel does no tz
arithmetic (41 §10), so `dayOf(ms, tz)` and `startOfGrain(ms, grain, tz)` are fifteen lines of
`Intl.DateTimeFormat(…).formatToParts` in `index.ts`; `parseDuration` is one regex over `<int>(m|h|d)`.

## 12 · Build order

Twelfth of the packages (35 §4). **Needs before it:** `ports` (37: the `Http`, `KeyStore`, `Clock` types and
the memory `Http`); `extract` (43: `extract()` over a `channel: pull` arrival, `readRows`, the `map:` forms).
**Needs beside it, by contract not import:** `record` (45: `applyPull`, `ackOutbox(result)`, the `PullPayload` the
schedule writes, the `pull` row's `paused` state — §13 D1, D8). **Unblocks:** the Worker's queue consumer for `pull.fetch`
and the bind route's `proveScopes` (51); the self-host's outbox poller (49); the Sources screen's `ok / failing /
paused` rows (50, from `PullResult` via the receipts and the schedule row); `braindog pull run <ingest>` if the CLI
ever gains it (48, not planned). Phase 4 of [BUILD.md](../BUILD.md) delivers it beside ingest and alarms.

## 13 · Decisions taken here

| # | Decision | Amend |
|---|---|---|
| D1 | **The write-back surface is one new INTERNAL method, `applyPull(page)`, plus `ackOutbox(id, state, result?, error?)`** — the `result` slot 51 §13 D9 and 46 §13 D6 already give the ack; `PullFinish` (§4.4) is its shape here, and a `failed` ack's `notBefore` rides inside `result.error`. `RecordApi` is declared structurally in this package (46 §4.6's pattern); 51's per-page `arrive({ channel: 'pull' })` row becomes `applyPull`. The record derives `actor = ingest:<id>` from its own outbox payload — never from the caller — and runs register rows through the write path (30 §4) as `create`/`update` on the `dedupe:` match; step 2b's `HUMAN_ONLY` is handled inside `applyPull` by dropping the named field and re-entering, so a person's field is never overwritten and the reply counts it `kept`. `applyPull` verifies the lease is still this runner's, else `PULL_LEASE_EDGE`. The `pull.fetch` payload is §4.4's `PullPayload`; the record writes `grant.read` with actor `ingest:<id>` and counts `opened` when it builds it. INTERNAL becomes seven methods, the surface forty-five | 30 §5, §8; 12 §6 rule 1 (the read event at enqueue); 51 §5 (the consumer table) |
| D2 | **SigV4 follows the AWS IAM User Guide, *Create a signed AWS API request*** (the 2024 revision), steps as §4.5 states them; the test vector is the guide's published example | 25 §5.2 |
| D3 | **Dedupe for register writes** is 43 §5.7's `Dedupe` and `isDuplicate`, applied by the record inside `applyPull`: an exact `dedupe: [id]` matches `register = ? AND deleted_at IS NULL AND json_extract(fields, '$.<f>') = ?` for every named field (lint requires `index: true` on each); a `near` dedupe runs 43's window query; then `on_conflict` — `update` → write path `update`, `skip` → counted, `new` → `create` | 25 §3.2; 07 §3; 43 §5.7 |
| D4 | **The `extract` expectation, aligned with 43 §2**: connect calls `extract(decl, raw, ctx)` **once per page** with `raw = { id, ts, channel: 'pull', headers, body }` and `ctx = { currencies, lookup, now, tz, maxRows }`; 43 reads `fetch.read.rows` (`readRows`) and applies `map:` per element, returning `n` `ExtractedRow`s; `Mapping.from ∈ epoch_s epoch_ms` (the other three formats are the field's own type); `Mapping` gains `scale` (D13). The host supplies `currencies` and a `lookup` built over the record's `list`. 43's `IngestDeclaration.writes.series` gains `unit` | 43 §4.1–§4.2; 25 §3.2 |
| D5 | **OAuth refresh storage**: the access token lives in run memory only; a rotated refresh token is re-sealed by connect (`seal`, version + 1) and stored by the record from the ack's `result.rotated_grant` with one `grant.rotate` event, actor `ingest:<id>` — the vault write 25 §5.2 reserves for kernel code, done by the record | 25 §5.2; 12 §6 |
| D6 | **Seven new codes** `PULL_AUTH_REJECTED PULL_PROVIDER_UNAVAILABLE PULL_REQUEST_REFUSED PULL_EXPECT_FAILED PULL_SHAPE_MISMATCH PULL_ORIGIN_REFUSED PULL_LEASE_EDGE`, a *connector* group after *auth and vault*; the count 75 → 82; seven fixtures | 30 §6; 34 §6 |
| D7 | **Four keys of 25 §3.2's example are not in v1**: `for_each` (42 §4 accepts 1–32 literals and its `Placeholder` regex has no `{each}` — an element nothing can name), `conditional`, `on_error.backoff`, `on_error.pause_after`; `limits.timeout` and `limits.max_pages` are added; 42's `calls_out` drops `for_each` | 25 §3.2, §5.3; 42 §4 (`fetch` keys, `calls_out`) |
| D8 | **The `pull` schedule row**: states `pending \| firing \| paused`; fire → `firing` and one outbox row; the ack's `result` → `pending` with `due_at` computed by connect's `nextDue`; `dead` → `paused` plus the item; the first `due_at` at install is `now` | 25 §9; 30 §1, §8; 09 §1 |
| D9 | **Bytes of the key hierarchy**: DEK wrap AES-256-GCM with AAD `record_id ‖ 0x1F ‖ purpose`; grant key HKDF-SHA-256, empty salt, `info = grant_id`; grant AAD `record_id ‖ 0x1F ‖ grant_id ‖ 0x1F ‖ version`; 12-byte nonces; base64url on the wire. `openSealed`/`seal` live here and the reveal route reuses them | 12 §6; 51 |
| D10 | **`expect:` semantics**: `is`/`is_not` compare a bare literal without substitution; `eq`/`ne` substitute placeholders first; a `[]` list is `all` | 25 §5.1 |
| D11 | **Window arithmetic**: `since = max(start, watermark − lookback)`, `until = min(since + max_span, end of the current grain)`, half-open; after a complete run `watermark = min(until, start of the current grain)` — today is re-asked until it ends | 25 §3.2 |
| D12 | **Raw retention for pulls**: one `inbox_raw` row per page, `channel = pull`; a passed page keeps `sha256`, headers and byte count with `body = NULL`; a `review` page keeps its body | 25 §7 rule 8; 07 §2 |
| D13 | **Series value shape**: `writes.unit` on the ingest (`count ms bytes money.<CUR> pct.bp`), `scale:` on the `value` mapping (integer multiplier, round half away from zero); the write-time reducer of §4.7 (`flow` sums, the four others take the latest, `n`-weighted when `n` is mapped) | 08 §3; 25 §8; 43 §4.2–§4.3 |
| D14 | **The `Http` port's refusals are named**: the adapter throws an `Error` whose `name ∈ PrivateRange \| TooLarge \| Timeout \| Network`; connect maps them in §5.1 step 6.3 | 33 §1; 37 |
| D15 | **Grant plaintext for connectors** is a JSON object of string fields; the secret keys per `auth.kind` are §4.5's closed set; `{grant.<name>}` may name only the others; `require_scopes` are proven by `proveScopes` at bind and stored in `grant.scopes` | 12 §6; 25 §7 |

Fifteen, counted. Each amendment lands in the same revision loop iteration as this draft ([BUILD.md](../BUILD.md)).

## 14 · Done when

- [ ] `pnpm -F @braindog/connect test` is green: every row of §9, the property test at 1,000 runs, seeds committed.
- [ ] The eleven fixture directories exist with invented responses; each produces its expected `PullResult`.
- [ ] `PULL_CODES` has seven members; the seven refusal fixtures pass the `refusal-fixtures` gate; `WRONG_KEY` is raised by the `openSealed` test.
- [ ] The eight `auth.kind`s each have a byte-exact header or query assertion; SigV4 matches the reference vector.
- [ ] The `origin` property holds: no fuzzed value moves a URL off `base`.
- [ ] `grep -r "Authorization" src/` finds exactly one assignment, in `auth.ts`; the `secret-grep` gate passes over connect.
- [ ] A forty-page fixture run completes under 2 s wall on CI and the `pull` event note carries `pages · bytes · ms`.
- [ ] 25, 30, 12, 08, 07, 33 and 34 carry the amendments of §13; 42, 43, 45, 37, 49 and 51 name the symbols this spec expects — `applyPull`, `ackOutbox(id, state, result, error)`, `runPull`, `extract` over a `pull` arrival, the `Http` error names — with the same signatures.
- [ ] `packages/connect/package.json` has no `dependencies`; the `graph` gate shows edges only to `ports` and `extract`.

---

*Previous: [46-SPEC-SPARK](46-SPEC-SPARK.md). Next: [48-SPEC-CLI](48-SPEC-CLI.md).*
