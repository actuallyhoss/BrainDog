/**
 * The `money` tool, over a real record, in one currency and then in three.
 *
 * WHAT IS UNDER TEST IS THE ARITHMETIC THE TOOL DOES NOT DO. The tool reads figures the money pack
 * declares and relays them; the number is the kernel's. So the assertions below are mostly about the
 * shape an agent reads when there is more than one currency in the record: one amount per currency
 * and no total, the pair of currencies a rate would join, and the day of the rate when there was
 * one. A tool that added EGP to USD would pass a test that only checked it answered.
 *
 * THE REGISTERS ARE THE MONEY PACK'S, CUT DOWN TO THE FIELDS THESE SEVEN FIGURES READ. The pack's
 * own registers carry `ref` fields into `people` and `things`, which belong to two other modules, so
 * installing them here would mean installing half the seed to test a relay. The figure ids are the
 * pack's own, and the last test holds them to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { MONEY_FIGURES, tools } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { MONEY_METRICS } from '../../seed/src/modules/money.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Decl = { id: string; kind: 'register' | 'metric'; body: never };

const register = (id: string, name: string, title: string, fields: object[]): Decl => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title, fields } as never,
});

const REGISTERS: Decl[] = [
  register('accounts', 'Accounts', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'balance', type: 'money', required: true },
    { id: 'as_of', type: 'day', index: true, required: true },
    { id: 'liquid', type: 'bool', default: true },
  ]),
  register('obligations', 'Obligations', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'due', type: 'day', index: true, required: true },
    { id: 'direction', type: 'enum', values: ['owed_to_me', 'owed_by_me'], index: true, required: true },
    { id: 'state', type: 'enum', values: ['open', 'part', 'paid', 'written_off'], index: true, required: true },
    { id: 'settled', type: 'day' },
  ]),
  register('transactions', 'Transactions', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'on', type: 'day', index: true, required: true },
    { id: 'direction', type: 'enum', values: ['in', 'out'], index: true, required: true },
    { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', index: true, required: true },
    { id: 'transfer', type: 'bool', default: false, index: true },
  ]),
  register('fx', 'Rates', 'currency', [
    { id: 'currency', type: 'text', required: true },
    { id: 'base', type: 'text', required: true },
    { id: 'rate', type: 'decimal', required: true },
    { id: 'as_of', type: 'day', index: true, required: true },
  ]),
];

/**
 * The seven the tool reads, with the pack's ids, its predicates, its sterling format and its
 * comparisons. `compare` is the pack's own because it is what puts `delta` on an answer, and two of
 * the seven declare `previous`: a copy that said `none` everywhere would leave the tool's movement
 * relayed by nothing.
 */
const figure = (metric: string, source: string, where: string, target: object, compare = 'none'): Decl => ({
  id: `metric.${metric}`,
  kind: 'metric',
  body: { metric, name: metric, source: `register.${source}`, where, value: { sum: source === 'accounts' ? 'balance' : 'amount' }, format: 'money.GBP', target, window: '30d', compare } as never,
});

const FIGURES: Decl[] = [
  figure('cash-now', 'accounts', 'liquid is true', { gte: 0 }),
  figure('received-30d', 'transactions', 'state is cleared, transfer is false, direction is in, on after -31d', { gte: 0 }, 'previous'),
  figure('spent-30d', 'transactions', 'state is cleared, transfer is false, direction is out, on after -31d', { lte: 1_500_000 }, 'previous'),
  figure('in-30d', 'obligations', 'state is open or part, direction is owed to me, due before +31d', { gte: 0 }),
  figure('out-30d', 'obligations', 'state is open or part, direction is owed by me, due before +31d', { lte: 5_000_000 }),
  figure('late-in', 'obligations', 'state is open or part, direction is owed to me, due before today', { lte: 0 }),
  figure('overdue', 'obligations', 'state is open or part, direction is owed by me, due before today', { lte: 0 }),
];

async function studio(withMoney = true, declared: Decl[] = FIGURES) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const installed = await api.kernel.install(withMoney ? [...REGISTERS, ...declared] : [register('notes', 'Notes', 'what', [{ id: 'what', type: 'text', required: true }])]);
  assert.ok(installed.ok, installed.ok ? '' : JSON.stringify(installed));
  /* The pack is remembered so that `home_currency` has somewhere to be set, which is how a record holds it. */
  if (withMoney)
    api.kernel.rememberPack({ id: 'money-core', version: '1.2.0', source: 'local', ref: null, manifest: JSON.stringify({ pack: 'money-core', version: '1.2.0', config: { home_currency: { type: 'text' } } }), checksum: 'not-a-real-checksum' });
  return { sql, api, mcp: tools(api) };
}

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/** Every figure of an answer, or the assertion that says which refusal came instead. */
const figures = (r: unknown): Record<string, Record<string, unknown>> => {
  const x = r as { ok: boolean; value?: { figures: Record<string, Record<string, unknown>> }; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value!.figures;
};
const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string } };
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal;
};

/* ── one currency ────────────────────────────────────────────────────────── */

test('SEVEN FIGURES IN ONE CALL, each the number the record already keeps and none of them the tool\'s own', async () => {
  const { sql, api, mcp } = await studio();
  assert.ok(api.kernel.create('accounts', { name: 'Current', balance: gbp(985_000), as_of: '2026-09-16', liquid: true }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('accounts', { name: 'Card', balance: gbp(-124_000), as_of: '2026-09-16', liquid: false }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('transactions', { what: 'Retainer', amount: gbp(240_000), on: '2026-09-02', direction: 'in', state: 'cleared', transfer: false }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('transactions', { what: 'Studio rent', amount: gbp(165_000), on: '2026-09-01', direction: 'out', state: 'cleared', transfer: false }, { actor: 'p_1' }).ok);
  /* A payment the bank has taken and not settled is not a fact yet, and the pack's predicate leaves it out. */
  assert.ok(api.kernel.create('transactions', { what: 'Not settled', amount: gbp(90_000), on: '2026-09-15', direction: 'out', state: 'pending', transfer: false }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('obligations', { what: 'Invoice 41', amount: gbp(480_000), due: '2026-08-10', direction: 'owed_to_me', state: 'open' }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('obligations', { what: 'Illustration', amount: gbp(135_000), due: '2026-09-15', direction: 'owed_by_me', state: 'open' }, { actor: 'p_1' }).ok);

  const money = figures(await mcp.call('money', {}, owner));
  assert.deepEqual(Object.keys(money), ['cash-now', 'received-30d', 'spent-30d', 'in-30d', 'out-30d', 'late-in', 'overdue']);
  /* The card is not cash, so 985,000 and not 861,000: the predicate is the pack's, read here and not
     rewritten. `rows: 1` of `list_rows: 2` is that predicate said as a count, and the pair is what
     keeps a zero readable: one account of two matched, and both were typed in by somebody. */
  assert.deepEqual(money['cash-now'], { currency: 'GBP', amount: 985_000, rows: 1, list_rows: 2, met: true });
  assert.equal(money['spent-30d']?.amount, 165_000, 'a pending payment was counted as spent');
  assert.equal(money['received-30d']?.amount, 240_000);
  assert.equal(money['late-in']?.amount, 480_000);
  assert.equal(money['overdue']?.amount, 135_000);
  assert.equal(money['overdue']?.met, false, 'a bill eight days late is inside its target of nothing overdue');

  /* THE SAME NUMBER THE RECORD ANSWERS BY ID, which is the whole claim: the tool computes nothing. */
  const alone = (await api.metric({ metric: 'spent-30d' }, owner)) as { ok: true; value: { value: number; rows: number } };
  assert.equal(money['spent-30d']?.amount, alone.value.value);
  assert.equal(money['spent-30d']?.rows, alone.value.rows);
  sql.close();
});

/* ── more than one ───────────────────────────────────────────────────────── */

test('TWO CURRENCIES ARE NEVER ADDED: one amount each, then the pair a rate would join, then one amount with the day of the rate', async () => {
  const { sql, api, mcp } = await studio();
  assert.ok(api.kernel.create('accounts', { name: 'Sterling', balance: gbp(985_000), as_of: '2026-09-16', liquid: true }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('accounts', { name: 'Dollars', balance: { amount: 340_000, currency: 'USD' }, as_of: '2026-09-16', liquid: true }, { actor: 'p_1' }).ok);

  /* NO HOME CURRENCY IS THE PARTS WITH NOTHING NAMED, because no rate would be the right one: nobody
     has said which currency this record adds up in. */
  const apart = figures(await mcp.call('money', {}, owner))['cash-now']!;
  assert.deepEqual(apart.parts, [
    { currency: 'GBP', amount: 985_000 },
    { currency: 'USD', amount: 340_000 },
  ]);
  assert.equal('amount' in apart, false, 'a total appeared over two currencies');
  assert.equal('missing' in apart, false);

  /* A HOME CURRENCY AND NO RATE NAMES THE PAIR, which is the one sentence that leads to a repair. */
  assert.ok(api.kernel.setPackConfig('money-core', { home_currency: 'GBP' }, { actor: 'p_1' }).ok);
  const lacking = figures(await mcp.call('money', {}, owner))['cash-now']!;
  assert.deepEqual(lacking.missing, ['USD to GBP']);
  assert.equal('amount' in lacking, false);

  /* AND WITH THE RATE IT IS ONE AMOUNT THAT SAYS WHICH DAY'S RATE MADE IT. USD 3,400 at 0.75 is GBP 2,550. */
  assert.ok(api.kernel.create('fx', { currency: 'USD', base: 'GBP', rate: 0.75, as_of: '2026-09-15' }, { actor: 'p_1' }).ok);
  const joined = figures(await mcp.call('money', {}, owner))['cash-now']!;
  assert.equal(joined.currency, 'GBP');
  assert.equal(joined.amount, 985_000 + 255_000);
  assert.equal(joined.rate_as_of, '2026-09-15');
  assert.equal(joined.parts, undefined);
  assert.equal(joined.rate_forward, undefined);
  sql.close();
});

test('A RATE FROM AFTER THE DAY IT IS ABOUT SAYS SO, because the same figure at two rates is two numbers', async () => {
  const { sql, api, mcp } = await studio();
  assert.ok(api.kernel.create('accounts', { name: 'Sterling', balance: gbp(100_000), as_of: '2026-09-16', liquid: true }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('accounts', { name: 'Dollars', balance: { amount: 40_000, currency: 'USD' }, as_of: '2026-09-16', liquid: true }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.setPackConfig('money-core', { home_currency: 'GBP' }, { actor: 'p_1' }).ok);
  /* The balance is true on the 16th and the only rate anybody has is from the 20th. */
  assert.ok(api.kernel.create('fx', { currency: 'USD', base: 'GBP', rate: 0.8, as_of: '2026-09-20' }, { actor: 'p_1' }).ok);

  const forward = figures(await mcp.call('money', {}, owner))['cash-now']!;
  assert.equal(forward.amount, 132_000);
  assert.equal(forward.rate_as_of, '2026-09-20');
  assert.equal(forward.rate_forward, true);
  sql.close();
});

/* ── when it cannot answer ───────────────────────────────────────────────── */

test('A RECORD WITH NO MONEY NAMES THE ADD-ON, and does not appear and answer nothing', async () => {
  const { sql, mcp } = await studio(false);
  const said = refusal(await mcp.call('money', {}, owner));
  assert.equal(said.code, 'METRIC_UNKNOWN');
  assert.match(said.fix, /money-core/, 'the refusal does not say what would give this record money');
  assert.match(said.fix, /record_index/, 'the refusal does not say what to do instead');
  sql.close();
});

test('A CALLER WHO CANNOT REACH THE MONEY REGISTERS IS TOLD WHAT A RECORD WITHOUT THEM IS TOLD, and no more', async () => {
  /* THE RECORD ANSWERS `METRIC_UNKNOWN` FOR A FIGURE OVER A REGISTER OUTSIDE THE CEILING SO THAT A
     PROBE CANNOT ENUMERATE WHAT A BUSINESS KEEPS, and a tool that told the two cases apart would
     hand that list back one layer further out. So this is the same sentence, deliberately. */
  const { sql, api, mcp } = await studio();
  assert.ok(api.kernel.create('accounts', { name: 'Current', balance: gbp(985_000), as_of: '2026-09-16', liquid: true }, { actor: 'p_1' }).ok);
  const outside: CallContext = { ...owner, registers: ['fx'] };
  const said = refusal(await mcp.call('money', {}, outside));
  assert.equal(said.code, 'METRIC_UNKNOWN');
  assert.equal(said.fix.includes('cash-now'), false, 'the refusal names a figure the caller may not read');
  sql.close();
});

test('A CALLER WHO MAY NOT READ AT ALL GETS THE RECORD\'S OWN SENTENCE, not an instruction to install what is already there', async () => {
  /* AN APPENDER SEES NOTHING, NOT EVEN WHAT THEY FILED (`20 §1`), so every figure refuses for a
     reason that is not "there is no such figure". Collapsing those into "install the money-core
     add-on" would send somebody to a screen they cannot use to fix a permission they cannot see. */
  const { sql, mcp } = await studio();
  const appender: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'append' } };
  const said = refusal(await mcp.call('money', {}, appender));
  assert.equal(said.code, 'LEVEL_REQUIRED');
  assert.equal(said.fix.includes('money-core'), false, 'a caller who may not read is told to install what is installed');
  assert.match(said.fix, /access/, 'the refusal does not say how to get further');
  sql.close();
});

/* ── what the record said, and nothing dropped on the way ────────────────── */

test('MOVEMENT COMES THROUGH ON A FIGURE THAT DECLARES A COMPARISON, because "spent GBP 1,650" and "spent GBP 1,650, down two fifths" are different answers', async () => {
  /* THE NUMBER IS THE KERNEL'S AND THIS IS ONLY ABOUT ITS ARRIVING. A comparison is the same
     predicate over the window immediately before, the same length and ending where this one starts. It held September's
     row as well as August's until 22 September, which compared a window with a superset of itself and
     could only ever say down: now 165,000 against 110,000 is +0.5. What is asserted here is that the tool hands it on, which
     it did not until this test was written: dropping the `delta` line from `figureOf` left every
     test in this file green. */
  const { sql, api, mcp } = await studio();
  assert.ok(api.kernel.create('transactions', { what: 'Studio rent', amount: gbp(165_000), on: '2026-09-01', direction: 'out', state: 'cleared', transfer: false }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('transactions', { what: 'Studio rent, August', amount: gbp(110_000), on: '2026-08-01', direction: 'out', state: 'cleared', transfer: false }, { actor: 'p_1' }).ok);

  const money = figures(await mcp.call('money', {}, owner));
  assert.equal(typeof money['spent-30d']?.delta, 'number', 'a figure that declares a comparison came back without one');
  assert.equal(money['spent-30d']?.delta, 0.5);
  const alone = (await api.metric({ metric: 'spent-30d' }, owner)) as { ok: true; value: { delta: number } };
  assert.equal(money['spent-30d']?.delta, alone.value.delta);
  /* AND A FIGURE THAT DECLARES NO COMPARISON CARRIES NO KEY, rather than a null an agent has to read. */
  assert.equal('delta' in money['cash-now']!, false);
  sql.close();
});

test('NOTHING OVERDUE OVER TWO INVOICES AND NOTHING OVERDUE OVER AN EMPTY LIST ARE TWO DIFFERENT ANSWERS, and only `list_rows` tells them apart', async () => {
  /* AN AGENT CANNOT SEE THE SCREEN, so it has no second source for this distinction. The kernel
     carries `held` beside `rows` precisely because `{"amount":0,"rows":0,"met":true}` was the same
     payload for a predicate that matched nobody and a list nobody has written to yet, and the tool
     relayed a whitelist that dropped it, so "you have nothing overdue, target met" went back for a
     record with no obligations in it at all. Both halves are asserted in one call below: the same
     answer holds two obligations that are paid and no transactions whatsoever. */
  const { sql, api, mcp } = await studio();
  assert.ok(api.kernel.create('obligations', { what: 'Invoice 41', amount: gbp(480_000), due: '2026-08-10', direction: 'owed_to_me', state: 'paid', settled: '2026-08-09' }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('obligations', { what: 'Illustration', amount: gbp(135_000), due: '2026-09-15', direction: 'owed_by_me', state: 'paid', settled: '2026-09-14' }, { actor: 'p_1' }).ok);

  const money = figures(await mcp.call('money', {}, owner));
  /* Nothing overdue over two obligations is the good news the figure exists to deliver. */
  assert.equal(money['overdue']?.rows, 0);
  assert.equal(money['overdue']?.list_rows, 2, 'the tool dropped the count that makes a zero readable');
  assert.equal(money['overdue']?.met, true);
  /* Nothing received over a ledger nobody has written to is not news at all, and reads identically without this. */
  assert.equal(money['received-30d']?.rows, 0);
  assert.equal(money['received-30d']?.list_rows, 0);
  assert.equal(money['received-30d']?.amount, money['overdue']?.amount, 'the two zeroes differ in the amount, so the test proves nothing');

  /* THE NUMBER IS THE RECORD'S, like every other on this answer: the tool counts nothing itself. */
  const alone = (await api.metric({ metric: 'overdue' }, owner)) as { ok: true; value: { held: number } };
  assert.equal(money['overdue']?.list_rows, alone.value.held);
  sql.close();
});

test('A FIGURE THAT REFUSED FOR A REASON OF ITS OWN KEEPS ITS PLACE AND ITS SENTENCE, because a gap where a figure was is read as a zero', async () => {
  /* ASKED OF THE TOOL AND NOT OF A BROKEN RECORD, deliberately. A healthy declaration over these
     registers cannot produce this: `evaluateMetric` always hands the aggregation an fx context, so
     two currencies come back as parts rather than `MIXED_CURRENCY`, and the codes left are ones a
     declaration and its rows have to have parted company to reach. So one figure's answer is
     replaced and the other six are the record's. Removing the branch that keeps a refusal left every
     other test in this file green. */
  const { sql, api } = await studio();
  assert.ok(api.kernel.create('accounts', { name: 'Current', balance: gbp(985_000), as_of: '2026-09-16', liquid: true }, { actor: 'p_1' }).ok);
  const said = { code: 'MIXED_CURRENCY', fix: 'late-in: the rows are in USD and the format says GBP.', at: 'format' };
  const mcp = tools({ ...api, metric: async (args, ctx) => (args.metric === 'late-in' ? ({ ok: false, refusal: said } as never) : api.metric(args, ctx)) });

  const money = figures(await mcp.call('money', {}, owner));
  assert.deepEqual(Object.keys(money), [...MONEY_FIGURES], 'a figure that refused was dropped, and a missing figure reads as nothing owed');
  assert.deepEqual(money['late-in'], { refusal: said });
  assert.equal(money['cash-now']?.amount, 985_000, 'one figure refusing took the other six with it');
  sql.close();
});

test('AND A PACK TOO OLD TO DECLARE TWO OF THE SEVEN ANSWERS THE FIVE IT HAS, without five figures and two apologies', async () => {
  /* `spent-30d` AND `received-30d` ARRIVED WITH THE LEDGER IN money-core 1.2.0, so a record on an
     earlier version has five of these and no `transactions` register at all. `METRIC_UNKNOWN` is the
     one code left out of the answer for that reason, and this is the test that says so. */
  const { sql, api, mcp } = await studio(true, FIGURES.filter((f) => f.id !== 'metric.spent-30d' && f.id !== 'metric.received-30d'));
  assert.ok(api.kernel.create('accounts', { name: 'Current', balance: gbp(985_000), as_of: '2026-09-16', liquid: true }, { actor: 'p_1' }).ok);

  const money = figures(await mcp.call('money', {}, owner));
  assert.deepEqual(Object.keys(money), ['cash-now', 'in-30d', 'out-30d', 'late-in', 'overdue']);
  assert.equal(money['cash-now']?.amount, 985_000);
  sql.close();
});

/* ── the list is the pack's ──────────────────────────────────────────────── */

test('EVERY FIGURE THE TOOL READS IS ONE THE MONEY PACK DECLARES, so a renamed figure is red here and not silent there', () => {
  /* A FIGURE THE PACK DOES NOT DECLARE ANSWERS `METRIC_UNKNOWN` FOR EVER AND IS LEFT OUT OF EVERY
     ANSWER, silently, which is the shape of defect this tool is careful about: a name that is wrong
     in one place and nowhere red. The tool's list is held to the pack's declarations rather than to
     the registers this file installs, which are a cut-down copy and would only agree with themselves. */
  for (const id of MONEY_FIGURES) assert.ok(Object.hasOwn(MONEY_METRICS, id), `${id} is read by the money tool and declared by no pack`);
  /* AND THE SEVEN ARE OVER THREE REGISTERS, which is the argument for the tool: an agent asking how
     money stands would otherwise have to know three register names and write a predicate for each. */
  assert.deepEqual(
    [...new Set(MONEY_FIGURES.map((id) => (MONEY_METRICS[id] as { source: string }).source))].sort(),
    ['register.accounts', 'register.obligations', 'register.transactions'],
  );
});
