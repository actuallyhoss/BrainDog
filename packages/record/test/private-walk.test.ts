/**
 * A row its maker kept private is in nobody else's answer, whichever way the answer reaches them.
 *
 * THE CASE: the owner keeps a bill private. `list` gave a member no row, and her forecast block gave her
 * `steps: [{ label: "SECRET", delta: -5000, spoken: "bills#1" }]`: the page's walk read as nobody. So each block that reads the
 * rows is drawn here for the owner and the member over one record, with the private row's name and amount looked for in what
 * the member is sent, and held answers tried both ways round.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import type { Declaration } from '../../kernel/src/index.ts';

const NOW = Date.UTC(2026, 8, 20, 9);
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const P = { actor: 'p_1' };
const money = (amount: number) => ({ amount, currency: 'EGP' });

const register = (id: string, title: string, fields: unknown[]): Declaration => ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title, fields } }) as never;
const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const ACCOUNTS = register('accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
]);
const TRANSACTIONS = register('transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
]);
const BILLS = register('bills', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'kind', type: 'enum', values: ['fixed', 'other'] },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'next_due', type: 'day', index: true },
]);
const LEGS = [{ register: 'bills', on: 'next_due', amount: 'amount', incoming: { field: 'direction', is: 'in' } }];
const CASH = {
  metric: 'cash',
  name: 'Cash now',
  source: 'register.accounts',
  value: { rolled: { balance: 'balance', as_of: 'as_of', moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' } } },
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
};
const OUT = { metric: 'out-30d', name: 'Out', source: 'forecast.runway', legs: LEGS, value: { walk: 'out', within: '30d' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };
const SUM = { metric: 'bills-sum', name: 'Bills', source: 'register.bills', value: { sum: 'amount' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };

const PAGE: Declaration = {
  id: 'page.money',
  kind: 'page',
  body: {
    page: 'money',
    title: 'Money',
    filters: [{ field: 'kind', control: 'chips' }],
    blocks: [
      { kind: 'forecast', source: 'forecast.runway', opening: { metric: 'cash' }, from: LEGS, horizon: 30 },
      { kind: 'stat', cells: [{ metric: 'out-30d' }, { metric: 'bills-sum' }] },
      { kind: 'bar', source: 'register.bills', columns: [{ field: 'what' }, { field: 'amount' }] },
      { kind: 'table', source: 'register.bills', columns: [{ field: 'what', label: 'What' }], empty: 'None.' },
    ],
  },
} as never;

async function made() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAY', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  const installed = await api.kernel.install([ACCOUNTS, TRANSACTIONS, BILLS, metric(CASH), metric(OUT), metric(SUM), PAGE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_2', 'member@example.test', 'Member', NULL) ON CONFLICT DO NOTHING");
  for (const list of ['accounts', 'transactions', 'bills']) sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_2', ?, 'read')", list);
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['accounts', 'transactions', 'bills'], levels: { accounts: 'read', transactions: 'read', bills: 'read' } } as never;
  assert.ok(api.kernel.create('accounts', { name: 'Current', balance: money(1_000_000), as_of: '2026-09-19' }, P).ok);
  assert.ok(api.kernel.create('bills', { what: 'Rent', kind: 'fixed', direction: 'out', amount: money(100_000), next_due: '2026-10-01' }, P).ok);
  const secret = api.kernel.create('bills', { what: 'SECRET', kind: 'other', direction: 'out', amount: money(777_700), next_due: '2026-10-02' }, P);
  assert.ok(secret.ok, JSON.stringify(secret));
  const id = (secret.value as { id: string }).id;
  const keep = () => sql.exec('INSERT INTO entry_private (entry_id, person_id) VALUES (?, ?)', id, 'p_1');
  const page = async (ctx: CallContext) => {
    const out = await api.page({ slug: 'money' }, ctx as never);
    assert.ok((out as { ok: boolean }).ok, JSON.stringify(out));
    return JSON.stringify((out as { value: unknown }).value);
  };
  return { sql, api, member, keep, page, id };
}

test('THE FORECAST AND EVERY BLOCK BESIDE IT: nothing of a bill kept private reaches a member', async () => {
  const { member, keep, page } = await made();
  keep();
  const theirs = await page(member);
  assert.ok(theirs.includes('Rent'), 'the page drew nothing, so this proves nothing');
  assert.equal(theirs.includes('SECRET'), false, 'its name reached her');
  assert.equal(theirs.includes('777700') || theirs.includes('-777700') || theirs.includes('877700'), false, 'its amount reached her');
  /* And the owner still sees what is hers, in every block, so a block that refused cannot pass for one that kept it out. */
  const mine = JSON.parse(await page(OWNER)) as { blocks: Record<string, unknown>[] };
  assert.equal(mine.blocks.length, 4);
  for (const block of mine.blocks) assert.deepEqual(block.refusals ?? [], [], JSON.stringify(block).slice(0, 300));
  assert.ok(JSON.stringify(mine.blocks[0]).includes('SECRET'), 'the owner\'s forecast lost her own bill');
  assert.ok(JSON.stringify(mine.blocks[3]).includes('SECRET'), 'the owner\'s table lost her own bill');
  const sums = (b: Record<string, unknown>) => JSON.stringify((b.readings as { reading: { value: number } }[]).map((r) => r.reading.value));
  const theirBlocks = (JSON.parse(theirs) as { blocks: Record<string, unknown>[] }).blocks;
  assert.equal(sums(mine.blocks[1]!), '[877700,877700]');
  assert.equal(sums(theirBlocks[1]!), '[100000,100000]', 'a figure counted the row kept from her');
});

test('HELD APART BY WHO READS: neither is answered with the other\'s walk, in either order', async () => {
  const { member, keep, page } = await made();
  keep();
  assert.equal((await page(member)).includes('SECRET'), false);
  assert.ok((await page(OWNER)).includes('SECRET'), 'the owner was answered with the member\'s walk');
  assert.equal((await page(member)).includes('SECRET'), false, 'the member was answered with the owner\'s walk');
});

test('KEPT PRIVATE AFTER IT WAS READ, AND LET GO AGAIN: each is seen at once', async () => {
  const { sql, member, keep, page, id } = await made();
  assert.ok((await page(member)).includes('SECRET'));
  keep();
  assert.equal((await page(member)).includes('SECRET'), false, 'a held walk outlived keeping the row private');
  sql.exec('DELETE FROM entry_private WHERE entry_id = ?', id);
  assert.ok((await page(member)).includes('SECRET'));
});

test('A CURRENCY ONLY A PRIVATE ROW HOLDS IS NO LINE OF THE EVERYDAY WALK', async () => {
  const { sql, api, member, page } = await made();
  const fx = api.kernel.create('transactions', { what: 'Abroad', on: '2026-06-01', amount: { amount: 5_000, currency: 'CHF' }, direction: 'out' }, P);
  assert.ok(fx.ok, JSON.stringify(fx));
  sql.exec('INSERT INTO entry_private (entry_id, person_id) VALUES (?, ?)', (fx.value as { id: string }).id, 'p_1');
  const everyday: Declaration = {
    id: 'page.money',
    kind: 'page',
    body: {
      page: 'money',
      title: 'Money',
      blocks: [{ kind: 'forecast', source: 'forecast.runway', opening: { metric: 'cash' }, from: [...LEGS, { register: 'transactions', on: 'on', amount: 'amount', incoming: { field: 'direction', is: 'in' }, everyday: { months: 3 } }], horizon: 30 }],
    },
  } as never;
  const installed = await api.kernel.install([everyday]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok((await page(OWNER)).includes('CHF'), 'the owner\'s walk does not name it, so this proves nothing');
  assert.equal((await page(member)).includes('CHF'), false, 'her walk named a currency only a row kept from her holds');
});
