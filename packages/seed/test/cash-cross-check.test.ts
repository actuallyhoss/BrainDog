/**
 * Cash now, worked out a second way (the test half): each liquid account walked entry by entry from its
 * newest statement to today, in the test's own arithmetic, must equal what `cash-now` reads, one currency at a time.
 *
 * WHY. "Wrong money on a screen is the worst class of defect in this repo", and no check compared a money
 * figure with its rows. `cash-now` rolls each account forward in SQL (`readRolled` in `packages/kernel/src/money-figures.ts`);
 * this walks the same rows in plain code, never through that function, so a change to either that moves a penny goes red.
 *
 * THE ROWS ARE THE ONES THAT GO WRONG: a balance check newer than the account's own balance, a bank message that prints
 * the balance after it, a move before a statement (not counted), a pending move and a dated one ahead of today (neither
 * counted), a transfer between two of the owner's accounts (out of one, into the other), an account that is not cash,
 * and two currencies, which are never added: each currency's walk is checked against the figure's part in it.
 *
 * THE NIGHTLY FIGURE, `cash-cross-check`, reads the same difference on a lived record (`readCrosscheck` in the kernel's
 * `money-figures.ts`, its own tests in `packages/kernel/test/cash-cross-figure.test.ts`). Here it is held to the walk
 * this file does: nought where the two ways agree, on the record made here and on Money's own example entries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { CASH_FIGURES } from '../src/modules/money/figures/cash.ts';

const OWNER = { actor: 'p_1' };
const TODAY = day(0);

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

/** A record holding money-core as the pack document says it, and what it points at, with no example rows. */
async function moneyCore(examples = false): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(examples ? firstPartyDocument(id) : firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

type Money = { amount: number; currency: string };
type Row = { id: string; fields: Record<string, unknown> };
const money = (amount: number, currency: string): Money => ({ amount, currency });
const rowsOf = (k: Kernel, register: string): Row[] => value<{ rows: Row[] }>(k.list({ register, limit: 500 })).rows;
const make = (k: Kernel, register: string, fields: Record<string, unknown>): string => value<{ id: string }>(k.create(register, fields, OWNER)).id;

/**
 * The owner's accounts and a month of their movements. Everyday was typed twenty days ago and checked ten days ago;
 * Savings takes a transfer from it; the deposit is not cash; with `dollars`, an account in dollars whose bank printed
 * its balance after a payment a week ago. Each statement says something the arithmetic of the rows before it does not, so
 * a roll that skipped one would read another number.
 */
function write(k: Kernel, dollars: boolean): void {
  const everyday = make(k, 'accounts', { name: 'Everyday account', kind: 'bank', balance: money(200_000, 'GBP'), as_of: day(-20) });
  const savings = make(k, 'accounts', { name: 'Savings', kind: 'bank', balance: money(100_000, 'GBP'), as_of: day(-30) });
  const deposit = make(k, 'accounts', { name: 'Deposit', kind: 'bank', liquid: false, balance: money(900_000, 'GBP'), as_of: day(-30) });
  make(k, 'balances', { account: everyday, balance: money(180_000, 'GBP'), as_of: day(-10), source: 'Statement' });
  const move = (account: string, on: string, direction: 'in' | 'out', amount: Money, more: Record<string, unknown> = {}) =>
    make(k, 'transactions', { what: 'Movement', on, direction, amount, account, state: 'cleared', ...more });
  move(everyday, day(-15), 'out', money(5_000, 'GBP'));
  move(everyday, day(-5), 'in', money(30_000, 'GBP'));
  move(everyday, day(-3), 'out', money(2_000, 'GBP'), { state: 'pending' });
  move(everyday, day(3), 'out', money(9_000, 'GBP'));
  move(everyday, day(-2), 'out', money(50_000, 'GBP'), { what: 'To savings', transfer: true });
  move(savings, day(-2), 'in', money(50_000, 'GBP'), { what: 'From everyday', transfer: true });
  move(deposit, day(-1), 'in', money(1_000, 'GBP'));
  if (!dollars) return;
  const usd = make(k, 'accounts', { name: 'Dollar account', kind: 'bank', balance: money(120_000, 'USD'), as_of: day(-20) });
  move(usd, day(-7), 'out', money(5_000, 'USD'), { balance_after: money(117_000, 'USD') });
  move(usd, day(-1), 'out', money(1_000, 'USD'));
}

/** What an account was said to hold, and the day it was said. */
type Stated = { on: string; balance: Money };
const dayOf = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '');

/**
 * THE SECOND WAY: each account that counts as cash, from the newest thing said about it on or before today (its own
 * balance, a balance check, or a movement that printed the balance after it), plus every cleared movement dated after
 * that day and not after today, in money in and out. A total a currency, never one across them.
 */
function walked(k: Kernel): Map<string, number> {
  const moves = rowsOf(k, 'transactions');
  const checks = rowsOf(k, 'balances');
  const totals = new Map<string, number>();
  const add = (m: Money) => totals.set(m.currency, (totals.get(m.currency) ?? 0) + m.amount);
  for (const account of rowsOf(k, 'accounts')) {
    if (account.fields.liquid !== true) continue;
    let start: Stated = { on: dayOf(account.fields.as_of), balance: account.fields.balance as Money };
    const said = [
      ...checks.filter((c) => c.fields.account === account.id).map((c) => ({ on: dayOf(c.fields.as_of), balance: c.fields.balance as Money })),
      ...moves.filter((t) => t.fields.account === account.id && t.fields.balance_after).map((t) => ({ on: dayOf(t.fields.on), balance: t.fields.balance_after as Money })),
    ];
    for (const s of said) if (s.on > start.on && s.on <= TODAY) start = s;
    add(start.balance);
    for (const t of moves) {
      const on = dayOf(t.fields.on);
      if (t.fields.account !== account.id || t.fields.state !== 'cleared' || on <= start.on || on > TODAY) continue;
      const amount = t.fields.amount as Money;
      add({ currency: amount.currency, amount: t.fields.direction === 'out' ? -amount.amount : amount.amount });
    }
  }
  return totals;
}

/** What `cash-now` reads, a total a currency: its value in its one unit, or each of its parts when it holds two. */
type Reading = { value: number | null; unit: string | null; parts?: Money[] };
function figure(k: Kernel): { read: Reading; totals: Map<string, number> } {
  const read = value<Reading>(k.metric(CASH_FIGURES['cash-now'] as never));
  const totals = new Map<string, number>();
  if (read.parts) for (const p of read.parts) totals.set(p.currency, p.amount);
  else if (read.value !== null && read.unit !== null) totals.set(read.unit, read.value);
  return { read, totals };
}

/** What the record's own check of Cash now reads: nought and met, or how far out it is. */
type Checked = Reading & { met: boolean | null };
const checked = (k: Kernel): Checked => value<Checked>(k.metric(CASH_FIGURES['cash-cross-check'] as never));

test('in pounds alone, Cash now walked entry by entry from each newest statement is the figure, a transfer moving nothing', async () => {
  const k = await moneyCore();
  write(k, false);
  const { read, totals } = figure(k);
  /* 180,000 checked + 30,000 in - 50,000 out to Savings; 100,000 + 50,000 in from Everyday. */
  assert.deepEqual([...walked(k)], [['GBP', 310_000]], 'the second way is not the arithmetic of the rows');
  assert.deepEqual([read.value, read.unit], [310_000, 'GBP']);
  assert.deepEqual([...totals], [...walked(k)]);
  const check = checked(k);
  assert.deepEqual([check.value, check.unit, check.met], [0, 'GBP', true], 'the nightly figure is out where this walk is not');
});

test('in pounds and dollars, each currency walked entry by entry is the figure\'s part in it, and the two are never added', async () => {
  const k = await moneyCore();
  write(k, true);
  const { read, totals } = figure(k);
  const second = walked(k);
  /* The dollars restart from the bank's 117,000 a week ago, less 1,000 since: not 114,000, which is the typed balance
     less both payments, since 2,000 came in that nobody filed and only the bank's word knows it. */
  assert.deepEqual(Object.fromEntries(second), { GBP: 310_000, USD: 116_000 }, 'the second way is not the arithmetic of the rows');
  assert.equal(read.value, null, 'Cash now added pounds and dollars with no rate between them');
  assert.deepEqual(Object.fromEntries(totals), Object.fromEntries(second));
  const check = checked(k);
  assert.deepEqual([check.value, check.unit, check.met, check.parts], [0, null, true, undefined], 'the nightly figure is out, or added two currencies');
});

test('on Money\'s own example entries the nightly figure reads nought, and this walk agrees with Cash now', async () => {
  const k = await moneyCore(true);
  const { totals } = figure(k);
  assert.ok(totals.size > 0, 'the example record holds no cash, so nothing was checked');
  assert.deepEqual(Object.fromEntries(totals), Object.fromEntries(walked(k)));
  const check = checked(k);
  assert.deepEqual([check.value, check.met, check.parts], [0, true, undefined]);
});
