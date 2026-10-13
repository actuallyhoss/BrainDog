/**
 * A repeating line whose "Next" is stuck (REC-B11 step 8, `src/modules/money/figures/signs.ts`), read through the kernel
 * on a record that installed money-core the way a person does, with no example rows.
 *
 * Money's `settle` script moves "Next" one cycle on when a payment is matched to the line. Nothing said when it did not:
 * a line whose day went by with no payment matched kept a day in the past and no screen counted it. `repeating-overdue`
 * counts the live lines whose "Next" is more than three days gone.
 *
 * RED FIRST: with `repeating-overdue` out of `SIGNS_FIGURES`, the first test fails on `METRICS['repeating-overdue']` and
 * the install declares no such figure.
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
const stuck = (k: Kernel) => {
  const read = k.metric(METRICS['repeating-overdue'] as never);
  assert.ok(read.ok, sayOf(read));
  return read.value;
};

/** A repeating line with its "Next" so many days from today, live unless said. */
const line = (k: Kernel, what: string, next: number, more: Record<string, unknown> = {}) =>
  value<Entry>(
    k.create('recurring', { what, direction: 'out', amount: { amount: 400_000, currency: 'GBP' }, every: 'monthly', next_due: day(next), state: 'live', ...more }, OWNER),
  );

test('MONEY DECLARES THE SIGN FOR A STUCK REPEATING LINE, and the record installs it with the rest of Money', async () => {
  const sign = METRICS['repeating-overdue'];
  assert.ok(sign, 'Money does not declare repeating-overdue');
  assert.equal(sign.source, 'register.recurring');
  assert.deepEqual(sign.value, { count: 'id' }, 'a count, so no two currencies can meet in it');
  assert.deepEqual(sign.target, { lte: 0 }, 'none stuck is the mark');
  assert.equal(sign.format, 'int');
  assert.equal(sign.compare, 'none');

  const k = await moneyCore();
  assert.ok(k.declarations().find((d) => d.id === 'metric.repeating-overdue'), 'money-core installed without repeating-overdue');
});

test('A LIVE LINE WHOSE NEXT IS FOUR DAYS GONE COUNTS, and one three days gone does not yet', async () => {
  const k = await moneyCore();
  line(k, 'Rent', -4);
  line(k, 'Phone', -3);

  const read = stuck(k);
  assert.equal(read.value, 1, 'the fourth day gone is stuck; the third is still inside the days a payment takes to land');
  assert.equal(read.met, false, 'one stuck line misses the mark');
});

test('A PAUSED OR ENDED LINE IS NOT STUCK, however long ago its Next was', async () => {
  const k = await moneyCore();
  line(k, 'Gym', -40, { state: 'paused' });
  line(k, 'Old lease', -200, { state: 'ended' });

  assert.equal(stuck(k).value, 0);
});

test('A LINE WHOSE NEXT IS TODAY OR AHEAD IS NOT STUCK, and with none stuck the mark is met', async () => {
  const k = await moneyCore();
  line(k, 'Rent', 12);
  line(k, 'Salary', 0, { direction: 'in' });
  line(k, 'Insurance', -1);

  const read = stuck(k);
  assert.equal(read.value, 0);
  assert.equal(read.met, true, 'lines are held and none is stuck');
});

test('EVERY STUCK LINE COUNTS ONCE, in any currency and either way', async () => {
  const k = await moneyCore();
  line(k, 'Rent', -4);
  line(k, 'Hosting', -30, { amount: { amount: 2_000, currency: 'USD' }, every: 'yearly' });
  line(k, 'Salary', -9, { direction: 'in', amount: { amount: 5_000_000, currency: 'EGP' } });
  line(k, 'Water', 3);

  assert.equal(stuck(k).value, 3);
});

test('A RECORD WITH NO REPEATING LINES HAS NONE STUCK', async () => {
  const read = stuck(await moneyCore());
  assert.equal(read.value, 0);
  assert.equal(read.met, true, 'none held, none stuck');
});
