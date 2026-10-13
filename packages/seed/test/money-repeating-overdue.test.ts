/**
 * A repeating line whose "Next" is stuck (REC-B11 step 8, `src/modules/money/figures/signs.ts`), read through the kernel
 * on a record that installed money-core the way a person does, with no example rows.
 *
 * Money's `settle` script moves "Next" one cycle on when a payment is matched to the line. Nothing said when it did not:
 * a line whose day went by with no payment matched kept a day in the past and no screen counted it. `repeating-overdue`
 * counts the live lines whose "Next" is more than three days gone.
 *
 * ONLY A LINE A PAYMENT WAS MATCHED TO BEFORE IS JUDGED (repeating-sign-fix-69, audit 67 claim 1). Nothing links an
 * arriving payment to a repeating line by itself, so on a line nobody has matched a payment to, "Next" stands still
 * whether the money went or not, and the sign was red on a line Money watch had just added. Such a line has no "Last
 * paid" and is left out; one that has it and whose "Next" then went by is the payment the record can say is missing.
 *
 * RED FIRST: with `last_paid is set` out of the figure's `where`, the first test fails on the sentence and the Money
 * watch test counts 1.
 *
 * AND ITS NAME SAYS SO (repeating-sign-72, audit 69 finding 5). Money watch writes its lines with no "Last paid" and
 * only `settle` writes one, so on a record nobody runs `settle` on the sign reads 0 whatever stopped. Under the name
 * "Repeating lines past their day" a reader took that 0 as every line watched. The name now says matched lines, and
 * nothing in the seed keeps the old one. RED FIRST: under the old name the two tests of the name fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/** A repeating line with its "Next" so many days from today, live unless said, and with no payment matched to it yet. */
const line = (k: Kernel, what: string, next: number, more: Record<string, unknown> = {}) =>
  value<Entry>(
    k.create('recurring', { what, direction: 'out', amount: { amount: 400_000, currency: 'GBP' }, every: 'monthly', next_due: day(next), state: 'live', ...more }, OWNER),
  );

/**
 * A line a payment was matched to so many days ago, as Money's `settle` leaves one: "Last paid" and "Last amount"
 * written, and "Next" wherever `next` says.
 */
const paid = (k: Kernel, what: string, next: number, last: number, more: Record<string, unknown> = {}) =>
  line(k, what, next, { last_paid: day(last), last_amount: { amount: 400_000, currency: 'GBP' }, ...more });

test('MONEY DECLARES THE SIGN FOR A STUCK REPEATING LINE, and the record installs it with the rest of Money', async () => {
  const sign = METRICS['repeating-overdue'];
  assert.ok(sign, 'Money does not declare repeating-overdue');
  assert.equal(sign.source, 'register.recurring');
  assert.equal(sign.where, 'state is live, next_due before -3d, last_paid is set', 'live, more than three days gone, and matched to a payment before');
  assert.deepEqual(sign.value, { count: 'id' }, 'a count, so no two currencies can meet in it');
  assert.deepEqual(sign.target, { lte: 0 }, 'none stuck is the mark');
  assert.equal(sign.format, 'int');
  assert.equal(sign.compare, 'none');

  const k = await moneyCore();
  assert.ok(k.declarations().find((d) => d.id === 'metric.repeating-overdue'), 'money-core installed without repeating-overdue');
});

/** The name the sign had while it read as a watch on every line. */
const OLD_NAME = 'Repeating lines past their day';

test('THE NAME SAYS IT COUNTS MATCHED LINES, so nought is not read as every repeating line watched', async () => {
  const sign = METRICS['repeating-overdue'];
  assert.ok(sign, 'Money does not declare repeating-overdue');
  assert.equal(sign.name, 'Matched repeating lines past their day');
  assert.match(sign.name, /^Matched /, 'the first word a reader meets is the limit on what is counted');

  /* The name is what the record holds, so what a page or an agent is shown. */
  const k = await moneyCore();
  const held = JSON.parse(k.declarations().find((d) => d.id === 'metric.repeating-overdue')!.body) as { name?: string };
  assert.equal(held.name, sign.name, 'the record installed another name than Money declares');

  /* And the number under it is what the name says: a line Money watch wrote, never matched, is not in it. */
  line(k, 'Netflix', -40, { note: 'Added by Money watch from three payments about a month apart.' });
  paid(k, 'Rent', -4, -34);
  assert.equal(stuck(k).value, 1, 'the matched line alone');
});

test('NOTHING IN THE SEED KEEPS THE OLD NAME, which promised a watch on every repeating line', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const hits: string[] = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(ts|js|json|md)$/.test(entry.name)) continue;
    const file = `${entry.parentPath}/${entry.name}`;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, i) => {
        /* Case matters: the new name holds the old one's words after "Matched", with a small r. */
        if (text.includes(OLD_NAME)) hits.push(`${file.slice(root.length)}:${i + 1}`);
      });
  }
  assert.deepEqual(hits, [], 'the old name is still written here');
});

test('A LINE PAID BEFORE WHOSE NEXT IS FOUR DAYS GONE COUNTS, and one three days gone does not yet', async () => {
  const k = await moneyCore();
  paid(k, 'Rent', -4, -34);
  paid(k, 'Phone', -3, -33);

  const read = stuck(k);
  assert.equal(read.value, 1, 'the fourth day gone is stuck; the third is still inside the days a payment takes to land');
  assert.equal(read.met, false, 'one stuck line misses the mark');
});

test('A LINE MONEY WATCH JUST ADDED IS NOT RED, though its Next has gone by with nothing matched to it', async () => {
  const k = await moneyCore();
  /* The fields `packs/money-watch/repeats.js` writes after a yes, and no others: no payment was ever matched to it. */
  line(k, 'Netflix', -4, { amount: { amount: 1_099, currency: 'GBP' }, day_of_month: '12', note: 'Added by Money watch from three payments about a month apart.' });

  const read = stuck(k);
  assert.equal(read.value, 0, 'nothing was ever matched to it, so the record cannot say a payment is missing');
  assert.equal(read.met, true, 'a line just added does not miss the mark');
});

test('A LINE NOBODY EVER MATCHED A PAYMENT TO IS NOT JUDGED, however long ago its Next was', async () => {
  const k = await moneyCore();
  line(k, 'Rent', -40);
  line(k, 'Salary', -200, { direction: 'in' });
  paid(k, 'Hosting', -9, -39);

  assert.equal(stuck(k).value, 1, 'the one line a payment was matched to before, and neither of the two it never was');
});

test('A LINE WHOSE PAYMENT WAS MATCHED IS NOT STUCK: its Next moved on with the match', async () => {
  const k = await moneyCore();
  /* As `settle` leaves a monthly line paid two days ago: "Last paid" then, "Next" a cycle ahead. */
  paid(k, 'Rent', 28, -2);
  /* And one matched on its day, which a yearly line's "Next" then left a year off. */
  paid(k, 'Hosting', 365, 0, { every: 'yearly' });

  const read = stuck(k);
  assert.equal(read.value, 0);
  assert.equal(read.met, true);
});

test('A PAUSED OR ENDED LINE IS NOT STUCK, however long ago its Next was', async () => {
  const k = await moneyCore();
  paid(k, 'Gym', -40, -70, { state: 'paused' });
  paid(k, 'Old lease', -200, -230, { state: 'ended' });

  assert.equal(stuck(k).value, 0);
});

test('A LINE WHOSE NEXT IS TODAY OR AHEAD IS NOT STUCK, and with none stuck the mark is met', async () => {
  const k = await moneyCore();
  paid(k, 'Rent', 12, -18);
  paid(k, 'Salary', 0, -30, { direction: 'in' });
  paid(k, 'Insurance', -1, -31);

  const read = stuck(k);
  assert.equal(read.value, 0);
  assert.equal(read.met, true, 'lines are held and none is stuck');
});

test('EVERY STUCK LINE COUNTS ONCE, in any currency and either way', async () => {
  const k = await moneyCore();
  paid(k, 'Rent', -4, -34);
  paid(k, 'Hosting', -30, -395, { amount: { amount: 2_000, currency: 'USD' }, last_amount: { amount: 2_000, currency: 'USD' }, every: 'yearly' });
  paid(k, 'Salary', -9, -39, { direction: 'in', amount: { amount: 5_000_000, currency: 'EGP' }, last_amount: { amount: 4_900_000, currency: 'EGP' } });
  paid(k, 'Water', 3, -27);

  assert.equal(stuck(k).value, 3);
});

test('A RECORD WITH NO REPEATING LINES HAS NONE STUCK', async () => {
  const read = stuck(await moneyCore());
  assert.equal(read.value, 0);
  assert.equal(read.met, true, 'none held, none stuck');
});
