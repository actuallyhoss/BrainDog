/**
 * What Home says of how long the money lasts, and the numbers a founder's pages count (founder-runway-words-68, REC-B07
 * and what founder-bound-66 left).
 *
 * TWO THINGS, AND ONE OF THEM WAITS. `datapoints-held` and the Latest numbers table it is the `when:` of end today, by
 * the clause the other four counts of numbers end on (`at before tomorrow`): a reading dated tomorrow was counted and
 * listed first. RED FIRST: the count read 1 and the table drew the reading.
 *
 * THE SENTENCE FOR MONEY THAT LASTS IS A TODO, AND THE TESTS UNDER IT SAY WHY. `runway-days` has no value when the walk
 * stays above zero for the year, and also when cash is in two currencies with no rate between them, and on a record with
 * no account. A second note under `when: { metric: 'runway-days', empty: true }` would say "it does not run out" on all
 * three, and `when:` reads one figure, so it could not keep `books-held < 2` beside it. Until a `when:` can ask whether
 * the walk reached its last day (`beyond` on the reading, walk-beyond-68), Home says the days only while there are days.
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
const LASTS = 'Cash is {{cash-now}} across {{cash-accounts}} account(s), and on what is due it does not run out.';

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
 * WHAT A SENTENCE FOR MONEY THAT LASTS HAS TO HOLD, WHOEVER WRITES IT. Each of these has no `runway-days`, and on none
 * of them is "it does not run out" known: the three tests after this one are green today because the sentence is not
 * said at all, and they stay so only if it is chosen by more than the figure being empty.
 */
const neverSaysItLasts = (k: Kernel, why: string): void =>
  assert.deepEqual(said(k).filter((b) => /does not run out/u.test(b.body ?? '')).map((b) => b.body), [], why);

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

/* TODO UNTIL A `when:` CAN TELL MONEY THAT LASTS FROM A DAY COUNT NOBODY CAN WORK OUT. What is wanted is this sentence
   on exactly the record below, one currency, one book and a walk that reached its last day above zero, and on none of
   the three above. Today the clause with the days is left out by the writer (`leadOf`), and Home reads "Cash is
   GBP 5,000.00 across 1 account." */
test('WITH MONEY THAT LASTS THE YEAR, Home says it does not run out', { todo: 'waits on a when: that reads the walk reaching its last day (beyond), and on two tests in one when:' }, async () => {
  const k = await founder();
  account(k, 'Current account', gbp(500_000));
  bill(k, 100_000, 12);
  assert.equal(figure(k, 'runway-days'), null);
  assert.equal(cash(k)?.body, LASTS);
});
