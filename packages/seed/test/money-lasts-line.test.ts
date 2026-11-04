/**
 * What Money's first line says of money that lasts the year (money-lasts-line-76, left by founder-lasts-74).
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
   THE ONE WHERE THE WALK GOES UNDER: there the Lasts tile says it, beside the day on what is due, and the line says what there is. */
/* AND EACH ENDS ON THE PART THAT IS LATE, since money-core 3.18.0: a sentence of its own,
   which the app leaves out whole while no part is late (`leadOf`). With two books the line says the money there is. */
/* AND WHAT IS TO PAY ON THE CARD AFTER IT, since money-core 3.20.0, left out whole with no card that says it. */
/* AND SINCE money-core 3.33.0 (AF4) THE LINE LEADS WITH WHAT HURTS MOST: what is late, or, with nothing late, the low
   point while the walk goes under inside twelve weeks; the card second. */
/* NO WORD OF THE CARD SINCE money-core 3.38.4 (ceeaf6193): the card's own tile says what is to pay on it. */
const LOW = 'Cash falls to {{runway-days.low}} by {{runway-days.low_on}}.';
/* NO WORD OF WHERE THE MONEY IS KEPT SINCE money-core 3.29.1: the Accounts tile draws a row for each, so the line is only
   what needs doing, and on one book with nothing late and no card it says nothing. */
const WHAT_THERE_IS = LOW;
const LASTS = 'Lasts the year on what is due.';
/* SPREAD OVER HOW MANY ACCOUNTS SINCE money-core 3.30.0, AND KEPT IN HOW MANY BOOKS SINCE 3.34.0: the count was of
   books all along, and the line is said only with two or more. */
const BOOKS = 'Kept in {{books-held}} books.';
const bodies = (k: Kernel, page = LINE): (string | undefined)[] => leads(k, page).map((b) => b.body);

test('ON MONEY ITSELF, a one-book record whose walk never goes under reads that it lasts the year', async () => {
  const k = await record();
  account(k, 'Current account', gbp(500_000));
  bill(k, 100_000, 12);
  assert.deepEqual(bodies(k, 'money'), [LASTS]);
});

test('MONEY IS ONE HERO AND A BOARD: well under the most a page declares, no word on categories marked the other way, and its figure still declared', async () => {
  const blocks = MONEY_PAGE.blocks as Record<string, unknown>[];
  /* 19 SINCE money-core 3.31.0: Over time (two, one drawn) and the budgets at a glance joined the board. */
  assert.ok(blocks.length <= 19, 'a front door, not the most a page declares');
  assert.deepEqual(blocks.filter((b) => JSON.stringify(b).includes('categories-against-direction')), []);
  assert.equal(
    blocks.filter((b) => b.kind === 'note' && b.lead === true).length,
    5,
    'the line asking for a first account, what there is, that it lasts, the line asking for a bill, and the line for two books',
  );
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
  /* NO COUNT OF ACCOUNTS: the Accounts tile draws one row for each. */
  assert.equal(line.values?.['cash-by-account.groups'], undefined);
  assert.equal(line.values?.['cash-now.apart'], undefined, 'how much there is is the hero\'s');
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
  assert.deepEqual(bodies(k), [], 'nobody knows whether GBP 5,000 and USD 5,000 pay GBP 9,000');
});

test('A RECORD WITH NO ACCOUNT IS NOT TOLD ITS MONEY LASTS', async () => {
  const k = await record();
  assert.equal(figure(k, 'runway-days'), null);
  assert.deepEqual(bodies(k).filter((b) => /lasts the year/u.test(b ?? '')), [], 'there is no money to last');
});

test('WITH TWO BOOKS, the line says how many books the money is kept in, whether it lasts or not', async () => {
  const k = await record();
  const book = (name: string): string => value<{ id: string }>(k.create('books', { name }, OWNER)).id;
  account(k, 'Company account', gbp(500_000), { book: book('Northwind Ltd') });
  account(k, 'Own account', gbp(200_000), { book: book('Personal') });
  assert.deepEqual(bodies(k), [BOOKS], 'a walk over two books is a walk over the sum');
  bill(k, 900_000, 12);
  assert.deepEqual(bodies(k), [`${LOW} ${BOOKS}`]);
});

test('A PART OF A PLAN PAST ITS DAY IS NAMED IN THE LINE, the one late longest, and the line says it first', async () => {
  const k = await record();
  account(k, 'Current account', gbp(500_000));
  const part = (what: string, due: number, state = 'open'): void =>
    void value(k.create('installments', { what, plan: 'Harbourview', number: 2, parts: 40, direction: 'out', amount: gbp(48_000), due: day(due), state }, OWNER));
  part('Harbourview part 1', -40, 'paid');
  part('Harbourview part 2', -10);
  part('Harbourview part 3', -3);
  part('Harbourview part 4', 20);
  assert.equal(figure(k, 'installments-late'), 2, 'two parts are open past their day');
  const [lead] = leads(k, 'money');
  assert.equal(lead?.values?.['installments-late.first'], 'Harbourview part 2', 'the part late longest leads');
  assert.deepEqual(lead?.values?.['installments-late.first_amount'], gbp(48_000));
  assert.equal(lead?.values?.['installments-late.first_due'], day(-10));
  /* THE PART RIDES AT THE START OF THE SENTENCE ABOUT WHAT IS LATE, SINCE money-core 3.34.0, and Heads up is gone. */
  assert.match(lead?.body ?? '', /^\{\{installments-late\.first\}\} is \{\{bad:late\}\}/u, 'the line does not say the late part first');
});
