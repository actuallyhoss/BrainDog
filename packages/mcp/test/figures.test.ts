/**
 * A figure is read with tools alone, whatever pack declared it.
 *
 * WHAT WENT WRONG. When the `money` tool left the core (`48ac43a1`), the figures it read stayed reachable as
 * `braindog:metric/<id>`, and only there. The probe installed money-core as it ships, with two accounts in two
 * currencies, and called each of the nine read tools with the most helpful arguments it takes: none of the nine
 * answers named the figure, so a client that hands its model tools and not resources had no figure at all, and the
 * one fallback was `list` and adding the rows up, which is the arithmetic the record exists to refuse (two currencies
 * summed). And `resources/list` offered a figure only when a page drew it: 18 of money-core's 36.
 *
 * WHAT REPLACES IT IS NO SIXTEENTH TOOL. The count was fifteen and the budget had 72 tokens left, so the two tools an
 * agent already reaches for carry it: `record_index` names the figures the caller may read, and `get` reads one by
 * that id, as the resource does, through the record's own `metric` and so through its own refusal. Neither knows one
 * pack's ids: the ids below are spelled out here so that `src/index.ts` does not have to (`money-out.test.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { TOOLS, tools } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../seed/src/index.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** The seven the removed tool read, `late-in` among them, which no page draws. */
const FORMER = ['cash-now', 'received-30d', 'spent-30d', 'in-30d', 'out-30d', 'late-in', 'overdue'];

/** The probe's record: money-core through the owner's door as it ships, and CIB in EGP beside Payoneer in USD. */
async function money() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'money-core']) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const plan = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as { ok: boolean; value: { diff: { planHash: string; approve: string[] } } };
    assert.ok(plan.ok, JSON.stringify(plan));
    const put = await api.installPack({ doc, source: { kind: 'local' }, planHash: plan.value.diff.planHash, approve: plan.value.diff.approve } as never, owner);
    assert.ok(put.ok, JSON.stringify(put));
  }
  assert.ok(api.kernel.create('accounts', { name: 'CIB', kind: 'bank', balance: { amount: 5_200_000, currency: 'EGP' }, as_of: '2026-09-23' }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('accounts', { name: 'Payoneer', kind: 'bank', balance: { amount: 340_050, currency: 'USD' }, as_of: '2026-09-23' }, { actor: 'p_1' }).ok);
  const declared = (api.kernel.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'metric').map((d) => d.id.slice('metric.'.length));
  return { sql, api, declared };
}

/**
 * A tool called over the wire, as a client that reads no resources calls it: the text the model reads, and the whole
 * answer beside it in `structuredContent`, which is where a value is read now that the text is brief.
 */
async function called(api: unknown, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string; structured: unknown }> {
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, api as never, owner)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const result = reply.result as { isError?: boolean; content: { text: string }[]; structuredContent?: unknown };
  return { isError: result.isError === true, text: result.content.map((c) => c.text).join(''), structured: result.structuredContent };
}

test('A TOOLS-ONLY AGENT READS A FIGURE: get of its id answers the reading, one amount per currency and no sum', async () => {
  const { sql, api } = await money();
  const got = await called(api, 'get', { spoken: 'cash-now' });
  assert.equal(got.isError, false, got.text);
  const figure = got.structured as { value?: unknown; parts?: { currency?: string; amount?: number }[] };
  assert.deepEqual(figure.parts, [{ currency: 'EGP', amount: 5_200_000 }, { currency: 'USD', amount: 340_050 }], got.text);
  /* A VALUE THAT IS NULL IS LEFT OUT OF THE ANSWER, and two currencies are still never one number. */
  assert.equal(figure.value ?? null, null, 'two currencies were added into one number');
  /* AND THE TEXT SAYS EACH AMOUNT IN ITS OWN CURRENCY, with its own decimals. */
  assert.match(got.text, /EGP 52,000(?!\.)/u, got.text);
  assert.match(got.text, /\$3,400\.50/u, got.text);
  sql.close();
});

test('AND THE ONE NO PAGE DRAWS: get of every figure the removed tool read answers it', async () => {
  const { sql, api } = await money();
  for (const id of FORMER) {
    const got = await called(api, 'get', { spoken: id });
    assert.equal(got.isError, false, `${id}: ${got.text}`);
  }
  sql.close();
});

test('record_index NAMES THE FIGURES IT CAN, and each one it names is one get answers, a template once its slot is filled', async () => {
  const { sql, api } = await money();
  assert.ok(api.kernel.create('things', { name: 'Kiln', lane: 'building' }, { actor: 'p_1' }).ok);
  /* `book-cash` (money-core 3.1.0) is a template too, `book is {{it}}`, filled the same way as `project-owed`
     below: a books row named Kiln, so `book-cash:Kiln` is one `get` answers rather than REF_UNKNOWN. */
  assert.ok(api.kernel.create('books', { name: 'Kiln', currency: 'GBP' }, { actor: 'p_1' }).ok);
  /* AND `budget-passed-on` (money-core 3.17.0) is one over `category is {{it}}`, so a category named Kiln too. */
  const category = api.kernel.create('categories', { name: 'Kiln', direction: 'out' }, { actor: 'p_1' });
  assert.ok(category.ok);
  /* AND money-core 3.29.0'S FIVE OF ONE ACCOUNT are over `name is {{it}}` on accounts, so an account named Kiln as well. */
  assert.ok(api.kernel.create('accounts', { name: 'Kiln', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: '2026-09-23' }, { actor: 'p_1' }).ok);
  /* AND money-core 3.32.0'S WEEKS PAID TO ONE PAYEE are over `party is {{it}}`, so an organisation named Kiln too. */
  assert.ok(api.kernel.create('organisations', { name: 'Kiln' }, { actor: 'p_1' }).ok);
  /* AND money-core 3.33.0'S `filing-rule-filed` is over `filed_by is {{it}}`, so a filing rule named Kiln too. */
  const ruled = api.kernel.create('filing_rules', { match: 'Kiln', match_by: 'exact', reads: 'payee', direction: 'either', category: category.value.id, state: 'on' }, { actor: 'p_1' });
  assert.ok(ruled.ok, JSON.stringify(ruled));
  const index = await called(api, 'record_index', {});
  assert.equal(index.isError, false, index.text);
  const figures = (index.structured as { figures?: unknown }).figures;
  assert.ok(Array.isArray(figures) && figures.length > 0, `record_index names no figure: ${index.text.slice(0, 200)}`);
  for (const id of figures as string[]) {
    const spoken = id.replace(':<value>', ':Kiln');
    const got = await called(api, 'get', { spoken });
    assert.equal(got.isError, false, `${spoken}: ${got.text}`);
  }
  sql.close();
});

/**
 * EVERY FIGURE THE RECORD DECLARES, AND NOT ONLY THE ONES A PAGE DRAWS, now that the record answers `figures`. Before it,
 * the list was the drawn ones: 18 of 36 on this record, `late-in` not among them. With the record's list and every id
 * still read through `metric` before it was named, it was 35: `project-owed` is read about one project, and asked bare
 * `metric` refuses it `REF_UNKNOWN`, so the check dropped a figure that exists.
 *
 * SO A TEMPLATE IS NAMED WITH ITS SLOT in `record_index`, `project-owed:<value>`, which is how `get` takes it, and it is
 * left out of `resources/list`, where an address is offered only if reading it answers; `braindog:metric/{id}` is the
 * template a client fills.
 */
test('record_index names every figure money-core declares, and resources/list every one that reads without a parameter', async () => {
  const { sql, api, declared } = await money();
  const named = ((await called(api, 'record_index', {})).structured as { figures: string[] }).figures;
  assert.deepEqual([...named].map((id) => id.split(':')[0]).sort(), [...declared].sort(), `${named.length} of ${declared.length} named`);
  assert.ok(named.includes('late-in'));
  assert.ok(named.includes('project-owed:<value>'), `the template is not named with its slot: ${named.filter((id) => id.startsWith('project'))}`);
  const offered = (await tools(api as never).resources(owner)).map((r) => r.uri).filter((u) => u.startsWith('braindog:metric/'));
  /* `book-cash` (money-core 3.1.0) is a template too, `book is {{it}}`, so it is left out of `resources/list` the same
     way `project-owed` and the two project walks are: an address is offered only if reading it answers bare. So is
     `book-spent-month`, which money-core declared after it, over the same slot. And `project-said` (portfolio 1.16.0),
     whether one project says where it stands, read about one project at a time. And money-core 3.17.0's
     `budget-passed-on`, read about one category, and its seven figures of one plan (`plan is {{it}}`, one of them plan-lead-all-paid-72's; plan-share-left went out in batch 74), and its three of one book's month
     (`book is {{it}}`): in, out and net, and what is due to come into one book and go out of it (book-owed-figures-73),
     and the same three by month, which a book's chart is drawn on (book-page-months-73). And
     `book-lasts-until`, the day one book's money runs out, a walk that opens from `book-cash:{{it}}` (book-lasts-until-76). And portfolio 1.19.0's `kpi-stale`, the days since one
     measure was read, its name in a tree. And portfolio 1.23.0's three of one project: how many stages it keeps, and
     whether its plan is kept as its road or its roadmap. And money-core 3.29.0's five of one account, and the plan page's
     eight more of one plan. And money-core 3.32.0's weeks of one payee and of one category. And `filing-rule-filed`, what
     one filing rule filed, and `book-accounts`, the accounts of one book. */
  const templates = ['filing-rule-filed', 'book-accounts', 'project-owed', 'project-in-by-month', 'project-out-by-month', 'book-cash', 'book-spent-month', 'project-in-month', 'project-out-month', 'project-kept-month', 'project-said', 'budget-passed-on', 'plan-parts-paid', 'plan-parts', 'plan-paid', 'plan-left', 'plan-next-due', 'plan-last-due', 'plan-parts-open', 'book-in-month', 'book-out-month', 'book-net-month', 'book-owed-to', 'book-owed-by', 'book-in-by-month', 'book-out-by-month', 'book-net-by-month', 'book-lasts-until', 'kpi-stale', 'project-staged', 'project-plan-path', 'project-plan-roadmap', 'account-now', 'account-lines', 'account-gap', 'account-in-by-month', 'account-out-by-month', 'plan-late', 'plan-parts-cancelled', 'plan-paid-by-quarter', 'plan-left-by-plan', 'plan-next-due-by-plan', 'plan-after-next-by-plan', 'plan-parts-by-plan', 'plan-parts-paid-by-plan', 'paid-to-by-week', 'spent-in-category-by-week'];
  assert.deepEqual(offered.map((u) => u.slice('braindog:metric/'.length)).sort(), declared.filter((id) => !templates.includes(id)).sort());
  for (const uri of offered) assert.ok((await tools(api as never).read(uri, owner)).ok, `${uri} is offered and refuses`);
  sql.close();
});

/**
 * AND IT IS CHEAP AGAIN, which a review of `4c707131` pointed out: with no list to take, `record_index` drew every
 * page the caller may open, which runs each block, and then read every figure it found. Measured over this record with
 * 500 rows of obligations, averaged over 20 calls on a busy machine: `boot` and `version` alone took 20 to 30 ms, the
 * drawn list 110 to 177 ms (5 pages run, 18 figures read), and the record's list with each id read again through
 * `metric` 67 ms (36 figures read). Taken at the record's word it is 20 to 24 ms, `boot`, `version` and `figures`, and
 * `figures` itself 0.5 to 1.4 ms: one read of the live declarations and one access check a figure. The answer grew from
 * 869 bytes to 1,197 for naming 36 figures and not 18. Counted here as calls, because a time in a test is a flake.
 */
test('record_index ASKS THREE METHODS, and reads no page and no figure to name them', async () => {
  const { sql, api } = await money();
  const asked: string[] = [];
  const counted = new Proxy(api, {
    get: (target, key) => {
      const value = (target as unknown as Record<string | symbol, unknown>)[key];
      return typeof value === 'function' ? (...args: unknown[]) => (asked.push(String(key)), value.apply(target, args)) : value;
    },
  });
  const index = await tools(counted as never).call('record_index', {}, owner);
  assert.ok(index.ok, JSON.stringify(index));
  /* THE DOOR'S `beat` IS THE RUN'S HEARTBEAT (`beatOn`), sent and never waited on, and reads nothing to name a figure. */
  assert.deepEqual(asked.filter((m) => m !== 'beat').sort(), ['boot', 'figures', 'version']);
  sql.close();
});

/* ── the tool layer, over a surface that answers what it is asked ─────── */

test('A FIGURE IS NEVER A ROW: a bare id goes to metric, a parameter after the colon goes with it, and a row still goes to get', async () => {
  const { surface, calls } = stub();
  const mcp = tools(surface);
  assert.ok((await mcp.call('get', { spoken: 'owed' }, { who: 'agent' })).ok);
  assert.ok((await mcp.call('get', { spoken: 'project-owed:C:\\Repos' }, { who: 'agent' })).ok);
  assert.ok((await mcp.call('get', { spoken: 'obligations#41' }, { who: 'agent' })).ok);
  assert.deepEqual(
    calls.map((c) => [c.method, c.args]),
    [
      ['metric', { metric: 'owed' }],
      ['metric', { metric: 'project-owed:C:\\Repos' }],
      ['get', { register: 'obligations', seq: 41 }],
    ],
  );
});

test('A FIGURE THE RECORD REFUSES IS REFUSED AS AN ID THAT NAMES NOTHING, with the row grammar and where figures are named', async () => {
  /* THE RECORD'S OWN ANSWER FOR A FIGURE OVER A LIST THE CALLER CANNOT READ IS `METRIC_UNKNOWN`, the one it gives a name
     nobody declared, so that a name leaks nothing. `get` keeps it so: the refusal is about the spoken id, and it sends a
     caller who meant a row to the row forms, which a sentence about metrics alone did not. */
  const { surface } = stub({ metric: async () => ({ ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: 'There is no metric called tasks.', at: 'metric' } }) });
  const said = await tools(surface).call('get', { spoken: 'tasks' }, { who: 'agent' });
  assert.equal(said.ok, false);
  const refusal = (said as { refusal: { code: string; fix: string; at: string } }).refusal;
  assert.equal(refusal.code, 'VALUE_MALFORMED');
  assert.equal(refusal.at, 'spoken');
  assert.match(refusal.fix, /tasks#41/);
  assert.match(refusal.fix, /record_index/);
});

test('A HOST THAT ANSWERS figures IS TAKEN AT ITS WORD: listed whole, a template with its slot, and no figure read to name one', async () => {
  /* THE RECORD'S LIST IS HELD TO `metric`'s OWN CHECK, figure by figure (`packages/record/test/figures-list.test.ts`), so
     reading each id again here was the same check twice at the price of a query each, and it dropped the template. */
  const { surface, calls } = stub({
    figures: async () => ({ ok: true, value: [{ id: 'owed', name: 'Owed' }, { id: 'undrawn', name: 'Undrawn' }, { id: 'project-owed', name: 'Owed to you', param: true }] }),
  });
  const mcp = tools(surface);
  const index = await mcp.call('record_index', {}, { who: 'agent' });
  assert.ok(index.ok);
  assert.deepEqual((index.value as { figures: string[] }).figures, ['owed', 'undrawn', 'project-owed:<value>']);
  const listed = (await mcp.resources({ who: 'agent' })).filter((r) => r.uri.startsWith('braindog:metric/'));
  assert.deepEqual(listed.map((r) => r.uri), ['braindog:metric/owed', 'braindog:metric/undrawn']);
  assert.match(listed[0]!.description, /^Owed: the figure owed,/, 'the name the record gave is not where a client looks for it');
  assert.deepEqual(calls.filter((c) => c.method === 'metric' || c.method === 'page'), [], 'a figure was read to be named');
});

test('A HOST THAT DOES NOT IS LISTED THE DRAWN ONES, each read first, and a figure the record then refuses is named nowhere', async () => {
  /* The fallback keeps its read, because a reading survives its own refusal: a page carries the id of a cell it could not
     fill, so an id taken from a page is not yet an id the caller may read. */
  const refused = new Set(['payroll']);
  const { surface } = stub({
    /* `record_index` takes the pages from `boot`, already in hand, and `resources/list` asks `pages`: both say Desk. */
    boot: async () => ({ ok: true, value: { registers: [{ id: 'obligations', name: 'Obligations' }], pages: [{ slug: 'desk', title: 'Desk' }] } }),
    pages: async () => ({ ok: true, value: [{ slug: 'desk', title: 'Desk' }] }),
    page: async () => ({ ok: true, value: { blocks: [{ readings: [{ metric: 'owed' }, { metric: 'payroll' }] }] } }),
    metric: async (args) =>
      refused.has(args.metric)
        ? { ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${args.metric}.`, at: 'metric' } }
        : { ok: true, value: { value: 1 } },
  });
  const mcp = tools(surface);
  const index = await mcp.call('record_index', {}, { who: 'agent' });
  assert.ok(index.ok);
  assert.deepEqual((index.value as { figures: string[] }).figures, ['owed']);
  const listed = (await mcp.resources({ who: 'agent' })).map((r) => r.uri).filter((u) => u.startsWith('braindog:metric/'));
  assert.deepEqual(listed, ['braindog:metric/owed']);
});

test('AND IT COST NO TOOL: sixteen, and no figure tool among them', () => {
  assert.equal(TOOLS.length, 16);
  assert.ok(TOOLS.some((t) => t.name === 'get' && /figure/.test(t.description)), 'get does not say it reads a figure');
  assert.ok(TOOLS.some((t) => t.name === 'record_index' && /figures/.test(t.description)), 'record_index does not say it names the figures');
});
