/**
 * What naming an answer's refs costs, and who it is told to.
 *
 * A REQUEST PER DISTINCT REF, ONE AFTER ANOTHER. `nameOf` asked `get` for every row id a
 * ref field held, so the cost of an answer grew with its page: measured here on the seed with 120 learnings added,
 * each superseding the one before, `list learnings` answered 127 rows after 126 calls to the surface (`list`, two
 * `schema`, 123 `get`). Over `braindog mcp` each call is an HTTP request from the command
 * line to the host (`apps/cli/src/surface.ts`), in series, before the agent reads a line. Now each register the refs
 * point into is read with its ids 64 at a time, and the same list asks six times.
 *
 * UNDER THE DURABLE OBJECT'S CEILING OF 100 BOUND PARAMETERS, which `node:sqlite` does not have. The first cut read
 * 200 ids at a time and passed this file on `node:sqlite`, while in workerd, measured through Miniflare, a statement
 * of 101 parameters threw `too many SQL variables`, so the 127 learnings below were an internal error for the whole
 * `list` in production. The record here refuses the same way, so a read too wide goes red on a laptop too.
 *
 * AND NOTHING IS KEPT PAST THE ANSWER. An earlier attempt kept names across messages keyed by what
 * `whoami` said, and `whoami` says nothing of `ctx.levels`, so a token held to `append` on one register could be told
 * the names of its rows. With the reads batched, a cache across messages would save four calls of those five, so
 * there is none: every read is asked with the caller's own context, and the record decides what it may be told. The
 * tests below go through `handle` with a copy of the context per message, as every transport builds one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools, type McpSurface } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub, type Ctx } from './stub.ts';

const owner: CallContext = {
  principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'names-cache', cwd: '/Users/studio/Code/kiln-type' },
} as CallContext;

type Row = { spoken: string; version: number; fields: Record<string, unknown> };
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** `node:sqlite` held to the Durable Object's 100 bound parameters, the one limit a naming read can meet. */
function doSqlite() {
  const sql = openSqlite();
  const held = <A extends unknown[], R>(run: (text: string, ...params: A) => R) => (text: string, ...params: A): R => {
    if (params.length > 100) throw new Error(`too many SQL variables: ${String(params.length)}, and a Durable Object binds 100`);
    return run(text, ...params);
  };
  return { ...sql, exec: held(sql.exec.bind(sql)), all: held(sql.all.bind(sql)), one: held(sql.one.bind(sql)) } as typeof sql;
}

/**
 * PROJECTS AS PORTFOLIO 1.15.0 DECLARED THEM, with no `delete:` rule. 1.16.0 refuses deleting a project anything points
 * at, and a record from before it can still hold live rows pointing at a deleted project, which is what this reads.
 */
async function withoutDeleteRule(kernel: { declarations(): { id: string; version: number; body: string }[]; install(d: never, e: { id: string; version: number }): Promise<{ ok: boolean }> }): Promise<void> {
  const things = kernel.declarations().find((d) => d.id === 'register.things');
  assert.ok(things, 'the seed declares no Projects');
  const { delete: _rule, ...body } = JSON.parse(things.body) as Record<string, unknown>;
  const out = await kernel.install([{ id: 'register.things', kind: 'register', body }] as never, { id: 'register.things', version: things.version });
  assert.ok(out.ok, JSON.stringify(out));
}

/** The seeded record behind a surface that counts every method it is asked, by name. */
async function counted() {
  const sql = doSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 9)) });
  await installSeed(api.kernel);
  await withoutDeleteRule(api.kernel as never);
  const asked: string[] = [];
  const surface = new Proxy(api, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      if (typeof value !== 'function' || typeof key !== 'string') return value;
      return (...args: unknown[]) => {
        /* The door's mark (`doorHeard`, or `heard` on an older surface) is a call nobody waits on, never a read, so it is
           not counted against the budget. */
        if (key !== 'heard' && key !== 'doorHeard') asked.push(key);
        return Reflect.apply(value, target, args) as unknown;
      };
    },
  }) as unknown as McpSurface<CallContext>;
  return { api, surface, asked, sql };
}

let n = 0;
/* A COPY OF THE CONTEXT PER MESSAGE, as every transport builds one (`ctxOf()` on stdio, `withSession` on the hosts). */
const call = async (surface: McpSurface<CallContext>, ctx: CallContext, name: string, args: Record<string, unknown>) => {
  const message = { jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } };
  const reply = (await handle(message, surface, { ...ctx })) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  /* THE WHOLE ANSWER IS `structuredContent`; the text beside it is the brief one, and it is named from the same reads. */
  const out = reply.result as { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
  return { error: out.isError === true, value: out.structuredContent, text: out.content[0]!.text };
};
const rowsOf = (said: { error: boolean; value: Record<string, unknown> }): Row[] => {
  assert.ok(!said.error, JSON.stringify(said.value));
  return said.value.rows as Row[];
};
const thingsOf = (rows: Row[]): unknown[] => rows.map((r) => r.fields.thing).filter((t) => t !== undefined);

test('a list of 127 learnings, each superseding the last, reads each register its refs point into and not each ref, and names every ref', async () => {
  const { api, surface, asked } = await counted();
  /* THE MEASURED SHAPE: 120 learnings through the record, each superseding the one before, beside the seed's seven. */
  let previous: string | undefined;
  for (let i = 0; i < 120; i++) {
    const made = await api.create(
      { register: 'learnings', fields: { lesson: `Lesson ${String(i)} of the names test.`, because: 'Measured for the names test.', kind: 'fact', ...(previous ? { supersedes: previous } : {}) } },
      owner,
    );
    assert.ok(made.ok, JSON.stringify(made));
    previous = (made.value as { id: string }).id;
  }
  asked.splice(0);

  /* A HUNDRED A PAGE AT MOST NOW, so the 127 come in two pages, each read by the cursor the one before it ended on, and
     each page is held to the bound below on its own. */
  const rows: Row[] = [];
  const costs: string[][] = [];
  let cursor: string | undefined;
  do {
    asked.splice(0);
    const page = await call(surface, owner, 'list', { register: 'learnings', limit: 500, ...(cursor === undefined ? {} : { cursor }) });
    rows.push(...rowsOf(page));
    costs.push([...asked]);
    cursor = typeof page.value.cursor === 'string' ? page.value.cursor : undefined;
  } while (cursor !== undefined && costs.length < 5);
  assert.equal(rows.length, 127);
  assert.equal(costs.length, 2, `the 127 came in ${String(costs.length)} pages`);

  /* EVERY REF IS NAMED, and named as the row it points at: each added learning supersedes the one made before it. */
  const added = rows.filter((r) => /^Lesson \d+ of the names test\.$/.test(String(r.fields.lesson)));
  const byLesson = new Map(added.map((r) => [String(r.fields.lesson), r.spoken]));
  for (const r of added) {
    const i = Number(/\d+/.exec(String(r.fields.lesson))![0]);
    assert.equal(r.fields.supersedes, i === 0 ? undefined : byLesson.get(`Lesson ${String(i - 1)} of the names test.`), `Lesson ${String(i)} supersedes ${String(r.fields.supersedes)}`);
  }
  const seeded = rows.filter((r) => !byLesson.has(String(r.fields.lesson)));
  assert.ok(seeded.some((r) => typeof r.fields.project === 'string' && /^things#\d+$/.test(r.fields.project)), 'no seeded learning named its project');

  /* MEASURED BEFORE: 126 (`list`, two `schema`, 123 `get`). The bound is the `list`, the `schema` of `learnings` and
     of `things`, two reads of the learnings ids at 64 a read, and one of the seeded projects, on each page. */
  for (const cost of costs) {
    assert.ok(!cost.includes('get'), `a ref was named by a get of its own: ${String(cost.filter((m) => m === 'get').length)} of them`);
    assert.ok(cost.length <= 1 + 2 + 2 + 1, `the list asked the surface ${String(cost.length)} times: ${cost.join(' ')}`);
  }
});

test('a caller whose level on a register does not read it is told the row id, though the owner was just told the name', async () => {
  /* THE HELD ATTEMPT'S REFUSAL, AS A TEST. The owner names Kiln first through the same surface, so anything kept
     across messages and shared between callers would hand the next two `things#1`. `levels` is the per-register
     override a token is minted with; `registers` is the ceiling. The record refuses both a read of `things`. */
  const { surface } = await counted();
  const owned = thingsOf(rowsOf(await call(surface, owner, 'list', { register: 'tasks', limit: 500 })));
  assert.ok(owned.includes('things#1'), 'the owner was told no project');

  const appends = { ...owner, levels: { things: 'append' } } as CallContext;
  const held = { ...owner, registers: ['tasks'] } as CallContext;
  for (const [who, ctx] of [['a token that only appends to things', appends], ['a token held to tasks', held]] as const) {
    const said = await call(surface, ctx, 'list', { register: 'tasks', limit: 500 });
    const things = thingsOf(rowsOf(said));
    assert.equal(things.length, owned.length, `${who} read a different page`);
    assert.ok(things.every((t) => typeof t === 'string' && ROW_ID.test(t)), `${who} was told ${JSON.stringify([...new Set(things)])}`);
    /* AND THE TEXT SAYS NEITHER THE NAME NOR THE ID: a row id is nothing a person can read, so a ref the caller may not
       name is left off the line, and no project is named on it either. */
    assert.doesNotMatch(said.text, /[0-9A-HJKMNP-TV-Z]{26}/u, `${who} was shown a row id: ${said.text}`);
    assert.doesNotMatch(said.text, /things#\d+/u, `${who} was shown a project: ${said.text}`);
  }
});

test('a delete is seen on the next message, by the caller who deleted and by another', async () => {
  /* MEASURED ON THE SEED: `get` of a deleted row's id answers `null`, and `list` leaves a deleted row out, so a fresh
     naming pass leaves the id as it is. A name kept past the answer would still say `things#1` for a project gone. */
  const { surface } = await counted();
  const other = { ...owner, principal: { ...owner.principal, id: 't3' } } as CallContext;
  const before = rowsOf(await call(surface, other, 'list', { register: 'tasks', where: { field: 'thing', is: 'things#1' } }));
  assert.ok(before.length > 0 && before.every((r) => r.fields.thing === 'things#1'), 'Kiln has no tasks on the seed');

  const gone = await call(surface, owner, 'update', { spoken: 'things#1', patch: { deleted_at: true } });
  assert.ok(!gone.error, JSON.stringify(gone.value));

  const kiln = new Set(before.map((r) => r.spoken));
  for (const ctx of [owner, other]) {
    const rows = rowsOf(await call(surface, ctx, 'list', { register: 'tasks', limit: 500 }));
    const still = rows.filter((r) => kiln.has(r.spoken)).map((r) => r.fields.thing);
    assert.equal(still.length, before.length, "Kiln's tasks were not all listed after the delete");
    assert.ok(still.every((t) => typeof t === 'string' && ROW_ID.test(t)), `a deleted project was named ${JSON.stringify(still)}`);
    /* AND THE REST ARE STILL NAMED. The deleted id rides in the same read as the live ones, and a read that refused
       for the one it cannot find would have unnamed every project on the page. */
    const rest = thingsOf(rows.filter((r) => !kiln.has(r.spoken)));
    assert.ok(rest.length > 0 && rest.every((t) => typeof t === 'string' && /^things#\d+$/.test(t)), `the live projects were told ${JSON.stringify([...new Set(rest)])}`);
  }
});

test('a page of 450 distinct refs is named in eight reads of 64 ids or fewer, each a statement and a URL a host takes', async () => {
  /* WHY 64 AND NOT THE 500 A PAGE HOLDS. Each id is a bound parameter, and a Durable Object binds 100, `list`'s own
     three among them, measured through Miniflare. And the command line sends `list` as a GET with `where` in the query
     string (`packages/client/src/index.ts`), where a `where` of 500 row ids made a 17,598-byte URL, measured, past the
     16 KiB Node lets a request's head be. */
  const ids = Array.from({ length: 450 }, (_, i) => `01M345FTM0${String(i).padStart(16, '0')}`);
  const { surface, calls } = stub({
    schema: async ({ register }) => ({
      ok: true,
      value: register === 'tasks' ? { seq_prefix: 'T', fields: [{ id: 'thing', type: 'ref', to: 'things' }] } : { seq_prefix: '', fields: [] },
    }),
    list: async (args) => {
      calls.push({ method: 'list', args, ctx: undefined });
      if (args.register === 'tasks')
        return { ok: true, value: { rows: ids.map((id, i) => ({ id: `T${id.slice(1)}`, register: 'tasks', seq: i + 1, version: 1, fields: { thing: id } })) } };
      const asked = (args.where as { in: string[] }).in;
      return { ok: true, value: { rows: asked.map((id) => ({ id, register: 'things', seq: ids.indexOf(id) + 1, version: 1, fields: {} })) } };
    },
  });
  const r = await tools(surface).call('list', { register: 'tasks', limit: 500 }, { who: 'agent' } satisfies Ctx);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(calls.filter((c) => c.method === 'get').length, 0, 'a ref was named by a get of its own');
  const reads = calls.filter((c) => c.method === 'list' && (c.args as { register: string }).register === 'things');
  assert.equal(reads.length, 8);
  for (const read of reads) assert.ok((read.args as { where: { in: string[] } }).where.in.length <= 64, 'a read held more ids than a statement binds');
  const rows = (r.value as { rows: Row[] }).rows;
  assert.deepEqual(
    rows.map((row) => row.fields.thing),
    ids.map((_, i) => `things#${String(i + 1)}`),
  );
  for (const read of reads) {
    const url = new URL('http://127.0.0.1:8787/api/list');
    for (const [key, value] of Object.entries(read.args as Record<string, unknown>))
      url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    assert.ok(url.href.length < 8192, `a read of ids was a ${String(url.href.length)}-byte URL`);
  }
});

/* ── what naming a ref tells the observe loop ─────────────────────────────── */

/** Every `query.scan` the record has counted, as `subject n`, and every `register.read` likewise. */
const observed = (sql: ReturnType<typeof doSqlite>, kind: string): string[] =>
  sql.all<{ subject: string; n: number }>('SELECT subject, sum(n) AS n FROM observation WHERE kind = ? GROUP BY subject ORDER BY subject', kind).map((r) => `${r.subject} ${String(r.n)}`);

test('ten lists of tasks and ten of learnings count no scan of a primary key', async () => {
  /* A NAMING READ IS NO SCAN. `namesIn` reads the rows a page's refs point into as `list` where `id` is in
     them, and the record counted each read as `query.scan` of `<list>.id`, because the declaration indexes no field
     named `id`. Measured after fe741dfa on this shape: `things.id 20, learnings.id 10, tasks.id 10, people.id 10,
     tracks.id 10`, and none of them a scan, since `id` is the row's primary key. */
  const { surface, sql } = await counted();
  for (let i = 0; i < 10; i++) {
    rowsOf(await call(surface, owner, 'list', { register: 'tasks', limit: 500 }));
    rowsOf(await call(surface, owner, 'list', { register: 'learnings', limit: 500 }));
  }
  assert.deepEqual(observed(sql, 'query.scan'), []);
  /* A NAMING READ STILL COUNTS AS A READ OF THE LIST IT NAMES, and that is kept on purpose. Both readers of
     `register.read` ask whether a list was read at all in ninety days (`dormant` in the kernel's observe loop, and
     Slash's untouched pack), and a list whose rows name every ref on an agent's pages is in use: retiring it would
     turn those names back into row ids. `people`, `things` and `tracks` are reached here only through refs. */
  assert.deepEqual(observed(sql, 'register.read'), ['learnings 20', 'people 10', 'tasks 20', 'things 20', 'tracks 10']);
});

test('a hundred lists of each, then the weekly look, drafts no index for things.id', async () => {
  /* AND SO NO INDEX IS DRAFTED FOR ONE. Two hundred naming reads of `things` in a day is the detector's threshold, and it drafted "things.id was
     scanned 200 times in thirty days, and an index would pay for itself": a model call on a proposal nobody can
     accept, and three of those marked incorrect suspend the whole analyser. The governors want a record with a habit,
     so the seed's events are spread over three weeks by SQL. */
  const { api, surface, sql } = await counted();
  const events = sql.all<{ rowid: number }>('SELECT rowid FROM event ORDER BY rowid');
  events.forEach(({ rowid }, i) =>
    sql.exec('UPDATE event SET ts = ? WHERE rowid = ?', new Date(Date.UTC(2026, 8, 1, 9) + (i % 7) * 86_400_000).toISOString(), rowid),
  );
  for (let i = 0; i < 100; i++) {
    rowsOf(await call(surface, owner, 'list', { register: 'tasks', limit: 500 }));
    rowsOf(await call(surface, owner, 'list', { register: 'learnings', limit: 500 }));
  }
  const looked = api.kernel.analyse();
  assert.equal(looked.suspended, null, `the governors held the look: ${String(looked.suspended)}`);
  assert.equal(looked.candidate, null, `the look proposed ${JSON.stringify(looked.candidate)}`);
  assert.deepEqual(sql.all("SELECT payload FROM outbox WHERE kind = 'infer.draft'"), []);
});
