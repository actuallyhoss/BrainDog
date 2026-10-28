/**
 * A repeating line whose "Next" is stuck (`src/modules/money/figures/signs.ts`), read through the kernel
 * on a record that installed money-core the way a person does, with no example rows.
 *
 * Money's `settle` script moves "Next" one cycle on when a payment is matched to the line. Nothing said when it did not:
 * a line whose day went by with no payment matched kept a day in the past and no screen counted it. `repeating-overdue`
 * counts the live lines whose "Next" is more than three days gone.
 *
 * ONLY A LINE A PAYMENT WAS MATCHED TO BEFORE IS JUDGED (repeating-sign-fix-69). Nothing links an
 * arriving payment to a repeating line by itself, so on a line nobody has matched a payment to, "Next" stands still
 * whether the money went or not, and the sign was red on a line Money watch had just added. Such a line has no "Last
 * paid" and is left out; one that has it and whose "Next" then went by is the payment the record can say is missing.
 *
 * RED FIRST: with `last_paid is set` out of the figure's `where`, the first test fails on the sentence and the Money
 * watch test counts 1.
 *
 * AND ITS NAME SAYS SO (repeating-sign-72). Money watch writes its lines with no "Last paid" and
 * only `settle` writes one, so on a record nobody runs `settle` on the sign reads 0 whatever stopped. Under the name
 * "Repeating lines past their day" a reader took that 0 as every line watched. The name now says matched lines, and
 * nothing in the seed keeps the old one. RED FIRST: under the old name the two tests of the name fail.
 *
 * AND WITH NONE TO COUNT IT SAYS NOTHING. The name did not stop the number: a record whose lines
 * were all written by Money watch read 0 and met its mark, a clean answer from a sign that could see none of them. The
 * count is now read per the one state its lines are in, so with no matched line past its day there is nothing to divide
 * by and the reading is no value and no verdict. RED FIRST: as a plain count, every test below that asks for no value
 * reads 0, and every one that asks for no verdict reads met.
 *
 * AND THE NOUGHT IS BACK WHERE IT WAS READ (signs-metric-75-76, repeating-overdue-past-78). Counting per the state
 * silenced the kept record too: lines matched and none past its day was no line under a `where` that held the day, the
 * same as no line ever matched. The day is out of the `where` now and in the count (`past`), so the `where` says who is
 * judged, the live lines a payment was matched to, and the count says how many of those are late. A record with such
 * lines and none late reads 0 and meets its mark; a record with none of them still reads no value. And the figure is
 * read both ways here, as Money declares it and as a record holds it, because a record keeps a declaration's keys in
 * order and `{ past, by }` comes back `{ by, past }`. RED FIRST: with the day in the `where`, every test below that
 * asks for 0 and met reads no value.
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

/** The sign as Money declares it, read now. */
const stuck = (k: Kernel) => {
  const read = k.metric(METRICS['repeating-overdue'] as never);
  assert.ok(read.ok, sayOf(read));
  return read.value;
};

/** The sign as the record installed it, its keys in the order a record keeps them. */
const heldSign = (k: Kernel) => {
  const held = k.declarations().find((d) => d.id === 'metric.repeating-overdue');
  assert.ok(held, 'money-core installed without repeating-overdue');
  return JSON.parse(held.body) as { name?: string; where?: string; value?: unknown };
};

/** The same sign read from what the record holds, which is what a page and an agent are answered from. */
const stuckHeld = (k: Kernel) => {
  const read = k.metric(heldSign(k) as never);
  assert.ok(read.ok, sayOf(read));
  return read.value;
};

/** Read both ways, and held to one answer: what Money declares and what a record stores must not part. */
const both = (k: Kernel) => {
  const declared = stuck(k);
  const held = stuckHeld(k);
  assert.equal(held.value, declared.value, 'the figure a record holds reads another number than the one Money declares');
  assert.equal(held.met, declared.met, 'and another verdict');
  return declared;
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
  assert.equal(sign.where, 'state is live, last_paid is set', 'who is judged: live, and matched to a payment before. The day is the count\'s');
  assert.deepEqual(
    sign.value,
    { ratio: { of: { past: 'next_due', by: '3d' }, per: { distinct: 'state' } } },
    'the late among them, per the one state, so no two currencies can meet in it',
  );
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
  const held = heldSign(k);
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

  const read = both(k);
  assert.equal(read.value, 1, 'the fourth day gone is stuck; the third is still inside the days a payment takes to land');
  assert.equal(read.met, false, 'one stuck line misses the mark');
});

test('A LINE MONEY WATCH JUST ADDED IS NOT RED, though its Next has gone by with nothing matched to it', async () => {
  const k = await moneyCore();
  /* The fields `packs/money-watch/repeats.js` writes after a yes, and no others: no payment was ever matched to it. */
  line(k, 'Netflix', -4, { amount: { amount: 1_099, currency: 'GBP' }, day_of_month: '12', note: 'Added by Money watch from three payments about a month apart.' });

  const read = both(k);
  assert.equal(read.value, null, 'nothing was ever matched to it, so the record cannot say a payment is missing, nor that none is');
  assert.equal(read.met, null, 'a line just added does not miss the mark, and does not meet it either');
});

test('A LINE NOBODY EVER MATCHED A PAYMENT TO IS NOT JUDGED, however long ago its Next was', async () => {
  const k = await moneyCore();
  line(k, 'Rent', -40);
  line(k, 'Salary', -200, { direction: 'in' });
  paid(k, 'Hosting', -9, -39);

  assert.equal(both(k).value, 1, 'the one line a payment was matched to before, and neither of the two it never was');
});

test('A LINE WHOSE PAYMENT WAS MATCHED IS NOT STUCK: its Next moved on with the match, and the sign says nought and met', async () => {
  const k = await moneyCore();
  /* As `settle` leaves a monthly line paid two days ago: "Last paid" then, "Next" a cycle ahead. */
  paid(k, 'Rent', 28, -2);
  /* And one matched on its day, which a yearly line's "Next" then left a year off. */
  paid(k, 'Hosting', 365, 0, { every: 'yearly' });

  const read = both(k);
  assert.equal(read.value, 0, 'two matched lines were read and neither is stuck, which is a nought that was counted');
  assert.equal(read.met, true, 'none stuck is the mark, and it is met');
});

test('A PAUSED OR ENDED LINE IS NOT STUCK, however long ago its Next was', async () => {
  const k = await moneyCore();
  paid(k, 'Gym', -40, -70, { state: 'paused' });
  paid(k, 'Old lease', -200, -230, { state: 'ended' });

  const read = both(k);
  assert.equal(read.value, null, 'neither is waiting for anything, so neither is judged, late or not');
  assert.equal(read.met, null);

  /* Beside a live line that is on time they are still left out: the nought is the live line's alone. */
  paid(k, 'Rent', 12, -18);
  assert.equal(both(k).value, 0);
});

test('A LINE WHOSE NEXT IS TODAY OR AHEAD IS NOT STUCK, and with none stuck the sign reads 0 and met', async () => {
  const k = await moneyCore();
  paid(k, 'Rent', 12, -18);
  paid(k, 'Salary', 0, -30, { direction: 'in' });
  paid(k, 'Insurance', -1, -31);

  const read = both(k);
  assert.equal(read.value, 0, 'three matched lines, the latest a day gone, and none past the three days');
  assert.equal(read.met, true, 'lines are held and none is stuck, which the sign now says');
});

test('EVERY STUCK LINE COUNTS ONCE, in any currency and either way', async () => {
  const k = await moneyCore();
  paid(k, 'Rent', -4, -34);
  paid(k, 'Hosting', -30, -395, { amount: { amount: 2_000, currency: 'USD' }, last_amount: { amount: 2_000, currency: 'USD' }, every: 'yearly' });
  paid(k, 'Salary', -9, -39, { direction: 'in', amount: { amount: 5_000_000, currency: 'EGP' }, last_amount: { amount: 4_900_000, currency: 'EGP' } });
  paid(k, 'Water', 3, -27);

  const read = both(k);
  assert.equal(read.value, 3, 'three late of four, and the count is the late ones, never a share of the four');
  assert.ok(Number.isInteger(read.value));
});

test('A RECORD WITH NO REPEATING LINES IS NOT JUDGED', async () => {
  const read = both(await moneyCore());
  assert.equal(read.value, null);
  assert.equal(read.met, null, 'none held, so nothing to say');
});

test('A RECORD NOBODY MATCHES PAYMENTS ON READS NO VALUE, never a clean nought from a sign that sees none of its lines', async () => {
  const k = await moneyCore();
  /* What a record kept by Money watch alone holds: every line written from the bank's payments, none ever matched,
     and each "Next" standing where it was written, long gone. */
  const watched = { note: 'Added by Money watch from three payments about a month apart.' };
  line(k, 'Netflix', -40, { ...watched, amount: { amount: 1_099, currency: 'GBP' } });
  line(k, 'Rent', -12, watched);
  line(k, 'Salary', -200, { ...watched, direction: 'in', amount: { amount: 5_000_000, currency: 'EGP' } });

  const blind = both(k);
  assert.equal(blind.value, null, 'three lines past their day and none counted is not nought stuck');
  assert.equal(blind.met, null, 'and a sign with no reading meets no mark');

  /* The day one of them is matched and its "Next" then goes by, the sign has a line to see and says so as a whole number. */
  paid(k, 'Hosting', -9, -39);
  const seen = both(k);
  assert.equal(seen.value, 1, 'the count itself, since every line it reads is live');
  assert.ok(Number.isInteger(seen.value), 'a count, never a share');
  assert.equal(seen.met, false);
});

test('A KEPT RECORD READS 0 AND MET, and the day one matched line goes past its day it reads 1 and missed', async () => {
  const k = await moneyCore();
  paid(k, 'Rent', 12, -18);
  paid(k, 'Hosting', 200, -165, { every: 'yearly' });
  paid(k, 'Salary', -2, -32, { direction: 'in' });

  const kept = both(k);
  assert.equal(kept.value, 0, 'every matched line is on time, and the sign has read them');
  assert.equal(kept.met, true);

  /* A line Money watch wrote and nobody matched does not spoil the nought, however long gone its "Next". */
  line(k, 'Netflix', -40, { note: 'Added by Money watch from three payments about a month apart.' });
  assert.equal(both(k).value, 0, 'a line nothing was matched to is not among the judged');

  /* And one of the matched goes by with nothing matched since. */
  paid(k, 'Phone', -5, -35);
  const late = both(k);
  assert.equal(late.value, 1);
  assert.equal(late.met, false);
});

test('WHAT A RECORD STORES READS AS WHAT MONEY DECLARES, whichever way round the count keeps its two keys', async () => {
  const k = await moneyCore();
  const held = heldSign(k);
  assert.equal(held.where, METRICS['repeating-overdue']!.where, 'the record installed another where than Money declares');
  assert.deepEqual(held.value, METRICS['repeating-overdue']!.value, 'the same count, whatever order its keys came back in');

  paid(k, 'Rent', 12, -18);
  paid(k, 'Phone', -4, -34);
  paid(k, 'Water', -3, -33);

  /* Both orders written out, so the test does not lean on how this record happens to keep them. */
  const base = { ...METRICS['repeating-overdue']! };
  const orders = [
    { past: 'next_due', by: '3d' },
    { by: '3d', past: 'next_due' },
  ];
  for (const of of orders) {
    const read = k.metric({ ...base, value: { ratio: { of, per: { distinct: 'state' } } } } as never);
    assert.ok(read.ok, `${Object.keys(of).join(', ')}: ${sayOf(read)}`);
    assert.equal(read.value.value, 1, `${Object.keys(of).join(', ')}: the fourth day gone and not the third`);
    assert.equal(read.value.met, false);
  }
  assert.equal(stuckHeld(k).value, 1, 'and so does the figure as the record holds it');
});
