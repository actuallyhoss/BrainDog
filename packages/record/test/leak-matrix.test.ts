/**
 * The leak matrix (sharing plan §4, Slice 2): every grant shape that can be built today, held to what it may see on
 * every read path, before any of the sharing work changes a reader.
 *
 * ROWS ARE THE SHAPES (`leak/fixture.ts`): the owner, a whole-record view, the five share templates as today's member
 * rows emulate them (assistant, accountant, contractor on Kiln, reviewer as a condition, one row), a whole-record reader
 * held to Kiln's tasks, adds only, and Sam who keeps rows private; and the same grants made as real shares through the
 * share API, with a deny inside an allow, an expired share, a group's share and the comment rung. Each runs as the person,
 * a write-scope token and a read-scope token, and each share grantee also as the owner seeing as them. COLUMNS ARE THE READ PATHS (`leak/routes.ts`, `leak/mcp.ts`): every READ+ and DATA route that changes
 * nothing, through the host's handler table, and all 17 MCP tools and the resources, through `serveMcp`.
 *
 * THE PROPERTIES ARE §4.4's: P1 (no canary or out-of-sight id in any answer) on every path; P2 (non-interference: an
 * answer is the same after changes the caller cannot see), P3 (every count is the visible rows that match) and P4 (a
 * hidden row is refused as a missing one) on the twelve core routes; P5's first half for G1. And T6 (§2.14): a filter, a
 * sort, a search, a count and a preview that name a field hidden from the caller answer as a field the list does not
 * have, whatever it holds, and the doors' firewall takes nothing off any answer the matrix is given.
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
import { build, personCtx, SHAPES, unseen, variantsOf, type Caller, type Fixture, type RowInfo, type Shape } from './leak/fixture.ts';
import { argsFor, ask, CORE, FIREWALLED, handlers, LIST_IDS, READ_ROUTES, walked, type Args } from './leak/routes.ts';
import { callTool, listResources, readResource, TOOL_NAMES, toolArgs, WRITES } from './leak/mcp.ts';

const FUZZ = Number(process.env.LEAK_FUZZ ?? 2);

/**
 * The gaps §1.2 names, and the ones this matrix found that it does not (`N<n>`), by the test they hold open.
 * Each line is the todo's own sentence, so the run lists it. Slices 3 and 4 closed G1 to G6 and N1 to N3 (`sight.ts`).
 */
const GAP = {
  G7: 'G7 the local copy\'s fingerprint (scopeOf) omits rules, so narrowing a colleague leaves the copy as it was',
  G8: 'G8 a removed member\'s poll is answered 403, and the app and the service worker wipe the copy only on a 401',
} as const;

/** Which P1 tests are held open by a gap: the route, and the sentence. */
const P1_OPEN: Record<string, string> = {};
const MCP_OPEN: Record<string, string> = {};
/** And which P2 tests: an answer that moves when something unseen does. */
const P2_OPEN: Record<string, string> = {};

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
  /* AND A FIELD HIDDEN FROM A SHAPE IS A CANARY ON EVERY ROW IT SEES: the owner's tasks carry the notes and rates. */
  const hid = f.callers.find((c) => c.shape.id === 'hidden-field' && c.variant === 'person')!;
  const held = leaks(listed, f.out(hid));
  assert.ok(held.some((l) => l.includes('hidden notes')) && held.some((l) => l.includes('hidden rate')), held.join('\n'));
  const sorted = (h: Readonly<Record<string, readonly string[]>> | undefined) => Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k, [...v].sort()]));
  for (const shape of SHAPES.filter((s) => s.hides)) assert.deepEqual(sorted(personCtx(f.api, shape.person).hides), sorted(shape.hides), shape.id);
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
        /* A PAGE BODY SHE DRAFTED IS ECHOED AS SHE WROTE IT, an id she typed in a block's `where` among it, which is no
           leak back to her. Only that echo is left out; the rows the preview draws are still read for canaries. */
        const read = route === 'previewPage' ? JSON.parse(JSON.stringify(answer, (k, v) => (k === 'where' ? undefined : v))) : answer;
        for (const l of leaks(read, f.out(caller))) note(found, caller, `${l} <- ${JSON.stringify(args).slice(0, 80)}`);
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

test('P2 search rank: a hit\'s rank is the same after rows its caller cannot see are written', async () => {
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

test('P3 search: matched counts the rows the caller is shown, by list', async () => {
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

test('P3 page: a block\'s matched and its filter\'s pill counts are the visible rows', async () => {
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

test('P3 metric: a figure is a sum over the visible amounts only', async () => {
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

test('P4 backlinks: a row out of sight answers as a row number nobody holds', async () => {
  const f = await reads();
  const h = handlers(f);
  const unlike: string[] = [];
  for (const c of f.callers)
    for (const r of [...f.rows.values()].filter((x) => !f.visible(c, x))) {
      /* BOTH ARE ANSWERED AS THE KERNEL ANSWERS A ROW THAT IS NOT THERE, `seq: null` (`read.test.ts`), or with the number asked. */
      const hidden = JSON.stringify(await ask(h, 'backlinks', { register: r.list, seq: r.seq }, c.ctx)).replaceAll(`"seq":${r.seq}`, '"seq":0').replaceAll('"seq":null', '"seq":0');
      const none = JSON.stringify(await ask(h, 'backlinks', { register: r.list, seq: 999 }, c.ctx)).replaceAll('"seq":999', '"seq":0').replaceAll('"seq":null', '"seq":0');
      if (hidden !== none) unlike.push(`${c.label} ${r.canary.label}`);
    }
  assert.deepEqual(unlike.slice(0, 12), [], `${unlike.length} answer(s) told a hidden row from a missing one`);
});

/* ── P5's first half (G1, closed in Slice 4): a write outside the rule is refused ── */

test('P5 a narrowed writer cannot edit, delete, note or create a row outside its rule, and nobody writes another person\'s private row', async () => {
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

test('G6 the version poll of a reader held to Kiln agrees with a fresh read after her newest row leaves Kiln, and after her rule changes', async () => {
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

test('SHAPES: the §4.2 grants made as real shares are in the matrix, each also seen as by the owner', () => {
  const built = new Set(SHAPES.map((s: Shape) => s.id));
  for (const wanted of ['sh-whole', 'sh-accountant', 'sh-contractor', 'sh-condition', 'sh-one-row', 'deny', 'expired', 'group', 'comment']) assert.ok(built.has(wanted), wanted);
  for (const s of SHAPES.filter((x) => x.shares)) assert.ok(variantsOf(s).includes('see-as'), s.id);
});

test('SHAPES: the §4.2 hidden fields are in the matrix, the rate and notes of tasks, and every amount', () => {
  const built = new Set(SHAPES.map((s: Shape) => s.id));
  for (const wanted of ['hidden-field', 'hide-amounts']) assert.ok(built.has(wanted), wanted);
});

test('SHAPES: the §4.2 grants that wait on later slices', { todo: 'outside its hours, once after it ran out, and child tokens (Slice 9)' }, () => {
  const built = new Set(SHAPES.map((s: Shape) => s.id));
  for (const wanted of ['hours', 'once', 'child-token']) assert.ok(built.has(wanted), wanted);
});

/* ── T6: guessing a hidden value through a filter, a sort, a search, a count or a preview ── */

/** Every caller from whom a field is hidden, with each list and the fields hidden there. */
const hiders = (f: Fixture) => f.callers.filter((c) => c.shape.hides).flatMap((c) => Object.entries(c.shape.hides!).map(([list, fields]) => ({ c, list, fields })));

/** An answer as text with one word put for another, so two answers that differ only in a name they were asked by compare. */
const said_as = (answer: unknown, from: string, to: string): string => JSON.stringify(answer).replaceAll(from, to);

test('T6 a filter, a sort and a count by a hidden field answer as a field the list does not have', async () => {
  const f = await reads();
  const h = handlers(f);
  const unlike: string[] = [];
  for (const { c, list, fields } of hiders(f))
    for (const field of fields) {
      const asks: [string, string, (x: string) => Args][] = [
        ['filter', 'list', (x) => ({ register: list, where: { field: x, present: true } })],
        ['filter in words', 'list', (x) => ({ register: list, where: `${x} is empty` })],
        ['sort', 'list', (x) => ({ register: list, order: [{ field: x, dir: 'desc' }] })],
        ['count by', 'countBy', (x) => ({ register: list, by: x })],
        ['count with a filter', 'countBy', (x) => ({ register: list, by: 'thing', where: { field: x, present: true } })],
      ];
      for (const [what, route, args] of asks) {
        const hidden = (await ask(h, route, args(field), c.ctx)) as { ok?: boolean; refusal?: { code: string } };
        const none = await ask(h, route, args('nosuch'), c.ctx);
        if (hidden.ok !== false) unlike.push(`${c.label} ${what} ${list}.${field} was answered`);
        else if (said_as(hidden, field, 'nosuch') !== JSON.stringify(none)) unlike.push(`${c.label} ${what} ${list}.${field}: ${JSON.stringify(hidden).slice(0, 160)} | ${JSON.stringify(none).slice(0, 160)}`);
      }
      /* AND THE SCHEMA SHE IS HANDED HAS NO SUCH FIELD. */
      const schema = (await ask(h, 'schema', { register: list }, c.ctx)) as { ok: boolean; value?: { fields: { id: string }[] } };
      if (schema.ok && schema.value!.fields.some((x) => x.id === field)) unlike.push(`${c.label} schema ${list} names ${field}`);
    }
  assert.deepEqual(unlike.slice(0, 12), [], `${unlike.length} answer(s) told a hidden field from a missing one`);
});

test('T6 a search for what a hidden field holds answers as a search for a word nobody wrote', async () => {
  const f = await reads();
  const h = handlers(f);
  const unlike: string[] = [];
  const nobody = 'zh00000000';
  for (const c of f.callers.filter((x) => x.shape.hides?.tasks?.includes('notes')))
    for (const r of [...f.rows.values()].filter((x) => f.visible(c, x)))
      for (const held of r.held.filter((x) => x.word)) {
        const hidden = await ask(h, 'search', { q: held.word }, c.ctx);
        const none = await ask(h, 'search', { q: nobody }, c.ctx);
        if (said_as(hidden, held.word!, nobody) !== JSON.stringify(none)) unlike.push(`${c.label} ${r.canary.label}: ${JSON.stringify(hidden).slice(0, 200)}`);
        /* AND THE SAME OVER MCP. */
        const tool = await callTool(f, 'search', { q: held.word, format: 'json' }, c.ctx);
        const toolNone = await callTool(f, 'search', { q: nobody, format: 'json' }, c.ctx);
        const strip = (x: unknown) => said_as({ ...(x as Record<string, unknown>), id: 0 }, held.word!, nobody);
        if (strip(tool) !== JSON.stringify({ ...(toolNone as Record<string, unknown>), id: 0 })) unlike.push(`${c.label} mcp ${r.canary.label}`);
        /* AND THE ROW IS STILL FOUND BY WHAT SHE IS SHOWN OF IT, its title, searched by `contains` and not the index. */
        const own = (await ask(h, 'search', { q: r.canary.word }, c.ctx)) as { ok: boolean; value?: { hits: { seq: number }[]; matched: Record<string, number> } };
        if (!own.ok || !own.value!.hits.some((x) => x.seq === r.seq) || own.value!.matched.tasks !== 1) unlike.push(`${c.label} ${r.canary.label} not found by its own word`);
      }
  assert.deepEqual(unlike.slice(0, 12), [], `${unlike.length} search(es) told what a hidden field holds`);
});

test('T6 a preview whose block names a hidden field is held, and answers the same whatever it asks of the field', async () => {
  const f = await reads();
  const h = handlers(f);
  const unlike: string[] = [];
  for (const { c, list, fields } of hiders(f))
    for (const field of fields) {
      const page = (block: Record<string, unknown>) => ({ body: { page: 'probe', title: 'Probe', requires: [`register.${list}`], blocks: [block] } });
      const bare = { kind: 'table', key: 'probe', source: `register.${list}`, columns: [{ field: list === 'money' ? 'payee' : 'name' }] };
      const table = (where: unknown) => ({ ...bare, where });
      const asks: [string, Record<string, unknown>, Record<string, unknown>][] = [
        ['where present', table({ field, present: true }), table({ field, present: false })],
        ['column', { ...bare, columns: [{ field }] }, { ...bare, columns: [{ field }, { field: 'thing' }] }],
        ['order', { ...bare, order: [{ field, dir: 'asc' }] }, { ...bare, order: [{ field, dir: 'desc' }] }],
      ];
      if (field === 'notes') {
        const r = [...f.rows.values()].find((x) => x.list === list && f.visible(c, x) && x.held.some((y) => y.word))!;
        asks.push(['where contains', table({ field, contains: r.held.find((y) => y.word)!.word }), table({ field, contains: 'zh00000000' })]);
      }
      for (const [what, one, other] of asks) {
        const a = (await ask(h, 'previewPage', page(one), c.ctx)) as { ok: boolean; value?: { blocks: { rows?: unknown[]; refusals?: unknown[] }[] } };
        const b = await ask(h, 'previewPage', page(other), c.ctx);
        const block = a.ok ? a.value!.blocks[0] : undefined;
        if (a.ok && (!block?.refusals?.length || block.rows?.length)) unlike.push(`${c.label} ${what} ${list}.${field} was drawn`);
        const shell = (x: unknown) => JSON.stringify(x, (k, v) => (k === 'where' || k === 'columns' || k === 'order' || k === 'blocks' ? undefined : v));
        const blocks = (x: unknown) => JSON.stringify(((x as { value?: { blocks?: { refusals?: unknown; rows?: unknown; matched?: unknown }[] } }).value?.blocks ?? []).map((y) => [y.refusals, y.rows, y.matched]));
        if (shell(a) !== shell(b) || blocks(a) !== blocks(b)) unlike.push(`${c.label} ${what} ${list}.${field}: ${blocks(a).slice(0, 160)} | ${blocks(b).slice(0, 160)}`);
      }
    }
  assert.deepEqual(unlike.slice(0, 12), [], `${unlike.length} preview(s) told what a hidden field holds`);
});

test('T6 figures over a list with a hidden field are answered to nobody it is hidden from', async () => {
  const f = await reads();
  const h = handlers(f);
  const told: string[] = [];
  for (const { c, list } of hiders(f)) {
    for (const metric of ['tasks-count', 'tasks-rate', 'money-sum'].filter((m) => m.startsWith(list === 'money' ? 'money' : 'tasks'))) {
      const got = (await ask(h, 'metric', { metric }, c.ctx)) as { ok: boolean };
      if (got.ok) told.push(`${c.label} metric ${metric}`);
    }
    const listed = (await ask(h, 'figures', {}, c.ctx)) as { ok: boolean; value?: { list: string | null }[] };
    if (listed.ok && listed.value!.some((x) => x.list === list)) told.push(`${c.label} figures name one over ${list}`);
  }
  assert.deepEqual(told, []);
});

/* ── the firewall: nothing it would take off, across the whole matrix ──── */

test('FIREWALL: no answer across the whole matrix had a hidden field taken off at a door, and no fault was raised', async () => {
  assert.deepEqual(FIREWALLED.slice(0, 12), [], `${FIREWALLED.length} answer(s) carried a hidden field to the door`);
  for (const f of [await reads(), await writes()]) {
    const faults = f.api.kernel.faults();
    assert.ok(faults.ok);
    assert.deepEqual(faults.value.faults.filter((x) => x.kind === 'lens.firewall'), []);
  }
});
