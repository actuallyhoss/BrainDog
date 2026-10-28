/**
 * An account that closes: it leaves the forms, the count of accounts and Cash now, and every
 * month it was open reads as it did.
 *
 * WHY. An account money moved through cannot be deleted (`delete: 'refuse_while_referenced'`), so until it could close
 * it stayed in Cash now and in every picker for good: a record held accounts nobody used, each reading out of date.
 * Closed is the list's finished status, which is what the refusal offers as the way out and what a form reads to leave
 * a row out of its choices.
 *
 * WHAT IS HELD HERE. The declaration as the record holds it, the four figures of `figures/cash.ts` a closed account
 * left, the cross-check still reading nought, and the spending of the months before, which no figure of cash reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { CASH_FIGURES } from '../src/modules/money/figures/cash.ts';
import { FLOW_FIGURES } from '../src/modules/money/figures/flow.ts';
import { ACCOUNTS_REGISTER } from '../src/modules/money/lists/accounts.ts';

const OWNER = { actor: 'p_1' };

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
async function moneyCore(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

type Money = { amount: number; currency: string };
type Row = { id: string; fields: Record<string, unknown> };
type Reading = { value: number | null; unit: string | null; met?: boolean | null; groups?: { key: string; value: number | null }[] };
const money = (amount: number, currency = 'GBP'): Money => ({ amount, currency });
const make = (k: Kernel, register: string, fields: Record<string, unknown>): string => value<{ id: string }>(k.create(register, fields, OWNER)).id;
const read = (k: Kernel, figures: Record<string, unknown>, id: string): Reading => value<Reading>(k.metric(figures[id] as never));
const cash = (k: Kernel, id: string): Reading => read(k, CASH_FIGURES, id);

/**
 * Two accounts typed sixty days ago, each with one payment forty days ago, which is a month before this one whatever
 * today is. Everyday rolls to 197,000 and the old joint account to 43,000.
 */
function write(k: Kernel): { everyday: string; joint: string } {
  const everyday = make(k, 'accounts', { name: 'Everyday account', kind: 'bank', balance: money(200_000), as_of: day(-60) });
  const joint = make(k, 'accounts', { name: 'Old joint account', kind: 'bank', balance: money(50_000), as_of: day(-60) });
  const paid = (account: string, amount: number) =>
    make(k, 'transactions', { what: 'Payment', on: day(-40), direction: 'out', amount: money(amount), account, state: 'cleared' });
  paid(everyday, 3_000);
  paid(joint, 7_000);
  return { everyday, joint };
}

const close = (k: Kernel, id: string) => value(k.update('accounts', id, { state: 'closed' }, OWNER));

test('an account is open until it is closed, and closed is the list\'s finished status', async () => {
  const state = ACCOUNTS_REGISTER.fields.find((f) => f.id === 'state');
  assert.deepEqual([ACCOUNTS_REGISTER.state, ACCOUNTS_REGISTER.done], ['state', ['closed']]);
  assert.deepEqual([state?.type, state?.values, state?.default, state?.label], ['enum', ['open', 'closed'], 'open', 'Status']);
  const k = await moneyCore();
  const { everyday } = write(k);
  assert.equal(k.get(everyday)?.fields.state, 'open', 'an account typed with no status is not open');
});

test('a closed account is not among the accounts a form offers', async () => {
  const k = await moneyCore();
  const { joint } = write(k);
  close(k, joint);
  /* WHAT A PICKER ASKS: the rows of the list that are in none of its finished statuses, read off the record's own
     declaration and never off a word of this file's. */
  const done = k.register('accounts')?.done ?? [];
  assert.deepEqual(done, ['closed'], 'the record holds no finished status for an account, so a form cannot leave one out');
  const offered = value<{ rows: Row[] }>(k.list({ register: 'accounts', where: { none: [{ field: 'state', in: [...done] }] }, limit: 50 })).rows;
  assert.deepEqual(offered.map((r) => r.fields.name), ['Everyday account']);
});

test('a closed account is not in the count of accounts, in Cash now or in its parts, and the cross-check still reads nought', async () => {
  const k = await moneyCore();
  const { joint } = write(k);
  assert.deepEqual([cash(k, 'cash-accounts').value, cash(k, 'cash-now').value], [2, 240_000]);
  close(k, joint);
  assert.equal(cash(k, 'cash-accounts').value, 1, 'a closed account is still counted');
  assert.deepEqual([cash(k, 'cash-now').value, cash(k, 'cash-now').unit], [197_000, 'GBP'], 'a closed account is still in Cash now');
  assert.deepEqual((cash(k, 'cash-by-account').groups ?? []).map((g) => [g.key, g.value]), [['Everyday account', 197_000]], 'a closed account is still a bar of the lead tile');
  const check = cash(k, 'cash-cross-check');
  assert.deepEqual([check.value, check.met], [0, true], 'the walk and the figure disagree about a closed account');
});

test('a closed account that nobody confirmed for months does not make Cash now out of date', async () => {
  const k = await moneyCore();
  const { everyday, joint } = write(k);
  make(k, 'balances', { account: everyday, balance: money(197_000), as_of: day(-1), source: 'Statement' });
  assert.equal(cash(k, 'balances-stale').value, 1);
  close(k, joint);
  assert.equal(cash(k, 'balances-stale').value, 0, 'a closed account still reads out of date');
  assert.equal(cash(k, 'cash-as-of').value, Math.floor(Date.parse(day(-1)) / 86_400_000), 'the oldest balance is still the closed account\'s');
  /* EVERY ACCOUNT KEEPS ITS OWN DAY, closed or not: the card of a closed account still says when it was last true. */
  assert.equal((cash(k, 'account-ages').groups ?? []).length, 2);
});

test('the months an account was open read the same after it closes', async () => {
  const k = await moneyCore();
  const { joint } = write(k);
  const before = read(k, FLOW_FIGURES, 'out-by-month');
  assert.equal((before.groups ?? []).reduce((sum, g) => sum + (g.value ?? 0), 0), 10_000, 'the two payments are not the month\'s spending');
  close(k, joint);
  assert.deepEqual(read(k, FLOW_FIGURES, 'out-by-month'), before, 'closing an account changed a past month');
  /* ITS PAYMENTS ARE STILL ITS OWN: nothing was moved or removed to close it. */
  const kept = value<{ rows: Row[] }>(k.list({ register: 'transactions', limit: 50 })).rows.filter((r) => r.fields.account === joint);
  assert.equal(kept.length, 1);
});

test('an account reopened is counted again', async () => {
  const k = await moneyCore();
  const { joint } = write(k);
  close(k, joint);
  value(k.update('accounts', joint, { state: 'open' }, OWNER));
  assert.deepEqual([cash(k, 'cash-accounts').value, cash(k, 'cash-now').value], [2, 240_000]);
});

test('an account typed before it had a status holds none, and is counted as open', async () => {
  const k = await moneyCore();
  const { joint } = write(k);
  /* THE ROW AS AN UPDATE LEAVES IT: the field is new, and no update writes a status into the accounts already held. */
  value(k.update('accounts', joint, { state: null }, OWNER));
  assert.equal(k.get(joint)?.fields.state ?? null, null);
  assert.deepEqual([cash(k, 'cash-accounts').value, cash(k, 'cash-now').value], [2, 240_000], 'an account with no status dropped out of Cash now');
  assert.equal(cash(k, 'cash-cross-check').value, 0);
});
