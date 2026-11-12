/**
 * What a project runs on says which agents used each thing and how often, and how many reach it from everywhere.
 *
 * HIS PROJECT PAGES NAMED ONE AGENT AT MOST beside a key or a tool, the one whose run used it last, and a block that
 * showed five of what applies everywhere could not say how many more there were. Each row now says `used_runs`, how many
 * runs used it in ninety days, and `used_agents`, the agents of those runs by name, newest first and three at most; the
 * block's answer says `inherited`, how many it kept that apply everywhere, counted before its `limit:` cut them.
 *
 * ON A REAL RECORD: the lists are declared, the runs made, and every use is a write of a tool's `seen` signed by a run,
 * at the hour the clock was set to, so each answer below comes through the record's own wiring (`k.page`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { readBlock, type PageBlock, type PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;
const OWNER = { actor: 'p_1' };

const list = (id: string, name: string, title: string, fields: Record<string, unknown>[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title, fields, ...more } as never,
});

const WHERE = { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person', same: 'nearer' } };
const STATE = { id: 'state', type: 'enum', values: ['active', 'retired'], default: 'active' };
const LISTS: Declaration[] = [
  list('things', 'Projects', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }], { scopes: { repos: 'repos' } }),
  list('credentials', 'Keys', 'label', [{ id: 'label', type: 'text', required: true }, { id: 'opens', type: 'text' }, { ...WHERE, scope: { widen: 'person' } }, STATE], {
    state: 'state',
    done: ['retired'],
  }),
  list('tools', 'Tools', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'seen', type: 'instant' }, WHERE, STATE], { state: 'state', done: ['retired'] }),
  list('skills', 'Skills', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'rev', type: 'int', default: 1 }, WHERE, STATE], { state: 'state', done: ['retired'] }),
];

/** A page of `runs_on` blocks about one project: everything, the project's own, and two of everywhere's. */
const pageAbout = (page: string, about: string): Declaration => ({
  id: `page.${page}`,
  kind: 'page',
  body: {
    page,
    title: page,
    blocks: [
      { kind: 'table', heading: 'All', source: 'runs_on', about },
      { kind: 'table', heading: 'Own', source: 'runs_on', about, where: 'scope is project' },
      { kind: 'cards', heading: 'And from everywhere', source: 'runs_on', about, where: 'scope is global', limit: 2 },
    ],
  } as never,
});

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

type Drawn = { heading?: string; rows: Entry[]; matched?: number; inherited?: number; refusals?: unknown[] };

/**
 * The record: Kiln with a key, a tool and a skill of its own, Portage with a tool of its own, Oxbow with nothing of its
 * own, and three tools, two skills and a key for everywhere. Six runs: two of Claude Code, and one each of Codex, Cursor, Gemini and an older Codex.
 */
async function record() {
  const clock = fixedClock(NOW - 200 * DAY);
  const k: Kernel = await openRecord(openSqlite(), clock);
  value(await k.install([...LISTS, pageAbout('kiln', 'things#1'), pageAbout('portage', 'things#2'), pageAbout('oxbow', 'things#3')]));
  value(k.create('things', { name: 'Kiln' }, OWNER));
  value(k.create('things', { name: 'Portage' }, OWNER));
  value(k.create('things', { name: 'Oxbow' }, OWNER));
  const tool = (name: string, project?: string): string => value<Entry>(k.create('tools', { name, ...(project ? { project } : {}) }, OWNER)).id;
  const tools = { kiln: tool('kiln-mcp', 'things#1'), portage: tool('portage-cli', 'things#2'), github: tool('github'), search: tool('search'), idle: tool('weather') };
  value(k.create('credentials', { label: 'Kiln deploy key', opens: 'Deploys Kiln', project: 'things#1' }, OWNER));
  value(k.create('credentials', { label: 'Shared mail key', opens: 'Sends mail' }, OWNER));
  value(k.create('skills', { name: 'kiln-release', project: 'things#1' }, OWNER));
  value(k.create('skills', { name: 'review-pr' }, OWNER));
  value(k.create('skills', { name: 'deploy' }, OWNER));
  const run = (agent: string, client?: string): string =>
    `S${value<Entry>(k.create('session', { doing: 'Work', agent, state: 'done', ...(client ? { client } : {}) }, { ...OWNER, stamp: { project: '' } })).seq}`;
  const runs = { claude: run('claude', 'claude-code'), codex: run('codex'), cursor: run('cursor'), gemini: run('gemini'), claude2: run('claude', 'claude-code'), old: run('codex') };
  /** A use: the run writes the tool's `seen` the given number of days before now, at that hour on the clock. */
  const use = (id: string, actor: string, daysAgo: number): void => {
    clock.set(NOW - daysAgo * DAY);
    value(k.update('tools', id, { seen: new Date(NOW - daysAgo * DAY).toISOString() }, { actor }));
  };
  use(tools.kiln, runs.old, 100);
  use(tools.kiln, runs.claude, 10);
  use(tools.kiln, runs.codex, 8);
  use(tools.kiln, runs.cursor, 6);
  use(tools.kiln, runs.codex, 5);
  use(tools.kiln, OWNER.actor, 4.5);
  use(tools.kiln, runs.claude2, 4);
  use(tools.kiln, runs.gemini, 2);
  use(tools.portage, runs.cursor, 3);
  use(tools.github, runs.codex, 1);
  use(tools.search, runs.old, 95);
  clock.set(NOW);
  return { k, runs };
}

const page = (k: Kernel, slug: string): Record<string, Drawn> => {
  const out = value<{ blocks: Drawn[] }>(k.page(slug));
  for (const b of out.blocks) assert.deepEqual(b.refusals ?? [], [], `${String(b.heading)}: ${JSON.stringify(b.refusals)}`);
  return Object.fromEntries(out.blocks.map((b) => [String(b.heading), b]));
};

const named = (rows: Entry[], name: string): Entry['fields'] => {
  const found = rows.find((r) => r.fields.name === name);
  assert.ok(found, `no row is named ${name}`);
  return found.fields;
};

const GLOBAL = ['Shared mail key', 'github', 'search', 'weather', 'deploy', 'review-pr'];

test("THE PROJECT'S OWN COME FIRST, then what applies everywhere, and another project's are on neither", async () => {
  const { k } = await record();
  const all = page(k, 'kiln').All!;
  assert.deepEqual(
    all.rows.map((r) => [r.fields.name, r.fields.scope]),
    [['Kiln deploy key', 'project'], ['kiln-mcp', 'project'], ['kiln-release', 'project'], ...GLOBAL.map((n) => [n, 'global'])],
  );
  assert.equal(all.matched, 9);
  assert.equal(all.inherited, 6);
  assert.ok(!all.rows.some((r) => r.fields.name === 'portage-cli'), "Portage's tool is on Kiln's page");
});

test('USED_RUNS COUNTS EACH RUN ONCE OVER NINETY DAYS, and USED_AGENTS NAMES THEIR AGENTS newest first, three at most', async () => {
  const { k, runs } = await record();
  const tool = named(page(k, 'kiln').All!.rows, 'kiln-mcp');
  /* SEVEN WRITES BY RUNS IN THE WINDOW, from five runs: Codex twice, and a person's write between them is no run's. */
  assert.equal(tool.used_runs, 5);
  /* GEMINI LAST, THEN CLAUDE CODE'S SECOND RUN, THEN CODEX: Claude Code's first run and Cursor are past the three. */
  assert.equal(tool.used_agents, 'Gemini, Claude Code, Codex');
  /* THE ONE AGENT OF THE LAST RUN STAYS AS IT WAS, for the pages that name it. */
  assert.equal(tool.used_agent, 'Gemini');
  assert.equal(tool.used_by, runs.gemini);
  assert.equal(tool.used_at, new Date(NOW - 2 * DAY).toISOString());
});

test('A RUN OLDER THAN NINETY DAYS IS NOT COUNTED, and a thing nobody used says 0 and names nobody', async () => {
  const { k, runs } = await record();
  const rows = page(k, 'kiln').All!.rows;
  assert.deepEqual([named(rows, 'github').used_runs, named(rows, 'github').used_agents], [1, 'Codex']);
  /* USED 95 DAYS AGO: still the last use, and no run of the window. */
  const old = named(rows, 'search');
  assert.deepEqual([old.used_runs, old.used_agents, old.used_by], [0, null, runs.old]);
  for (const name of ['weather', 'Kiln deploy key', 'Shared mail key', 'kiln-release', 'deploy'])
    assert.deepEqual([named(rows, name).used_runs, named(rows, name).used_agents], [0, null], name);
});

test('NAMES, NEVER RUN IDS: no agents line on any page holds a run handle', async () => {
  const { k } = await record();
  for (const slug of ['kiln', 'portage', 'oxbow'])
    for (const r of page(k, slug).All!.rows) {
      const said = r.fields.used_agents;
      assert.ok(said === null || (typeof said === 'string' && !/\bS[0-9]+\b/u.test(said)), `${slug}: ${String(said)}`);
    }
  assert.equal(named(page(k, 'portage').All!.rows, 'portage-cli').used_agents, 'Cursor');
});

test('INHERITED IS EVERY ROW KEPT THAT APPLIES EVERYWHERE, counted before the block cut them to two', async () => {
  const { k } = await record();
  const blocks = page(k, 'kiln');
  const everywhere = blocks['And from everywhere']!;
  assert.deepEqual(everywhere.rows.map((r) => r.fields.name), GLOBAL.slice(0, 2));
  assert.equal(everywhere.inherited, 6, 'a block of two cannot say four more');
  assert.equal(everywhere.matched, 6);
  for (const r of everywhere.rows) assert.equal(r.fields.quiet, 'global');
  /* THE PROJECT'S OWN BLOCK KEEPS NONE OF EVERYWHERE'S, and says so. */
  assert.deepEqual([blocks.Own!.rows.length, blocks.Own!.inherited], [3, 0]);
});

/* A PROJECT'S PAGE DRAWS FOUR OF THESE BLOCKS, and each gathered every key, tool and skill again with who used each. */
test('THE BLOCKS OF ONE READ GATHER WHAT THE PROJECT RUNS ON ONCE, and the next read sees what was written since', async () => {
  const clock = fixedClock(NOW);
  const db = openSqlite();
  let tools = 0;
  /* Every read of the tools list's rows in scope, counted where the kernel asks the database. */
  const counted = { ...db, all: ((text: string, ...params: never[]) => (/FROM entry e WHERE e\.register = \?/u.test(text) && params[0] === 'tools' ? tools++ : 0, db.all(text, ...params))) as typeof db.all };
  const k: Kernel = await openRecord(counted, clock);
  value(await k.install([...LISTS, pageAbout('kiln', 'things#1')]));
  value(k.create('things', { name: 'Kiln' }, OWNER));
  value(k.create('tools', { name: 'kiln-mcp', project: 'things#1' }, OWNER));
  tools = 0;
  const first = page(k, 'kiln');
  const once = tools;
  assert.ok(once > 0, 'the tools were never read');
  assert.deepEqual(first.All!.rows.map((r) => r.fields.name), ['kiln-mcp']);
  assert.deepEqual(first.Own!.rows.map((r) => r.fields.name), ['kiln-mcp']);
  /* One block alone reads as much as the page's three did. */
  tools = 0;
  k.block({ kind: 'table', source: 'runs_on', about: 'things#1' } as never);
  assert.equal(tools, once, `three blocks read the tools ${once} times and one block ${tools}`);
  /* A block's rows are its own: a second tool written after the read is on the next read of every block. */
  value(k.create('tools', { name: 'kiln-cli', project: 'things#1' }, OWNER));
  const second = page(k, 'kiln');
  assert.deepEqual(second.All!.rows.map((r) => r.fields.name), ['kiln-cli', 'kiln-mcp']);
  assert.deepEqual(second.Own!.rows.map((r) => r.fields.name), ['kiln-cli', 'kiln-mcp']);
});

test('A PROJECT WITH NOTHING OF ITS OWN ANSWERS ONLY WHAT APPLIES EVERYWHERE, every row of it quiet', async () => {
  const { k } = await record();
  const blocks = page(k, 'oxbow');
  assert.deepEqual(blocks.All!.rows.map((r) => r.fields.name), GLOBAL);
  for (const r of blocks.All!.rows) assert.deepEqual([r.fields.scope, r.fields.quiet], ['global', 'global'], String(r.fields.name));
  assert.deepEqual([blocks.All!.inherited, blocks.All!.matched], [6, 6]);
  assert.deepEqual([blocks.Own!.rows, blocks.Own!.inherited], [[], 0]);
});

/* ── a key's opens ───────────────────────────────────────────────────────── */

/*
 * A KEY IS USED WHEN IT IS OPENED, and the record says so as a `grant.read` on the grant its row points at. The host's
 * read of every open since an instant (`keyUses`) is not wired by the kernel yet, so a key on the record above is opened
 * by nobody; here the page layer is handed the reads a host gives, over one key of Kiln's, to hold both ways a key counts.
 * The opens are handed whole, the one past the window among them, so the window is the page layer's to hold.
 */
const iso = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();
const KEY = { id: 'k1', register: 'credentials', seq: 1, fields: { label: 'Kiln deploy key', value: 'g_1' }, state: 'live', version: 1, created_at: iso(200), updated_at: iso(200), deleted_at: null } as unknown as Entry;
const OPENS = [
  { actor: 'S4', ts: iso(1) },
  { actor: 'p_1', ts: iso(2) },
  { actor: 'S2', ts: iso(3) },
  { actor: 'S4', ts: iso(4) },
  { actor: 'S1', ts: iso(120) },
];
const AGENT: Record<string, Record<string, string>> = { '1': { agent: 'claude', client: 'claude-code' }, '2': { agent: 'codex' }, '4': { agent: 'gemini' } };

function keyDeps(every: boolean): PageDeps {
  const project = { id: 't1', register: 'things', seq: 1, fields: { name: 'Kiln' }, state: null, version: 1, created_at: iso(200), updated_at: iso(200), deleted_at: null } as unknown as Entry;
  return {
    pages: () => [],
    metric: () => null,
    read: () => ok(null as never),
    list: (q) => {
      const seq = String((q.where as { is?: unknown } | undefined)?.is);
      if (q.register === 'things') return ok({ rows: [project], matched: 1 });
      const run = q.register === 'session' ? AGENT[seq] : undefined;
      return ok(run ? { rows: [{ ...project, register: 'session', fields: run }], matched: 1 } : { rows: [], matched: 0 });
    },
    schemaOf: (register) => (register === 'credentials' ? { register, fields: { label: { type: 'text' }, value: { type: 'secret' } } } : null) as never,
    titleOf: (register) => (register === 'credentials' ? 'label' : 'name'),
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    scopeOf: (register) => (register === 'credentials' ? { field: 'project', to: 'things' } : null),
    inScope: (register) => ok({ rows: register === 'credentials' ? [KEY] : [], inherited: [] }),
    keyOpened: (grant) => (grant === 'g_1' ? OPENS[0]! : null),
    ...(every ? { keyUses: (grant: string) => (grant === 'g_1' ? OPENS : []) } : {}),
  } as PageDeps;
}

const KEY_BLOCK = { kind: 'table', source: 'runs_on', about: 'things#1' } as PageBlock;

test("A KEY COUNTS EVERY RUN THAT OPENED IT when the host hands its opens: a person's open and an old one are no run's", () => {
  const read = readBlock(keyDeps(true), KEY_BLOCK);
  assert.deepEqual(read.refusals, []);
  const key = read.rows[0]!.fields;
  assert.deepEqual([key.used_runs, key.used_agents, key.used_agent, key.used_by], [2, 'Gemini, Codex', 'Gemini', 'S4']);
});

test('A KEY WITHOUT THAT READ COUNTS ITS LAST OPEN, and never more than it read', () => {
  const key = readBlock(keyDeps(false), KEY_BLOCK).rows[0]!.fields;
  assert.deepEqual([key.used_runs, key.used_agents, key.used_at], [1, 'Gemini', iso(1)]);
});
