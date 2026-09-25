/**
 * A forecast's `sell:` figure, held from a member who may not open the list it totals.
 *
 * THE KERNEL TAKES `sell: { metric }` ON A FORECAST AND ANSWERS `sells`, the total of a list as the amount a date control
 * may count as sold. `kernel.blockRegisters` names that list, so `heldBy` refuses the block to Wren, invited to Accounts
 * and Bills and not to Store. But the shell `shellOf` makes of a refused block deletes only the keys `DRAWN` and
 * `WRITTEN` name, and `sells` was in neither: measured before the fix, the refused block still carried
 * `sells: [{ label: 'Store value', value: 249976 }]`, the list's total to the minor unit, and `sell` still named the
 * figure. Any page can declare it: a hand-written one, a pack's, or an agent's body shown through `previewPage`.
 *
 * The owner's half is the money check: what `page` hands the owner is exactly what `metric` reads for the same figure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields } as never,
});
const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;
const figure = (metric: string, name: string, source: string, sum: string) =>
  decl('metric', metric, { metric, name, source, value: { sum }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' });

/** Cash walked over Bills, with Store's total offered as what may be sold. */
const WALK = {
  kind: 'forecast',
  source: 'forecast.runway',
  opening: { metric: 'cash-now' },
  from: [{ register: 'bills', on: 'due', amount: 'amount' }],
  horizon: 90,
  knobs: ['horizon', 'sell'],
  sell: { metric: 'store-value' },
};

const DECLS = [
  reg('accounts', 'Accounts', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'balance', type: 'money', required: true },
  ]),
  reg('bills', 'Bills', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'due', type: 'day', required: true },
  ]),
  reg('store', 'Store of value', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'worth', type: 'money' },
  ]),
  figure('cash-now', 'Cash now', 'register.accounts', 'balance'),
  figure('store-value', 'Store value', 'register.store', 'worth'),
  decl('page', 'cash', { page: 'cash', title: 'Cash', blocks: [{ kind: 'table', source: 'register.accounts' }, WALK] }),
];

/** GBP 1,500.75 and GBP 999.01, a total no other number in the record shares. */
const TOTAL = 249_976;

type Block = { kind: string; sells?: { label: string; value: number }[]; sell?: unknown; walk?: { currency?: string }; refusals: { code: string }[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.create({ register: 'accounts', fields: { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'bills', fields: { what: 'Rent', amount: { amount: 600_000, currency: 'GBP' }, due: '2026-10-01' } }, owner));
  value(await api.create({ register: 'store', fields: { what: 'Coins', worth: { amount: 150_075, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'store', fields: { what: 'Bond', worth: { amount: 99_901, currency: 'GBP' } } }, owner));
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { accounts: 'read', bills: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { api, wren };
}

test('THE OWNER IS OFFERED THE SELL FIGURE AS THE RECORD READS IT, to the minor unit', async () => {
  const { api } = await record();
  const read = value<{ value: number; unit: string }>(api.kernel.metric(api.kernel.metricDecl('store-value')!));
  assert.equal(read.value, TOTAL);
  const page = value<{ blocks: Block[] }>(await api.page({ slug: 'cash' }, owner));
  const walk = page.blocks.find((b) => b.kind === 'forecast')!;
  assert.deepEqual(walk.refusals, []);
  assert.deepEqual(walk.sells, [{ label: 'Store value', value: read.value }]);
  assert.equal(walk.walk?.currency, read.unit);
});

test('A MEMBER REFUSED THE FIGURE’S LIST READS THE WALK REFUSED, with no sell value and no sell figure named', async () => {
  const { api, wren } = await record();
  const page = value<{ blocks: Block[] }>(await api.page({ slug: 'cash' }, wren));
  const walk = page.blocks.find((b) => b.kind === 'forecast')!;
  assert.equal(walk.refusals[0]?.code, 'FORBIDDEN');
  assert.equal(walk.sells, undefined, 'the refused block handed her Store’s total');
  assert.equal(walk.sell, undefined, 'the refused block named the figure she may not read');
  assert.equal(walk.walk, undefined);
  assert.ok(!JSON.stringify(page).includes(String(TOTAL)), 'Store’s total is nowhere on her page');
});

test('THE SAME WALK PROPOSED BY AN AGENT IS HELD FROM HER THE SAME WAY, and its figure is not offered', async () => {
  const { api, wren } = await record();
  const body = { page: 'cash-proposed', title: 'Cash, proposed', blocks: [{ kind: 'table', source: 'register.accounts' }, WALK] };
  const drawn = (await api.previewPage({ body }, wren)) as { ok: boolean; value?: { blocks: Block[] } };
  assert.ok(!JSON.stringify(drawn).includes(String(TOTAL)), 'Store’s total is nowhere in her preview');
  if (drawn.ok) {
    const walk = drawn.value!.blocks.find((b) => b.kind === 'forecast')!;
    assert.equal(walk.sells, undefined);
    assert.ok(walk.refusals.length > 0);
  }
  /* AND THE OWNER'S PREVIEW OFFERS IT, so the member's answer is held and not merely broken. */
  const mine = value<{ blocks: Block[] }>(await api.previewPage({ body }, owner));
  assert.deepEqual(mine.blocks.find((b) => b.kind === 'forecast')!.sells, [{ label: 'Store value', value: TOTAL }]);
});
