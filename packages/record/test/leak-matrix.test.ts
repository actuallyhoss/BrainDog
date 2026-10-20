/**
 * The leak matrix (sharing plan §4, Slice 2): every grant shape that can be built today, held to what it may see on
 * every read path, before any of the sharing work changes a reader.
 *
 * ROWS ARE THE SHAPES (`leak/fixture.ts`): the owner, a whole-record view, the five share templates as today's member
 * rows emulate them (assistant, accountant, contractor on Kiln, reviewer as a condition, one row), a whole-record reader
 * held to Kiln's tasks, adds only, and Sam who keeps rows private. Each runs as the person, a write-scope token and a
 * read-scope token. COLUMNS ARE THE READ PATHS (`leak/routes.ts`, `leak/mcp.ts`): every READ+ and DATA route that changes
 * nothing, through the host's handler table, and all 17 MCP tools and the resources, through `serveMcp`.
 *
 * THE PROPERTIES ARE §4.4's: P1 (no canary or out-of-sight id in any answer) on every path; P2 (non-interference: an
 * answer is the same after changes the caller cannot see), P3 (every count is the visible rows that match) and P4 (a
 * hidden row is refused as a missing one) on the twelve core routes; P5's first half for G1.
 *
 * A KNOWN GAP IS A TODO NAMED FOR IT (`G<n>`, §1.2), so the suite passes and lists what is still open; a leak this
 * matrix found that §1.2 does not name is a todo named `N<n>`. Slice 3 and later remove a todo by closing its gap.
 * `LEAK_FUZZ` sets how many random rounds of unseen changes P2 draws per shape (2 by default).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { scopeOf } from '../../../apps/web/src/lib/data/local.ts';
import { leaks } from './leak/canary.ts';
import { build, personCtx, SHAPES, unseen, type Caller, type Fixture, type RowInfo, type Shape } from './leak/fixture.ts';
import { argsFor, ask, CORE, handlers, LIST_IDS, READ_ROUTES, walked, type Args } from './leak/routes.ts';
import { callTool, listResources, readResource, TOOL_NAMES, toolArgs, WRITES } from './leak/mcp.ts';

const FUZZ = Number(process.env.LEAK_FUZZ ?? 2);

/**
 * The gaps §1.2 names, and the ones this matrix found that it does not (`N<n>`), by the test they hold open.
 * Each line is the todo's own sentence, so the run lists it.
 */
const GAP = {
  G1: 'G1 writes ignore row rules and private rows: a narrowed writer edits, deletes and notes rows outside its rule, creates rows outside it, and anyone who writes a list writes, and is answered, another person\'s private row',
  G2: 'G2 context reads each list with kernel.inScope, without the private exclusion, so every agent is briefed on other people\'s private rows',
  G3: 'G3 backlinks never checks the target row against the rule: a hidden row number answers with its id, where a missing one answers null',
  G4: 'G4 metric checks only that the list can be read, so a narrowed caller gets a figure over the whole list and the row numbers behind it',
  G5: 'G5 search matched counts the whole list, not the rows the caller is shown',
  G6: 'G6 versionFor\'s cache key ignores wheres, and its shortcut assumes a row write cannot change which older lines a narrowed caller sees',
  G7: 'G7 the local copy\'s fingerprint (scopeOf) omits rules, so narrowing a colleague leaves the copy as it was',
  G8: 'G8 a removed member\'s poll is answered 403, and the app and the service worker wipe the copy only on a 401',
  N1: 'N1 makePrivate writes a log line with no target ("Kept private: tasks#8"), so every reader\'s log, catch-up and version poll sees that a private row was made and its number',
  N2: 'N2 a page filter\'s pill counts include other people\'s private rows, though the block under it does not',
  N3: 'N3 a search hit\'s rank is BM25 over the whole index, so it moves when a row the caller cannot see is written',
} as const;

/** Which P1 tests are held open by a gap: the route, and the sentence. */
const P1_OPEN: Record<string, string> = { backlinks: GAP.G3, context: GAP.G2 };
const MCP_OPEN: Record<string, string> = { update: GAP.G1, log: GAP.G1 };
/** And which P2 tests: an answer that moves when something unseen does. */
const P2_OPEN: Record<string, string> = {
  recentHistory: GAP.N1,
  whatsNew: GAP.N1,
  boot: GAP.N1,
  version: `${GAP.G6}; ${GAP.N1}`,
  page: GAP.N2,
  search: GAP.G5,
  backlinks: GAP.G3,
  metric: GAP.G4,
};

let fixture: Promise<Fixture> | undefined;
/** The read fixture, built once: P1 changes nothing on it. */
const reads = (): Promise<Fixture> => (fixture ??= build());

type Found = Map<string, Set<string>>;
const note = (found: Found, caller: Caller, what: string) => {
  const set = found.get(caller.label) ?? new Set<string>();
  set.add(what);
  found.set(caller.label, set);
};
const said = (found: Found, most = 6): string =>
  [...found].map(([who, what]) => `  ${who}: ${[...what].slice(0, most).join(' | ')}${what.size > most ? ` (and ${what.size - most} more)` : ''}`).join('\n');

/* ── the harness itself ─────────────────────────────────────────────────── */

test('THE CANARIES ARE LIVE: the owner\'s answers, held to a contractor\'s sight, are caught carrying what she may not see', async () => {
  const f = await reads();
  const h = handlers(f);
  const contractor = f.callers.find((c) => c.shape.id === 'contractor' && c.variant === 'person')!;
  const listed = await ask(h, 'list', { register: 'tasks' }, f.owner);
  const caught = leaks(listed, f.out(contractor));
  assert.ok(caught.some((l) => l.includes('t-loom-todo') && l.includes('its word')), caught.join('\n'));
  assert.ok(caught.some((l) => l.includes('its amount')), 'an amount out of sight is caught as written, in minor units or as money');
  assert.ok(caught.some((l) => l.includes('its id')), 'a row id out of sight is caught');
  /* AND WHAT SHE MAY SEE IS NOT A CANARY TO HER. */
  assert.deepEqual(leaks(await ask(h, 'list', { register: 'tasks' }, contractor.ctx), f.out(contractor)), []);
  /* EVERY SHAPE IS ON THE RECORD AS THE HOST WOULD BUILD IT, and the narrowed ones carry their rule. */
  for (const shape of SHAPES.filter((s) => s.narrowed)) assert.ok(personCtx(f.api, shape.person).wheres?.tasks, shape.id);
});

/* ── P1: no answer carries a canary ─────────────────────────────────────── */

for (const route of READ_ROUTES) {
  const todo = P1_OPEN[route];
  test(`P1 ${route}: no caller is answered a canary or an id out of their sight`, todo ? { todo } : {}, async () => {
    const f = await reads();
    const h = handlers(f);
    const found: Found = new Map();
    for (const args of argsFor(route, f))
      for (const caller of f.callers) {
        const answer = await ask(h, route, args, caller.ctx);
        assert.equal((answer as { threw?: string }).threw, undefined, `${route} threw for ${caller.label} on ${JSON.stringify(args)}`);
        for (const l of leaks(answer, f.out(caller))) note(found, caller, `${l} <- ${JSON.stringify(args).slice(0, 80)}`);
      }
    assert.equal(found.size, 0, `${route} answered what its caller may not see:\n${said(found)}`);
  });
}

test('P1 cursors walked to the end: list, recentHistory and backlinks carry no canary on any page', async () => {
  const f = await reads();
  const h = handlers(f);
  const found: Found = new Map();
  const walks: [string, Args][] = [...LIST_IDS.map((register): [string, Args] => ['list', { register }]), ['recentHistory', {}], ['recentHistory', { everything: true }]];
  for (const caller of f.callers)
    for (const [route, args] of walks)
      for (const page of await walked(h, route, args, caller.ctx)) for (const l of leaks(page, f.out(caller))) note(found, caller, `${l} <- ${route} ${JSON.stringify(args)}`);
  assert.equal(found.size, 0, said(found));
});

test('P1 export and slash are refused to everyone but the owner', async () => {
  const f = await reads();
  const h = handlers(f);
  const let_in: string[] = [];
  for (const caller of f.callers) {
    if (caller.shape.id === 'owner' && caller.variant === 'person') continue;
    for (const [route, args] of [['export', {}], ['slash', { asked: 'What is on Kiln?' }]] as const) {
      const answer = (await ask(h, route, args, caller.ctx)) as { ok?: boolean };
      if (answer.ok !== false) let_in.push(`${route} answered ${caller.label}`);
    }
  }
  assert.deepEqual(let_in, []);
});

/* ── P1 over MCP: the 17 tools and the resources ────────────────────────── */

let writeFixture: Promise<Fixture> | undefined;
/** A record of its own for the write tools, so nothing they change reaches a read. */
const writes = (): Promise<Fixture> => (writeFixture ??= build());

test('MCP: the matrix asks every one of the 17 tools', () => {
  assert.equal(TOOL_NAMES.length, 17, TOOL_NAMES.join(', '));
});

for (const tool of TOOL_NAMES) {
  const todo = MCP_OPEN[tool];
  test(`P1 MCP ${tool}: no caller is answered a canary or an id out of their sight`, todo ? { todo } : {}, async () => {
    const f = WRITES.has(tool) ? await writes() : await reads();
    const found: Found = new Map();
    for (const args of toolArgs(tool, f))
      for (const caller of f.callers) {
        const reply = (await callTool(f, tool, args, caller.ctx)) as { error?: unknown; threw?: string };
        assert.equal(reply.threw, undefined, `${tool} threw for ${caller.label}`);
        assert.equal(reply.error, undefined, `${tool} was a protocol error for ${caller.label}: ${JSON.stringify(reply.error)}`);
        /* WHAT THE CALLER SENT IS NOT A LEAK BACK TO THEM. */
        const given = JSON.stringify(args);
        const out = f.out(caller).filter((c) => !given.includes(c.word) && !(c.id !== undefined && given.includes(c.id)));
        for (const l of leaks(reply, out)) note(found, caller, `${l} <- ${given.slice(0, 80)}`);
      }
    assert.equal(found.size, 0, `${tool} answered what its caller may not see:\n${said(found)}`);
  });
}

test('P1 MCP resources: the list and every resource read carry no canary', async () => {
  const f = await reads();
  const fixed = ['braindog:page/kiln', 'braindog:page/spend', 'braindog:metric/tasks-count', 'braindog:metric/tasks-rate', 'braindog:metric/money-sum', 'braindog:inbox', 'braindog:declaration/kiln', ...LIST_IDS.map((l) => `braindog:schema/${l}`)];
  const found: Found = new Map();
  for (const caller of f.callers) {
    const listed = (await listResources(f, caller.ctx)) as { result?: { resources?: { uri: string }[] } };
    for (const l of leaks(listed, f.out(caller))) note(found, caller, `resources/list: ${l}`);
    const uris = new Set([...(listed.result?.resources ?? []).map((r) => r.uri), ...fixed]);
    for (const uri of uris) for (const l of leaks(await readResource(f, uri, caller.ctx), f.out(caller))) note(found, caller, `${uri}: ${l}`);
  }
  assert.equal(found.size, 0, said(found));
});

/* ── P2: non-interference ───────────────────────────────────────────────── */

/** An answer with what a caller may see move normalized away: cursors, and with `rank` the search scores. */
function normal(answer: unknown, drop: readonly string[] = ['cursor', 'next']): string {
  return JSON.stringify(answer, (key, value) => (drop.includes(key) ? undefined : value));
}

const P2_ROUTES = [...CORE, 'version'] as const;

for (const route of P2_ROUTES) {
  const todo = P2_OPEN[route];
  test(`P2 ${route}: every answer is the same after changes its caller cannot see`, todo ? { todo } : {}, async () => {
    const moved: string[] = [];
    for (const shape of SHAPES) {
      const f = await build();
      const h = handlers(f);
      const callers = f.callers.filter((c) => c.shape.id === shape.id);
      const asked = argsFor(route, f, true);
      const drop = route === 'search' ? ['cursor', 'next', 'rank'] : ['cursor', 'next'];
      const before = new Map<string, string>();
      for (const c of callers) for (const args of asked) before.set(`${c.label} ${JSON.stringify(args)}`, normal(await ask(h, route, args, c.ctx), drop));
      for (let round = 0; round < FUZZ; round++) {
        const did = await unseen(f, shape, 1_000 * round + SHAPES.indexOf(shape) + 1);
        for (const c of callers)
          for (const args of asked) {
            const now = normal(await ask(h, route, args, c.ctx), drop);
            if (now !== before.get(`${c.label} ${JSON.stringify(args)}`)) moved.push(`${c.label} on ${JSON.stringify(args).slice(0, 60)} after: ${did.join('; ')}`);
          }
      }
    }
    assert.deepEqual(moved.slice(0, 12), [], `${moved.length} answer(s) moved`);
  });
}

test('P2 search rank: a hit\'s rank is the same after rows its caller cannot see are written', { todo: GAP.N3 }, async () => {
  const moved: string[] = [];
  for (const shape of SHAPES.filter((s) => s.id !== 'adds')) {
    const f = await build();
    const h = handlers(f);
    const c = f.callers.find((x) => x.shape.id === shape.id && x.variant === 'person')!;
    const words = [...f.rows.values()].filter((r) => f.visible(c, r)).map((r) => r.canary.word);
    const before = await Promise.all(words.map(async (q) => JSON.stringify(await ask(h, 'search', { q }, c.ctx))));
    await unseen(f, shape, 99, 4);
    for (const [i, q] of words.entries()) if (JSON.stringify(await ask(h, 'search', { q }, c.ctx)) !== before[i]) moved.push(`${c.label} on ${q}`);
  }
  assert.deepEqual(moved, []);
});

/* ── P3: every count is the visible rows that match ─────────────────────── */

/** The rows of one list a caller may see, by the fixture's truth. */
const seen = (f: Fixture, c: Caller, list: string): RowInfo[] => [...f.rows.values()].filter((r) => r.list === list && f.visible(c, r));

test('P3 list, countBy and boot: matched, each count and the rail\'s counts are the visible rows', async () => {
  const f = await reads();
  const h = handlers(f);
  const wrong: string[] = [];
  for (const c of f.callers) {
    const boot = (await ask(h, 'boot', {}, c.ctx)) as { ok: boolean; value?: { registers: { id: string; count: number }[] } };
    for (const list of LIST_IDS) {
      const listed = (await ask(h, 'list', { register: list, limit: 100 }, c.ctx)) as { ok: boolean; value?: { matched: number; rows: unknown[] } };
      if (!listed.ok) continue;
      const want = seen(f, c, list).length;
      if (listed.value!.matched !== want || listed.value!.rows.length !== want) wrong.push(`${c.label} list ${list}: matched ${listed.value!.matched}, rows ${listed.value!.rows.length}, sees ${want}`);
      const counted = (await ask(h, 'countBy', { register: list, by: list === 'tasks' ? 'stage' : LIST_IDS.includes(list) ? 'thing' : 'name' }, c.ctx)) as { ok: boolean; value?: { matched: number; counts: { n: number }[] } };
      if (counted.ok && counted.value!.matched !== want) wrong.push(`${c.label} countBy ${list}: matched ${counted.value!.matched}, sees ${want}`);
      const rail = boot.ok ? boot.value!.registers.find((r) => r.id === list) : undefined;
      if (rail && rail.count !== want) wrong.push(`${c.label} boot ${list}: count ${rail.count}, sees ${want}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('P3 search: matched counts the rows the caller is shown, by list', { todo: GAP.G5 }, async () => {
  const f = await reads();
  const h = handlers(f);
  const wrong: string[] = [];
  for (const c of f.callers)
    for (const q of ['kiln', 'loom', 'private']) {
      const found = (await ask(h, 'search', { q, limit: 100 }, c.ctx)) as { ok: boolean; value?: { hits: { register: string }[]; matched: Record<string, number> } };
      if (!found.ok) continue;
      const shown: Record<string, number> = {};
      for (const hit of found.value!.hits) shown[hit.register] = (shown[hit.register] ?? 0) + 1;
      for (const [list, n] of Object.entries(found.value!.matched)) if (n !== (shown[list] ?? 0)) wrong.push(`${c.label} "${q}" ${list}: matched ${n}, shown ${shown[list] ?? 0}`);
    }
  assert.deepEqual(wrong.slice(0, 12), [], `${wrong.length} count(s) wrong`);
});

test('P3 page: a block\'s matched and its filter\'s pill counts are the visible rows', { todo: GAP.N2 }, async () => {
  const f = await reads();
  const h = handlers(f);
  const wrong: string[] = [];
  for (const c of f.callers) {
    const page = (await ask(h, 'page', { slug: 'kiln' }, c.ctx)) as {
      ok: boolean;
      value?: { blocks: { key?: string; matched: number; refusals?: unknown[] }[]; filters?: { field: string; values: { value: string; count?: number }[] }[] };
    };
    if (!page.ok) continue;
    const want = seen(f, c, 'tasks');
    const block = page.value!.blocks.find((b) => b.key === 'tasks')!;
    if (!block.refusals?.length && block.matched !== want.length) wrong.push(`${c.label} block: matched ${block.matched}, sees ${want.length}`);
    for (const filter of page.value!.filters ?? [])
      for (const v of filter.values) {
        const n = want.filter((r) => r.stage === v.value).length;
        if (v.count !== undefined && v.count !== n) wrong.push(`${c.label} pill ${filter.field}=${v.value}: ${v.count}, sees ${n}`);
      }
  }
  assert.deepEqual(wrong, []);
});

test('P3 metric: a figure is a sum over the visible amounts only', { todo: GAP.G4 }, async () => {
  const f = await reads();
  const h = handlers(f);
  const wrong: string[] = [];
  for (const c of f.callers) {
    for (const [metric, list] of [['tasks-rate', 'tasks'], ['money-sum', 'money']] as const) {
      const got = (await ask(h, 'metric', { metric }, c.ctx)) as { ok: boolean; value?: { value: number } };
      if (!got.ok) continue;
      const want = seen(f, c, list).reduce((sum, r) => sum + (r.canary.amount ?? 0), 0);
      if (got.value!.value !== want) wrong.push(`${c.label} ${metric}: ${got.value!.value}, visible ${want}`);
    }
  }
  assert.deepEqual(wrong, []);
});

/* ── P4: a hidden row is refused as a missing one ───────────────────────── */

test('P4 get, history, comments and MCP get: a row out of sight answers as a row number nobody holds', async () => {
  const f = await reads();
  const h = handlers(f);
  const unlike: string[] = [];
  /* THE NAME ASKED IS THE CALLER'S OWN, and so is a JSON-RPC message's id: both are masked, and nothing else is. */
  const masked = (answer: unknown, ...names: string[]) => {
    const { id: _id, ...rest } = (answer ?? {}) as Record<string, unknown>;
    return names.reduce((s, n) => s.replaceAll(n, '<asked>'), JSON.stringify(rest));
  };
  for (const c of f.callers)
    for (const r of [...f.rows.values()].filter((x) => !f.visible(c, x))) {
      const spoken = f.spoken(r);
      const missing = r.list === 'tasks' ? 'TK999' : r.list === 'money' ? 'MO999' : `${r.list}#999`;
      const pairs: [string, unknown, unknown][] = [
        ['get', await ask(h, 'get', { register: r.list, seq: r.seq }, c.ctx), await ask(h, 'get', { register: r.list, seq: 999 }, c.ctx)],
        ['history', await ask(h, 'history', { register: r.list, seq: r.seq }, c.ctx), await ask(h, 'history', { register: r.list, seq: 999 }, c.ctx)],
        ['comments', await ask(h, 'comments', { on: spoken }, c.ctx), await ask(h, 'comments', { on: missing }, c.ctx)],
        ['mcp get', await callTool(f, 'get', { spoken }, c.ctx), await callTool(f, 'get', { spoken: missing }, c.ctx)],
        ['mcp history', await callTool(f, 'history', { spoken }, c.ctx), await callTool(f, 'history', { spoken: missing }, c.ctx)],
      ];
      for (const [what, hidden, none] of pairs) if (masked(hidden, spoken) !== masked(none, missing)) unlike.push(`${c.label} ${what} ${r.canary.label}`);
    }
  assert.deepEqual(unlike.slice(0, 12), [], `${unlike.length} refusal(s) told a hidden row from a missing one`);
});

test('P4 backlinks: a row out of sight answers as a row number nobody holds', { todo: GAP.G3 }, async () => {
  const f = await reads();
  const h = handlers(f);
  const unlike: string[] = [];
  for (const c of f.callers)
    for (const r of [...f.rows.values()].filter((x) => !f.visible(c, x))) {
      const hidden = JSON.stringify(await ask(h, 'backlinks', { register: r.list, seq: r.seq }, c.ctx)).replaceAll(`"seq":${r.seq}`, '"seq":0');
      const none = JSON.stringify(await ask(h, 'backlinks', { register: r.list, seq: 999 }, c.ctx)).replaceAll('"seq":999', '"seq":0').replaceAll('"seq":null', '"seq":0');
      if (hidden !== none) unlike.push(`${c.label} ${r.canary.label}`);
    }
  assert.deepEqual(unlike.slice(0, 12), [], `${unlike.length} answer(s) told a hidden row from a missing one`);
});

/* ── P5's first half, G1: a write outside the rule is refused ───────────── */

test('P5 a narrowed writer cannot edit, delete, note or create a row outside its rule, and nobody writes another person\'s private row', { todo: GAP.G1 }, async () => {
  const f = await build();
  const h = handlers(f);
  const contractor = personCtx(f.api, 'p_con');
  const loom = f.rows.get('t-loom-todo')!;
  const own = f.rows.get('t-sam-kiln')!;
  const got: string[] = [];
  const refused = async (what: string, route: string, args: Args, ctx: CallContext) => {
    const answer = (await ask(h, route, args, ctx)) as { ok?: boolean };
    if (answer.ok !== false) got.push(`${what} was let through`);
  };
  await refused('the contractor editing a Loom task', 'update', { register: 'tasks', seq: loom.seq, patch: { notes: 'mine now' } }, contractor);
  await refused('the contractor deleting a Loom task', 'update', { register: 'tasks', seq: f.rows.get('t-loom-review')!.seq, patch: { deleted_at: new Date().toISOString() } }, contractor);
  await refused('the contractor noting a Loom task', 'log', { register: 'tasks', seq: loom.seq, note: 'Seen.' }, contractor);
  await refused('the contractor adding a task on Loom', 'create', { register: 'tasks', fields: { name: 'On Loom', thing: f.built.ids.loom } }, contractor);
  await refused('the contractor moving a Kiln task to Loom', 'update', { register: 'tasks', seq: f.rows.get('t-kiln-todo')!.seq, patch: { thing: f.built.ids.loom } }, contractor);
  await refused("the owner editing Sam's private task", 'update', { register: 'tasks', seq: own.seq, patch: { notes: 'seen' } }, f.owner);
  await refused("the contractor editing Sam's private Kiln task", 'update', { register: 'tasks', seq: own.seq, patch: { notes: 'seen' } }, contractor);
  assert.deepEqual(got, []);
});

/* ── G6 to G8: the version poll and the local copy ──────────────────────── */

test('G6 the version poll of a reader held to Kiln agrees with a fresh read after her newest row leaves Kiln, and after her rule changes', { todo: GAP.G6 }, async () => {
  const f = await build({ shapes: SHAPES.filter((s) => s.id === 'kiln-reader' || s.id === 'owner') });
  const h = handlers(f);
  const version = async (ctx: CallContext, api = f.api) => ((await ask(api === f.api ? h : handlers({ ...f, api }), 'version', {}, ctx)) as { value: { version: number } }).value.version;
  const fresh = async (ctx: CallContext) => version(ctx, await createRecordApi({ sql: f.sql, clock: f.clock }));
  const write = async (seq: number, patch: Record<string, unknown>) => assert.ok(((await ask(h, 'update', { register: 'tasks', seq, patch }, f.owner)) as { ok: boolean }).ok);
  const kim = personCtx(f.api, 'p_kim');
  const first = await version(kim);
  /* AN EDIT TO A ROW SHE CANNOT SEE IS NOT NEWS TO HER. */
  await write(f.rows.get('t-loom-todo')!.seq, { notes: 'yarn bought' });
  assert.equal(await version(kim), first, 'an edit outside her rule moved her version');
  /* HER NEWEST LINE IS AN EDIT TO A KILN TASK; THEN THE TASK MOVES TO LOOM, AND THAT LINE IS NO LONGER HERS. The cached
     poll trusts the move as a row write that leaves older lines alone, and keeps a line she can no longer see. */
  const kiln = f.rows.get('t-kiln-todo')!;
  await write(kiln.seq, { notes: 'glazed' });
  await version(kim);
  await write(kiln.seq, { thing: f.built.ids.loom });
  assert.equal(await version(kim), await fresh(kim), 'after a move out of her rule the cached version is not a fresh read\'s');
  /* AND THE SAME PERSON UNDER ANOTHER RULE IS THE SAME CACHE KEY. */
  f.sql.exec("UPDATE member SET row_where = ? WHERE person_id = 'p_kim' AND register = 'tasks'", JSON.stringify({ field: 'stage', is: 'done' }));
  const narrowed = personCtx(f.api, 'p_kim');
  assert.equal(await version(narrowed), await fresh(narrowed), 'a changed rule is answered the version cached for the old one');
});

test('G7 narrowing a colleague changes the fingerprint her local copy is kept under', { todo: GAP.G7 }, async () => {
  const f = await build({ shapes: SHAPES.filter((s) => s.id === 'kiln-reader' || s.id === 'owner') });
  const h = handlers(f);
  const me = async () => ((await ask(h, 'boot', {}, personCtx(f.api, 'p_kim'))) as { value: { me: Parameters<typeof scopeOf>[0] } }).value.me;
  const before = scopeOf(await me());
  /* THE OWNER NARROWS HER FROM KILN'S TASKS TO REVIEW ONLY: the copy holds rows she may no longer read. */
  f.sql.exec("UPDATE member SET row_where = ? WHERE person_id = 'p_kim' AND register = 'tasks'", JSON.stringify({ field: 'stage', is: 'review' }));
  assert.notEqual(scopeOf(await me()), before);
});

test('G8 a removed member\'s poll is answered in a way the app wipes the copy on', { todo: GAP.G8 }, async () => {
  const f = await build({ shapes: SHAPES.filter((s) => s.id === 'whole' || s.id === 'owner') });
  assert.ok(((await f.api.removeMember({ person: 'p_vera' } as never, f.owner)) as { ok: boolean }).ok);
  /* THE DOOR ASKS `access`, finds nothing, and answers 403 (`apps/worker/src/session.ts`, `heldBy`). */
  assert.equal(f.api.kernel.access('p_vera'), null);
  const web = (path: string) => readFileSync(fileURLToPath(new URL(`../../../apps/web/src/${path}`, import.meta.url)), 'utf8');
  assert.ok(/code === 'FORBIDDEN'|status === 403/u.test(web('lib/data/live.svelte.ts')), 'the poll wipes the copy only on UNAUTHORIZED, and a removed member is answered FORBIDDEN');
  assert.ok(/status === 403/u.test(web('service-worker.ts')), 'the service worker deletes the copy only on a 401');
});

/* ── the shapes the matrix could not build yet ──────────────────────────── */

test('SHAPES: the §4.2 grants not buildable before shares are wired wait on their slices', { todo: 'hidden field (G9), comment rung (G10), groups, time, once and deny (G11), child tokens and See as: Slice 5 onward' }, () => {
  const built = new Set(SHAPES.map((s: Shape) => s.id));
  for (const wanted of ['hidden-field', 'comment', 'group', 'expired', 'hours', 'once', 'deny', 'child-token', 'see-as']) assert.ok(built.has(wanted), wanted);
});
