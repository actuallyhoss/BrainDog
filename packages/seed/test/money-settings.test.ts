/**
 * Money's settings (`src/modules/money/settings.ts`), held on a record rather than read off the declaration alone.
 *
 * THE HOME CURRENCY HAS NO DEFAULT, AND THIS IS WHERE THAT IS MEASURED. A default of `GBP` was tried: on a record with
 * one account in Egyptian pounds and one in dollars, Cash now then answered a sterling figure converted at a rate nobody
 * asked for, which reads exactly like one a person chose. These cases lived in `founder-poll.test.ts` and then in
 * `packs/rates-poll/rates-poll.test.ts`; the founder's poll builder is gone (the live feed fills a poll now),
 * and the setting is Money's, so its record case lives beside Money's own tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, NOW, day, firstPartyDocument } from '../src/index.ts';
import { MONEY_HOME_SETTING } from '../src/modules/money.ts';

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

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

/** Money with no sample rows, through the door a record installs a pack by, so the two accounts below are the whole of it. */
async function money(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const read = await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' });
    assert.ok(read.ok, sayOf(read));
    const pack = read.value as Pack;
    const diff = await plan(pack, stateOf(k));
    const out = await install(pack, diff, hostFor(k), diff.planHash);
    assert.ok(out.ok, `${id}: ${sayOf(out)}`);
  }
  return k;
}

const cashNow = (k: Kernel): number | null => {
  const out = k.metric(METRICS['cash-now'] as never);
  assert.ok(out.ok, sayOf(out));
  return out.value.value;
};

test('THE HOME CURRENCY SETTING HAS NO DEFAULT, because a figure converted at a rate nobody asked for looks like one a person chose', () => {
  assert.equal((MONEY_HOME_SETTING.home_currency as { default?: string }).default, undefined);
});

test('CASH NOW READS NOTHING ACROSS TWO CURRENCIES UNTIL SOMEBODY CHOOSES THE HOME ONE, and then reads each at its rate', async () => {
  const k = await money();
  for (const a of [
    { name: 'Nile current', kind: 'bank', balance: { amount: 5_200_000, currency: 'EGP' }, as_of: day(0), liquid: true },
    { name: 'Dollar float', kind: 'bank', balance: { amount: 340_000, currency: 'USD' }, as_of: day(0), liquid: true },
  ]) {
    const made = k.create('accounts', a as never, { actor: 'p_1' });
    assert.ok(made.ok, sayOf(made));
  }
  for (const [base, rate] of [['EGP', 50], ['GBP', 0.74]] as const) {
    const quoted = k.create('fx', { currency: 'USD', base, rate, as_of: day(0), source: 'open.er-api.com' } as never, { actor: 'p_1' });
    assert.ok(quoted.ok, sayOf(quoted));
  }

  /* A RATE ON THE RECORD IS NOT A CHOICE: with nothing to add them up in, the two are not added up. */
  assert.equal(cashNow(k), null, 'two currencies were added up with no home currency chosen');

  /* AND NOT FOR WANT OF A RATE: sterling, the old default, reads a figure the moment it is the answer, through the
     dollar both rates are quoted against. That figure is what a default would have shown before anybody chose. */
  const sterling = k.setPackConfig('money-core', { home_currency: 'GBP' }, { actor: 'p_1' });
  assert.ok(sterling.ok, sayOf(sterling));
  assert.equal(typeof cashNow(k), 'number');

  const chose = k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' });
  assert.ok(chose.ok, sayOf(chose));
  assert.equal(cashNow(k), 5_200_000 + 340_000 * 50);
});
