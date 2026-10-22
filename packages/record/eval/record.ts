/**
 * The record the evaluation drafts over and writes headlines for, and the fresh record `tools/model-checks/describe-live.mjs`
 * asks a host's door over: one person's money at HSBC, a small baking trade and an
 * allotment, each with a page in the rail that opens on a lead note with real figures.
 *
 * THE SAME SEED FOR EVERY CASE, A FRESH COPY EACH TIME. `slashDraft` files nothing, but it writes a ledger row per ask and
 * reads use from the record, so each description is drafted over a record nobody else's case has touched, and two runs
 * hand the model the same reading.
 *
 * ORDINARY DECLARATIONS AND NOTHING SPECIAL: lists, figures and pages as any pack or person would declare
 * them, so what the model is measured on is what it meets on any record.
 *
 * THE CLOCK STANDS STILL ON FRIDAY 2 OCTOBER 2026, so "late" and "this month" name the same rows on every run. Money is in
 * minor units with its currency, and every sum here is of one currency, GBP.
 */

import { createRecordApi, type CallContext, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/** 2026-10-02T09:00:00Z. */
export const NOW = Date.UTC(2026, 9, 2, 9);

export const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const reg = (id: string, name: string, title: string, fields: unknown[], done?: readonly string[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields, ...(done === undefined ? {} : { state: 'state', done }) } as never,
});
const metric = (id: string, name: string, source: string, value: unknown, format: string, where?: string) => ({
  id: `metric.${id}`,
  kind: 'metric' as const,
  body: { metric: id, name, source: `register.${source}`, ...(where === undefined ? {} : { where }), value, format, target: { gte: 0 }, window: '30d', compare: 'none' } as never,
});
const page = (id: string, title: string, icon: string, order: number, requires: string[], blocks: unknown[]) => ({
  id: `page.${id}`,
  kind: 'page' as const,
  body: { page: id, title, icon, nav: { section: 'Work', order }, requires: requires.map((r) => `register.${r}`), blocks } as never,
});

const SEED = [
  reg('accounts', 'Accounts', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'balance', type: 'money', required: true },
  ]),
  reg(
    'bills',
    'Bills',
    'what',
    [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
    ['paid'],
  ),
  reg(
    'orders',
    'Orders',
    'what',
    [
      { id: 'what', type: 'text', required: true },
      { id: 'price', type: 'money' },
      { id: 'due', type: 'day' },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    ['done'],
  ),
  reg(
    'jobs',
    'Jobs',
    'what',
    [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    ['done'],
  ),
  metric('cash-now', 'Cash now', 'accounts', { sum: 'balance' }, 'money.GBP', 'name is HSBC current'),
  metric('bills-owed', 'Still to pay', 'bills', { sum: 'amount' }, 'money.GBP', 'state is open'),
  metric('bills-open', 'Bills to pay', 'bills', { count: 'id' }, 'int', 'state is open'),
  metric('orders-open', 'Orders to bake', 'orders', { count: 'id' }, 'int', 'state is open'),
  metric('takings-month', 'Takings', 'orders', { sum: 'price' }, 'money.GBP', 'state is done'),
  metric('jobs-open', 'Jobs to do', 'jobs', { count: 'id' }, 'int', 'state is open'),
  page('money', 'HSBC', 'wallet', 10, ['accounts', 'bills'], [
    { kind: 'note', lead: true, span: 12, body: '{{cash-now}} in the current account, {{bills-owed}} still to pay across {{bills-open}} bills.' },
    { kind: 'table', heading: 'Bills', icon: 'calendar', span: 12, source: 'register.bills', where: 'state is open', columns: [{ field: 'what' }, { field: 'amount' }, { field: 'due' }], empty: 'Every bill is paid.' },
  ]),
  page('bake', 'Bake', 'book', 20, ['orders'], [
    { kind: 'note', lead: true, span: 12, body: '{{orders-open}} orders to bake, {{takings-month}} taken this month.' },
    { kind: 'table', heading: 'Still to bake', icon: 'calendar', span: 12, source: 'register.orders', where: 'state is open', columns: [{ field: 'what' }, { field: 'due' }], empty: 'Nothing left to bake.' },
  ]),
  page('allotment', 'Allotment', 'task', 30, ['jobs'], [
    { kind: 'note', lead: true, span: 12, body: '{{jobs-open}} jobs to do on the plot.' },
    { kind: 'table', heading: 'On the plot', icon: 'check', span: 12, source: 'register.jobs', where: 'state is open', columns: [{ field: 'what' }], empty: 'Nothing to do on the plot.' },
  ]),
];

const ROWS: { register: string; fields: Record<string, unknown> }[] = [
  { register: 'accounts', fields: { name: 'HSBC current', balance: gbp(184_250) } },
  { register: 'accounts', fields: { name: 'HSBC saver', balance: gbp(620_000) } },
  { register: 'bills', fields: { what: 'EDF energy', amount: gbp(11_840), due: '2026-09-28', state: 'open' } },
  { register: 'bills', fields: { what: 'Council tax', amount: gbp(16_700), due: '2026-10-05', state: 'open' } },
  { register: 'bills', fields: { what: 'Rent', amount: gbp(95_000), due: '2026-10-01', state: 'paid' } },
  { register: 'bills', fields: { what: 'Phone', amount: gbp(2_400), due: '2026-10-12', state: 'open' } },
  { register: 'orders', fields: { what: 'Sourdough for the Lees', price: gbp(1_200), due: '2026-10-03', state: 'open' } },
  { register: 'orders', fields: { what: 'Birthday cake, Ama', price: gbp(4_500), due: '2026-10-04', state: 'open' } },
  { register: 'orders', fields: { what: 'Cinnamon buns, café', price: gbp(3_600), due: '2026-10-01', state: 'done' } },
  /* THREE BAKES DONE ON THREE DAYS, and not one: a description that puts what was taken beside what was spent (`cases.ts`,
     the baking costs) reads takings worth a sentence, and a chart over the orders has the three points it needs to be drawn. */
  { register: 'orders', fields: { what: 'Focaccia, market café', price: gbp(2_800), due: '2026-09-24', state: 'done' } },
  { register: 'orders', fields: { what: 'Lemon drizzle, the Okafors', price: gbp(2_200), due: '2026-09-29', state: 'done' } },
  { register: 'jobs', fields: { what: 'Lift the last potatoes', state: 'open' } },
  { register: 'jobs', fields: { what: 'Mend the shed door', state: 'open' } },
  { register: 'jobs', fields: { what: 'Sow the broad beans', state: 'done' } },
];

/** A meter with room for every ask, the person's and the background's, so nothing here is turned away for its count. */
export const METER: SlashMeter = {
  hold: async () => ({ ok: true, value: { settle: () => {}, release: () => {} } }),
  background: async () => ({ ok: true, value: { settle: () => {}, release: () => {} } }),
};

/** A fresh copy of the seed, its model the one given. Throws when the seed itself is refused, which is this file's fault. */
export async function seeded(model: SlashModel) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), slashModel: model, slashMeter: METER });
  const put = await api.kernel.install(SEED);
  if (!put.ok) throw new Error(`The evaluation's seed was refused: ${JSON.stringify(put)}`);
  for (const row of ROWS) {
    const made = (await api.create(row, OWNER)) as { ok: boolean; refusal?: { fix: string } };
    if (!made.ok) throw new Error(`A seed row for ${row.register} was refused: ${made.refusal?.fix}`);
  }
  return { sql, api };
}
