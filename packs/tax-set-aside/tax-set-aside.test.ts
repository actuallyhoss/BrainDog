/**
 * Tax set aside: a rate on a category of money in, the part to put aside on each payment, tax paid, and the page.
 * Every name and amount here is invented.
 */


import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 9, 26, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Body = Record<string, unknown>;
type Reading = { value: number | null; unit?: string | null; refusals: unknown[] };
type Block = { kind: string; heading?: string; drawn?: boolean; refusals: unknown[]; rows?: { fields: Body }[] };

const FILE = new URL('./tax-set-aside.pack.json', import.meta.url);
const shipped = (): Body & { declarations: Body[]; extends: Body } => JSON.parse(readFileSync(FILE, 'utf8')) as never;

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

async function fresh(withPack = true): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'money-core']) await put(api, firstPartyDocument(id, { seeds: [] }));
  if (withPack) await put(api, shipped());
  return { api, close: () => sql.close() };
}

async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('tax set aside fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 4; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'a run was refused or failed ' + JSON.stringify(ran));
  }
}

const make = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const fieldsOf = (api: Api, id: string): Body => api.kernel.get(id as never)!.fields as Body;
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const metric = async (api: Api, id: string): Promise<Reading> => said<Reading>(await api.metric({ metric: id }, owner));

test('THE FILE: tax-set-aside 1.0.1 on money-core, fields on categories, accounts and the Ledger, one script for two rules', () => {
  const doc = shipped();
  assert.deepEqual([doc.pack, doc.version, doc.license], ['tax-set-aside', '1.2.1', 'Apache-2.0']);
  const kinds = (k: string) => doc.declarations.filter((d) => k in d).map((d) => d[k]);
  assert.deepEqual(kinds('register'), []);
  assert.deepEqual(kinds('page'), ['tax-set-aside']);
  assert.deepEqual(kinds('rule'), ['tax_line', 'tax_category']);
  const script = doc.declarations.find((d) => d.script === 'tax_set_aside')!;
  assert.equal(script.source, readFileSync(new URL('./tax.js', import.meta.url), 'utf8'), 'the pack file and tax.js disagree');
  assert.deepEqual(Object.keys(doc.extends), ['register.categories', 'register.accounts', 'register.transactions']);
});

test('BEFORE THE PACK: a category holds no tax rate', async () => {
  const { api, close } = await fresh(false);
  const categories = api.kernel.register('categories') as unknown as { fields: { id: string }[] };
  assert.ok(!categories.fields.some((f) => f.id === 'tax_rate'));
  close();
});

test('A PAYMENT IN A TAXED CATEGORY SAYS WHAT TO SET ASIDE; a salary, a move and a pending line do not', async () => {
  const { api, close } = await fresh();
  const account = make(api, 'accounts', { name: 'Current', kind: 'bank', balance: gbp(500_000), as_of: '2026-01-01', liquid: true });
  const work = make(api, 'categories', { name: 'Client work', direction: 'in', tax_rate: 25 });
  const salary = make(api, 'categories', { name: 'Salary', direction: 'in' });
  const tax = make(api, 'categories', { name: 'Tax office', direction: 'out', tax_paid: true });
  const line = (what: string, amount: number, direction: 'in' | 'out', extra: Body) =>
    make(api, 'transactions', { what, on: '2026-10-10', direction, amount: gbp(amount), account, state: 'cleared', ...extra });
  const invoice = line('Invoice 12', 200_000, 'in', { category: work });
  const pay = line('Pay', 300_000, 'in', { category: salary });
  const pending = line('Invoice 13', 100_000, 'in', { category: work, state: 'pending' });
  const paid = line('Quarter payment', 30_000, 'out', { category: tax });
  await settle(api);
  assert.deepEqual([fieldsOf(api, invoice).tax_part, fieldsOf(api, invoice).tax_rate], [gbp(50_000), 25]);
  assert.equal(fieldsOf(api, pay).tax_part ?? null, null);
  assert.equal(fieldsOf(api, pending).tax_part ?? null, null);
  assert.deepEqual(fieldsOf(api, paid).tax_paid, gbp(30_000));
  assert.equal((await metric(api, 'tax-aside-year')).value, 50_000);
  assert.equal((await metric(api, 'tax-paid-year')).value, 30_000);

  said(api.kernel.update('categories', work, { tax_rate: 20 } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual(fieldsOf(api, invoice).tax_part, gbp(40_000), 'a changed rate works this year out again');
  said(api.kernel.update('transactions', invoice, { category: salary } as never, { actor: 'p_1' }));
  await settle(api);
  assert.equal(fieldsOf(api, invoice).tax_part ?? null, null, 'a line moved out of the category loses its part');
  close();
});

test('THE PAGE draws with nothing refused, before a rate and after', async () => {
  const { api, close } = await fresh();
  const empty = said<{ blocks: Block[] }>(await api.page({ slug: 'tax-set-aside' }, owner));
  for (const b of empty.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  assert.equal(empty.blocks[0]!.kind, 'note');
  const account = make(api, 'accounts', { name: 'Tax pot', kind: 'bank', balance: gbp(10_000), as_of: '2026-01-01', liquid: false, tax_pot: true });
  const work = make(api, 'categories', { name: 'Client work', direction: 'in', tax_rate: 30 });
  make(api, 'transactions', { what: 'Invoice 7', on: '2026-10-03', direction: 'in', amount: gbp(100_000), account, state: 'cleared', category: work });
  await settle(api);
  const page = said<{ blocks: Block[] }>(await api.page({ slug: 'tax-set-aside' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const heads = page.blocks.map((b) => b.heading);
  for (const h of ['This year', 'Set aside each month', 'Payments this year']) assert.ok(heads.includes(h), `${h} is on the page: ${heads.join(', ')}`);
  close();
});

test('AN ACCOUNT NAMED FOR TAX IS SAID AGAINST THE TAX BILLS before one is marked (audit 31 Oct f, AF25)', async () => {
  const { api, close } = await fresh();
  make(api, 'accounts', { name: 'Tax reserve', kind: 'bank', balance: gbp(2_400_000), as_of: '2026-10-25', liquid: false });
  make(api, 'accounts', { name: 'Current account', kind: 'bank', balance: gbp(500_000), as_of: '2026-10-25', liquid: true });
  await settle(api);
  assert.equal((await metric(api, 'tax-reserves')).value, 1, 'only the account named for tax');
  assert.equal((await metric(api, 'tax-reserve')).value, 2_400_000);
  const page = said<{ blocks: Block[] }>(await api.page({ slug: 'tax-set-aside' }, owner));
  const note = page.blocks.find((b) => b.heading === 'Tax account' && b.drawn !== false);
  assert.ok(note, 'the reserve is said before any rate or mark');
  close();
});
