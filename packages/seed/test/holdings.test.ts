/**
 * What a person HOLDS, on a record: a gold lot, a certificate with the day it matures, a policy whose
 * premium is in another currency, and the one arithmetic a register of holdings has to get right.
 *
 * WHY THIS FILE EXISTS. Fourteen rows in the old tool had nowhere to go. `money.assets` carries 80 units
 * of gold across 11 lots, a saving certificate and two Northwind policies, and `money-core` declared
 * eight registers with no place for any of them, so the import dropped them: `apps/cli/src/legacy.ts`
 * names each one in a skip line and says why, that the nearest list is an account with a BALANCE and
 * filing a policy there would count it as cash he could spend. The rows below are that export, read
 * live on 2026-09-21 through `money_overview`, and every assertion here is about a row the record
 * could not hold at all a commit ago.
 *
 * THE NUMBERS ARE THE EXPORT'S, NOT A FIXTURE'S. 11 gold lots at EGP 555,435.00 of cost, a
 * EGP 100,000.00 certificate maturing 2028-11-05, and two policies of USD 202.10 and USD 101.05 a
 * month maturing in 2052 and 2062. A total across the fourteen is therefore two totals or it is
 * nothing, which is the last test here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { METRICS, NOW, installSeed } from '../src/index.ts';
import { MONEY_REGISTERS } from '../src/modules/money.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const egp = (minor: number): { amount: number; currency: string } => ({ amount: minor, currency: 'EGP' });
const usd = (minor: number): { amount: number; currency: string } => ({ amount: minor, currency: 'USD' });

const amountOf = (v: unknown): number => (v as { amount: number }).amount;
const currencyOf = (v: unknown): string => (v as { currency: string }).currency;

type Held = { kind: string; label: string; qty: number; unit_cost: { amount: number; currency: string }; acquired_on: string; matures_on?: string; note?: string };

/**
 * The fourteen rows as the live export holds them, in its own order.
 *
 * ONE ROW A LOT AND NOT ONE ROW A METAL, because that is what the source says and because the lots
 * were bought at nine different prices between May 2025 and July 2026: EGP 5,373.00 a unit on the
 * first and EGP 8,336.00 on the dearest. Adding them into "80 units of gold" loses the only thing
 * that makes a cost a cost, which is the day it was paid.
 */
const HELD: readonly Held[] = [
  { kind: 'certificate', label: 'Saving Certificate', qty: 1, unit_cost: egp(10_000_000), acquired_on: '2025-11-05', matures_on: '2028-11-05', note: 'Three years.' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(537_300), acquired_on: '2025-05-02' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(529_000), acquired_on: '2025-05-14' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(558_000), acquired_on: '2025-06-18' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(558_500), acquired_on: '2025-06-18' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(794_800), acquired_on: '2026-03-27' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(827_800), acquired_on: '2026-04-02' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(833_600), acquired_on: '2026-04-08' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(691_000), acquired_on: '2026-07-30' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(691_000), acquired_on: '2026-07-30' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(691_000), acquired_on: '2026-07-30' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(691_000), acquired_on: '2026-07-30' },
  { kind: 'policy', label: 'Northwind 5820614', qty: 1, unit_cost: usd(20_210), acquired_on: '2025-11-25', matures_on: '2052-11-25', note: 'Your Way For Protection Investment. USD 48,000.00 sum assured.' },
  { kind: 'policy', label: 'Northwind 5836271', qty: 1, unit_cost: usd(10_105), acquired_on: '2025-12-07', matures_on: '2062-12-07', note: 'Your Way For Protection Investment. USD 24,000.00 sum assured.' },
];

const write = (k: Kernel, row: Held): Entry => {
  const out = k.create('holdings', row as never, { actor: 'p_test' });
  assert.ok(out.ok, `${row.label}: ${sayOf(out)}`);
  return out.value;
};

const rowsWhere = (k: Kernel, where: string): Entry[] => {
  const out = k.list({ register: 'holdings', where, limit: 50 });
  assert.ok(out.ok, `${where}: ${sayOf(out)}`);
  return out.value.rows;
};

/** Every row, with no predicate. `qty gte 0` was the first draft of this and the grammar refused it:
    `gte` is the structured form's operator, and a sentence says is, is not, before, after, has or lacks. */
const allRows = (k: Kernel): Entry[] => {
  const out = k.list({ register: 'holdings', limit: 50 });
  assert.ok(out.ok, sayOf(out));
  return out.value.rows;
};

/* ── the declaration ─────────────────────────────────────────────────────── */

test('THE REGISTER INSTALLS, and a holding is found by the words on it rather than by its number', async () => {
  const k = await seeded();
  const decl = k.register('holdings') as unknown as { title?: string; fields?: readonly Record<string, unknown>[] } | undefined;
  assert.ok(decl, 'holdings did not install');
  assert.equal(decl.title, 'label', 'the title is not the words a person reads on the row');

  /* IT ARRIVES EMPTY, and that is not an oversight. The sample record is a London studio and holds no
     gold; the rows that fill this list are an import's, so the register is a place for them and the
     demonstration data stays what it was. */
  assert.equal(k.count('holdings'), 0);

  for (const row of HELD) write(k, row);
  assert.equal(k.count('holdings'), HELD.length);
  assert.equal(HELD.length, 14, 'the export stopped holding fourteen rows');

  /* A REGISTER NOTHING CAN FIND IS INVISIBLE TO `/search`, THE MCP AND SPARK AT ONCE, which is the
     rule `snapshots` was caught breaking in `test/money.test.ts`. Both queries are scoped to this
     register on purpose: the sample's `services` holds a row called "Wildcard certificate", so an
     unscoped count would pass on somebody else's row. */
  assert.equal(k.search('northwind', { registers: ['holdings'], limit: 20 }).length, 2, 'the two policies are not findable by the insurer on them');
  assert.equal(k.search('gold', { registers: ['holdings'], limit: 20 }).length, 11, 'the gold lots are not findable by the metal');
  /* AND BY THE KIND, WHICH IS AN ENUM AND IS INDEXED ANYWAY (`projectedText` takes every searchable
     field, and `declare`'s SEARCHABLE list holds `enum`). "Saving Certificate" says the word in its
     label; a policy's label is an insurer and a number, so `policy` is reachable only through the
     kind. */
  assert.equal(k.search('policy', { registers: ['holdings'], limit: 20 }).length, 2, 'a policy cannot be found by being a policy');
});

/* ── a lot, a certificate and a policy ───────────────────────────────────── */

test('A GOLD LOT IS A DATED COST FOR A NUMBER OF UNITS, and the cost keeps its own currency', async () => {
  const k = await seeded();
  const lot = write(k, HELD[5]!);

  assert.equal(lot.fields.kind, 'gold');
  assert.equal(lot.fields.qty, 10);
  assert.equal(amountOf(lot.fields.unit_cost), 794_800);
  assert.equal(currencyOf(lot.fields.unit_cost), 'EGP');
  assert.equal(lot.fields.acquired_on, '2026-03-27');
  /* A LOT OF GOLD MATURES ON NO DAY, which is why the field is not required: 11 of the 14 rows in the
     export carry no maturity at all. */
  assert.ok(lot.fields.matures_on === null || lot.fields.matures_on === undefined, 'a gold lot came back with a maturity');
});

test('A CERTIFICATE MATURES ON A DAY THE RECORD CAN BE ASKED ABOUT, and a policy in 2062 is not in the answer', async () => {
  const k = await seeded();
  for (const row of HELD) write(k, row);

  const soon = rowsWhere(k, 'matures_on before 2030-01-01');
  assert.deepEqual(
    soon.map((r) => r.fields.label),
    ['Saving Certificate'],
    'the one thing that matures this decade is not the one the record named',
  );
  assert.equal(soon[0]!.fields.matures_on, '2028-11-05');
  assert.equal(amountOf(soon[0]!.fields.unit_cost), 10_000_000);

  /* SORTED HERE, BECAUSE A LIST WITH NO `sort:` IS IN THE RECORD'S ORDER AND NOT IN THE ROWS' ORDER:
     the first draft asserted the two policies in the order they were written and the record answered
     2062 first. What is being asserted is the pair, not the order they came back in. */
  const policies = rowsWhere(k, 'kind is policy').sort((a, b) => String(a.fields.matures_on).localeCompare(String(b.fields.matures_on)));
  assert.deepEqual(policies.map((r) => r.fields.matures_on), ['2052-11-25', '2062-12-07']);
  assert.deepEqual(policies.map((r) => amountOf(r.fields.unit_cost)), [20_210, 10_105]);
  assert.deepEqual([...new Set(policies.map((r) => currencyOf(r.fields.unit_cost)))], ['USD'], 'the premiums stopped being in dollars');

  /* AND THE LOTS ARE THE REST OF IT. `is empty` over the same field is how a page asks for what a
     person holds with no end date, which is 11 of the 14. */
  assert.equal(rowsWhere(k, 'matures_on is empty').length, 11);
});

/* ── what a policy is NOT ────────────────────────────────────────────────── */

test('WRITING WHAT HE HOLDS MOVES CASH NOW BY NOTHING, which is the whole reason this is not an account', async () => {
  const k = await seeded();
  const before = k.metric(METRICS['cash-now'] as never);
  assert.ok(before.ok, sayOf(before));

  for (const row of HELD) write(k, row);

  const after = k.metric(METRICS['cash-now'] as never);
  assert.ok(after.ok, sayOf(after));
  /* THE MEASURED FAILURE THIS REPLACES: filed as accounts, these fourteen rows would have added
     EGP 655,435.00 of gold and certificate and USD 287.15 of premium to what the tile calls the money
     he has. `cash-now` sums `accounts.balance` where `liquid is true`, and a holding has no balance
     and no `liquid`, so the figure cannot see them at all. */
  assert.equal(after.value.value, before.value.value, 'what he holds leaked into what he can spend');
  assert.equal(k.count('holdings'), 14);
});

/* ── the one arithmetic ──────────────────────────────────────────────────── */

test('A TOTAL IS PER CURRENCY AND NEVER SUMMED ACROSS, and qty times unit cost is what a lot cost', async () => {
  const k = await seeded();
  for (const row of HELD) write(k, row);

  /* THE TOTAL THE RECORD CANNOT DO FOR US, and saying so is the point. The kernel's `product` is a
     field times a NAMED FACTOR TABLE (`metrics.ts`'s `Product` is `[field, { lookup, by }]`), so
     there is no figure that multiplies one stored number by another: qty times unit_cost is the
     reader's arithmetic, and it is done here per currency because that is the only way it is about
     anything. */
  const byCurrency = new Map<string, number>();
  for (const row of allRows(k)) {
    const currency = currencyOf(row.fields.unit_cost);
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + Number(row.fields.qty) * amountOf(row.fields.unit_cost));
  }

  /* THE EXPORT'S OWN NUMBERS, typed out so that a change in the rows above cannot quietly agree with
     itself: 80 units of gold at EGP 555,435.00 of cost, plus the EGP 100,000.00 certificate. */
  const gold = rowsWhere(k, 'kind is gold');
  assert.equal(gold.length, 11);
  assert.equal(gold.reduce((n, r) => n + Number(r.fields.qty), 0), 80);
  assert.equal(gold.reduce((n, r) => n + Number(r.fields.qty) * amountOf(r.fields.unit_cost), 0), 55_543_500);

  assert.deepEqual([...byCurrency.entries()].sort(), [['EGP', 65_543_500], ['USD', 28_715]]);

  /* AND WHAT A CURRENCY-BLIND SUM WOULD HAVE SAID. 65,573,815 is not a number about anything: it is
     555,435 pounds of gold plus 100,000 pounds of certificate plus 303 dollars of premium, printed as
     though the last were the same money as the first two. */
  assert.equal([...byCurrency.values()].reduce((n, v) => n + v, 0), 65_573_815);
  assert.ok(![...byCurrency.values()].includes(65_573_815), 'a currency-blind total is one of the answers, so this asserts nothing');

  /**
   * AND THE RECORD ITSELF REFUSES TO ADD THEM, which is the half a reader cannot get wrong later.
   *
   * A money figure is added up in the home currency when one is chosen and in the currency its format
   * declares when none is, and `MONEY_HOME_SETTING` has no default on purpose. So a sum over a list
   * holding two currencies comes back with no `value` at all and one `part` per currency: an
   * unanswered question reading as unanswered, rather than a single number nobody chose.
   */
  const summed = k.metric({
    metric: 'holdings-cost',
    name: 'What it cost, each',
    source: 'register.holdings',
    value: { sum: 'unit_cost' },
    format: 'money.EGP',
    /* A TARGET, BECAUSE THE RECORD REQUIRES ONE: written without it, this read came back
       `REQUIRED_MISSING: holdings-cost: a number with no target is decoration`. */
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  } as never);
  assert.ok(summed.ok, sayOf(summed));
  assert.equal(summed.value.value, null, 'two currencies came back as one number');
  const parts = new Map((summed.value.parts ?? []).map((p) => [p.currency, p.amount]));
  assert.deepEqual([...parts.entries()].sort(), [['EGP', 17_403_000], ['USD', 28_715]]);
});

/* ── the declaration is the same shape as the rest of Money ──────────────── */

test('HOLDINGS IS DECLARED THE WAY THE OTHER MONEY REGISTERS ARE, down to the pack it belongs to', () => {
  const decl = MONEY_REGISTERS.holdings;
  assert.ok(decl, 'MONEY_REGISTERS has no holdings');
  assert.equal(decl.pack, 'money-core');
  assert.equal(decl.title, 'label');
  /* THE THREE FIELDS AND NOT THEIR COUNT. `mobile.length === 3` was what this line said, and
     `SeedRegister.mobile` is typed `readonly [string, string, string]`, so the compiler had already
     proved it and the assertion could never fail: swapping the card to `['label', 'kind',
     'unit_cost']` left all six tests here green, which is the one arrangement the declaration's own
     comment argues against by name. A cost each with no count beside it is EGP 8,336.00 standing in
     for a lot that cost EGP 83,360.00. */
  assert.deepEqual([...decl.mobile], ['label', 'qty', 'unit_cost'], 'the card lost the count that makes a cost each readable');

  const fields = new Map(decl.fields.map((f) => [f.id, f]));
  /* EVERY FIELD THE FOURTEEN ROWS NEED, and no field they do not. A register that cannot hold the rows
     it was declared for is a register somebody has to change again before the first import. */
  assert.deepEqual([...fields.keys()], ['label', 'kind', 'qty', 'unit_cost', 'acquired_on', 'matures_on', 'note']);
  assert.equal(fields.get('unit_cost')!.type, 'money');
  assert.deepEqual(fields.get('kind')!.values, ['gold', 'certificate', 'policy', 'other']);
  /* `qualifies` IS THE DECLARATION SAYING A COST EACH IS UNREADABLE ALONE: EGP 7,948.00 beside
     EGP 8,336.00 says nothing until one of them is ten units and the other is five. */
  assert.equal(fields.get('qty')!.qualifies, 'unit_cost');
  assert.equal(fields.get('matures_on')!.required, undefined, 'a maturity is required, and 11 of the 14 rows have none');
  /* AND THE TYPE OF THE COUNT, WHICH NOTHING HERE WAS HOLDING. Changed to `int`, every test in this
     file stayed green, so "half a gram is a holding" was an argument in a comment and not a property
     of the register. The write below is the argument itself. */
  assert.equal(fields.get('qty')!.type, 'decimal');
});

test('HALF A UNIT IS A HOLDING AND A NEGATIVE COUNT IS NOT, which is what `decimal` and `min: 0` are doing there', async () => {
  const k = await seeded();

  /* GOLD IS WEIGHED AND NOT COUNTED, so a fraction has to go in. `int` refuses this row, and every
     other test in this file passes against `int`, which is how the gap was found. */
  const half = write(k, { kind: 'gold', label: 'Gold 24c', qty: 0.5, unit_cost: egp(691_000), acquired_on: '2026-07-30' });
  assert.equal(half.fields.qty, 0.5, 'a half unit was rounded away');

  /* AND BELOW NOTHING IS NOT A HOLDING. Written without `min: 0` the register took -3 units of gold
     happily, and a negative count times a positive cost each is a total that reads as money owed. */
  const owed = k.create('holdings', { kind: 'gold', label: 'Gold 24c', qty: -3, unit_cost: egp(691_000) } as never, { actor: 'p_test' });
  assert.equal(owed.ok, false, 'the register took a negative number of units');
  assert.match(sayOf(owed), /at least 0/);
});
