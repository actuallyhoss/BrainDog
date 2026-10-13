/**
 * What Home says of how long the money lasts, and the numbers a founder's pages count (founder-runway-words-68, REC-B07
 * and what founder-bound-66 left).
 *
 * TWO THINGS. `datapoints-held` and the Latest numbers table it is the `when:` of end today, by the clause the other
 * four counts of numbers end on (`at before tomorrow`): a reading dated tomorrow was counted and listed first. RED FIRST:
 * the count read 1 and the table drew the reading.
 *
 * AND THE SENTENCE FOR MONEY THAT LASTS (founder-lasts-74), WHICH WAITED ON THE KERNEL. `runway-days` has no value when
 * the walk stays above zero for the year, and also when cash is in two currencies with no rate between them, and on a
 * record with no account. A note under `when: { metric: 'runway-days', empty: true }` would have said the money lasts on
 * all three. It is chosen by `when: { all: [books-held lt 2, runway-days beyond] }` instead: the walk reached its last
 * day above zero (`beyond` on the reading), and the record keeps one set of money. The line with the days carries
 * `beyond: false` beside the same count of books, so one of the two is drawn and the cash is said once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handedOf, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
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
async function founder(): Promise<Kernel> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  sqlOf.set(k, sql);
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: false }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: false }));
  return k;
}
const figure = (k: Kernel, id: string): number | null => value<{ value: number | null }>(k.metric(k.metricDecl(id)!)).value;
type Drawn = { kind: string; heading?: string; body?: string; lead?: boolean; drawn?: boolean; values?: Record<string, unknown>; rows?: { fields: Record<string, unknown> }[]; refusals?: unknown[] };
const day = (n: number): string => new Date(NOW + n * DAY).toISOString().slice(0, 10);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const blocksOf = (k: Kernel, page: string): Drawn[] => value<{ blocks: Drawn[] }>(k.page(page)).blocks;
/** Every note Home draws, which is every sentence it says in its own words. */
const said = (k: Kernel): Drawn[] => blocksOf(k, 'home-founder').filter((b) => b.kind === 'note' && b.drawn !== false);
/** The one sentence of what there is, when Home says one. */
const cash = (k: Kernel): Drawn | undefined => said(k).find((b) => b.body?.startsWith('Cash is '));
const account = (k: Kernel, name: string, balance: { amount: number; currency: string }, more: Record<string, unknown> = {}): void =>
  void value(k.create('accounts', { name, kind: 'bank', liquid: true, balance, as_of: day(0), ...more }, OWNER));
const bill = (k: Kernel, amount: number, due: number): void =>
  void value(k.create('obligations', { what: 'Corporation tax', direction: 'owed_by_me', amount: gbp(amount), due: day(due), state: 'open' }, OWNER));

const RUNS_OUT = 'Cash is {{cash-now}} across {{cash-accounts}} account(s), and on what is due it runs out in {{runway-days}} day(s).';
const LASTS = 'Cash is {{cash-now}} across {{cash-accounts}} account(s), and on what is due it lasts the year.';

test('A READING DATED AFTER TODAY IS NOT ONE OF THE NUMBERS: datapoints-held leaves it out, and Latest numbers does not list it', async () => {
  const k = await founder();
  const harbour = value<{ id: string }>(k.create('things', { name: 'Harbour', lane: 'building' }, OWNER));
  const reading = (name: string, days: number): void =>
    void value(k.create('datapoints', { name, value: 10, thing: harbour.id, source: 'reported', at: new Date(NOW + days * DAY).toISOString() }, OWNER));
  const latest = (): Drawn | undefined => blocksOf(k, 'dashboard').find((b) => b.heading === 'Latest numbers' && b.drawn !== false);

  reading('Sign-ups tomorrow', 1);
  reading('Sign-ups next year', 400);
  assert.equal(figure(k, 'datapoints-held'), 0, 'datapoints-held counts a reading dated after today');
  assert.equal(latest(), undefined, 'Latest numbers stands over readings that have not happened');

  /* TODAY'S AND LAST YEAR'S ARE NUMBERS, and the two after today stay out of the table beside them. */
  reading('Sign-ups today', 0);
  reading('Sign-ups last year', -400);
  assert.equal(figure(k, 'datapoints-held'), 2);
  const table = latest();
  assert.ok(table, 'no Latest numbers over two readings');
  assert.deepEqual(table.refusals ?? [], [], 'Latest numbers was refused');
  assert.deepEqual(table.rows?.map((r) => r.fields.name), ['Sign-ups today', 'Sign-ups last year'], 'newest first, and none dated after today');
});

test('WITH MONEY THAT RUNS OUT IN TWELVE DAYS, Home says the cash, the accounts and the twelve days', async () => {
  const k = await founder();
  account(k, 'Current account', gbp(500_000));
  bill(k, 900_000, 12);
  assert.equal(figure(k, 'runway-days'), 12);
  const line = cash(k);
  assert.ok(line, 'Home says no sentence of what there is');
  assert.equal(line.body, RUNS_OUT);
  assert.equal(line.lead, true);
  assert.deepEqual(line.values, { 'cash-now': gbp(500_000), 'cash-accounts': 1, 'runway-days': 12 });
  assert.equal(said(k).filter((b) => b.body?.includes('on what is due')).length, 1, 'how long it lasts is said once');
});

/**
 * WHAT THE SENTENCE FOR MONEY THAT LASTS HOLDS. Each of the three records after this has no `runway-days`, and on none
 * of them is "it lasts the year" known: they stay green only because the sentence is chosen by more than the figure
 * being empty.
 */
const neverSaysItLasts = (k: Kernel, why: string): void =>
  assert.deepEqual(said(k).filter((b) => /lasts the year|does not run out/u.test(b.body ?? '')).map((b) => b.body), [], why);

test('TWO CURRENCIES WITH NO RATE HAVE NO DAY COUNT, and Home does not say the money lasts: a bill past the pounds held is still due', async () => {
  const k = await founder();
  account(k, 'Current account', gbp(500_000));
  account(k, 'Dollar account', { amount: 500_000, currency: 'USD' });
  bill(k, 900_000, 12);
  assert.equal(figure(k, 'runway-days'), null, 'a day count across two currencies with no rate');
  neverSaysItLasts(k, 'nobody knows whether GBP 5,000 and USD 5,000 pay GBP 9,000');
});

test('A RECORD WITH NO ACCOUNT HAS NO DAY COUNT, and Home does not say money it does not hold lasts', async () => {
  const k = await founder();
  assert.equal(figure(k, 'runway-days'), null);
  neverSaysItLasts(k, 'there is no money to last');
});

test('WITH TWO BOOKS, Home draws each book and adds them into no sentence, whether the money lasts or not', async () => {
  const k = await founder();
  const book = (name: string): string => value<{ id: string }>(k.create('books', { name }, OWNER)).id;
  account(k, 'Company account', gbp(500_000), { book: book('Northwind Ltd') });
  account(k, 'Own account', gbp(200_000), { book: book('Personal') });
  assert.equal(figure(k, 'runway-days'), null);
  assert.equal(cash(k), undefined, "one Cash now over a company's money and a person's own");
  neverSaysItLasts(k, 'a walk over two books is a walk over the sum');
  bill(k, 900_000, 12);
  assert.equal(cash(k), undefined, "one Cash now over a company's money and a person's own, with a bill due");
});

/* ONE CURRENCY, ONE BOOK AND A WALK THAT REACHED ITS LAST DAY ABOVE ZERO: the one record the sentence is said on, and
   none of the three above. The line with the days is not drawn beside it, so the cash is said once. */
test('WITH MONEY THAT LASTS THE YEAR, Home says it lasts the year, once, and says no day count', async () => {
  const k = await founder();
  account(k, 'Current account', gbp(500_000));
  bill(k, 100_000, 12);
  assert.equal(figure(k, 'runway-days'), null);
  const line = cash(k);
  assert.ok(line, 'Home says no sentence of what there is');
  assert.equal(line.body, LASTS);
  assert.equal(line.lead, true);
  assert.deepEqual(line.values, { 'cash-now': gbp(500_000), 'cash-accounts': 1 });
  assert.deepEqual(said(k).filter((b) => b.body?.startsWith('Cash is ')).map((b) => b.body), [LASTS], 'the cash is said twice');

  /* A BILL PAST THE CASH TURNS IT BACK TO THE DAYS, and the sentence that it lasts goes. */
  bill(k, 900_000, 30);
  assert.equal(figure(k, 'runway-days'), 30);
  assert.deepEqual(said(k).filter((b) => b.body?.startsWith('Cash is ')).map((b) => b.body), [RUNS_OUT]);
});

/* THE LINE WITH THE DAYS STILL STANDS WHERE NOBODY CAN COUNT THEM: one book, two currencies and no rate. It says what is
   held and drops the days, as it did before the second line was written. */
test('TWO CURRENCIES WITH NO RATE STILL DRAW THE LINE OF WHAT THERE IS, with no day count in it', async () => {
  const k = await founder();
  account(k, 'Current account', gbp(500_000));
  account(k, 'Dollar account', { amount: 500_000, currency: 'USD' });
  const line = cash(k);
  assert.ok(line, 'the line of what there is went with the days');
  assert.equal(line.body, RUNS_OUT);
  assert.equal(line.values?.['runway-days'], undefined);
});
