/**
 * TYPED CELLS FROM A COMPUTED SOURCE (PGS-B02 job g), what a run left (AGT-C05 job g) and the resolver that answers
 * `UNNAMED`.
 *
 * His BrainDog project page, "Tools and servers", printed `2026-10-06T19:07:01.610Z` under Last used and `S731` under
 * Last used by: `runs_on` names no list, so `display()` found no field and wrote the raw value. Each test here fails on
 * that code by itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UNNAMED } from 'braindog-render';

import './fixtures/fill.ts';
/* A FIGURE'S FORMAT IS READ FROM WHAT THE TAB WAS TOLD (`figures-known.ts`, c5e02b64f), and this build's own table is told it on load. */
import './declared.ts';
import { display, runWho, runWords, stepLeft, toRows } from './api.ts';
import { answeredTypes, blockOf, namedResolverOf, pageReader, resolverOf, runsNamed, type Fetch } from './page-live.ts';

const AT = Date.parse('2026-10-09T12:00:00.000Z');
const USED = '2026-10-09T09:00:00.000Z';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;
const HANDLE = /\bS\d+\b/u;

const RUN = { agent: 'claude', client: 'Claude Code', started: '2026-10-06T19:00:00.000Z', state: 'done' };

const tool = (seq: number, fields: Record<string, unknown>) => ({
  id: `01JTOOL${String(seq).padStart(19, '0')}`,
  register: 'tools',
  seq,
  fields: { kind: 'tool', name: 'GitHub', scope: 'project', state: 'live', detail: 'stdio', spoken: `tools#${seq}`, quiet: null, ...fields },
  state: 'live',
  version: 1,
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-10T09:00:00.000Z',
  deleted_at: null,
});

const COLUMNS = [
  { field: 'name', as: 'title' },
  { field: 'scope', label: 'Applies to', as: 'scope' },
  { field: 'detail', label: 'Reached by', as: 'fact' },
  { field: 'used_by', label: 'Last used by', as: 'who' },
  { field: 'used_at', label: 'Last used', as: 'when' },
];

const runsOn = (types?: Record<string, string>) => ({
  kind: 'cards',
  heading: 'Tools and servers',
  source: 'runs_on',
  about: 'things#1',
  where: 'kind is tool',
  columns: COLUMNS,
  rows: [tool(1, { used_by: 'S731', used_at: USED }), tool(2, { name: 'Linear', used_by: null, used_at: null })],
  matched: 2,
  scopes: ['BrainDog', 'BrainDog'],
  refusals: [],
  ...(types ? { types } : {}),
});

/* ── display() and the type the block answered ──────────────────────────── */

test('an instant no list declares is said in words by the type the block answered, never as the stored instant', () => {
  assert.equal(display('runs_on', 'used_at', USED, AT), USED, 'with no type the value is as it was: this is the fault');
  const said = display('runs_on', 'used_at', USED, AT, undefined, 'instant');
  assert.ok(said !== null && !ISO.test(said), `said "${said}"`);
  assert.match(said!, /ago|today/u);
});

test('a run no list declares is the words the page read for it, or an agent, never its handle', () => {
  const names = new Map([['S731', 'Claude Code, 6 Oct']]);
  assert.equal(display('runs_on', 'used_by', 'S731', AT, names, 'run'), 'Claude Code, 6 Oct');
  const unread = display('runs_on', 'used_by', 'S731', AT, undefined, 'run');
  assert.ok(unread !== null && !HANDLE.test(unread), `said "${unread}"`);
});

test('a run is its app and the day it started, else its agent', () => {
  assert.equal(runWords(RUN), 'Claude Code, 6 Oct');
  assert.equal(runWords({ agent: 'codex' }), 'Codex');
  assert.equal(runWho({ agent: 'claude' }), 'Claude');
  assert.equal(runWords({ agent: 'other' }), null);
});

test('a column typed as a run links to the run by its words', () => {
  const rows = toRows('runs_on', [{ seq: 1, fields: { used_by: 'S731' } } as never], [{ field: 'used_by', label: 'Last used by', width: '1fr' }], AT, new Map([['S731', 'Claude Code, 6 Oct']]), { used_by: 'run' });
  assert.equal(rows[0]?.cells[0], '[Claude Code, 6 Oct](/r/session/731)');
});

/* ── the page: what a project runs on ───────────────────────────────────── */

test('a runs_on card says the time in words and the run by its app and day, with its face', () => {
  const runs = new Map([['S731', RUN]]);
  const block = blockOf(runsOn({ used_by: 'run', used_at: 'instant' }) as never, new Map(), AT, null, new Map(), runs);
  const cells = block.rows.flatMap((r) => r.cells).filter((c): c is string => c !== null);
  assert.ok(!cells.some((c) => ISO.test(c)), `an instant was printed: ${cells.join(' | ')}`);
  assert.ok(!cells.some((c) => /^S\d+$/u.test(c)), `a run handle was printed: ${cells.join(' | ')}`);
  assert.ok(cells.includes('[Claude Code, 6 Oct](/r/session/731)'), cells.join(' | '));
  assert.deepEqual(block.runFaces?.[0], { run: 'S731', agent: 'claude', live: 'stopped', presence: 'before' });
  assert.equal(block.runFaces?.[1], null);
});

test('a record that answered no types still says what runs_on holds, by its own source', () => {
  assert.deepEqual(answeredTypes({ source: 'runs_on' }), { used_by: 'run', used_at: 'instant' });
  assert.equal(answeredTypes({ source: 'tasks' }), null);
  const block = blockOf(runsOn() as never, new Map(), AT, null, new Map(), new Map());
  const cells = block.rows.flatMap((r) => r.cells).filter((c): c is string => c !== null);
  assert.ok(!cells.some((c) => ISO.test(c) || /^S\d+$/u.test(c)), cells.join(' | '));
});

test('a run the reader could not open is said by the agent the record named beside it, and only runs_on and handoffs.open ask for runs', () => {
  const b = { ...runsOn({ used_by: 'run', used_at: 'instant' }), rows: [tool(1, { used_by: 'S731', used_agent: 'Claude Code', used_at: USED })] };
  const block = blockOf(b as never, new Map(), AT, null, new Map(), new Map());
  const cells = block.rows.flatMap((r) => r.cells);
  assert.ok(cells.includes('[Claude Code](/r/session/731)'), cells.join(' | '));
  assert.deepEqual(runsNamed({ ...b, source: 'handoffs.open', types: { run: 'run' }, rows: [tool(1, { run: 'S731' })] } as never), ['S731']);
  assert.deepEqual(runsNamed({ ...b, source: 'signs', types: { run: 'run' }, rows: [tool(1, { run: 'S731' })] } as never), []);
});

test('the reader asks the record for each run a block names, once', async () => {
  assert.deepEqual(runsNamed(runsOn() as never), ['S731']);
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    const method = at.pathname.split('/').pop() ?? '';
    sent.push(method);
    const body =
      method === 'page'
        ? { ok: true, value: { page: 'p-braindog', title: 'BrainDog', blocks: [runsOn({ used_by: 'run', used_at: 'instant' }), runsOn()] } }
        : method === 'get'
          ? { ok: true, value: { id: '01JRUN', seq: 731, register: 'session', state: 'done', fields: RUN } }
          : { ok: false, refusal: { code: 'ROW_UNKNOWN', fix: 'There is no such run here.' } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as Fetch;
  const out = await pageReader('https://brain.example/api', io, () => AT).read('p-braindog');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(sent.filter((m) => m === 'get').length, 1);
  const cells = out.page.blocks[0]!.rows.flatMap((r) => r.cells);
  assert.ok(cells.includes('[Claude Code, 6 Oct](/r/session/731)'), cells.join(' | '));
});

/* ── the resolver ───────────────────────────────────────────────────────── */

test('a path that names nothing answers UNNAMED, a named path with no value its dash', () => {
  const resolve = namedResolverOf({ 'tasks.count': 4 }, ['tasks.cuont']);
  assert.equal(resolve('tasks.cuont'), UNNAMED);
  assert.equal(resolve('tasks.done'), null);
  assert.equal(resolve('tasks.count'), '4');
  assert.equal(namedResolverOf(undefined, undefined)('anything'), null);
});

test('a day figure is written as a day, also read for one group by its parameter', () => {
  const day = 20_699; /* 2026-09-03 */
  assert.match(resolverOf({ 'cash-as-of': day })('cash-as-of') ?? '', /3 Sep/u);
  assert.match(resolverOf({ 'cash-as-of:hsbc': day })('cash-as-of:hsbc') ?? '', /3 Sep/u);
  assert.equal(resolverOf({ 'open-tasks:hsbc': day })('open-tasks:hsbc'), '20,699');
});

/* ── what a run left ────────────────────────────────────────────────────── */

const LEFT = { next: 'Wire the rates page', next_at: '2026-10-09T08:00:00.000Z' };

test('a step another run took says who took it, by name, and how much later', () => {
  const s = stepLeft({ ...LEFT, closed_as: 'taken', closed_at: '2026-10-09T10:00:00.000Z', taken_by: 'S740' }, 'done', AT, 'Claude Code');
  assert.equal(s?.fate, 'Taken by Claude Code, 2h later');
  assert.equal(s?.next, 'Wire the rates page');
  assert.match(s?.left ?? '', /^Left this next step 4h ago$/u);
  assert.equal(s?.open, false);
  const nameless = stepLeft({ ...LEFT, closed_as: 'taken', taken_by: 'S740' }, 'done', AT);
  assert.ok(!HANDLE.test(nameless?.fate ?? ''), nameless?.fate ?? 'no fate');
});

test('a step dropped, expired or still waiting says so, and only a waiting one may be closed', () => {
  assert.match(stepLeft({ ...LEFT, closed_as: 'dropped', closed_at: '2026-10-09T08:30:00.000Z' }, 'done', AT)?.fate ?? '', /^Closed without being taken, 30 min later$/u);
  assert.equal(stepLeft({ ...LEFT, closed_as: 'expired' }, 'done', AT)?.fate, 'Nobody took it in thirty days, so it closed');
  const waiting = stepLeft(LEFT, 'handoff', AT);
  assert.equal(waiting?.open, true);
  assert.equal(waiting?.fate, 'Nobody has taken it yet');
  assert.equal(stepLeft(LEFT, 'active', AT)?.fate, null);
  assert.equal(stepLeft({ next: '' }, 'handoff', AT), null);
});

test('no em dash in the words a run panel says', () => {
  const all = [stepLeft({ ...LEFT, closed_as: 'taken', closed_at: USED }, 'done', AT, 'Codex'), stepLeft(LEFT, 'handoff', AT)];
  for (const s of all) assert.ok(!JSON.stringify(s).includes(String.fromCharCode(0x2014)));
});
