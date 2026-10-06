/**
 * A ceiling typed in the home currency before the record moved to another is converted at the day's rate, not dropped.
 *
 * MEASURED BEFORE: `liveTarget` held a money setting to the figure only when it was typed in the figure's currency or the
 * home one as it is now. A person who set "most spent: £500" and later made the record's home currency Egyptian pounds
 * had the ceiling dropped, and the figure was held to the number written beside the setting in the declaration, which
 * nobody typed (`loop/research-audit-11-13.md`, kernel-queue-walk).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const SPENDS: Declaration = {
  id: 'register.spends',
  kind: 'register',
  body: { id: 'spends', name: 'Spends', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }] } as never,
};

const RATES: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

/* The placeholder beside the setting is one penny, so a figure held to it is plainly not held to what was typed. */
const SPENT: Declaration = {
  id: 'metric.spent',
  kind: 'metric',
  pack: 'money-core',
  body: { metric: 'spent', name: 'Spent', source: 'register.spends', value: { sum: 'amount' }, format: 'money', target: { lte: 1, setting: 'most_spent' }, window: '30d', compare: 'none' } as never,
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' }, most_spent: { type: 'money' } } }),
    checksum: 'not-a-real-checksum',
  });
  value(await k.install([SPENDS, RATES, SPENT]));
  value(k.setPackConfig('money-core', { home_currency: 'GBP', most_spent: { amount: 50_000, currency: 'GBP' } }, OWNER));
  return k;
}

const target = (k: Kernel) => k.metricDecl('spent')?.target as { lte?: number; currency?: string; setting?: string } | undefined;

test('A CEILING TYPED IN THE OLD HOME CURRENCY IS CONVERTED AT THE DAY’S RATE into the new one, and the figure is held to it', async () => {
  const k = await record();
  assert.deepEqual(target(k), { lte: 50_000, setting: 'most_spent', currency: 'GBP' }, 'typed in the home currency, held as typed');

  /* An older rate, the day's rate, and one dated after today: the day's is the one. */
  value(k.create('fx', { currency: 'GBP', base: 'EGP', rate: 55, as_of: '2026-09-01' }, OWNER));
  value(k.create('fx', { currency: 'GBP', base: 'EGP', rate: 60, as_of: '2026-10-06' }, OWNER));
  value(k.create('fx', { currency: 'GBP', base: 'EGP', rate: 70, as_of: '2026-10-20' }, OWNER));
  value(k.setPackConfig('money-core', { home_currency: 'EGP' }, OWNER));
  assert.deepEqual(target(k), { lte: 3_000_000, setting: 'most_spent', currency: 'EGP' }, 'the ceiling was dropped or converted at the wrong rate');

  /* And the figure, added up in pounds of Egypt, is judged against it. */
  value(k.create('spends', { what: 'Rent', amount: { amount: 2_000_000, currency: 'EGP' } }, OWNER));
  const met = () => (k.block({ kind: 'stat', cells: [{ metric: 'spent' }] } as never) as { readings: { reading: { met: boolean | null } | null }[] }).readings[0]?.reading?.met;
  assert.equal(met(), true);
  value(k.create('spends', { what: 'Kiln', amount: { amount: 1_500_000, currency: 'EGP' } }, OWNER));
  assert.equal(met(), false);
});

test('WITH NO RATE BETWEEN THE TWO, the declared number stands: a sum in pounds is never read as Egyptian pounds', async () => {
  const k = await record();
  value(k.setPackConfig('money-core', { home_currency: 'EGP' }, OWNER));
  assert.deepEqual(target(k), { lte: 1, setting: 'most_spent' });
});
