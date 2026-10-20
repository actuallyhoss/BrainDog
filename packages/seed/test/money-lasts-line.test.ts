/**
 * What Money's first line says of money that lasts the year (money-lasts-line-76, left by founder-lasts-74, REC-B07).
 *
 * WHEN IT RUNS OUT IS THE TILE'S since money-core 3.11.0 (`parts/runway.ts`), and that tile is drawn only while the walk
 * has a day it goes under on. So a record whose money lasts read nothing of how long anywhere on Money: the line said
 * the cash and stopped, exactly as it does where nobody can count the days (two currencies and no rate). The line now
 * ends "it lasts the year" on the one record where that is known, chosen as Home's is (`usecases/founder.ts`): one set
 * of money, and the reading of `runway-days` carrying `beyond`. The line without it carries `beyond: false` beside the
 * same count of books, so one of the two is drawn and the cash is said once.
 *
 * RED FIRST: on a one-book record with GBP 5,000 and a GBP 1,000 bill, the lead read the cash and no word of the year.
 *
 * PLACED ON MONEY (money-lasts-line-78). Money is at twenty-four blocks, the most a page declares, and the split is a
 * third lead note, so it waited on a block being given up: Heads up's line on categories marked the other way went,
 * its figure still declared. The first tests read Money itself; the rest read `HEADLINE_LASTS` on a page of their own,
 * installed beside Money in the same pack, as they did while the line waited.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handedOf, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
import { HEADLINE_LASTS } from '../src/modules/money/pages/parts/headline.ts';

const TODAY = dayOf(NOW);
/** The page the three lines are read on until Money has room for them. */
const LINE = 'money-line';
const OWNER = { actor: 'p_1' };
const DAY = 86_400_000;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});
const sqlOf = new WeakMap<Kernel, NodeSql>();
const stateOf = (k: Kernel): Installed => ({
  format: 1, primitives: 1, record_version: k.version(), packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings(),
  handed: handedOf((sqlOf.get(k)?.all<{ manifest: string }>('SELECT manifest FROM pack') ?? []).map((r) => r.manifest)),
});
const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));
async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}
/** A founder's record with no examples: the one shipped record that installs Money whole, the way a person gets it. */
async function record(): Promise<Kernel> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  sqlOf.set(k, sql);
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    const doc = moduleDocument(u, m, { today: TODAY, holds, examples: false }) as { declarations: Record<string, unknown>[] };
    /* THE THREE LINES ON A PAGE OF THEIR OWN, in Money's own pack and over Money's own lists. */
    const money = doc.declarations.find((d) => d.page === 'money');
    if (money) doc.declarations.push({ page: LINE, title: 'Money line', requires: money.requires, pack: money.pack, blocks: HEADLINE_LASTS });
    await put(k, doc);
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: false }));
  return k;
}
const figure = (k: Kernel, id: string): number | null => value<{ value: number | null }>(k.metric(k.metricDecl(id)!)).value;
type Drawn = { kind: string; heading?: string; body?: string; lead?: boolean; drawn?: boolean; values?: Record<string, unknown> };
const day = (n: number): string => new Date(NOW + n * DAY).toISOString().slice(0, 10);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
/** Every lead note a page draws: the sentences under the page's name. */
const leads = (k: Kernel, page = LINE): Drawn[] =>
  value<{ blocks: Drawn[] }>(k.page(page)).blocks.filter((b) => b.kind === 'note' && b.lead === true && b.drawn !== false);
const account = (k: Kernel, name: string, balance: { amount: number; currency: string }, more: Record<string, unknown> = {}): void =>
  void value(k.create('accounts', { name, kind: 'bank', liquid: true, balance, as_of: day(0), ...more }, OWNER));
const bill = (k: Kernel, amount: number, due: number): void =>
  void value(k.create('obligations', { what: 'Corporation tax', direction: 'owed_by_me', amount: gbp(amount), due: day(due), state: 'open' }, OWNER));

/* EACH LINE ENDS ON HOW LONG THE CASH LASTS WITH NO INCOME, since money-core 3.17.0 (money-lasts-no-income-95), BUT
   THE ONE WHERE THE WALK GOES UNDER: there the Lasts tile says it, beside the day on what is due (the UI pass of 20
   October, money F3), and the line says what there is. */
const WHAT_THERE_IS = 'Cash is {{cash-now}} across {{cash-accounts}} account(s), {{cash-now.change}} on a month ago.';
const LASTS = 'Cash is {{cash-now}} across {{cash-accounts}} account(s), {{cash-now.change}} on a month ago, and on what is due it lasts the year.';
const BOOKS = 'Your money is kept in {{books-held}} books, across {{cash-accounts}} account(s).';
const bodies = (k: Kernel, page = LINE): (string | undefined)[] => leads(k, page).map((b) => b.body);

test('ON MONEY ITSELF, a one-book record whose walk never goes under reads that it lasts the year', async () => {
  const k = await record();
  account(k, 'Current account', gbp(500_000));
  bill(k, 100_000, 12);
  assert.deepEqual(bodies(k, 'money'), [LASTS]);
});

test('MONEY GAVE UP ONE BLOCK FOR THE LINE: twenty-four still, no word on categories marked the other way, and its figure still declared', async () => {
  const blocks = MONEY_PAGE.blocks as Record<string, unknown>[];
  assert.equal(blocks.length, 24, 'the most a page declares');
  assert.deepEqual(blocks.filter((b) => JSON.stringify(b).includes('categories-against-direction')), []);
  assert.equal(blocks.filter((b) => b.lead === true).length, 3, 'what there is, that it lasts, and the line for two books');
  const k = await record();
  assert.ok(k.metricDecl('categories-against-direction'), 'the figure is still there to be read');
  /* A BILL PAST THE CASH TAKES THE YEAR BACK OUT OF MONEY'S LINE, and the cash is still said once. */
  account(k, 'Current account', gbp(500_000));
  bill(k, 900_000, 30);
  assert.deepEqual(bodies(k, 'money'), [WHAT_THERE_IS]);
});

test('WITH ONE BOOK AND A WALK THAT NEVER GOES UNDER, the line says the cash and that it lasts the year, once', async () => {
  const k = await record();
  account(k, 'Current account', gbp(500_000));
  bill(k, 100_000, 12);
  assert.equal(figure(k, 'runway-days'), null, 'a walk that stays above zero has no day count');
  assert.deepEqual(bodies(k), [LASTS], 'the cash is said once, and that it lasts the year');
  const line = leads(k)[0]!;
  assert.equal(line.values?.['cash-accounts'], 1);
  assert.deepEqual(line.values?.['cash-now'], gbp(500_000));
  assert.equal(line.values?.['runway-days'], undefined, 'the line carries no day count: that is the tile\'s');

  /* A BILL PAST THE CASH TAKES THE YEAR BACK OUT OF THE LINE, and the day it runs out is the tile's to say. */
  bill(k, 900_000, 30);
  assert.equal(figure(k, 'runway-days'), 30);
  assert.deepEqual(bodies(k), [WHAT_THERE_IS]);
});

test('WITH MONEY THAT RUNS OUT, the line says what there is and no word of the year', async () => {
  const k = await record();
  account(k, 'Current account', gbp(500_000));
  bill(k, 900_000, 12);
  assert.equal(figure(k, 'runway-days'), 12);
  assert.deepEqual(bodies(k), [WHAT_THERE_IS]);
});

/* NO DAY COUNT IS NOT "IT LASTS": the two records after this have none either, and on neither is it known. */
test('TWO CURRENCIES WITH NO RATE STILL READ WHAT THERE IS, and the line does not say the money lasts', async () => {
  const k = await record();
  account(k, 'Current account', gbp(500_000));
  account(k, 'Dollar account', { amount: 500_000, currency: 'USD' });
  bill(k, 900_000, 12);
  assert.equal(figure(k, 'runway-days'), null, 'a day count across two currencies with no rate');
  assert.deepEqual(bodies(k), [WHAT_THERE_IS], 'nobody knows whether GBP 5,000 and USD 5,000 pay GBP 9,000');
});

test('A RECORD WITH NO ACCOUNT IS NOT TOLD ITS MONEY LASTS', async () => {
  const k = await record();
  assert.equal(figure(k, 'runway-days'), null);
  assert.deepEqual(bodies(k).filter((b) => /lasts the year/u.test(b ?? '')), [], 'there is no money to last');
});

test('WITH TWO BOOKS, the line says where the money is kept and adds it into no sentence, whether it lasts or not', async () => {
  const k = await record();
  const book = (name: string): string => value<{ id: string }>(k.create('books', { name }, OWNER)).id;
  account(k, 'Company account', gbp(500_000), { book: book('Northwind Ltd') });
  account(k, 'Own account', gbp(200_000), { book: book('Personal') });
  assert.deepEqual(bodies(k), [BOOKS], 'a walk over two books is a walk over the sum');
  bill(k, 900_000, 12);
  assert.deepEqual(bodies(k), [BOOKS]);
});
