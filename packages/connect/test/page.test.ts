/**
 * The five paginators, and the four ways one loops forever.
 *
 * Every test here that matters is a STOP: a `rel="next"` on the last page, a cursor the provider
 * stopped advancing, a short page, an empty one. Getting page two right is arithmetic; the failures
 * worth a test are the ones where a run keeps asking, burns forty requests and a 300-second lease,
 * and reports "the run was longer than its lease" — a sentence that sends a person to look at the
 * wrong thing entirely.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  firstPage, nextCursor, parseLink, PullError,
  type FetchDecl, type Json, type PageDecl, type PageState, type Window,
} from '../src/index.ts';

const BASE = 'https://api.example.com';
const TZ = 'Africa/Cairo';
const WINDOW: Window = { since: Date.parse('2026-01-01T00:00:00Z'), until: Date.parse('2026-01-02T00:00:00Z') };
const HERE = new URL(`${BASE}/v1/things`);

const decl = (page: PageDecl): FetchDecl => ({
  base: BASE,
  path: '/v1/things',
  auth: { kind: 'none' },
  schedule: { every: '1h' },
  page,
});

const at = (
  page: PageDecl,
  json: Json,
  rows: Json[],
  state: PageState | null = null,
  headers: Record<string, string> = {},
) => nextCursor(decl(page), json, rows, { headers: new Headers(headers), url: HERE }, state, WINDOW, TZ);

const refusal = (fn: () => unknown): PullError => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof PullError, `threw something that is not a PullError: ${String(e)}`);
    return e;
  }
  throw new assert.AssertionError({ message: 'nothing was thrown, and a refusal was wanted' });
};

const ROWS: Json[] = [{ id: 'in_1' }, { id: 'in_2' }, { id: 'in_3' }];

/* ── none ────────────────────────────────────────────────────────────────────────────────────── */

test('a declaration with no paginator asks once', () => {
  assert.equal(at({ kind: 'none' }, { data: ROWS }, ROWS), null);
  /* AND SO DOES ONE THAT NEVER MENTIONED PAGING. The default is the same rule and not a hole. */
  const bare: FetchDecl = { base: BASE, path: '/v1/things', auth: { kind: 'none' }, schedule: { every: '1h' } };
  assert.equal(nextCursor(bare, { data: ROWS }, ROWS, { headers: new Headers(), url: HERE }, null, WINDOW, TZ), null);
});

/* ── cursor_param — Stripe ───────────────────────────────────────────────────────────────────── */

const CURSOR: PageDecl = { kind: 'cursor_param', param: 'starting_after', from: 'data[-1].id', more: { path: 'has_more', is: true } };

test('a cursor comes off the last row of the page', () => {
  assert.deepEqual(at(CURSOR, { has_more: true, data: ROWS }, ROWS), { kind: 'cursor_param', value: 'in_3' });
});

test('has_more false ends it, however many rows arrived', () => {
  assert.equal(at(CURSOR, { has_more: false, data: ROWS }, ROWS), null);
});

test('no rows ends it, and so does a body that stopped carrying the cursor', () => {
  assert.equal(at(CURSOR, { has_more: true, data: [] }, []), null);
  assert.equal(at(CURSOR, { has_more: true, data: [{ other: 1 }] }, [{ other: 1 }]), null);
});

/* THE LOOP. A provider that answers the same cursor twice is not advancing, and forty identical
   requests end at the lease edge — which reads as "the run was too long" and is nothing of the
   kind. The refusal names the path a person can check against a real response. */
test('a cursor that repeats is a loop and is refused, not survived', () => {
  const no = refusal(() => at(CURSOR, { has_more: true, data: ROWS }, ROWS, { kind: 'cursor_param', value: 'in_3' }));
  assert.equal(no.code, 'PULL_SHAPE_MISMATCH');
  assert.equal(no.at, 'fetch.page.from');
});

/* ── offset ──────────────────────────────────────────────────────────────────────────────────── */

const OFFSET: PageDecl = { kind: 'offset', param: 'offset', size: 3 };

test('offset advances by the page size and stops on a short page', () => {
  assert.deepEqual(at(OFFSET, {}, ROWS), { kind: 'offset', value: 3 });
  assert.deepEqual(at(OFFSET, {}, ROWS, { kind: 'offset', value: 3 }), { kind: 'offset', value: 6 });
  assert.equal(at(OFFSET, {}, ROWS.slice(0, 2), { kind: 'offset', value: 3 }), null);
  assert.equal(at(OFFSET, {}, [], { kind: 'offset', value: 3 }), null);
});

/* ── page_number ─────────────────────────────────────────────────────────────────────────────── */

test('a page number starts where the declaration says and stops on an empty page', () => {
  assert.deepEqual(at({ kind: 'page_number', param: 'page' }, {}, ROWS), { kind: 'page_number', value: 2 });
  assert.deepEqual(at({ kind: 'page_number', param: 'page', start: 0 }, {}, ROWS), { kind: 'page_number', value: 1 });
  assert.equal(at({ kind: 'page_number', param: 'page' }, {}, []), null);
});

test('a more: test ends a page-numbered run before the empty page does', () => {
  const page: PageDecl = { kind: 'page_number', param: 'page', more: { path: 'next', present: true } };
  assert.deepEqual(at(page, { next: 2 }, ROWS), { kind: 'page_number', value: 2 });
  assert.equal(at(page, { done: true }, ROWS), null);
});

/* ── keyset ──────────────────────────────────────────────────────────────────────────────────── */

const KEYSET: PageDecl = { kind: 'keyset', param: 'after', from: 'id' };

test('a keyset reads the last row and not the envelope', () => {
  assert.deepEqual(at(KEYSET, { data: ROWS }, ROWS), { kind: 'keyset', value: 'in_3' });
  assert.equal(at(KEYSET, { data: [] }, []), null);
  assert.equal(at(KEYSET, {}, [{ other: 1 }]), null);
  assert.equal(refusal(() => at(KEYSET, {}, ROWS, { kind: 'keyset', value: 'in_3' })).code, 'PULL_SHAPE_MISMATCH');
});

/* VERCEL'S LAST PAGE SAYS `next: null`, and a keyset that cannot read the envelope asks once more to find nothing. */
test('a keyset with a more: test stops on the page that says there is no more', () => {
  const told: PageDecl = { ...KEYSET, more: { path: 'pagination.next', is_not: null } };
  assert.deepEqual(at(told, { pagination: { next: 1768880000000 } }, ROWS), { kind: 'keyset', value: 'in_3' });
  assert.equal(at(told, { pagination: { next: null } }, ROWS), null);
  /* Without the test, the same body pages on, which is the extra request a run used to make. */
  assert.deepEqual(at(KEYSET, { pagination: { next: null } }, ROWS), { kind: 'keyset', value: 'in_3' });
});

/* ── link_header ─────────────────────────────────────────────────────────────────────────────── */

const LINK: PageDecl = { kind: 'link_header', stop_when: { param: 'results', is: 'false' } };
const link = (header: string) => at(LINK, {}, ROWS, null, { link: header });

test('the next link is taken verbatim, which is what an opaque cursor needs', () => {
  const header = `<${BASE}/v1/things?cursor=abc%3D%3D>; rel="next"; results="true", <${BASE}/v1/things>; rel="first"`;
  assert.deepEqual(link(header), { kind: 'link_header', url: `${BASE}/v1/things?cursor=abc%3D%3D` });
});

test('no next link ends it', () => {
  assert.equal(link(`<${BASE}/v1/things>; rel="previous"`), null);
  assert.equal(at(LINK, {}, ROWS), null);
});

/* SENTRY SENDS A `next` LINK ON THE LAST PAGE. A paginator that stopped only when the link was
   absent would page that API until the lease ran out, on every single run. */
test('a next link marked results="false" ends it although the link is there', () => {
  assert.equal(link(`<${BASE}/v1/things?cursor=0:100:0>; rel="next"; results="false"; cursor="0:100:0"`), null);
  assert.deepEqual(
    link(`<${BASE}/v1/things?cursor=0:100:0>; rel="next"; results="true"; cursor="0:100:0"`),
    { kind: 'link_header', url: `${BASE}/v1/things?cursor=0:100:0` },
  );
});

/* SSRF BY RESPONSE, `47 §8`. This is the one paginator that follows an address the run did not
   build, so the origin check is written a second time here rather than trusted from elsewhere. */
test('a next link on another host is refused rather than followed', () => {
  const no = refusal(() => link('<https://evil.example/v1/things>; rel="next"'));
  assert.equal(no.code, 'PULL_ORIGIN_REFUSED');
  assert.equal(no.at, 'fetch.page');
});

test('a relative next link resolves against the page it came with, and is still checked', () => {
  assert.deepEqual(link('</v1/things?page=2>; rel="next"'), { kind: 'link_header', url: `${BASE}/v1/things?page=2` });
  assert.equal(refusal(() => link('<//evil.example/x>; rel="next"')).code, 'PULL_ORIGIN_REFUSED');
});

test('a next link that repeats is a loop', () => {
  const state: PageState = { kind: 'link_header', url: `${BASE}/v1/things?page=2` };
  const no = refusal(() =>
    at(LINK, {}, ROWS, state, { link: `<${BASE}/v1/things?page=2>; rel="next"` }));
  assert.equal(no.code, 'PULL_SHAPE_MISMATCH');
});

/* ── the header itself ───────────────────────────────────────────────────────────────────────── */

test('a Link header splits on its references and not on its commas', () => {
  /* A CURSOR IS AN OPAQUE STRING AND MAY HOLD A COMMA. Splitting the header on commas truncates
     exactly the parameter the stop rule reads. */
  const links = parseLink('<https://a.example/1>; rel="next"; cursor="0,100,0"; results="true"');
  assert.equal(links.get('next')?.url, 'https://a.example/1');
  assert.equal(links.get('next')?.params.cursor, '0,100,0');
  assert.equal(links.get('next')?.params.results, 'true');
});

test('an unquoted parameter and an odd case read the same, and a missing header is empty', () => {
  const links = parseLink('<https://a.example/1>; Rel=next; Results=false');
  assert.equal(links.get('next')?.params.results, 'false');
  assert.equal(parseLink(null).size, 0);
  assert.equal(parseLink('').size, 0);
  assert.equal(parseLink('nonsense').size, 0);
});

test('the first reference with a rel wins, because the alternative to a rule is a silent choice', () => {
  const links = parseLink('<https://a.example/1>; rel="next", <https://a.example/2>; rel="next"');
  assert.equal(links.get('next')?.url, 'https://a.example/1');
});

/* ── where a run starts ──────────────────────────────────────────────────────────────────────── */

test('only the two counted paginators have a first value', () => {
  assert.deepEqual(firstPage(decl({ kind: 'offset', param: 'o', size: 50 })), { kind: 'offset', value: 0 });
  assert.deepEqual(firstPage(decl({ kind: 'page_number', param: 'p' })), { kind: 'page_number', value: 1 });
  assert.deepEqual(firstPage(decl({ kind: 'page_number', param: 'p', start: 0 })), { kind: 'page_number', value: 0 });
  for (const page of [CURSOR, KEYSET, LINK, { kind: 'none' } as PageDecl])
    assert.deepEqual(firstPage(decl(page)), { kind: 'none' }, page.kind);
});
