/**
 * Placeholders in, one concrete request out — and what a response has to be true of.
 *
 * FIVE PLACEHOLDERS, SUBSTITUTED, NEVER COMPUTED. `25 §3.1` is the line this file holds: a `fetch:`
 * block is a declaration, so `{since}`, `{until}`, `{page}`, `{probe.<name>}` and `{grant.<name>}`
 * are the whole vocabulary. There is no expression, no concatenation operator and no default value,
 * and the reason is not minimalism — it is that a connector runs unattended against somebody else's
 * system with a credential attached, and the set of things it can be made to do has to be readable
 * off the file by the person who installed it.
 *
 * ANYTHING ELSE BETWEEN BRACES IS TEXT. A GraphQL body is `query { viewer { zones(…) } }` and has to
 * survive this untouched, so the grammar matches exactly or not at all: a token that is nearly a
 * placeholder is literal, and the failure mode is a provider answering oddly rather than a body
 * quietly rewritten.
 *
 * THE ORIGIN IS CHECKED AFTER SUBSTITUTION, ALWAYS, AND THAT IS THE POINT OF THE WHOLE FILE. Lint
 * proves `base:` is a literal origin; nothing before run time can prove what `{grant.account}` holds.
 * So the URL is built, re-parsed and compared, and a `..` that survived as `%2e%2e` is refused with
 * it. `47 §9`'s property test fuzzes exactly this, and the table in `request.test.ts` is its floor.
 *
 * ENCODED IN A URL, RAW EVERYWHERE ELSE. `encodeURIComponent` on every value substituted into a path
 * or a query — which is what makes a `/` inside a value a character rather than a segment — and raw
 * in a header value and a body leaf, where a percent sign means a percent sign. A header value
 * outside visible ASCII is refused rather than encoded: header encoding is a place where a provider
 * and a client can disagree, and a connector is not a good place to find that out.
 */

import { fansOut, readPath, type Json } from '@braindog/where';

import {
  dayOf, isReservedHeader, isSecretField, PullError,
  type AuthKind, type Cond, type Expect, type ExpectOutcome, type Failed, type FetchDecl,
  type Grant, type PageState, type ResolvedRequest, type Scalar, type Window,
} from './index.ts';

/* ── The grammar ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `47 §4.2`, exactly:
 *
 *   placeholder = "{" name [ ":" format ] "}"
 *   name        = "since" | "until" | "page" | "probe." ident | "grant." ident
 *   format      = "date" | "instant" | "epoch_s" | "epoch_ms" | "int"
 *   ident       = [a-z] { [a-z0-9_] }
 */
const TOKEN = /\{(since|until|page|probe\.[a-z][a-z0-9_]*|grant\.[a-z][a-z0-9_]*)(?::(date|instant|epoch_s|epoch_ms|int))?\}/gu;

/** The whole of a leaf and nothing else — what makes a body leaf a JSON number rather than a string. */
const WHOLE = new RegExp(`^${TOKEN.source}$`, 'u');

export const FORMATS = ['date', 'instant', 'epoch_s', 'epoch_ms', 'int'] as const;
export type Format = (typeof FORMATS)[number];

/** Everything a substitution reads. Nothing here is mutated and nothing is read from anywhere else. */
export type SubCtx = {
  auth: AuthKind;
  grant: Grant;
  probe: Record<string, Scalar>;
  page: PageState | null;
  window: Window;
  tz: string;
};

/** An instant, formatted. `instant` is RFC 3339 UTC with milliseconds, which is what `07 §2` stores. */
const timeAs = (ms: number, format: Format | undefined, tz: string): string => {
  if (format === 'date') return dayOf(ms, tz);
  if (format === 'epoch_s') return String(Math.floor(ms / 1000));
  if (format === 'epoch_ms' || format === 'int') return String(Math.trunc(ms));
  return new Date(ms).toISOString();
};

/**
 * What `{page}` stands for.
 *
 * A `link_header` STATE HAS NO PAGE VALUE, because that paginator replaces the whole URL with the
 * one the provider sent. `{page}` beside it is refused at lint and again here, since a declaration
 * that names it is asking for a number nothing produces.
 */
const pageValue = (page: PageState | null, at: string): string => {
  if (page === null || page.kind === 'none')
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: '{page}', wanted: 'a paginator that produces one' });
  if (page.kind === 'link_header')
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: '{page}', wanted: 'a paginator other than link_header' });
  return String(page.value);
};

/**
 * A `{grant.<name>}`, or a refusal.
 *
 * TWO REFUSALS AND ONE CODE. A name that is the secret for this kind of auth, and a name the grant
 * does not hold at all, are both `PULL_REQUEST_REFUSED` before any byte leaves — the first because
 * `47 §4.6` closes the set, the second because a missing grant field substituted as the empty string
 * is a request that silently asks for somebody else's account.
 */
export const readGrantField = (ctx: SubCtx, field: string, at: string): string => {
  if (isSecretField(ctx.auth, field))
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: `{grant.${field}}`, wanted: 'a non-secret grant field' });
  const value = Object.hasOwn(ctx.grant.fields, field) ? ctx.grant.fields[field] : undefined;
  if (value === undefined)
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: `{grant.${field}}`, wanted: 'a field this grant holds' });
  return value;
};

/** One token's value, before encoding. `at` is the declaration key, so a refusal says where. */
const valueOf = (name: string, format: Format | undefined, ctx: SubCtx, at: string): string => {
  if (name === 'since') return timeAs(ctx.window.since, format, ctx.tz);
  if (name === 'until') return timeAs(ctx.window.until, format, ctx.tz);
  if (name === 'page') return pageValue(ctx.page, at);

  const dot = name.indexOf('.');
  const head = name.slice(0, dot);
  const field = name.slice(dot + 1);
  const raw =
    head === 'grant'
      ? readGrantField(ctx, field, at)
      : Object.hasOwn(ctx.probe, field)
        ? ctx.probe[field]
        : undefined;
  if (raw === undefined || raw === null)
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: `{${name}}`, wanted: 'a value the probe read' });

  /* `int` ON A NUMBER AND NOTHING ELSE. A probe that answered `"12 items"` must not become `12`:
     that is a parse, and a parse is the computation this grammar refuses. */
  if (format === 'int') {
    if (typeof raw !== 'number')
      throw new PullError('PULL_REQUEST_REFUSED', at, { found: raw, wanted: 'a number, for :int' });
    return String(Math.trunc(raw));
  }
  return String(raw);
};

/**
 * Every token in one string, substituted.
 *
 * `encode` IS THE CALLER'S AND NOT THE VALUE'S, because the same grant field is a path segment in
 * one declaration and a header value in another, and only the caller knows which it is holding.
 */
export function substitute(text: string, ctx: SubCtx, at: string, encode: boolean): string {
  return text.replace(TOKEN, (_, name: string, format?: Format) => {
    const value = valueOf(name, format, ctx, at);
    return encode ? encodeURIComponent(value) : value;
  });
}

/**
 * A body leaf: the same substitution, plus the one place a string becomes a number.
 *
 * `47 §4.2`: a leaf that is EXACTLY one placeholder formatted `int`, `epoch_s` or `epoch_ms` is a
 * JSON number. Exactly one, because `"page {page:int} of many"` is a sentence and `"{page:int}"` is
 * a count, and a provider that wants `{"limit": 100}` will not take `{"limit": "100"}`.
 */
const substituteLeaf = (text: string, ctx: SubCtx, at: string): Json => {
  const whole = WHOLE.exec(text);
  const out = substitute(text, ctx, at, false);
  const format = whole?.[2];
  return format === 'int' || format === 'epoch_s' || format === 'epoch_ms' ? Number(out) : out;
};

const substituteBody = (node: Json, ctx: SubCtx, at: string): Json => {
  if (typeof node === 'string') return substituteLeaf(node, ctx, at);
  if (Array.isArray(node)) return node.map((n, i) => substituteBody(n, ctx, `${at}[${i}]`));
  if (node !== null && typeof node === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(node)) out[k] = substituteBody(v, ctx, `${at}.${k}`);
    return out;
  }
  return node;
};

/* ── The URL ─────────────────────────────────────────────────────────────────────────────────── */

/** Visible ASCII, which is the whole of what a header value may be. `47 §5.2` step 3. */
const VISIBLE = /^[\x20-\x7e]*$/u;

/**
 * Whether a path, decoded, walks upwards.
 *
 * DECODED, WHICH IS THE ONLY WAY TO SEE IT. `encodeURIComponent('../admin')` is `..%2Fadmin`, so
 * `url.pathname` holds no segment equal to `..` and the `URL` parser has nothing to normalise away —
 * the traversal is intact and invisible to a check that reads the parsed path. A backslash counts as
 * a separator here because some servers count it as one, and a connector is not the place to find
 * out which.
 */
export const climbs = (pathname: string): boolean => {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    /* A PERCENT SEQUENCE THAT IS NOT ONE. Undecodable is not safe; fall through and test the raw
       form, which still catches a literal `..`. */
  }
  return decoded.split(/[/\\]/u).includes('..');
};

/** `?a=1&b=2`, built with `encodeURIComponent` rather than `URLSearchParams`, which spells a space `+`. */
const queryString = (pairs: [string, string][]): string =>
  pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/**
 * One declaration plus one run's values → one concrete request. Pure.
 *
 * `47 §5.2`'s five steps, in order, and step 4 is the one that matters: the URL is re-parsed and its
 * origin compared with the literal `base`. Everything above it is convenience; this is the check.
 */
export function resolveRequest(
  decl: FetchDecl,
  page: PageState | null,
  grant: Grant,
  probe: Record<string, Scalar>,
  window: Window,
  tz: string,
): ResolvedRequest {
  const ctx: SubCtx = { auth: decl.auth.kind, grant, probe, page, window, tz };
  const method = decl.method ?? 'GET';

  /* ── headers ── */
  const headers: Record<string, string> = {};
  for (const [name, raw] of Object.entries(decl.headers ?? {})) {
    const at = `fetch.headers.${name}`;
    if (isReservedHeader(name))
      throw new PullError('PULL_REQUEST_REFUSED', at, { found: name, wanted: 'a header the declaration may set' });
    const value = substitute(raw, ctx, at, false);
    if (!VISIBLE.test(value))
      throw new PullError('PULL_REQUEST_REFUSED', at, { found: value, wanted: 'visible ASCII' });
    headers[name] = value;
  }

  /* ── body ── */
  let body: string | undefined;
  if (decl.body !== undefined) {
    if (method !== 'POST')
      throw new PullError('PULL_REQUEST_REFUSED', 'fetch.body', { found: method, wanted: 'POST, which is the only method that carries one' });
    body = JSON.stringify(substituteBody(decl.body, ctx, 'fetch.body'));
    /* THE DECLARATION MAY SAY WHAT IT IS SENDING and usually does not. JSON is the only body shape
       this package builds, so the header is a fact rather than a guess. */
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
  }

  /* ── query ── */
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(decl.query ?? {})) {
    const at = `fetch.query.${key}`;
    /* AN ARRAY REPEATS THE KEY — Stripe's `expand[]`, which is a shape and not a list of values. */
    for (const one of Array.isArray(value) ? value : [value])
      pairs.push([key, one === null ? '' : substitute(String(one), ctx, at, false)]);
  }

  /**
   * ── the paginator's own parameter ──
   *
   * `param:` IS THE KEY THE PAGINATOR OWNS, and applying it here is what makes a second page a
   * second page. `25 §3.2`'s Stripe example declares `param: starting_after` and no `query:` at
   * all, so a run that only substituted `{page}` would ask for page one, get page one, and ask for
   * page one again until `max_pages` — forty identical pages, which a register would deduplicate
   * into silence and a `flow` series would add up forty times.
   *
   * IT REPLACES A DECLARED PAIR OF THE SAME NAME rather than repeating it. A declaration that sets
   * `page=1` in its own `query:` and then paginates by `page` means the first of those as a start
   * value, and sending both would leave which one the provider reads up to the provider.
   *
   * `{page}` IS STILL THERE AND IS FOR SOMEWHERE ELSE — a path segment, a POST body — and the two
   * do not collide, because a declaration that puts the value in its path is not also naming a
   * query key for it.
   */
  const paged = decl.page ?? { kind: 'none' };
  if ('param' in paged && page !== null && 'value' in page) {
    const held = pairs.findIndex(([key]) => key === paged.param);
    if (held >= 0) pairs.splice(held, 1);
    pairs.push([paged.param, String(page.value)]);
  }

  /* ── the URL, and the check ── */
  const path = substitute(decl.path, ctx, 'fetch.path', true);
  if (climbs(path))
    throw new PullError('PULL_ORIGIN_REFUSED', 'fetch.path', { found: path, base: decl.base, wanted: decl.base });

  let url: URL;
  try {
    url = new URL(decl.base + path);
  } catch {
    throw new PullError('PULL_ORIGIN_REFUSED', 'fetch.path', { found: decl.base + path, base: decl.base, wanted: decl.base });
  }
  if (pairs.length > 0) url.search = queryString(pairs);

  /**
   * A `link_header` STATE REPLACES THE WHOLE URL, path and query together, because what the
   * provider sent in `Link: rel="next"` is the whole of the next request and not a value to put
   * into this declaration's shape.
   *
   * AND IT IS CHECKED AGAIN HERE. `nextCursor` compared its origin when it parsed the header, but
   * this URL has been through the cursor and out of storage since; the check below is the one that
   * runs against what is actually about to be requested.
   */
  if (paged.kind === 'link_header' && page?.kind === 'link_header') {
    try {
      url = new URL(page.url);
    } catch {
      throw new PullError('PULL_ORIGIN_REFUSED', 'fetch.page', { found: page.url, base: decl.base, wanted: decl.base });
    }
  }

  if (url.origin !== decl.base || climbs(url.pathname))
    throw new PullError('PULL_ORIGIN_REFUSED', 'fetch.path', { found: url.href, base: decl.base, wanted: decl.base });

  return body === undefined ? { url, method, headers } : { url, method, headers, body };
}

/* ── What the response has to be true of ─────────────────────────────────────────────────────── */

/** `47 §5.4`: the literal cap is `where:`'s, and it is lint's rule asserted here too. */
const LITERAL_BYTES = 40;

const bytes = (s: string): number => new TextEncoder().encode(s).length;

/**
 * One comparison, `47 §5.4`'s rule verbatim: *numbers compare as numbers, everything else as
 * strings; `null` equals only `null`*.
 */
const same = (found: unknown, wanted: Scalar): boolean => {
  if (wanted === null || found === null) return found === wanted;
  if (typeof found === 'number' && typeof wanted === 'number') return found === wanted;
  if (found === undefined) return false;
  return String(found) === String(wanted);
};

const lengthOf = (v: unknown): number | null =>
  typeof v === 'string' ? v.length : Array.isArray(v) ? v.length : null;

/**
 * What the check wanted, as the sentence a person reads on the refusal.
 *
 * `eq` AND `ne` REPORT THE SUBSTITUTED LITERAL, which is the only version worth reading: the whole
 * point of npm's clamp check is *the server answered 2025-02-27 and the window asked for 2026-01-01*,
 * and `wanted: {since:date}` sends a person to look up what the window was instead of telling them.
 */
const wantedOf = (e: Expect, ctx: SubCtx, at: string): string => {
  if ('eq' in e) return String(literal(e.eq, true, ctx, at));
  if ('ne' in e) return `anything but ${String(literal(e.ne, true, ctx, at))}`;
  if ('is' in e) return String(e.is);
  if ('is_not' in e) return `anything but ${String(e.is_not)}`;
  if ('present' in e) return 'present';
  if ('absent' in e) return 'absent';
  if ('contains' in e) return `something containing "${e.contains}"`;
  if ('starts' in e) return `something starting "${e.starts}"`;
  if ('ends' in e) return `something ending "${e.ends}"`;
  if ('len_lte' in e) return `at most ${e.len_lte} long`;
  return `at least ${e.len_gte} long`;
};

/**
 * The literal a comparison uses, substituted or not.
 *
 * `eq`/`ne` SUBSTITUTE AND `is`/`is_not` DO NOT, which is `47 §13` D10 and is not a subtlety for its
 * own sake: `eq: "{since:date}"` is how npm's clamp is caught — *did the server answer the window I
 * asked for* — and `is: list` is Stripe's `"object": "list"`, a bare word that must not be searched
 * for braces. Two operators for two questions rather than one operator with a flag.
 */
const literal = (value: Scalar, substituted: boolean, ctx: SubCtx, at: string): Scalar =>
  substituted && typeof value === 'string' ? substitute(value, ctx, at, false) : value;

/** One `Expect` against one read value. `undefined` is the missing-step answer from `readPath`. */
const holds = (e: Expect, found: unknown, ctx: SubCtx, at: string): boolean => {
  if ('present' in e) return found !== undefined;
  if ('absent' in e) return found === undefined;
  if ('eq' in e) return same(found, literal(e.eq, true, ctx, at));
  if ('ne' in e) return !same(found, literal(e.ne, true, ctx, at));
  if ('is' in e) return same(found, e.is);
  if ('is_not' in e) return !same(found, e.is_not);

  if ('len_lte' in e) {
    const n = lengthOf(found);
    return n !== null && n <= e.len_lte;
  }
  if ('len_gte' in e) {
    const n = lengthOf(found);
    return n !== null && n >= e.len_gte;
  }

  /* THE THREE STRING OPERATORS ARE BYTE-WISE AND ONLY OVER A STRING. A number that happens to read
     as one is not a string: `contains: "20"` must not match the number 2026. */
  const needle = 'contains' in e ? e.contains : 'starts' in e ? e.starts : e.ends;
  if (bytes(needle) > LITERAL_BYTES)
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: needle, wanted: `a literal of at most ${LITERAL_BYTES} bytes` });
  if (typeof found !== 'string') return false;
  if ('contains' in e) return found.includes(e.contains);
  if ('starts' in e) return found.startsWith(e.starts);
  return found.endsWith(e.ends);
};

/**
 * One `Expect` over one body, fanning out where the path does.
 *
 * A LIST IS IMPLICITLY `all`, and the element reported is the FIRST that failed rather than the
 * list. `data[].status was ["ok","ok","pending"]` makes a person read three values to find the one;
 * `data[].status was pending` is the row they have to go and look at.
 */
const check = (e: Expect, json: Json | undefined, ctx: SubCtx, at: string): Failed | null => {
  const read = readPath(json, e.path);
  const each = fansOut(e.path) ? (read as (Json | undefined)[]) : [read as Json | undefined];
  for (const one of each) if (!holds(e, one, ctx, at)) return { at: e.path, found: one, wanted: wantedOf(e, ctx, at) };
  return null;
};

/**
 * The context a check runs in: the window and nothing else.
 *
 * EMPTY RATHER THAN FAKED. An expectation is about the RESPONSE, not about the credential, so a
 * `{grant.x}` inside an `eq:` literal has no grant to reach and is refused. Only `{since}` and
 * `{until}` mean anything here, which is why the window is the one thing threaded in.
 */
const bodyCtx = (window: Window, tz: string): SubCtx =>
  ({ auth: 'none', grant: { id: '', version: 0, fields: {} }, probe: {}, page: null, window, tz });

/** Whether one `Expect` holds over one body. What `page.ts` asks of a paginator's `more:`. */
export const holdsExpect = (e: Expect, json: Json | undefined, window: Window, tz: string, at: string): boolean =>
  check(e, json, bodyCtx(window, tz), at) === null;

/**
 * Every `expect:` against one parsed page. Pure.
 *
 * WARNINGS ARE COLLECTED AND THE FIRST REVIEW OR FAIL STOPS. `on_fail: warn` says *note it and carry
 * on*, which is a sampled-data flag and not a reason to write nothing; `review` and `fail` both mean
 * this page does not get written, so there is nothing further to learn from checking the rest of it.
 */
export function expect(decl: FetchDecl, json: Json, window: Window, tz: string): ExpectOutcome {
  const ctx = bodyCtx(window, tz);
  const warnings: Failed[] = [];

  for (const [i, e] of (decl.expect ?? []).entries()) {
    const failed = check(e, json, ctx, `fetch.expect[${i}]`);
    if (failed === null) continue;
    const on = e.on_fail ?? 'review';
    if (on === 'warn') warnings.push(failed);
    else return { ok: false, failed, severity: on, warnings };
  }
  return { ok: true, warnings };
}

/**
 * Whether one `on_error` condition holds. `47 §4.1`, `25 §6`.
 *
 * A STATUS LIST OR A BODY PATH, and the body arm is an `Expect` read the other way up: the condition
 * HOLDS when the test PASSES, so `error_when: { path: errors, present: true }` fires on a 200 whose
 * body carries an `errors` key — which is how Cloudflare's GraphQL reports a failure.
 */
export function matchesCond(cond: Cond, status: number, json: Json | undefined, window: Window, tz: string): boolean {
  if ('status_in' in cond) return cond.status_in.includes(status);
  return holdsExpect(cond, json, window, tz, 'fetch.on_error');
}
