/**
 * `POST /api/spark/read` (`src/spark-ask.ts`), driven over a real socket against a real record.
 *
 * WHAT THIS IS FOR IS THE PATH AND NOT THE EDGE. Finding 2 of `loop/research-batch-five-audit.md` made both
 * engine builders throw on every call and watched every suite but the builders' own pass unmoved. Re-driven on
 * 2026-09-21 over the WHOLE of each app, because the audit's 172 and 199 were those suites less
 * `spark.test.ts` and a memo that dropped the exclusion turned them into false tallies: `apps/selfhost` is 204
 * tests, 202 pass, 0 fail, 2 skipped, identical to an unmutated run, and `apps/worker` is 179 tests, 176 pass,
 * 3 fail, with all three reds inside `apps/worker/test/spark.test.ts`. The thirteenth package had a dependency,
 * a builder, a door and a test, and no request that reached any of them. So the tests below are about a
 * request, and the last one is about whether a request can arrive at all. The door is asked over `fetch`, on 127.0.0.1 on whatever port
 * the machine hands out, through a `node:http` server built the way `apps/selfhost/src/server.ts` builds its own (its header map at
 * `:1296`, its `new Request` at `:1319`), against a record on real SQLite, through the real engine of
 * `@braindog/spark`, with the model as the only double. Nothing here leaves the machine.
 *
 * THE TEST THAT MATTERS IS THE ONE WITH THE THROWING BUILDER, because that is the assertion a future pass
 * cannot delete the caller and keep. Measured by removing the lines that ask `door.engine()` from
 * `serveSpark` and answering a canned reading instead: 5 of the 7 that existed then fail, and the throwing builder answers
 * `200 !== 500` with `{"ok":true,"value":{"ask_id":"a","predicate":null,"q":null,"read":[],"rows":[]}}` under
 * it. That is the inverse of the audit's measurement and the reason this file exists.
 *
 * `createSpark` IS IMPORTED BY A RELATIVE PATH, as it is in `spark.test.ts` and for the same reason:
 * `packages/host` does not depend on `@braindog/spark` and must not, because `46 §5.1` puts the dynamic
 * `import()` in the app. `tools/gates/graph.mjs` reads `src/**` alone, so a test reaching across weakens no
 * boundary it is standing in for.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createRecordApi, type CallContext } from '@braindog/record';

import { handlersFor, serveApi, serveSpark, servesSpark, sparkAskDoor, type SparkAskDoor, type SparkAskEngine } from '../src/index.ts';
import { endpointInference, sparkRecord } from '../src/spark.ts';
import { createSpark } from '../../spark/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    search: ['what'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day' },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

/** The drafted predicate pass 1 asks for, and the only thing the model is asked in this file. */
const DRAFT = '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}';

const completion = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 812, completion_tokens: 19 } }), { status: 200 });

function endpoint(answer: () => Response) {
  const sent: { url: string; init: RequestInit }[] = [];
  return { sent, send: async (url: URL, init: RequestInit) => (sent.push({ url: url.href, init }), answer()) };
}

/**
 * A record with two open tasks and one that is done, on real SQLite, plus Spark's own database beside it.
 *
 * EVERY HANDLE IS CLOSED BY THE TEST CONTEXT AND NOT BY THE LAST LINE OF THE TEST. Measured: with the close
 * at the end of the body, driving the red case (`serveSpark` answering without asking `door.engine()`) left
 * five tests failing before reaching their own cleanup, their `node:http` servers up with keep-alive sockets on
 * them, and the runner never exited. It printed all seven results and then hung until a 120-second timeout
 * killed it. A test that hangs when the thing it measures is broken reports nothing at the moment it matters.
 */
async function record(t: TestContext) {
  const sql = openSqlite();
  const own = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 8, 21, 9));
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  for (const fields of [
    { what: 'Invoice Acme', amount: { amount: 500500, currency: 'EGP' }, due: '2026-10-01', state: 'open' },
    { what: 'Invoice Beta', amount: { amount: 120000, currency: 'EGP' }, due: '2026-10-08', state: 'open' },
    { what: 'Invoice Gamma', amount: { amount: 9900, currency: 'EGP' }, due: '2026-09-01', state: 'done' },
  ])
    assert.ok((await api.create({ register: 'tasks', fields }, owner)).ok, 'the row was not written');
  t.after(() => (sql.close(), own.close()));
  return { api, sql, own, clock };
}

/**
 * A host, on a real port, answering the two paths a host answers: the Spark door, and everything else.
 *
 * THIS IS THE DISPATCH BOTH HOSTS WILL HOLD, in the shape `apps/selfhost/src/server.ts:1352` already has for
 * `/api/keys/*`: one branch on `servesSpark(path)` before `serveApi`. A test that called `serveSpark` in
 * process would pass with the door unroutable, which is the class of defect this whole file is about.
 */
async function listen(
  t: TestContext,
  engine: () => Promise<SparkAskEngine<CallContext> | undefined>,
  api: Awaited<ReturnType<typeof record>>['api'],
  ctx: CallContext = owner,
) {
  const handlers = handlersFor(api as never);
  let port = 0;
  /* THE DOOR IS BUILT AFTER THE SOCKET AND NOT BEFORE IT, because `origins` is the address this host answers
     for and the address is not known until a port is bound. A door holding the port this test asked for rather
     than the one it got would refuse every request as cross-origin and say so at `origin`, which is a true
     sentence about the wrong thing. */
  let door!: SparkAskDoor<CallContext>;
  const server = createServer((req, res) => {
    void (async () => {
      const url = `http://127.0.0.1:${port}${req.url ?? '/'}`;
      const headers = Object.entries(req.headers).map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const request = new Request(url, { method: req.method ?? 'GET', headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      const path = new URL(url).pathname;
      const out = servesSpark(path) ? await serveSpark(request, door, ctx) : await serveApi(request, handlers, ctx);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
    })();
  });
  /* THE PORT THE MACHINE GIVES, WHICH IS `apps/cli/test/http.test.ts:31`'s OWN LINE. This scanned 5991 upwards
     until 5999 instead, and the scan is measurable as the thing that breaks: with 5991 to 5994 held by another
     process, which is the very collision its comment recorded on `5993`, one of the six tests that bind a socket
     failed with *"no port between 5991 and 5999 was free, so the door was never driven"* and said nothing about
     the door. The scan also never reused a port a finished test had closed, so a seventh socket in this file
     would have been the last one the range could hold. `listen(0)` cannot collide with anything, and the
     `origins` set below still reads the port back off the socket rather than the one asked for. */
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  door = sparkAskDoor(new Set([origin]), engine);
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { origin };
}


type Answer = { status: number; body: { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } } };

/** One ask at the door, as a browser sends it: a JSON body, this host's `Origin`, and no bearer at all. */
async function ask(origin: string, body: unknown, extra: Record<string, string> = {}, path = '/api/spark/read'): Promise<Answer> {
  const res = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...extra },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Answer['body'] };
}

test('THE ASK ANSWERS ROWS OUT OF THE RECORD, over a real socket, through the engine and under the asker own level', async (t) => {
  const it = await record(t);
  const net = endpoint(() => completion(DRAFT));
  let built = 0;
  const engine = () => {
    built += 1;
    return Promise.resolve(
      createSpark({
        sql: it.own,
        clock: it.clock,
        inference: endpointInference({ url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'small', send: net.send }),
        record: sparkRecord(it.api),
      }) as SparkAskEngine<CallContext>,
    );
  };
  const host = await listen(t, engine, it.api);

  const out = await ask(host.origin, { question: 'Which tasks are open?' });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.ok, true);
  const reading = out.body.value as { ask_id: string; predicate: unknown; rows: { spoken: string }[]; read: { register: string; rows: number; predicate: string }[] };

  /* THE ROWS ARE THE RECORD'S AND THE PREDICATE IS THE MODEL'S. Two open tasks and not the third, which is
     `done`: the answer came through the record's own `list` under the drafted predicate rather than out of the
     model's account of anything. */
  assert.deepEqual(
    reading.rows.map((r) => r.spoken),
    ['tasks#2', 'tasks#1'],
  );
  assert.deepEqual(reading.predicate, { field: 'state', is: 'open' });
  assert.deepEqual(reading.read.at(0), { register: 'tasks', rows: 2, predicate: '{"field":"state","is":"open"}' });
  /* THE FOLD'S LAST LINE IS THE VAULT, REFUSED, on every ask (`46 §4.2`), and it reaches a person through this door. */
  assert.deepEqual(reading.read.at(-1), { register: 'grant', rows: 0, predicate: 'refused' });
  assert.match(reading.ask_id, /^[0-9a-z_]+$/iu);

  /* ONE MODEL CALL, WHICH IS PASS 1 AND NOT PASS 2 (`46 §13` D12): the door asks `read`, so nothing was
     proposed, nothing was filed on Decide, and the question is answered by rows. */
  assert.equal(net.sent.length, 1);
  assert.equal(built, 1);
  const governance = (await it.api.governance({ limit: 5 }, owner)) as { ok: boolean; value: unknown[] };
  assert.deepEqual(governance.value, [], 'the ask filed something on Decide');

  /* ONE ENGINE FOR TWO ASKS. `createSpark` is the cold path `46 §7` budgets, and a door that rebuilt it per
     request would run the two `CREATE TABLE IF NOT EXISTS` and the settings insert on every question. */
  net.sent.length = 0;
  const again = await ask(host.origin, { question: 'Which tasks are open?' });
  assert.equal(again.status, 200);
  assert.equal(built, 1, 'the engine was built a second time');

  /* AND SPARK'S OWN METER SAW BOTH, in its own database and not the record's (`46 §4.1`). */
  const metered = it.own.all<{ kind: string; status: string }>('SELECT kind, status FROM call ORDER BY rowid');
  assert.deepEqual(
    metered.map((r) => `${r.kind}:${r.status}`),
    ['read:ok', 'read:ok'],
  );
});

test('A BUILDER THAT THROWS MAKES THE ASK FAIL, which is the assertion a pass that deletes the caller cannot keep', async (t) => {
  const it = await record(t);
  let asked = 0;
  /* AN `async` BUILDER AND NOT A SYNCHRONOUS THROW, which is what the two real ones are: `sparkEngineFor` and
     `workerSparkEngine` are `async`, so a failure arrives as a REJECTED PROMISE, which is the case the door's
     own memo has to forget. A `throw` on the way in would never reach `sparkAskDoor`'s `.catch`, so the retry
     below would pass without the line it is about having run at all. */
  const engine = async () => {
    asked += 1;
    throw new Error('the engine builder was not called');
  };
  const host = await listen(t, engine, it.api);

  const out = await ask(host.origin, { question: 'Which tasks are open?' });
  assert.equal(out.status, 500, JSON.stringify(out.body));
  assert.equal(out.body.ok, false);
  assert.equal(out.body.refusal?.code, 'INTERNAL');
  assert.match(String(out.body.refusal?.fix), /the engine builder was not called/u);
  assert.equal(asked, 1, 'the door answered without asking the builder at all');

  /* AND A FAILURE IS NOT KEPT. The first ask of the day opens a vault grant, which can fail for a reason that
     has passed by the second; a cached rejection would answer the same 500 until the process restarted. */
  const twice = await ask(host.origin, { question: 'Which tasks are open?' });
  assert.equal(twice.status, 500);
  assert.equal(asked, 2, 'the rejection was cached, so the second ask was an echo rather than a retry');
});

test('NO MODEL CONFIGURED SAYS SO IN WORDS, and every other route on the same host answers as it did', async (t) => {
  const it = await record(t);
  let asked = 0;
  /* WHAT `sparkEngineFor(undefined, …)` AND `workerSparkEngine` WITH NO `SPARK_ENDPOINT` BOTH ANSWER. */
  const engine = () => (asked += 1, Promise.resolve(undefined));
  const host = await listen(t, engine, it.api);

  const out = await ask(host.origin, { question: 'Which tasks are open?' });
  assert.equal(out.status, 501, JSON.stringify(out.body));
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(out.body.refusal?.fix, 'No model is configured behind Spark on this host, so it cannot read the record for you.');
  assert.equal(asked, 1);

  /* THE KEYLESS PATH DOES NOT REGRESS: the record's own surface is untouched by the door in front of it, and
     a host with no model answers every method it answered before. */
  const boot = await fetch(`${host.origin}/api/boot`);
  assert.equal(boot.status, 200);
  const rows = await fetch(`${host.origin}/api/list?register=tasks`);
  assert.equal(rows.status, 200);
  const listed = (await rows.json()) as { ok: boolean; value: { rows: unknown[] } };
  assert.equal(listed.value.rows.length, 3);

  /* AND THE FOUR SPARK ROUTES `46 §5.2` NAMES AND NOBODY HAS BUILT ARE NOT SILENTLY THE ASK. `servesSpark`
     matches one path, so `/api/spark/status` falls through to the method router and is told there is no such
     method, which is true, rather than being answered by the one door that exists. */
  const status = await ask(host.origin, {}, {}, '/api/spark/status');
  assert.equal(status.status, 404);
  assert.equal(status.body.refusal?.code, 'ROUTE_UNKNOWN');
});

test('A BEARER IS REFUSED BEFORE THE ENGINE IS ASKED, and so is a page this host does not answer for', async (t) => {
  const it = await record(t);
  let asked = 0;
  const engine = () => (asked += 1, Promise.resolve(undefined));
  const host = await listen(t, engine, it.api);

  /* `46 §5.2`: every bearer at a cookie route is 403 `NEEDS_BROWSER_SESSION`. It is the header that is
     refused and not the principal behind it, because on a self-host the server key makes the owner. */
  for (const authorization of ['Bearer bd_obviously_fake_for_tests', 'Bearer ']) {
    const out = await ask(host.origin, { question: 'Which tasks are open?' }, { authorization });
    assert.equal(out.status, 403, JSON.stringify(out.body));
    assert.equal(out.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
    assert.equal(out.body.refusal?.at, 'principal');
  }

  /* THE HALF OF CSRF THAT DOES NOT DEPEND ON THE BROWSER (`12 §8`): every browser sends `Origin` on a POST,
     so a request with none is not a page, and a page somewhere else is what a cookie must not serve. */
  const nowhere = await fetch(`${host.origin}/api/spark/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"question":"x"}' });
  assert.equal(nowhere.status, 403);
  assert.equal(((await nowhere.json()) as Answer['body']).refusal?.at, 'origin');
  const elsewhere = await ask(host.origin, { question: 'x' }, { origin: 'https://evil.example' });
  assert.equal(elsewhere.status, 403);
  assert.equal(elsewhere.body.refusal?.at, 'origin');

  /* A GET IS NOT AN ASK: the door spends a model call and a browser may prefetch a link. */
  const got = await fetch(`${host.origin}/api/spark/read`, { headers: { origin: host.origin } });
  assert.equal(got.status, 405);
  assert.equal(got.headers.get('allow'), 'POST');

  assert.equal(asked, 0, 'a refused request reached the engine builder');
});

test('A CALLER WHO HOLDS NOTHING ON THE RECORD IS REFUSED BEFORE A TOKEN IS SPENT, which is what the `Origin` check cannot do on its own', async (t) => {
  /* THE `Origin` HEADER IS NOT A CREDENTIAL AWAY FROM A BROWSER, and this is the case that matters: `curl` sets
     any `Origin` it likes, so a stranger reaches every line of this door and the ask lands on whatever context
     the host resolved, which for a caller with no session is a person holding nothing. What stops it is the
     RECORD, and the order inside the engine is the part worth pinning: `propose.ts` `look` asks
     `record.project` for the index FIRST and returns its refusal, so the draft call is never made. A door that
     spent a model call before the record had refused would be a bill a stranger could run up on any host with
     `SPARK_ENDPOINT` set. Test 1's own title says the asker's own level and no test varied it, so this is it. */
  const it = await record(t);
  const net = endpoint(() => completion(DRAFT));
  const engine = () =>
    Promise.resolve(
      createSpark({
        sql: it.own,
        clock: it.clock,
        inference: endpointInference({ url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'small', send: net.send }),
        record: sparkRecord(it.api),
      }) as SparkAskEngine<CallContext>,
    );
  const stranger: CallContext = { principal: { kind: 'person', id: 'p_stranger', level: null } };
  const host = await listen(t, engine, it.api, stranger);

  const out = await ask(host.origin, { question: 'Which tasks are open?' });
  assert.equal(out.status, 403, JSON.stringify(out.body));
  assert.equal(out.body.ok, false);
  assert.equal(out.body.refusal?.code, 'FORBIDDEN');
  assert.equal(net.sent.length, 0, 'a caller who holds nothing on the record spent a model call');

  /* AND SPARK'S METER IS EMPTY, so nothing was charged to the record either (`46 §4.1`). */
  assert.deepEqual(it.own.all<{ kind: string }>('SELECT kind FROM call ORDER BY rowid'), []);

  /* THE OWNER ON THE SAME RECORD STILL READS IT, so the refusal above is the level and not the door. */
  const asOwner = await listen(t, engine, it.api, owner);
  const good = await ask(asOwner.origin, { question: 'Which tasks are open?' });
  assert.equal(good.status, 200, JSON.stringify(good.body));
  assert.equal((good.body.value as { rows: unknown[] }).rows.length, 2);
});

test('A QUESTION THAT IS NOT WORDS IS A 422, and a blank one is answered in the engine own sentence', async (t) => {
  const it = await record(t);
  const net = endpoint(() => completion(DRAFT));
  const engine = () =>
    Promise.resolve(
      createSpark({
        sql: it.own,
        clock: it.clock,
        inference: endpointInference({ url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'small', send: net.send }),
        record: sparkRecord(it.api),
      }) as SparkAskEngine<CallContext>,
    );
  const host = await listen(t, engine, it.api);

  /* `question.trim()` ON A NUMBER IS A TypeError, which is a 500 for a value the caller can see and fix. */
  for (const question of [7, null, { said: 'hello' }, ['hello']]) {
    const out = await ask(host.origin, { question });
    assert.equal(out.status, 422, JSON.stringify(out.body));
    assert.equal(out.body.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(out.body.refusal?.at, 'question');
  }
  const absent = await ask(host.origin, {});
  assert.equal(absent.status, 422);
  assert.equal(net.sent.length, 0, 'the model was asked about a question that is not a question');

  /* AND A BLANK ONE IS THE ENGINE'S REFUSAL AND NOT A SECOND COPY OF IT HERE: one sentence, one file. */
  const blank = await ask(host.origin, { question: '   ' });
  assert.equal(blank.status, 422);
  assert.equal(blank.body.refusal?.fix, 'Ask Spark a question first. A blank ask has nothing to read.');
  assert.equal(net.sent.length, 0);

  /* A BODY THAT IS NOT A JSON OBJECT IS A 400, before anything reads a field of it. */
  for (const body of ['not json at all', '"a string"', '[1,2]', 'null']) {
    const res = await fetch(`${host.origin}/api/spark/read`, { method: 'POST', headers: { 'content-type': 'application/json', origin: host.origin }, body });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as Answer['body']).refusal?.code, 'BODY_MALFORMED');
  }
  /* AND A BODY WITH NO TYPE ON IT IS NOT READ EITHER, which is `keys.ts`'s rule for the same reason. */
  const untyped = await fetch(`${host.origin}/api/spark/read`, { method: 'POST', headers: { origin: host.origin }, body: '{"question":"x"}' });
  assert.equal(untyped.status, 400);
});

test('A QUESTION LONGER THAN THE DOOR TAKES IS REFUSED BEFORE A MODEL IS ASKED', async (t) => {
  const it = await record(t);
  const net = endpoint(() => completion(DRAFT));
  const engine = () =>
    Promise.resolve(
      createSpark({
        sql: it.own,
        clock: it.clock,
        inference: endpointInference({ url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'small', send: net.send }),
        record: sparkRecord(it.api),
      }) as SparkAskEngine<CallContext>,
    );
  const host = await listen(t, engine, it.api);

  const out = await ask(host.origin, { question: 'x'.repeat(5_000) });
  assert.equal(out.status, 400, JSON.stringify(out.body));
  assert.equal(out.body.refusal?.at, 'question');
  assert.equal(net.sent.length, 0);

  /* AND THE 400 BYTES THE ENGINE READS ARE NOT THIS DOOR'S BUSINESS: a question inside the envelope goes
     through, and the engine truncates to its own budget. */
  const through = await ask(host.origin, { question: `Which tasks are open? ${'and '.repeat(80)}` });
  assert.equal(through.status, 200, JSON.stringify(through.body));
  assert.equal(net.sent.length, 1);
});

test('THE DOOR IS NOT A METHOD, which is what keeps it out of the record surface and the two gates over it', async () => {
  /* `ROUTES` IS THE RECORD'S SURFACE AND TWO GATES HOLD IT TO THAT: `tools/gates/guards.mjs` looks for every
     routed name as a method of `packages/record/src/index.ts`, and `tools/gates/router-groups.mjs` fails on a
     name `docs/30-BLUEPRINT.md` §5 does not enumerate. This answer comes out of the host's engine, so a row in
     that table would be a name neither gate can account for. The assertion is the one a future pass would
     break by "tidying" the door into the table. */
  const { ROUTES } = await import('../src/index.ts');
  assert.equal(
    ROUTES.find((r) => r.name === 'sparkAsk' || r.name.startsWith('spark/')),
    undefined,
  );
  /* AND THE FOUR THAT ARE THERE ARE THE ARRANGEMENT ENGINE, which `1f85a49a` settled is a different feature
     with the same name: they propose how a BrainDog is put together, and none of them answers a question
     about what is in it. */
  assert.deepEqual(
    ROUTES.filter((r) => r.name.startsWith('spark')).map((r) => r.name),
    ['spark', 'sparkPropose', 'sparkDaily', 'sparkForm'],
  );
  assert.equal(servesSpark('/api/sparkAsk'), null);
  assert.equal(servesSpark('/api/spark/read'), 'read');
  assert.equal(servesSpark('//api//spark//read/'), 'read');
  assert.equal(servesSpark('/api/spark/propose'), null);
});

/**
 * WHETHER A REQUEST CAN ARRIVE AT ALL, which is the one thing every test above this line assumes.
 *
 * THIS IS RED ON PURPOSE AND IT IS THE POINT OF THE FILE. Every other test here builds its own dispatch in
 * `listen`, which is what lets all seven pass while no host routes the door: three reports in a row said the
 * thirteenth package had a caller, and each time the checker measured it and found `packages/host/src/index.ts`
 * exporting a door, `apps/worker/src/spark.ts` and `apps/selfhost/src/spark.ts` each declaring one, and no
 * branch anywhere handing a request to either. Measured directly on 2026-09-21: a real self-host started with
 * a `SPARK_ENDPOINT` and a key reports `spark: true` at `/api/version` and answers `POST /api/spark/read` with
 * 404 `ROUTE_UNKNOWN` "There is no method called spark/read." An in-process test cannot see that, so this one
 * reads the two dispatch files off disk instead.
 *
 * IT IS THE SHAPE `apps/worker/test/vault.test.ts:90` ALREADY USES for exactly this question, and for the same
 * reason: whether a door is routed is a fact about a host's source, not about a function's behaviour, so the
 * source is what is asserted. Its right homes are `apps/worker/test/spark.test.ts` and
 * `apps/selfhost/test/spark.test.ts`, one assertion per host in the suite that owns the host. It is here
 * because this was the only test file the pass that wrote it was allowed to write, and moving it is a
 * five-line change that should happen with the mount.
 *
 * WHAT TURNS IT GREEN, both driven before this was written. The self-host wants three edits to `server.ts`:
 * a second `openSqlite` for Spark's own database beside `const sql`, a `spark: sparkDoor(...)` entry in the
 * `site` literal, and `servesSpark(path)` ahead of `servesKeys(path)` at the dispatch. Under those three, one
 * real question over a real socket answered 200 with the record's own rows and the model's own predicate. The
 * Worker wants a `SparkAskDoor` on a field of `Record$` and a branch in `#answer` beside `servesMcp`'s; a field
 * rather than a local because `sparkAskDoor` caches the built engine on the door it returns.
 */
test('BOTH HOSTS ROUTE THE DOOR, which is the claim three reports made and none of them held', () => {
  const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

  const worker = read('apps/worker/src/index.ts');
  assert.ok(worker.includes('servesSpark('), 'the Worker does not route POST /api/spark/read');
  assert.ok(worker.includes('workerSparkDoor('), 'the Worker builds no Spark door, so nothing it routes could be answered');

  const selfhost = read('apps/selfhost/src/server.ts');
  assert.ok(selfhost.includes('servesSpark('), 'the self-host does not route POST /api/spark/read');
  assert.ok(selfhost.includes('sparkDoor('), 'the self-host builds no Spark door, so nothing it routes could be answered');
});
