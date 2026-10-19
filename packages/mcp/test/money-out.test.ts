/**
 * The core MCP server knows no use case's figure ids.
 *
 * WHAT WAS THERE. A sixteenth tool, `money`, read seven figures the money-core pack declares, by id, out of a constant
 * in `src/index.ts` (`MONEY_FIGURES`), and on a record without that pack its refusal told the agent to install
 * `money-core`. So the one server every record speaks carried one pack's vocabulary, and a record whose money lives in
 * a pack of its own figure names read a tool that could only ever say "install ours".
 *
 * WHAT REPLACES IT IS NOTHING BY NAME. A pack's figures already reach an agent the way every other pack's do: a page
 * that draws them is `braindog:page/<slug>`, each figure it draws is offered at `braindog:metric/<id>`, and both answer
 * the record's own reading, which carries more than the tool's relay did (the tool whitelisted eight keys of it). The
 * tests below hold the removal and then read, over the wire, the one shape the tool existed to protect: two currencies
 * with no rate between them come back as one amount per currency, never a sum.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createRecordApi, type CallContext } from '@braindog/record';

import * as mcp from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** The seven ids the tool read, spelled out here so that the package under test does not have to. */
const MONEY_CORE_IDS = ['cash-now', 'received-30d', 'spent-30d', 'in-30d', 'out-30d', 'late-in', 'overdue'];

test('NO `money` TOOL: sixteen tools, and a call by that name is refused like any other name that is not one', async () => {
  assert.equal(mcp.TOOLS.some((t) => t.name === 'money'), false, 'the core still advertises a tool for one pack');
  assert.equal(mcp.TOOLS.length, 17);
  assert.equal('MONEY_FIGURES' in mcp, false, 'the core still exports a list of one pack\'s figure ids');

  const { surface, calls } = stub();
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'money', arguments: {} } }, surface, { who: 'agent' })) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const said = (reply.result as { structuredContent: unknown }).structuredContent as { code: string; allowed: string[] };
  assert.equal(said.code, 'ROUTE_UNKNOWN');
  assert.equal(said.allowed.includes('money'), false);
  assert.deepEqual(calls, [], 'a name that is not a tool read the record');
});

test('AND THE SOURCE NAMES NO FIGURE OF money-core, in code or in a comment', () => {
  /* A comment counts, because the last time a use case lived here the comments were where it was argued for, and a
     comment that says `cash-now` is a comment that goes stale the day the pack renames it. */
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  for (const id of [...MONEY_CORE_IDS, 'money-core']) assert.equal(source.includes(id), false, `src/index.ts still names ${id}`);
});

/* ── what an agent reads instead ────────────────────────────────────────── */

type Decl = { id: string; kind: 'register' | 'metric' | 'page'; body: never };

/** One register of two accounts, the figure over it, and a page that draws the figure: a pack cut down to one figure. */
const PACK: Decl[] = [
  {
    id: 'register.accounts',
    kind: 'register',
    body: {
      id: 'accounts',
      name: 'Accounts',
      title: 'name',
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'balance', type: 'money', required: true },
        { id: 'liquid', type: 'bool', default: true },
      ],
    } as never,
  },
  {
    id: 'metric.cash-now',
    kind: 'metric',
    body: { metric: 'cash-now', name: 'Cash now', source: 'register.accounts', where: 'liquid is true', value: { sum: 'balance' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
  },
  { id: 'page.money', kind: 'page', body: { page: 'money', title: 'Money', blocks: [{ kind: 'stat', cells: [{ metric: 'cash-now', label: 'Cash now' }] }] } as never },
];

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const installed = await api.kernel.install(PACK);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(api.kernel.create('accounts', { name: 'Current', balance: { amount: 985_000, currency: 'GBP' }, liquid: true }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('accounts', { name: 'Dollars', balance: { amount: 340_050, currency: 'USD' }, liquid: true }, { actor: 'p_1' }).ok);
  return { sql, api };
}

async function over(api: Parameters<typeof handle>[1], method: string, params?: Record<string, unknown>): Promise<unknown> {
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }, api, owner)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return reply.result;
}

test('A PACK\'S PAGE OFFERS ITS FIGURES, and the figure answers one amount per currency and no sum', async () => {
  const { sql, api } = await record();

  const listed = ((await over(api, 'resources/list')) as { resources: { uri: string }[] }).resources.map((r) => r.uri);
  assert.ok(listed.includes('braindog:page/money'), 'the page the pack declares is not offered');
  assert.ok(listed.includes('braindog:metric/cash-now'), 'the figure the page draws is not offered, so an agent has to know its id');

  const read = (await over(api, 'resources/read', { uri: 'braindog:metric/cash-now' })) as { contents: { text: string }[] };
  const figure = JSON.parse(read.contents[0]!.text) as { value?: unknown; parts?: { currency?: string; amount?: number }[] };
  /* WHAT THE TOOL WAS FOR, READ WITHOUT IT. Sterling and dollars on a record with no home currency are two parts and
     no value, never one sum of pounds and dollars read as a position. Measured before the tool left: the resource
     already answered exactly this, `held` and `rows` and `met` included, which are keys the tool's relay had to be
     taught one at a time. */
  assert.deepEqual(figure.parts, [{ currency: 'GBP', amount: 985_000 }, { currency: 'USD', amount: 340_050 }], read.contents[0]!.text);
  assert.equal(figure.value, null, 'the figure added two currencies into one number');
  sql.close();
});
