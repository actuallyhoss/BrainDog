/**
 * What a block read beside its own list, held from somebody who may not read that list, and what a held block kept.
 *
 * THE MEASURED CASES, AS TESTS. Wren is invited to Areas alone and `list('steps')` refuses her. Before this file a
 * cards block over Areas with `{ field: salary, as: next }` drew her the hidden list's salary, through `page`, through
 * `previewPage` with the field her own choice, through an agent token held to Areas as MCP calls it, and through MCP
 * itself; a field that is not there answered `FIELD_UNKNOWN` naming Steps and listing its whole schema. `as: ring` drew
 * the done share of the same steps. Walking every other read a block makes beside its source found four more of the
 * same shape, each measured red here first: `as: scope` drew a hidden project's title, a live run's card drew the same,
 * `spent:` and `toward:` drew a Payroll total, and a ring's `of:` answered a hidden project's title with a row and a
 * wrong one with `REF_UNKNOWN`.
 *
 * AND A HELD BLOCK KEPT WHAT THE NEW FORMS COMPUTED: `open: 2` of a list she may not read, `types` of its fields, and an
 * inputs block's `register`, `row` and `columns`. The shell is checked against the kernel's own list of answer keys, so
 * an answer key added later and left off the shell goes red here rather than out to a reader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { ANSWER_KEYS } from '../../kernel/src/block-keys.ts';
import { tools } from '../../mcp/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const reg = (id: string, name: string, title: string, fields: unknown[], extra: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields, ...extra } as never,
});
const pageDecl = (slug: string, blocks: unknown[], requires: string[]) => ({ id: `page.${slug}`, kind: 'page', body: { page: slug, title: slug, requires, blocks } }) as never;

const cardsWith = (field: string, as: string) => ({ kind: 'cards', source: 'register.areas', columns: [{ field: 'name', as: 'title' }, { field, as }], empty: 'None.' });

const DECLS = [
  reg('areas', 'Areas', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'what', type: 'text' },
    { id: 'project', type: 'ref', to: 'things' },
  ]),
  /* THE HIDDEN LIST: steps under each area, with a private field. */
  reg(
    'steps',
    'Steps',
    'what',
    [
      { id: 'what', type: 'text', required: true },
      { id: 'area', type: 'ref', to: 'areas' },
      { id: 'done', type: 'bool' },
      { id: 'rank', type: 'int' },
      { id: 'salary', type: 'text' },
    ],
    { steps: { of: 'area', done: 'done', order: 'rank' } },
  ),
  /* THE PROJECTS, which Areas are scoped to and runs are placed in, and which Wren may not open either. */
  reg('things', 'Things', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }], { scopes: { repos: 'repos' } }),
  reg('notes', 'Notes', 'what', [{ id: 'what', type: 'text', required: true }, { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person', same: 'nearer' } }]),
  reg('payroll', 'Payroll', 'who', [{ id: 'who', type: 'text', required: true }, { id: 'kind', type: 'text' }, { id: 'pay', type: 'int' }]),
  reg('budgets', 'Budgets', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'limit', type: 'int' }, { id: 'project', type: 'ref', to: 'things' }]),
  {
    id: 'metric.pay-by-kind',
    kind: 'metric',
    body: { metric: 'pay-by-kind', name: 'Pay', source: 'register.payroll', value: { sum: 'pay' }, group_by: 'kind', format: 'int', window: '30d', target: { gte: 0 }, compare: 'none' },
  } as never,
  pageDecl('areas-cards', [cardsWith('what', 'next')], ['register.areas']),
  pageDecl('budget', [{ kind: 'progress', source: 'register.budgets', spent: 'pay-by-kind', columns: [{ field: 'name' }, { field: 'limit' }], empty: 'None.' }], ['register.budgets']),
  pageDecl(
    'mixed',
    [
      { kind: 'table', source: 'register.areas', columns: [{ field: 'name' }], empty: 'None.' },
      { kind: 'steps', source: 'register.steps', first: 1, columns: [{ field: 'what' }], empty: 'None.' },
      { kind: 'inputs', register: 'steps', row: 'steps#2', columns: [{ field: 'what' }, { field: 'salary' }, { field: 'rank' }] },
    ],
    ['register.areas', 'register.steps'],
  ),
  pageDecl('calls', [{ kind: 'table', source: 'register.areas', empty: 'None.' }, { kind: 'queue', source: 'governance.open', tiles: true, empty: 'Nothing waits.' }], ['register.areas']),
];

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Block = Record<string, unknown> & { refusals: { code: string; fix: string }[] };

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const kiln = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Secret Kiln' } }, owner));
  const product = value<{ id: string }>(await api.create({ register: 'areas', fields: { name: 'Product', project: kiln.id } }, owner));
  value(await api.create({ register: 'steps', fields: { what: 'Fire Sam quietly', area: product.id, done: true, rank: 1, salary: 'GBP 91,000' } }, owner));
  value(await api.create({ register: 'steps', fields: { what: 'Tell the bank about the overdraft', area: product.id, done: false, rank: 2, salary: 'GBP 44,500' } }, owner));
  value(await api.create({ register: 'steps', fields: { what: 'Sign the lease', area: product.id, done: false, rank: 3 } }, owner));
  value(await api.create({ register: 'notes', fields: { what: 'A note', project: kiln.id } }, owner));
  value(await api.create({ register: 'payroll', fields: { who: 'Sam', kind: 'ops', pay: 91017 } }, owner));
  value(await api.create({ register: 'budgets', fields: { name: 'ops', limit: 100, project: kiln.id } }, owner));
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { areas: 'read', notes: 'read', budgets: 'read', session: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { api, wren };
}

/** One block drawn in a preview, as `previewPage` answers it to this caller. */
const preview = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext, block: unknown, requires = ['register.areas']): Promise<Block> => {
  const drawn = value<{ blocks: Block[] }>(await api.previewPage({ body: { page: 'mine', title: 'Mine', requires, blocks: [block] } }, ctx));
  return drawn.blocks[0]!;
};

/** Nothing of the hidden lists: no step, no salary, no project title, no payroll figure, and neither list's name. */
const HIDDEN = ['44,500', '91,000', 'overdraft', 'Secret Kiln', '91017', 'register.steps', '"register":"steps"', 'steps#', 'salary'];
const blind = (drawn: unknown, said: string) => {
  const text = JSON.stringify(drawn);
  for (const word of HIDDEN) assert.equal(text.includes(word), false, `${said} carried ${word}: ${text.slice(0, 600)}`);
};

test('THE PREMISE: Wren may not list Steps, Things or Payroll', async () => {
  const { api, wren } = await record();
  for (const register of ['steps', 'things', 'payroll']) assert.equal((await api.list({ register } as never, wren)).ok, false, register);
});

/* ── as: next and as: ring ───────────────────────────────────────────────────────────────────────────── */

test('AN INSTALLED CARD GRID WITH as: next IS HELD FROM WREN, and carries no next step', async () => {
  const { api, wren } = await record();
  const b = value<{ blocks: Block[] }>(await api.page({ slug: 'areas-cards' }, wren)).blocks[0]!;
  assert.equal(b.refusals[0]?.code, 'FORBIDDEN', JSON.stringify(b));
  assert.equal('nexts' in b, false);
  blind(b, 'page(areas-cards)');
  /* THE OWNER STILL READS IT. */
  const own = value<{ blocks: Block[] }>(await api.page({ slug: 'areas-cards' }, owner)).blocks[0]!;
  assert.deepEqual(own.refusals, []);
  assert.deepEqual(own.nexts, ['Tell the bank about the overdraft']);
});

test('A PREVIEW NAMING A FIELD OF THE HIDDEN STEPS, OR ONE THAT IS NOT THERE, IS HELD THE SAME WAY and names neither', async () => {
  const { api, wren } = await record();
  const hit = await preview(api, wren, cardsWith('salary', 'next'));
  const miss = await preview(api, wren, cardsWith('nosuch', 'next'));
  blind(hit, 'as: next salary');
  blind(miss, 'as: next nosuch');
  assert.equal(hit.refusals[0]?.code, 'FORBIDDEN');
  assert.equal(JSON.stringify(miss).replaceAll('nosuch', 'salary'), JSON.stringify(hit), 'a field that is there and one that is not answered differently');
});

test('AN AGENT TOKEN HELD TO AREAS, AS MCP CALLS previewPage, IS HELD THE SAME WAY', async () => {
  const { api } = await record();
  const agent = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_1', level: 'owner' }, registers: ['areas'] } as unknown as CallContext;
  assert.equal((await api.list({ register: 'steps' } as never, agent)).ok, false);
  const b = await preview(api, agent, cardsWith('salary', 'next'));
  assert.equal(b.refusals[0]?.code, 'FORBIDDEN');
  blind(b, 'token preview');
});

test('OVER MCP: a propose with try, from a token held to Areas, draws nothing of the hidden steps', async () => {
  const { api } = await record();
  const agent = { principal: { kind: 'token', id: 't_2', scope: 'propose', person: 'p_1', level: 'owner' }, registers: ['areas'] } as unknown as CallContext;
  const body = { page: 'mine', title: 'Mine', requires: ['register.areas'], blocks: [cardsWith('salary', 'next'), cardsWith('what', 'ring')] };
  const out = await tools(api).call('propose', { question: 'Add my page?', body_kind: 'change', body: { declaration_id: 'page.mine', to: { id: 'page.mine', kind: 'page', body }, try: true } }, agent);
  const drawn = value<{ page_preview: { blocks: Block[] } }>(out);
  assert.deepEqual(drawn.page_preview.blocks.map((b) => b.refusals[0]?.code), ['FORBIDDEN', 'FORBIDDEN']);
  assert.equal(JSON.stringify(drawn).includes('"rings"'), false);
  blind(drawn, 'MCP page_preview');
});

test('A RING OVER THE HIDDEN STEPS IS HELD, and carries no done share', async () => {
  const { api, wren } = await record();
  const b = await preview(api, wren, cardsWith('what', 'ring'));
  assert.equal(b.refusals[0]?.code, 'FORBIDDEN');
  assert.equal('rings' in b, false, JSON.stringify(b));
});

/* ── the same walk, beside as: next ──────────────────────────────────────────────────────────────────── */

test('as: scope AND A LIVE RUN DRAW NO TITLE FROM THE PROJECTS LIST WREN MAY NOT OPEN', async () => {
  const { api, wren } = await record();
  const scoped = await preview(api, wren, { kind: 'table', source: 'register.notes', columns: [{ field: 'what' }, { field: 'project', as: 'scope' }], empty: 'None.' }, ['register.notes']);
  blind(scoped, 'as: scope');
  assert.equal(scoped.refusals[0]?.code, 'FORBIDDEN');
  /* A RUN THE LADDER PLACED IN THE HIDDEN PROJECT, the only way a run's project is written. */
  assert.ok(api.kernel.create('session', { doing: 'Axis QA', agent: 'claude', state: 'active' }, { actor: 'p_1', stamp: { last_seen: new Date(NOW - 60_000).toISOString(), project: 'things#1' } }).ok);
  const live = await preview(api, wren, { kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }], empty: 'None.' });
  blind(live, 'sessions.live');
  assert.equal(live.refusals[0]?.code, 'FORBIDDEN', JSON.stringify(live));
  /* THE OWNER STILL SEES THE RUN WHERE IT IS. */
  const own = await preview(api, owner, { kind: 'cards', source: 'sessions.live', columns: [{ field: 'doing', as: 'title' }], empty: 'None.' });
  assert.deepEqual(own.scopes, ['Secret Kiln']);
});

test("spent: AND toward: OVER A FIGURE OF PAYROLL DRAW NO PAYROLL TOTAL, installed or previewed, and read as a figure nobody declared", async () => {
  const { api, wren } = await record();
  const installed = value<{ blocks: Block[] }>(await api.page({ slug: 'budget' }, wren)).blocks[0]!;
  blind(installed, 'page(budget)');
  assert.equal(installed.refusals[0]?.code, 'FORBIDDEN');
  for (const key of ['spent', 'toward']) {
    const block = (metric: string) => ({ kind: 'progress', source: 'register.budgets', [key]: metric, columns: [{ field: 'name' }, { field: 'limit' }], empty: 'None.' });
    const hidden = await preview(api, wren, block('pay-by-kind'), ['register.budgets']);
    const nobody = await preview(api, wren, block('nosuch-by-kind'), ['register.budgets']);
    blind(hidden, `${key}: pay-by-kind`);
    assert.equal(JSON.stringify(nobody).replaceAll('nosuch-by-kind', 'pay-by-kind'), JSON.stringify(hidden), `${key}: a hidden figure and an unknown one answered differently`);
  }
});

test("A RING'S of: IS ASKED AS ITS where IS, so a hidden project's title and a wrong one answer the same", async () => {
  const { api, wren } = await record();
  const ring = (title: string) => ({ kind: 'ring', source: 'register.budgets', of: `project is ${title}`, empty: 'None.' });
  const hit = await preview(api, wren, ring('Secret Kiln'), ['register.budgets']);
  const miss = await preview(api, wren, ring('Nothing Here'), ['register.budgets']);
  assert.equal(hit.refusals[0]?.code, 'FORBIDDEN', JSON.stringify(hit));
  assert.equal(JSON.stringify(miss).replaceAll('Nothing Here', 'Secret Kiln'), JSON.stringify(hit));
});

/* ── what a held block kept ──────────────────────────────────────────────────────────────────────────── */

test('A HELD steps BLOCK AND A HELD inputs BLOCK KEEP NO ANSWER KEY, and the inputs shell names no list, row or field', async () => {
  const { api, wren } = await record();
  const [, steps, inputs] = value<{ blocks: Block[] }>(await api.page({ slug: 'mixed' }, wren)).blocks as [Block, Block, Block];
  /* THE EMPTIES A HOST READS OFF A HELD BLOCK, and the one sentence that says why. */
  const EMPTIES = new Set(['rows', 'matched', 'refusals', 'readings', 'measures', 'values', 'feed', 'queue']);
  for (const [name, b] of [['steps', steps], ['inputs', inputs]] as const) {
    assert.equal(b.refusals[0]?.code, 'FORBIDDEN', name);
    assert.deepEqual(Object.keys(b).filter((key) => ANSWER_KEYS.includes(key) && !EMPTIES.has(key)), [], `${name} kept an answer key: ${JSON.stringify(b)}`);
    assert.equal('open' in b, false, `${name} kept open`);
    blind(b, name);
  }
  for (const key of ['register', 'row', 'columns', 'types']) assert.equal(key in inputs, false, `the inputs shell kept ${key}`);
  /* THE OWNER'S DRAWING STILL ANSWERS THEM. */
  const own = value<{ blocks: Block[] }>(await api.page({ slug: 'mixed' }, owner)).blocks;
  assert.equal(own[1]!.open, 2);
  assert.deepEqual(own[2]!.types, { what: 'text', salary: 'text', rank: 'int' });
});

test('EVERY KEY THE KERNEL ANSWERS IS TAKEN OFF A HELD BLOCK, so an answer key added later cannot be forgotten on the shell', async () => {
  const { api, wren } = await record();
  /* A BLOCK WRITTEN WITH EVERY ANSWER KEY ON IT, which `previewPage` shells from what was written when it holds it. */
  const MARK = 'answered-and-held';
  const block = Object.fromEntries([['kind', 'table'], ['source', 'register.steps'], ['empty', 'None.'], ...ANSWER_KEYS.map((key) => [key, MARK])]);
  const b = await preview(api, wren, block);
  assert.equal(b.refusals[0]?.code, 'FORBIDDEN');
  assert.deepEqual(Object.keys(b).filter((key) => b[key] === MARK), [], JSON.stringify(b));
});

/* ── the queue ───────────────────────────────────────────────────────────────────────────────────────── */

test('Q1 A QUEUE IS HELD FROM A MEMBER WHO DOES NOT READ EVERY LIST, as governance holds the rowset back from her', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([reg('areas', 'Areas', 'name', [{ id: 'name', type: 'text', required: true }]), reg('diary', 'Diary', 'what', [{ id: 'what', type: 'text', required: true }]), DECLS.at(-1)!])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok(api.kernel.propose({ question: 'Add the diary line?', body_kind: 'rowset', body: { register: 'diary', rows: [{ what: 'Dinner with the auditor about Sam' }] } } as never, 'slash').ok);
  value(await api.invite({ person: 'p_9', name: 'Wren', level: 'read', registers: { diary: 'append' } } as never, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const asked = value<{ question: string }[]>(await api.governance({} as never, wren));
  assert.equal(JSON.stringify(asked).includes('Add the diary line?'), false, 'the premise: governance holds the rowset back');
  const queue = value<{ blocks: Block[] }>(await api.page({ slug: 'calls' }, wren)).blocks[1]!;
  assert.equal(JSON.stringify(queue).includes('Add the diary line?'), false, JSON.stringify(queue).slice(0, 400));
  assert.equal(queue.refusals[0]?.code, 'FORBIDDEN');
  /* THE OWNER'S QUEUE STILL HOLDS IT. */
  const own = value<{ blocks: Block[] }>(await api.page({ slug: 'calls' }, owner)).blocks[1]!;
  assert.equal(JSON.stringify(own).includes('Add the diary line?'), true);
});
