/**
 * What the boundary does with what a caller sends.
 *
 * ONE SUBJECT, THREE WAYS IN. A query value, a JSON body and a refusal code are all text somebody
 * outside chose, and every one of them reached a place that assumed it had not been chosen: the SQL
 * driver, a slug comparison, and a lookup off an object literal's prototype. The failure each
 * produced was the same failure, and it is the one `serveApi` exists to make impossible: an
 * exception where a refusal belongs.
 *
 * IT IMPORTS THE CLIENT, WHICH SITS ABOVE THIS PACKAGE. A wire has two ends and a claim about it is
 * a claim about both: `packages/client/src/index.ts` says a plain string stays one, and only a
 * request that this file's own `serveApi` answers can say whether it does. `apps/selfhost` is where
 * the two are normally held together and it needs a socket to do it. The edge is a test's and not a
 * package's, so `31 §2`'s order is untouched, the same way this directory already reaches
 * `packages/kernel/test/sqlite.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

import { ROUTES, handlersFor, httpStatus, serveApi, type Handler } from '../src/index.ts';
import { createClient } from '../../client/src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

async function host() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  const handlers = handlersFor(api);

  const call = async (name: string, body?: unknown, ctx: CallContext = owner) => {
    const request = body
      ? new Request(`https://x/api/${name}`, { method: 'POST', body: JSON.stringify(body) })
      : new Request(`https://x/api/${name}`);
    const res = await serveApi(request, handlers, ctx);
    return { status: res.status, body: (await res.json()) as Answer };
  };

  return { api, sql, call, handlers };
}

/* ── an argument's shape ─────────────────────────────────────────────────── */

/**
 * The fourteen shapes the boundary is fuzzed with, and the pool of argument names is the table's own.
 *
 * DRIVEN OFF `ROUTES` AND NOT OFF A LIST OF THE BROKEN ONES. `page` and `metric` coerced their slug
 * and their id and said why, at `packages/record/src/index.ts:744`; `get`, `history`, `search`,
 * `governance`, `schema` and `list` did not. A test naming those six goes green on the day a
 * seventh read route arrives with an argument nobody coerced, which is exactly how this got here.
 * So every non-writing route in the table is sent every shape at every argument name any route
 * declares, and the assertion is about all of them at once.
 */
const HOSTILE = [
  '{"a":1}', '{"length":1}', '[]', '[1,2]', 'true', 'false', 'null',
  '1.5', '-1', '1e400', '{}', '"__proto__"', '{"toString":{}}', '[[1]]',
  /* The fifteenth is the only one that is not JSON at all, and it is here for the arguments that
     are: a predicate reaches the query string encoded, so half-typed JSON is a thing a caller sends
     by accident and the one input `json` can actually refuse. */
  '{nope',
];

/** A value each argument is happy with, so a route gets past its own guards and reaches the driver. */
const SOUND: Record<string, string> = {
  register: 'obligations', seq: '1', q: 'Invoice', limit: '5', slug: 'x',
  metric: 'x', digest: 'x', id: 'x', status: 'open',
};

test('NO READ ANSWERS 500 FOR THE SHAPE OF AN ARGUMENT, whatever a stranger writes in the query string', async () => {
  // Every query value was JSON-decoded and handed on uncoerced, so a caller chose the SHAPE of every
  // argument and nothing between the router and SQLite looked at it again. Fifty-two GET requests
  // answered 500 INTERNAL: "Provided value cannot be bound to SQLite parameter 2", "Unknown named
  // parameter 'length'", "datatype mismatch". A refusal is a value, and a 500 answering a read is
  // the failure this whole layer exists to prevent.
  const { call, sql } = await host();
  await call('create', { register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } });

  const reads = ROUTES.filter((r) => !r.writes);
  /* THE TABLE'S OWN ARGUMENT NAMES, AND THE FIXTURE'S. The union is not belt and braces: a table
     that declared nothing would give an empty pool and a loop that drove no requests, which is a
     test measuring the table's opinion of itself. `SOUND` is a list of real arguments with real
     values, so the fuzz has teeth whatever the table says. */
  const pool = [...new Set([...Object.keys(SOUND), ...reads.flatMap((r) => Object.keys(r.takes ?? {}))])];
  const crashed: string[] = [];
  const refused = new Set<string>();
  let driven = 0;

  for (const route of reads)
    for (const arg of pool)
      for (const shape of HOSTILE) {
        const params = new URLSearchParams();
        for (const key of Object.keys(route.takes ?? {})) {
          const sound = SOUND[key];
          if (key !== arg && sound !== undefined) params.set(key, sound);
        }
        params.set(arg, shape);
        const out = await call(`${route.name}?${params}`);
        driven++;
        if (out.status === 500) crashed.push(`${route.name}?${params} -> ${out.body.refusal?.fix ?? ''}`);
        if (out.body.refusal?.code === 'VALUE_MALFORMED') refused.add(route.name);
      }

  assert.deepEqual(crashed.slice(0, 5), [], `${crashed.length} of ${driven} reads answered 500`);
  // AND THE FUZZ ACTUALLY RAN. A loop over an empty list asserts nothing, which is the one way this
  // could go green while saying nothing at all.
  assert.ok(driven > 1000, `only ${driven} requests were driven`);
  // AND EVERY ROUTE THAT DECLARES A SHAPE REFUSED ONE. This is the half that names the defect: "no
  // 500s" alone would also pass for a route that quietly ignored the argument instead of reading
  // it. The list is read off the table for the same reason the fuzz is: a route whose only
  // arguments are text has nothing to refuse, and which routes those are is not this test's memory.
  const structured = reads.filter((r) => Object.values(r.takes ?? {}).some((k) => k !== 'text'));
  assert.ok(structured.length >= 6, `only ${structured.length} routes declare an argument that is not text`);
  for (const route of structured)
    assert.ok(refused.has(route.name), `${route.name} declares a shape and took every hostile value without refusing one`);
  sql.close();
});

test('and it says which argument and what it wanted, in a code 30 §6 already has', async () => {
  const { call, sql } = await host();

  // `?limit=1.5` needs no hostility at all. A fractional limit is a typo, and it was a 500 saying
  // "datatype mismatch" out of SQLite.
  const fraction = await call('search?q=Invoice&limit=1.5');
  assert.equal(fraction.status, 422);
  assert.equal(fraction.body.refusal?.code, 'VALUE_MALFORMED');
  assert.equal(fraction.body.refusal?.at, 'limit');

  const seq = await call(`get?register=obligations&seq=${encodeURIComponent('{"a":1}')}`);
  assert.equal(seq.status, 422);
  assert.equal(seq.body.refusal?.at, 'seq');

  // A predicate is the one thing a query string cannot carry as itself, so it is the one thing still
  // decoded, and a `where` that is not JSON is the caller's to fix rather than the driver's.
  const predicate = await call('list?register=obligations&where=%7Bnope');
  assert.equal(predicate.status, 422);
  assert.equal(predicate.body.refusal?.at, 'where');
  sql.close();
});

test('A DECLARED TEXT ARGUMENT ARRIVES AS THE TEXT IT WAS SENT AS, even when it reads as JSON', async () => {
  // The host guessed: it tried JSON on every value and kept the text only when the parse threw. So
  // `?slug=2026` stopped being a slug and `?register=true` stopped being a name, and the caller was
  // told it had sent nothing.
  const seen: Record<string, unknown>[] = [];
  const spy: Record<string, Handler> = {};
  for (const route of ROUTES)
    spy[route.name] = async (a) => {
      seen.push({ ...a });
      return ok(null);
    };

  const drive = (qs: string) => serveApi(new Request(`https://x/api/${qs}`), spy, owner);

  await drive('page?slug=2026');
  await drive('schema?register=true');
  await drive('metric?metric=null');
  await drive('get?register=obligations&seq=41');
  await drive(`list?register=obligations&where=${encodeURIComponent('{"field":"state","is":"open"}')}&limit=2`);
  // AND AN ARGUMENT THE TABLE DOES NOT DECLARE REACHES NO HANDLER, so there is nothing to guess at.
  await drive('boot?whatever=%7B%22a%22%3A1%7D');

  assert.deepEqual(seen[0], { slug: '2026' });
  assert.deepEqual(seen[1], { register: 'true' });
  assert.deepEqual(seen[2], { metric: 'null' });
  assert.deepEqual(seen[3], { register: 'obligations', seq: 41 });
  assert.deepEqual(seen[4], { register: 'obligations', where: { field: 'state', is: 'open' }, limit: 2 });
  assert.deepEqual(seen[5], { whatever: '{"a":1}' });
});

test('a read sent as a POST is held to the same shapes, because either verb may carry one', async () => {
  const { call, sql } = await host();
  const out = await call('get', { register: 'obligations', seq: { a: 1 } });
  assert.equal(out.status, 422);
  assert.equal(out.body.refusal?.code, 'VALUE_MALFORMED');
  // AND A NULL CURSOR IS AN ABSENT CURSOR. Every optional read argument reads a missing one the same
  // way, so refusing `null` here would refuse a sentence the record already understands.
  const beginning = await call('list', { register: 'obligations', cursor: null });
  assert.equal(beginning.status, 200);
  sql.close();
});

/* ── the same string at both ends of the wire ────────────────────────────── */

const PROJECTS = {
  id: 'register.projects',
  kind: 'register' as const,
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    fields: [{ id: 'name', type: 'text', required: true }],
  } as never,
};

const PROJECT_PAGE = {
  id: 'page.project',
  kind: 'page' as const,
  body: {
    page: 'project',
    title: 'Project {{it}}',
    for: { register: 'projects' },
    blocks: [{ kind: 'table', source: 'register.projects', span: 12 }],
  } as never,
};

test('A PAGE THE RECORD ADVERTISES OPENS, even when its slug reads as a number', async () => {
  // The client sends a string raw and the host `JSON.parse`d every value, so a string whose text is
  // valid JSON changed type in flight: `"2026"` arrived as the number 2026. The record listed the
  // page, the client asked for it by the slug the record had just handed back, and the answer was
  // REQUIRED_MISSING telling the caller to send the thing it had sent.
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([PROJECTS, PROJECT_PAGE])).ok);
  const handlers = handlersFor(api);

  const client = createClient({
    base: 'https://x',
    fetch: (input, init) => serveApi(new Request(input as string, init), handlers, owner),
  });

  for (const name of ['kiln', '2026', 'true', 'null']) {
    const made = await client.create({ register: 'projects', fields: { name } });
    assert.equal(made.ok, true, name);
  }

  const listed = await client.pages();
  assert.equal(listed.ok, true);
  const slugs = (listed.ok ? listed.value : []).map((p) => (p as { slug: string }).slug);
  for (const slug of slugs) {
    const page = await client.page(slug);
    assert.equal(page.ok, true, `${slug} is advertised by pages and did not open`);
  }
  assert.ok(slugs.includes('2026'), 'the fixture did not produce the slug this test is about');

  // The same asymmetry as a 500: `get('true', 1)` bound a boolean to a SQLite parameter.
  const asBoolean = await client.get('true', 1);
  assert.equal(asBoolean.ok, true);

  sql.close();
});

test('AND A KEYSET CURSOR STILL ROUND-TRIPS, which it did before any of this and has to after', async () => {
  // A cursor is `<when>|<id>`, which is not valid JSON, so it survived the guessing by accident.
  // Reading it as the text the record minted is the same answer on purpose, and the property that
  // matters is the one paging has: nothing skipped and nothing repeated.
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([PROJECTS])).ok);
  const handlers = handlersFor(api);
  const client = createClient({
    base: 'https://x',
    fetch: (input, init) => serveApi(new Request(input as string, init), handlers, owner),
  });

  for (let i = 0; i < 5; i++) assert.ok((await client.create({ register: 'projects', fields: { name: `p${i}` } })).ok);

  const walked: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const out = await client.list({ register: 'projects', limit: 2, cursor });
    assert.equal(out.ok, true);
    if (!out.ok) break;
    walked.push(...out.value.rows.map((r) => (r as { fields: { name: string } }).fields.name));
    cursor = out.value.cursor;
    if (cursor === null) break;
  }
  assert.equal(walked.length, 5, 'paging skipped or repeated a row');
  assert.equal(new Set(walked).size, 5);
  sql.close();
});

/* ── a refusal code the caller could one day choose ──────────────────────── */

test('A REFUSAL CODE OFF `Object.prototype` IS A 422, not a RangeError out of the router', async () => {
  // `NOT_422` was a bare object literal and `Refusal.code` is a `string`, so `constructor` returned
  // `Object` where a number is declared and `?? 422` never fired, because a function is not nullish.
  // `new Response` then threw a RangeError from the line AFTER the try whose own comment promises
  // that nothing throws across this boundary. `packages/record/src/index.ts:358` had already made
  // this repair one layer in, and the table one layer out did not get it.
  for (const code of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'toLocaleString'])
    assert.equal(httpStatus(no(code, 'x')), 422, code);

  const res = await serveApi(new Request('https://x/api/boot'), { boot: async () => no('constructor', 'x') }, owner);
  assert.equal(res.status, 422);
  assert.equal(((await res.json()) as Answer).refusal?.code, 'constructor');

  // And the enumerated exceptions still are what they were.
  assert.equal(httpStatus(no('FORBIDDEN', 'x')), 403);
  assert.equal(httpStatus(no('SCHEMA_NEWER', 'x')), 503);
});

test('A REFUSAL THAT SAYS WHEN TO ASK AGAIN IS A 429 WITH Retry-After, on the one door both hosts serve through', async () => {
  const limited: Handler = async () => ({ ok: false, refusal: { code: 'RATE_LIMITED', fix: 'Wait 42 seconds.', at: 'rows', retry_after: 42 } });
  const res = await serveApi(new Request('https://x/api/report', { method: 'POST', body: '{}' }), { report: limited } as never, owner);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '42');
  assert.equal(httpStatus({ ok: false, refusal: { code: 'RATE_LIMITED', fix: 'x' } }), 429);
});
