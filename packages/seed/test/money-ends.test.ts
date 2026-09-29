/**
 * A repeating line in Money carries the last day it moves money on, and the Money page's cash walk stops on it.
 *
 * WHAT WENT WRONG. `5d4bbf8b` taught both engines an end day for a leg (`Leg.ends` in `packages/kernel/src/forecast.ts`)
 * and taught an import to write one, but only where `obligations` declares the field, and money-core 2.3.0
 * declared none. So on every record the import sent nothing, and a bill the source says ends on 10 November walked
 * 10 December and every month to the horizon on the page a person reads to decide what to shut down. The field was one half
 * of the repair and the leg naming it was the other; neither was in the pack.
 *
 * money-core 2.4.0 declares `ends` on `obligations` and names it on the cash legs both `/p/money` walks share
 * (`CASH_LEGS`), which is one field added and nothing taken away: see `packs/first-party.ts` for the step.
 *
 * RED FIRST, against money-core 2.3.0 and this file: the first test failed on the field, which `obligations` did not
 * declare; the second on the create, which the kernel refused because `ends` was no field of the list; the third on
 * the update from 2.3.0, which planned no change to `register.obligations`.
 *
 * SINCE money-core 3.0.0 REPEATING MONEY IS WALKED FROM `recurring` ALONE, which has always carried `ends`. The walk's
 * obligations leg reads a bill once and leaves out one that says it repeats, so a stream is never walked twice
 * (`CASH_LEGS`), and the leg that names `ends` is the recurring one. `obligations` keeps its `ends`, which nothing is
 * taken away from, and an import writes a repeating line and its end to `recurring`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY, NOW, day, firstPartyDocument, gbp, installSeed } from '../src/index.ts';
import { put, record, value, type Doc } from './money-core-earlier.ts';

/**
 * money-core 2.3.0 AS IT SHIPPED, examples and all. Kept as a file and not rebuilt out of today's document, because
 * 3.0.0 reshaped the lists, the page and the figures, and taking that back off is a second copy of 2.3.0 written by hand.
 * It was written from the tree before 3.0.0 (`6db58337`, `asMoneyCore230(firstPartyDocument('money-core'))`), and the
 * test below holds it to the fingerprint `pack-versions.test.ts` recorded for 2.3.0.
 */
const MONEY_CORE_2_3_0 = JSON.parse(readFileSync(new URL('./fixtures/money-core-2.3.0.json', import.meta.url), 'utf8')) as Doc & { seeds?: unknown[] };

const OWNER = { actor: 'p_1' };

/** The steps of the row called `what` in the walk a block on `/p/money` draws, as `day delta`. */
function walked(k: Kernel, heading: string, what: string): string[] {
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  const block = (out.value as { blocks: readonly { heading?: string; refusals: readonly unknown[]; walk?: { steps: readonly { day: string; label: string; delta: number }[] } }[] }).blocks.find(
    (b) => b.heading === heading,
  );
  assert.ok(block?.walk, `/p/money draws no walk headed ${heading}`);
  assert.deepEqual(block.refusals, [], `${heading} refused`);
  return block.walk.steps.filter((s) => s.label === what).map((s) => `${s.day} ${String(s.delta)}`);
}

/* A MONTHLY LINE DUE A WEEK AFTER THE SEED'S TODAY, 3 September 2026, whose last payment is on 10 November. */
const HOSTING = {
  what: 'Hosting, ending',
  direction: 'out',
  amount: gbp(4_500),
  next_due: day(7),
  every: 'monthly',
  state: 'live',
};

/* THE SAME MONEY TYPED AS A BILL THAT SAYS IT REPEATS, as money-core 2.x walked it. */
const HOSTING_BILL = {
  what: 'Hosting, as a bill',
  direction: 'owed_by_me',
  amount: gbp(4_500),
  due: day(7),
  state: 'open',
  repeats: 'monthly',
};

test('money-core declares `ends` on Money as a day, and names it on the repeating leg of both walks `/p/money` draws', () => {
  const doc = firstPartyDocument('money-core', { seeds: [] }) as unknown as Doc;
  for (const register of ['obligations', 'recurring']) {
    const list = doc.declarations.find((d) => d.register === register);
    assert.ok(list, `money-core declares no ${register}`);
    assert.deepEqual(
      (list.fields as { id: string }[]).find((f) => f.id === 'ends'),
      { id: 'ends', label: 'Ends', type: 'day' },
      register,
    );
  }
  const money = doc.declarations.find((d) => d.page === 'money');
  const legs = (money?.blocks as { heading: string; from?: { register: string; ends?: string; where?: string }[] }[]).filter((b) => b.from !== undefined);
  assert.deepEqual(
    legs.map((b) => [b.heading, b.from!.find((l) => l.register === 'recurring')?.ends]),
    [
      ['Cash ahead', 'ends'],
      ['The next 30 days', 'ends'],
    ],
  );
  /* A BILL IS WALKED ONCE, AND ONE THAT SAYS IT REPEATS NOT AT ALL, so the obligations leg has no end to stop on. */
  for (const b of legs) {
    const bills = b.from!.find((l) => l.register === 'obligations');
    assert.ok(bills, `${b.heading} walks no bills`);
    assert.equal(bills.ends, undefined, `${b.heading}: the bills leg names an end`);
    assert.match(String(bills.where), /repeats is not monthly or quarterly or yearly/u, `${b.heading}: a repeating bill is walked beside its line`);
  }
});

test('a monthly line ending on 10 November walks 10 September, October and November on `/p/money`, and walks on again once its end is cleared', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));

  const made = k.create('recurring', { ...HOSTING, ends: '2026-11-10' }, OWNER);
  assert.ok(made.ok, sayOf(made));
  /* THE END IS INCLUSIVE, because an imported end day is the last payday: see `Leg.ends`. */
  assert.deepEqual(walked(k, 'Cash ahead', HOSTING.what), ['2026-09-10 -4500', '2026-10-10 -4500', '2026-11-10 -4500']);
  assert.deepEqual(walked(k, 'The next 30 days', HOSTING.what), ['2026-09-10 -4500']);

  /* A BILL THAT SAYS IT REPEATS IS KEPT AND NOT WALKED, end or none: its money moves on the line in `recurring`. */
  value(k.create('obligations', { ...HOSTING_BILL, ends: '2026-11-10' }, OWNER));
  assert.deepEqual(walked(k, 'Cash ahead', HOSTING_BILL.what), []);

  /* CLEARED, THE ROW IS A MONTHLY LINE WITH NO END AGAIN, which is what an import sends the night the source takes an
     end away. The kernel must take `null` as the clear. */
  const cleared = k.update('recurring', made.value.id, { ends: null }, { ...OWNER, version: made.value.version });
  assert.ok(cleared.ok, sayOf(cleared));
  assert.equal(Object.hasOwn(cleared.value.fields, 'ends') ? cleared.value.fields.ends : null, null);
  const after = walked(k, 'Cash ahead', HOSTING.what);
  assert.ok(after.includes('2026-12-10 -4500') && after.length > 3, `a line with its end cleared still stops:${JSON.stringify(after)}`);
});

/**
 * THE UPDATE A RECORD ON 2.3.0 IS OFFERED. A field added to a list a record already holds reaches it only through an
 * update, and an update is offered only when the version moves, so this plans today's document over a record holding
 * 2.3.0 as it shipped and writes the row the import would write the next night.
 */
test('a record on money-core 2.3.0 takes the update, gains `ends`, and its walk stops on it', async () => {
  const shipped = MONEY_CORE_2_3_0;
  assert.equal(shipped.version, '2.3.0');
  /* THE 2.3.0 THIS FILE READS IS THE 2.3.0 THAT SHIPPED, by the fingerprint `pack-versions.test.ts` holds for it. */
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify({ declarations: shipped.declarations, config: shipped.config ?? null }))
      .digest('hex')
      .slice(0, 16),
    '8ad733c726f4fd0b',
  );

  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, id === 'money-core' ? MONEY_CORE_2_3_0 : firstPartyDocument(id));
  assert.equal(
    k.register('obligations')?.fields.some((f) => f.id === 'ends'),
    false,
    'the record on 2.3.0 already holds ends',
  );

  const diff = await put(k, firstPartyDocument('money-core'));
  assert.deepEqual(
    diff.changes.map((c) => c.id).filter((id) => id === 'register.obligations' || id === 'page.money').sort(),
    ['page.money', 'register.obligations'],
    'the update from 2.3.0 does not carry the field and the legs that read it',
  );
  assert.equal(k.register('obligations')?.fields.find((f) => f.id === 'ends')?.type, 'day');
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, firstPartyDocument('money-core')?.version);

  const made = value<{ id: string }>(k.create('recurring', { ...HOSTING, ends: '2026-11-10' }, OWNER));
  assert.ok(made.id);
  assert.deepEqual(walked(k, 'Cash ahead', HOSTING.what), ['2026-09-10 -4500', '2026-10-10 -4500', '2026-11-10 -4500']);
  sql.close();
});
