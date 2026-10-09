/**
 * Money's signs of life (REC-B01 job 3, `src/modules/money/figures/signs.ts`), read through the kernel on a record that
 * installed money-core the way a person does, with no example rows.
 *
 * `ledger-rows-7d` is the one declared. The other three the unit names (`ledger-newest-days`, `currencies-held`,
 * `uncategorised-share-30d`) need words the kernel does not read yet, and `signs.ts` says which.
 *
 * RED FIRST: with `SIGNS_FIGURES` out of `figures/index.ts`, the first test fails on `METRICS['ledger-rows-7d']` and the
 * install declares no such figure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, NOW, day, firstPartyDocument } from '../src/index.ts';

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

/** The sign as the record holds it, read now. */
const rows7d = (k: Kernel) => {
  const read = k.metric(METRICS['ledger-rows-7d'] as never);
  assert.ok(read.ok, sayOf(read));
  return read.value;
};

test('MONEY DECLARES ITS FIRST SIGN OF LIFE, and the record installs it with the rest of Money', async () => {
  const sign = METRICS['ledger-rows-7d'];
  assert.ok(sign, 'Money no longer declares ledger-rows-7d');
  assert.deepEqual(sign.value, { count: 'id' }, 'a sign of life is a count, so no two currencies can meet in it');
  assert.equal(sign.format, 'int');

  const k = await moneyCore();
  const held = k.declarations().find((d) => d.id === 'metric.ledger-rows-7d');
  assert.ok(held, 'money-core installed without ledger-rows-7d');
});

test('A RECORD WITH NOTHING ON ITS LEDGER READS NOUGHT AND IS NOT JUDGED, never a quiet week that looks good', async () => {
  const k = await moneyCore();
  const read = rows7d(k);
  assert.equal(read.value, 0);
  assert.equal(read.met, null, 'an empty Ledger is judged neither kept nor missed: nothing held is no verdict');
});

test('THE SEVEN DAYS ARE TODAY AND THE SIX BEFORE IT, cleared rows only, in any currency, a transfer counted', async () => {
  const k = await moneyCore();
  const account = (name: string, currency: string) =>
    value<Entry>(k.create('accounts', { name, kind: 'bank', balance: { amount: 0, currency }, as_of: day(-40) }, OWNER));
  const pounds = account('Current', 'GBP');
  const dollars = account('Dollars', 'USD');

  let n = 0;
  const row = (on: number, account: Entry, currency: string, more: Record<string, unknown> = {}) =>
    value<Entry>(
      k.create('transactions', { what: `Payment ${++n}`, on: day(on), direction: 'out', amount: { amount: 1000 + n * 137, currency }, account: account.id, ...more }, OWNER),
    );

  row(0, pounds, 'GBP'); // today: counted
  row(-6, dollars, 'USD'); // the sixth day before: counted, in another currency
  row(-3, pounds, 'GBP', { transfer: true }); // moved between two of his own accounts: still kept, counted
  row(-7, pounds, 'GBP'); // the seventh day before: outside
  row(1, pounds, 'GBP'); // dated ahead: outside
  row(-1, pounds, 'GBP', { state: 'pending' }); // not settled: not a fact yet
  row(-2, dollars, 'USD', { state: 'void' }); // taken back

  const read = rows7d(k);
  assert.equal(read.value, 3, 'today, the sixth day before and the transfer, and nothing else');
  assert.equal(read.met, true);
});

test('A LEDGER THAT STOPPED A WEEK AGO MISSES ITS MARK, as his did on 28 September', async () => {
  const k = await moneyCore();
  const current = value<Entry>(k.create('accounts', { name: 'Current', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: day(-40) }, OWNER));
  for (const on of [-30, -20, -11, -8])
    value(k.create('transactions', { what: `Payment ${on}`, on: day(on), direction: 'out', amount: { amount: 2500 - on, currency: 'GBP' }, account: current.id }, OWNER));

  const read = rows7d(k);
  assert.equal(read.value, 0);
  assert.equal(read.met, false);
});

test('THREE MORE SIGNS INSTALL WITH MONEY 3.16.0 AND READ NOTHING ON AN EMPTY RECORD, never a nought that looks kept', async () => {
  const k = await moneyCore();
  for (const id of ['ledger-newest-days', 'currencies-held', 'uncategorised-share-30d']) {
    assert.ok(k.declarations().some((d) => d.id === `metric.${id}`), `money-core installed without ${id}`);
    const read = k.metric(METRICS[id] as never);
    assert.ok(read.ok, `${id}: ${sayOf(read)}`);
    if (id !== 'currencies-held') assert.equal(read.value.value, null, `${id} read ${read.value.value} with nothing to read`);
  }
});
