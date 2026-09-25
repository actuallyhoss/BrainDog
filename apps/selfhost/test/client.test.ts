/**
 * The client, against a real server.
 *
 * There is no mock here on purpose. A client tested against a fake is a client that agrees with the
 * fake, and the two places this one has to be right — the verb it picks and the shape it hands back —
 * are exactly the two a fake would get wrong in the same way the client does.
 *
 * AND IT LIVES WITH THE SERVER RATHER THAN WITH THE CLIENT. It was `packages/client/test/`, which
 * gave `@braindog/client` a devDependency on `@braindog/selfhost` and a relative import that climbed
 * three directories out of the package into an app — `31 §1`: a package may name a capability, only
 * an app may name a runtime, and that package named one. The test is unchanged; the only thing that
 * moved is which side of the boundary it sits on, which is the side that has the runtime.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { codeOf, conflicted } from '@braindog/ports';

import { createClient } from '@braindog/client';
import { ROUTES } from '@braindog/host';
import { start } from '../src/server.ts';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'party', type: 'text', search: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

/* PORT 0, AND THE OS PICKS ONE. A counter from a fixed base fails for a reason that is not about
   the code — a killed run still holding a socket, another checkout, a reserved range — and it fails
   on whichever test happens to land on the number, which changes every time one is inserted. */

async function connected(token?: string, build?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-client-'));
  const running = await start({
    file: join(dir, 'record.sqlite'),
    port: 0,
    ...(token === undefined ? {} : { token }),
    ...(build === undefined ? {} : { build }),
  });
  const at = (running.server.address() as { port: number }).port;
  assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);
  const client = createClient({ base: `http://127.0.0.1:${at}`, ...(token === undefined ? {} : { token }) });
  return {
    client,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const value = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.refusal));
  return (r as never as { value: T }).value;
};
const refusal = (r: { ok: boolean }) => {
  assert.ok(!r.ok, 'the call succeeded');
  return (r as never as { refusal: { code: string; fix: string; allowed?: string[] } }).refusal;
};

/* ── it works ────────────────────────────────────────────────────────────── */

test('THE CLIENT DRIVES A REAL RECORD, over a real socket', async () => {
  const c = await connected();
  try {
    assert.deepEqual(
      value<{ registers: { id: string }[] }>(await c.client.boot()).registers.map((r) => r.id),
      ['session', 'obligations'],
    );

    const made = value<{ seq: number; version: number }>(
      await c.client.create({ register: 'obligations', fields: { what: 'Invoice 41', party: 'Halden', state: 'open' } }),
    );
    assert.equal(made.seq, 1);

    const read = value<{ fields: { what: string } }>(await c.client.get('obligations', 1));
    assert.equal(read.fields.what, 'Invoice 41');

    value(await c.client.update({ register: 'obligations', seq: 1, patch: { state: 'paid' }, version: made.version }));
    assert.equal(value<{ state: string }>(await c.client.get('obligations', 1)).state, 'paid');
  } finally {
    await c.close();
  }
});

test('a predicate survives the query string, which is the thing a GET client gets wrong', async () => {
  const c = await connected();
  try {
    for (const [what, state] of [['a', 'open'], ['b', 'paid'], ['c', 'open']] as const)
      value(await c.client.create({ register: 'obligations', fields: { what, state } }));

    assert.equal(value<{ matched: number }>(await c.client.list({ register: 'obligations' })).matched, 3);
    assert.equal(
      value<{ matched: number }>(await c.client.list({ register: 'obligations', where: { field: 'state', is: 'open' } })).matched,
      2,
    );
    assert.equal(
      value<{ matched: number }>(
        await c.client.list({ register: 'obligations', where: { all: [{ field: 'state', is: 'open' }, { field: 'what', is: 'a' }] } }),
      ).matched,
      1,
    );
  } finally {
    await c.close();
  }
});

test('A CONTAINS TREE SURVIVES THE QUERY STRING, which is what the register list’s search box sends', async () => {
  /* The box is `{ any: [{ field, contains }] }` per word over the register's `search:` fields. It
     travels as JSON in one query parameter, and a GET client that dropped the nesting would send a
     list the record reads as no predicate at all: every row, looking like a search that matched. */
  const c = await connected();
  try {
    for (const what of ['Invoice 41', 'Deposit', 'Invoice 7'])
      value(await c.client.create({ register: 'obligations', fields: { what, state: 'open' } }));
    const found = value<{ matched: number }>(
      await c.client.list({ register: 'obligations', where: { all: [{ any: [{ field: 'what', contains: 'voice' }] }] } }),
    );
    assert.equal(found.matched, 2, 'the substring did not reach the record as a predicate');
  } finally {
    await c.close();
  }
});

test('A SORTED LIST PAGES IN ITS OWN ORDER, and so does an unsorted one', async () => {
  /* The record pages an `order` now (f8b68d6): a sorted answer carries a cursor for that order, and
     following it gives the rest in the same order, with `matched` still the whole answer. */
  const c = await connected();
  try {
    for (const what of ['c', 'a', 'b']) value(await c.client.create({ register: 'obligations', fields: { what } }));
    const order = [{ field: 'what', dir: 'asc' as const }];
    const sorted = value<{ rows: { fields: { what: string } }[]; matched: number; cursor: string | null }>(
      await c.client.list({ register: 'obligations', order, limit: 2 }),
    );
    assert.deepEqual(sorted.rows.map((r) => r.fields.what), ['a', 'b']);
    assert.equal(sorted.matched, 3);
    assert.notEqual(sorted.cursor, null, 'a sorted answer with more rows offered no next page');
    const rest = value<{ rows: { fields: { what: string } }[]; cursor: string | null }>(
      await c.client.list({ register: 'obligations', order, limit: 2, cursor: sorted.cursor! }),
    );
    assert.deepEqual(rest.rows.map((r) => r.fields.what), ['c']);
    assert.equal(rest.cursor, null);

    const paged = value<{ cursor: string | null }>(await c.client.list({ register: 'obligations', limit: 2 }));
    assert.notEqual(paged.cursor, null, 'an unsorted answer with more rows offered no next page');
  } finally {
    await c.close();
  }
});

test('search comes back with enough to draw a result without fetching it', async () => {
  const c = await connected();
  try {
    value(await c.client.create({ register: 'obligations', fields: { what: 'Invoice 41', party: 'Halden' } }));
    /* AND IT COMES BACK WITH HOW MANY MATCHED, which is what a caller cannot work out for itself: the
       record clamps a search at a hundred hits, so a hundred rows is the same answer for a query with a
       hundred matches and for one with five hundred and seventy-seven. */
    const found = value<{ hits: { register: string; seq: number; title: string }[]; matched: Record<string, number> }>(await c.client.search('hal'));
    assert.equal(found.hits.length, 1);
    assert.equal(found.hits[0]?.title, 'Invoice 41');
    assert.equal(found.matched['obligations'], 1);
  } finally {
    await c.close();
  }
});

/* ── what day the record thinks it is ────────────────────────────────────── */

test('THE RECORD SAYS WHAT INSTANT IT ANSWERED AS OF, and nothing asked it before', async () => {
  /* A record is opened with an injected clock so a fixture can pin one instant, and the sample
     record this product demonstrates itself with is exactly such a fixture: its rows are dated
     relative to a pinned day. A reader dating them against its own `Date.now()` puts every band,
     deadline tone and window some number of days out and gets no error while doing it. The dates
     parse, the arithmetic runs, the screen is confidently wrong. */
  const c = await connected();
  try {
    const boot = value<{ now: string }>(await c.client.boot());
    assert.match(boot.now, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u, 'the instant is not an ISO instant');

    /* WITHIN A MINUTE OF THIS PROCESS, because this server runs the real clock. The assertion that
       matters is not the value: it is that the value CAME FROM THE RECORD. A reader can only hold
       an offset if the number crossed the wire. */
    const drift = Math.abs(Date.parse(boot.now) - Date.now());
    assert.ok(drift < 60_000, `the record's instant is ${drift}ms from this process's`);
  } finally {
    await c.close();
  }
});

test('A RECORD STARTED ON A PINNED CLOCK SAYS THAT INSTANT, which is how the app learns the day', async () => {
  /* The browser gates read the seed through this server, and the seed is dated relative to one day.
     `start({ now })` pins the record's clock there, and `boot` is where the app reads it: a record
     that pinned its clock and still answered the real one would put every band on the screen out by
     however long it has been since the seed was written. */
  const dir = mkdtempSync(join(tmpdir(), 'braindog-client-'));
  const pinned = Date.UTC(2026, 8, 3, 12);
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, now: pinned, pollMs: 0 });
  try {
    const at = (running.server.address() as { port: number }).port;
    const client = createClient({ base: `http://127.0.0.1:${at}` });
    assert.equal(value<{ now: string }>(await client.boot()).now, new Date(pinned).toISOString());
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("and `version` answers 33 §4's six keys, where it answered one number", async () => {
  /* `deploy-parity` (33 §8) reads `app` to prove the host is serving the build that was deployed
     and `50 §5.13` step 3 reads `slash` to decide whether the Slash surface exists at all. Both
     read a bare `MAX(event.rowid)`, which has neither. */
  const c = await connected('sekret', '2026-09-09+abc1234');
  try {
    const v = value<Record<string, unknown>>(await c.client.version());
    assert.deepEqual(Object.keys(v).sort(), ['app', 'format', 'kernel', 'primitives', 'slash', 'version']);
    assert.equal(typeof v.version, 'number');
    assert.equal(v.format, 1);
    assert.ok(typeof v.kernel === 'number' && v.kernel >= 1, 'the kernel migration count is not a count');
    assert.equal(v.primitives, 1);
    assert.equal(v.app, '2026-09-09+abc1234', 'the host was told what it is running and did not say');
    assert.equal(v.slash, false, 'a host with no Slash endpoint claimed a Slash');
  } finally {
    await c.close();
  }
});

test('a host that was not told what it is running says so, rather than saying it is called nothing', async () => {
  /* `BRAINDOG_BUILD` is declared empty in `wrangler.jsonc` and overwritten at deploy. A deploy that
     forgets the flag leaves `""`, and answering `app: ""` says "this build is called nothing"
     rather than "I was not told what I am". `deploy-parity` reads the second and cannot read the
     first: `"" !== "2026-09-09+abc"` is merely unequal, which is what a WRONG build also looks
     like, and the two failures want different repairs. */
  const c = await connected(undefined, '');
  try {
    assert.equal(value<{ app: string | null }>(await c.client.version()).app, null);
  } finally {
    await c.close();
  }
});

test("and the version a caller polls is the one that moves when the record is written", async () => {
  const c = await connected();
  try {
    const before = value<{ version: number }>(await c.client.version()).version;
    value(await c.client.create({ register: 'obligations', fields: { what: 'Invoice 41' } }));
    assert.ok(value<{ version: number }>(await c.client.version()).version > before, 'a write did not move the version');
  } finally {
    await c.close();
  }
});

/* ── a refusal is a value at both ends ───────────────────────────────────── */

test('A REFUSAL IS A VALUE, WITH ITS SENTENCE INTACT, and nothing throws for one', async () => {
  // A client that throws on a 422 makes every caller write a try/catch to read a message that was
  // already structured, and the message loses its shape on the way through.
  const c = await connected();
  try {
    const missing = refusal(await c.client.create({ register: 'obligations', fields: { amount: { amount: 1, currency: 'GBP' } } }));
    assert.equal(missing.code, 'REQUIRED_MISSING');
    assert.ok(missing.fix.length > 10);

    const gone = refusal(await c.client.schema('atlantis'));
    assert.equal(gone.code, 'REGISTER_UNKNOWN');
    assert.ok(gone.allowed?.includes('obligations'), 'the refusal lost its list on the way through');

    value(await c.client.create({ register: 'obligations', fields: { what: 'a' } }));
    /* A CONFLICT SURVIVES THE TRIP TOO, and it is the arm that would have been quietly lost: the
       client passes the envelope through, so a body arriving as `{ ok: false, conflict }` reaches a
       caller reading `.refusal.fix` unless the client knows there are three arms. */
    const stale = await c.client.update({ register: 'obligations', seq: 1, patch: { what: 'b' }, version: 99 });
    assert.ok(conflicted(stale));
    assert.equal(codeOf(stale), 'VERSION_STALE');
    assert.ok(stale.conflict.current, 'the row did not survive the trip, and it is what a re-apply needs');
  } finally {
    await c.close();
  }
});

test('a method this build does not have is refused before a request is made', async () => {
  const c = await connected();
  try {
    const out = refusal(await c.client.call('delete_everything'));
    assert.equal(out.code, 'ROUTE_UNKNOWN');
    assert.ok(out.allowed?.includes('list'));
  } finally {
    await c.close();
  }
});

/* ── the network is the one thing the record has no opinion about ────────── */

test('A NETWORK FAILURE IS A REFUSAL TOO, so a caller has exactly one branch to write', async () => {
  const client = createClient({ base: 'http://127.0.0.1:9' });
  const out = refusal(await client.boot());
  assert.equal(out.code, 'UNREACHABLE');
  assert.match(out.fix, /could not be reached/);
});

test('and an answer this client does not recognise is unreachable, not a success', async () => {
  // A proxy returning its own error page with a 200 would otherwise arrive as a successful call
  // whose value is an HTML string, and the first thing that reads a field off it fails somewhere
  // unrelated to the cause.
  const client = createClient({
    base: 'http://x',
    fetch: async () => new Response('<html>we are having trouble</html>', { status: 200 }),
  });
  assert.equal(refusal(await client.boot()).code, 'UNREACHABLE');

  const wrongShape = createClient({ base: 'http://x', fetch: async () => new Response(JSON.stringify({ data: 1 })) });
  assert.equal(refusal(await wrongShape.boot()).code, 'UNREACHABLE');
});

/* ── the verb comes from the table ───────────────────────────────────────── */

test('THE VERB FOLLOWS THE ROUTE TABLE, not the caller’s guess', async () => {
  const seen: { url: string; method: string }[] = [];
  const client = createClient({
    base: 'http://x',
    fetch: async (input, init) => {
      seen.push({ url: String(input), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify({ ok: true, value: null }));
    },
  });

  await client.boot();
  await client.list({ register: 'obligations' });
  await client.create({ register: 'obligations', fields: {} });
  await client.update({ register: 'obligations', seq: 1, patch: {} });

  assert.deepEqual(seen.map((s) => s.method), ['GET', 'GET', 'POST', 'POST']);

  /* AND THEN EVERY ROUTE IN THE TABLE, BECAUSE THE LOOP THAT WAS HERE COULD NOT FAIL.
     It walked the seventeen write routes and asserted `seen.every(s => !s.url.includes(name) ||
     s.method === 'POST')` against a `seen` holding four calls: `boot`, `list`, `create` and
     `update`. For the fifteen write routes nothing had called, no URL mentioned them, so the
     `every` was vacuously true and the assertion said nothing. What it actually checked was
     `create` and `update`, which the `deepEqual` one line up had just checked exactly.

     `includes` WAS WRONG TWICE OVER, TOO. `/api/listTokens` contains `/api/list`, so a read route's
     name matched a write route's URL and the two were being asked about each other. The path is
     compared whole here.

     A ROUTE THE LOOP DID NOT REACH IS NOW A FAILURE rather than a pass, which is the only shape of
     this test that has anything to say about the thirty-one methods nobody wrote a line for. */
  for (const route of ROUTES) await client.call(route.name);

  const wrong = ROUTES.filter((route) => {
    const sent = seen.filter((s) => new URL(s.url).pathname === `/api/${route.name}`);
    return sent.length === 0 || sent.some((s) => s.method !== (route.writes ? 'POST' : 'GET'));
  });
  assert.deepEqual(
    wrong.map((r) => `${r.name} ${r.writes ? 'writes' : 'reads'}`),
    [],
    'a route was sent with the wrong verb, or was not sent at all',
  );
});

test('a token is sent when there is one, and not when there is not', async () => {
  const headers: (string | null)[] = [];
  const withToken = createClient({
    base: 'http://x',
    token: 'sekret',
    fetch: async (_i, init) => {
      headers.push(new Headers(init?.headers).get('authorization'));
      return new Response(JSON.stringify({ ok: true, value: null }));
    },
  });
  const without = createClient({
    base: 'http://x',
    fetch: async (_i, init) => {
      headers.push(new Headers(init?.headers).get('authorization'));
      return new Response(JSON.stringify({ ok: true, value: null }));
    },
  });
  await withToken.boot();
  await without.boot();
  assert.deepEqual(headers, ['Bearer sekret', null]);
});

test('and the whole route table is reachable from the client', async () => {
  // A method in the table with no way to call it is a method that does not exist for anybody using
  // this client, which is everybody.
  const c = await connected();
  try {
    for (const route of ROUTES) {
      const out = await c.client.call(route.name, { register: 'obligations', seq: 1, fields: { what: 'x' }, patch: {}, q: 'x' });
      const answer = out as { ok: boolean; refusal?: { code: string } };
      assert.notEqual(answer.refusal?.code, 'ROUTE_UNKNOWN', `${route.name} is in the table and the client cannot call it`);
      assert.notEqual(answer.refusal?.code, 'UNREACHABLE', `${route.name} did not reach the server`);
      /* AND THE VERB SURVIVED THE TRIP. The test above proves the client picks it from the table;
         this proves the server agreed, which is the half a mock cannot check. `serveApi` answers a
         write sent as a GET with 405 and that one sentence, and nothing here was looking at it. */
      assert.doesNotMatch(
        (answer as { refusal?: { fix?: string } }).refusal?.fix ?? '',
        /so it is a POST/,
        `${route.name} writes and the client sent it as a GET`,
      );
    }
  } finally {
    await c.close();
  }
});

/* ── the typed methods, each under its own name ─────────────────────────── */

test('EVERY TYPED READ REACHES A REAL RECORD under its own name, and a missing one is a refusal', async () => {
  /* The client grew a named method for each READ+ route a screen needs, and nothing drove them: a
     method that sent the wrong argument name would have typed cleanly and answered nothing. Each is
     asked once against a real server, which is the only place the name on the wire is checked. */
  const c = await connected();
  try {
    value(await c.client.pages());
    value(await c.client.packs());
    value(await c.client.members());
    value(await c.client.listTokens());
    value(await c.client.listGrants());
    value(await c.client.whoami());
    value(await c.client.governance());
    value(await c.client.governance({ register: 'suggestion', limit: 5 }));
    assert.ok(refusal(await c.client.page('no-such-page')).fix.length > 0, 'a missing page said nothing');
    assert.ok(refusal(await c.client.metric('no-such-metric')).fix.length > 0, 'a missing metric said nothing');
  } finally {
    await c.close();
  }
});

test('a read mark and a note are writes that change no row', async () => {
  const c = await connected();
  try {
    const mark = value<{ upTo: number; seen_at: unknown }>(await c.client.markRead());
    assert.equal(typeof mark.upTo, 'number');
    assert.ok('seen_at' in mark, 'the mark came back without saying where it now stands');

    const made = value<{ version: number }>(
      await c.client.create({ register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } }),
    );
    value(await c.client.log({ register: 'obligations', seq: 1, note: 'Chased twice.' }));
    /* THE VERSION DOES NOT MOVE. Somebody holding the version they read must still be able to save
       over a note somebody else left, because a note changed nothing they could have read. */
    assert.equal(value<{ version: number }>(await c.client.get('obligations', 1)).version, made.version);
    assert.equal(refusal(await c.client.log({ register: 'obligations', seq: 1, note: '  ' })).code, 'REQUIRED_MISSING');
  } finally {
    await c.close();
  }
});
