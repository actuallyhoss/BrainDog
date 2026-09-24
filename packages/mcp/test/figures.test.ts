/**
 * A figure is read with tools alone, whatever pack declared it (audit sixty-two finding 2, probe M1).
 *
 * WHAT WENT WRONG. When the `money` tool left the core (`48ac43a1`), the figures it read stayed reachable as
 * `braindog:metric/<id>`, and only there. The probe installed money-core as it ships, with two accounts in two
 * currencies, and called each of the nine read tools with the most helpful arguments it takes: none of the nine
 * answers named the figure, so a client that hands its model tools and not resources had no figure at all, and the
 * one fallback was `list` and adding the rows up, which is the arithmetic the record exists to refuse (two currencies
 * summed). And `resources/list` offered a figure only when a page drew it: 18 of money-core's 36.
 *
 * WHAT REPLACES IT IS NO SIXTEENTH TOOL. The count is fifteen and the budget had 72 tokens left, so the two tools an
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

/** M1's record: money-core through the owner's door as it ships, and CIB in EGP beside Payoneer in USD. */
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

/** A tool called over the wire, as a client that reads no resources calls it, answered as the text the model reads. */
async function called(api: unknown, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, api as never, owner)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const result = reply.result as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, text: result.content.map((c) => c.text).join('') };
}

test('M1 A TOOLS-ONLY AGENT READS A FIGURE: get of its id answers the reading, one amount per currency and no sum', async () => {
  const { sql, api } = await money();
  const got = await called(api, 'get', { spoken: 'cash-now' });
  assert.equal(got.isError, false, got.text);
  const figure = JSON.parse(got.text) as { value?: unknown; parts?: { currency?: string; amount?: number }[] };
  assert.deepEqual(figure.parts, [{ currency: 'EGP', amount: 5_200_000 }, { currency: 'USD', amount: 340_050 }], got.text);
  assert.equal(figure.value, null, 'two currencies were added into one number');
  sql.close();
});

test('M1 AND THE ONE NO PAGE DRAWS: get of every figure the removed tool read answers it', async () => {
  const { sql, api } = await money();
  for (const id of FORMER) {
    const got = await called(api, 'get', { spoken: id });
    assert.equal(got.isError, false, `${id}: ${got.text}`);
  }
  sql.close();
});

test('record_index NAMES THE FIGURES IT CAN, and each one it names is one get answers', async () => {
  const { sql, api } = await money();
  const index = await called(api, 'record_index', {});
  assert.equal(index.isError, false, index.text);
  const figures = (JSON.parse(index.text) as { figures?: unknown }).figures;
  assert.ok(Array.isArray(figures) && figures.length > 0, `record_index names no figure: ${index.text.slice(0, 200)}`);
  for (const id of figures as string[]) assert.equal((await called(api, 'get', { spoken: id })).isError, false, id);
  sql.close();
});

/**
 * EVERY FIGURE THE RECORD DECLARES, AND NOT ONLY THE ONES A PAGE DRAWS, WHICH IS HALF OF THIS FINDING THAT IS NOT
 * THIS PACKAGE'S TO CLOSE. No method the record answers lists its figures: `pages` and `page` name the ones drawn,
 * `arrangement` names packs and pages, and `metric` answers one id. So until the record answers `figures`, which the
 * surface below takes when a host has it, the list is the drawn ones. Measured on this record: 18 of 36, and `late-in`
 * not among them, which is still the case `get` above answers by id. A `todo` and not a pass, so the run says so.
 */
test('record_index and resources/list name every figure money-core declares', { todo: 'the record has no figures method yet' }, async () => {
  const { sql, api, declared } = await money();
  const named = (JSON.parse((await called(api, 'record_index', {})).text) as { figures: string[] }).figures;
  assert.deepEqual([...named].sort(), [...declared].sort(), `${named.length} of ${declared.length} named`);
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

test('A HOST THAT ANSWERS figures IS LISTED WHOLE, and a figure the record then refuses is named nowhere', async () => {
  const refused = new Set(['payroll']);
  const { surface } = stub({
    figures: async () => ({ ok: true, value: [{ id: 'owed', name: 'Owed' }, { id: 'undrawn', name: 'Undrawn' }, { id: 'payroll', name: 'Payroll' }] }),
    metric: async (args) =>
      refused.has(args.metric)
        ? { ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${args.metric}.`, at: 'metric' } }
        : { ok: true, value: { value: 1 } },
  });
  const mcp = tools(surface);
  const index = await mcp.call('record_index', {}, { who: 'agent' });
  assert.ok(index.ok);
  assert.deepEqual((index.value as { figures: string[] }).figures, ['owed', 'undrawn']);
  const listed = (await mcp.resources({ who: 'agent' })).map((r) => r.uri).filter((u) => u.startsWith('braindog:metric/'));
  assert.deepEqual(listed, ['braindog:metric/owed', 'braindog:metric/undrawn']);
});

test('AND IT COST NO TOOL: fifteen, the same fifteen names', () => {
  assert.equal(TOOLS.length, 15);
  assert.ok(TOOLS.some((t) => t.name === 'get' && /figure/.test(t.description)), 'get does not say it reads a figure');
  assert.ok(TOOLS.some((t) => t.name === 'record_index' && /figures/.test(t.description)), 'record_index does not say it names the figures');
});
