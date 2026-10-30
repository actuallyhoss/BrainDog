/**
 * The five paginators, and every reason a run stops asking for another page.
 *
 * STOPPING IS THE WHOLE SUBJECT. Getting page two is arithmetic; knowing there is no page three is
 * the part that costs somebody a rate limit, a lease, or a loop that runs until the 300 s edge and
 * writes nothing. So each kind here is a NEXT VALUE and a STOP RULE together (`47 §5.3`), and the
 * stop rule is never "the provider stopped sending rows" alone — three of the five would loop
 * forever on a provider that answers an empty page with a cursor.
 *
 * A VALUE THAT REPEATS IS A LOOP AND IS REFUSED, not survived. A cursor equal to the one just used
 * means the provider is not advancing, and continuing is forty identical requests ending in a lease
 * edge — which reads as "the run was too long" and is nothing of the kind. `PULL_SHAPE_MISMATCH`
 * names the path instead, because that is where a person looks.
 *
 * THE LINK HEADER IS THE PROVIDER CHOOSING THE NEXT URL, which is the one paginator where the run
 * follows an address it did not build. So the origin is checked against `base` exactly as
 * `resolveRequest` checks its own — a `rel="next"` on another host is `PULL_ORIGIN_REFUSED`, not a
 * hop. `47 §8` calls this SSRF by response and it is the same defence written in the second place
 * it is needed.
 *
 * `results="false"` IS THE REASON PRESENCE NEVER DECIDES. Sentry sends a `rel="next"` link on the
 * last page and marks it `results="false"`; a paginator that stopped only when the link was absent
 * would page that API forever. `stop_when` compares the VALUE, and a declaration that names no
 * `stop_when` gets the plain rule.
 */

import { readPath, type Json } from '@braindog/where';

import { holdsExpect, PullError, type Expect, type FetchDecl, type PageState, type Window } from './index.ts';

/* ── The Link header ─────────────────────────────────────────────────────────────────────────── */

/** One `<url>; rel="next"; results="false"` of a `Link` header. Parameter names are lower-cased. */
export type LinkRef = { url: string; params: Record<string, string> };

/**
 * RFC 8288's `Link`, as a map from `rel` to the reference.
 *
 * SPLIT ON THE ANGLE BRACKETS AND NOT ON THE COMMAS, because a parameter value may hold a comma and
 * a cursor is exactly the kind of opaque string that does. The references are delimited by `<…>`,
 * so each one's parameters run to the next `<`, and the separating comma is trimmed off the end.
 *
 * FIRST `rel` WINS. The header may carry two references with one `rel`; the alternative to a rule is
 * a silent choice, and "the first one the provider wrote" is the only one a reader can predict.
 */
export const parseLink = (header: string | null | undefined): Map<string, LinkRef> => {
  const out = new Map<string, LinkRef>();
  if (header === null || header === undefined || header.trim() === '') return out;

  for (const ref of header.matchAll(/<([^>]*)>((?:\s*;\s*[^;<]+)*)/gu)) {
    const params: Record<string, string> = {};
    for (const part of (ref[2] ?? '').split(';')) {
      const at = part.indexOf('=');
      if (at === -1) continue;
      const key = part.slice(0, at).trim().toLowerCase();
      const value = part
        .slice(at + 1)
        .trim()
        .replace(/,$/u, '')
        .trim()
        .replace(/^"(.*)"$/su, '$1');
      if (key !== '') params[key] = value;
    }
    const rel = params.rel;
    if (rel !== undefined && !out.has(rel)) out.set(rel, { url: (ref[1] ?? '').trim(), params });
  }
  return out;
};

/* ── The next page ───────────────────────────────────────────────────────────────────────────── */

/** A paginator that repeated itself. Named where a person can check it against a real response. */
const loop = (at: string, value: string): never => {
  throw new PullError('PULL_SHAPE_MISMATCH', at, { found: value, wanted: 'a value this run has not already used' });
};

/** Whether a `more:` test — the paginator's own expectation — holds over this page. */
const more = (test: Expect | undefined, json: Json, window: Window, tz: string): boolean =>
  test === undefined || holdsExpect(test, json, window, tz, 'fetch.page.more');

/**
 * The paginator's next state, or `null` after the last page. Pure.
 *
 * THE WINDOW AND THE ZONE ARE ARGUMENTS AND `47 §2`'s DRAFT SIGNATURE HAS NEITHER. A `more:` is an
 * `Expect`, and `eq`/`ne` substitute placeholders in their literal (`§13` D10) — so evaluating one
 * without a window means either refusing every `eq` or substituting a wrong instant silently, and
 * the second is the kind of failure this package exists to avoid. The run holds both already.
 *
 * `max_pages` AND `rows_per_run` ARE NOT HERE. They stop the LOOP, not the paginator, and the
 * difference matters at the end of a run: a window cut short by a page limit is `partial` and keeps
 * its cursor, while a paginator answering `null` means the window is complete (`47 §5.1` step 8).
 */
export function nextCursor(
  decl: FetchDecl,
  json: Json,
  rows: readonly Json[],
  res: { headers: Headers; url: URL },
  page: PageState | null,
  window: Window,
  tz: string,
): PageState | null {
  const decl_page = decl.page ?? { kind: 'none' };

  if (decl_page.kind === 'none') return null;

  if (decl_page.kind === 'link_header') {
    const next = parseLink(res.headers.get('link')).get('next');
    if (next === undefined) return null;
    /* THE VALUE, NEVER THE PRESENCE. Sentry's last page carries a `next` link marked `false`. */
    if (next.params[decl_page.stop_when.param] === decl_page.stop_when.is) return null;

    let url: URL;
    try {
      url = new URL(next.url, res.url);
    } catch {
      throw new PullError('PULL_SHAPE_MISMATCH', 'fetch.page', { found: next.url, wanted: 'a URL' });
    }
    if (url.origin !== decl.base)
      throw new PullError('PULL_ORIGIN_REFUSED', 'fetch.page', { found: url.href, base: decl.base, wanted: decl.base });
    if (page?.kind === 'link_header' && page.url === url.href) loop('fetch.page', url.href);
    return { kind: 'link_header', url: url.href };
  }

  if (decl_page.kind === 'offset') {
    /* A SHORT PAGE IS THE LAST PAGE, which is the only stop rule offset paging has: the provider
       never says how many there are, and asking once more after a full page is the cost of that. */
    if (rows.length < decl_page.size) return null;
    if (!more(decl_page.more, json, window, tz)) return null;
    const at = page?.kind === 'offset' ? page.value : 0;
    return { kind: 'offset', value: at + decl_page.size };
  }

  if (decl_page.kind === 'page_number') {
    if (rows.length === 0) return null;
    if (!more(decl_page.more, json, window, tz)) return null;
    const at = page?.kind === 'page_number' ? page.value : (decl_page.start ?? 1);
    return { kind: 'page_number', value: at + 1 };
  }

  if (decl_page.kind === 'cursor_param') {
    if (rows.length === 0) return null;
    if (!more(decl_page.more, json, window, tz)) return null;
    /* THE CURSOR IS READ OFF THE BODY, so a body that stopped carrying one is the end rather than a
       fault: Stripe answers `has_more: false` and the `from` path goes missing together. */
    const found = readPath(json, decl_page.from);
    if (found === undefined || found === null || Array.isArray(found)) return null;
    const value = String(found);
    if (page?.kind === 'cursor_param' && page.value === value) loop('fetch.page.from', value);
    return { kind: 'cursor_param', value };
  }

  if (rows.length === 0) return null;
  /* A PROVIDER THAT SAYS IT HAS NO MORE IS BELIEVED, as for the three paginators above. Vercel's last page carries
     `pagination.next: null`, and without a `more:` here the run asked once more, for an empty page, every run. */
  if (!more(decl_page.more, json, window, tz)) return null;
  /* KEYSET READS THE LAST ROW AND NOT THE BODY, which is the difference from `cursor_param`: the key
     is whatever the final row says it is. */
  const found = readPath(rows.at(-1) ?? null, decl_page.from);
  if (found === undefined || found === null || Array.isArray(found)) return null;
  const value = String(found);
  if (page?.kind === 'keyset' && page.value === value) loop('fetch.page.from', value);
  return { kind: 'keyset', value };
}

/**
 * Where a paginator starts, before any page has come back.
 *
 * `offset` STARTS AT ZERO AND `page_number` AT ONE — or at whatever `start:` says, because a
 * provider numbering from zero is common enough that `47 §4.1` gives the key. The other three have
 * no first value: a cursor and a keyset come off the first response, and a `link_header` run asks
 * the declared URL and reads the header.
 */
export const firstPage = (decl: FetchDecl): PageState => {
  const page = decl.page ?? { kind: 'none' };
  if (page.kind === 'offset') return { kind: 'offset', value: 0 };
  if (page.kind === 'page_number') return { kind: 'page_number', value: page.start ?? 1 };
  return { kind: 'none' };
};
