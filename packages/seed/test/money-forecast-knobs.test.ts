/**
 * Cash ahead on `/p/money` turns on the forecast's later controls, and its instalments say which plan each part is in.
 *
 * WHAT WAS MISSING. The controls for growth, rate drift and counting a plan in or out were built in the renderer, the
 * kernel and the browser's walk (brief B6 of `loop/research-legacy-parity.md`), and no page declared them: Cash ahead
 * asked for four knobs, and its instalments leg named no `group`, so every part of the proofing press reached the chart
 * as its own one-off, `Proofing press, 5 of 8`, which the count control does not offer.
 *
 * MONEY IS THE WORST PLACE TO BE WRONG, so the parts of each plan are held to the rows that make it, to the minor unit:
 * a plan counted out has to take away exactly what is still open in it, no more and no less.
 *
 * RED FIRST, against money.ts before this change: the knobs were `horizon late spend leave`, and no step carried `of`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite } from '../../kernel/test/sqlite.ts';

import { INSTALLMENTS, NOW, installSeed } from '../src/index.ts';

type Walked = { heading?: string; refusals: readonly unknown[]; knobs?: string[]; sells?: unknown; walk?: { steps: { day: string; label: string; delta: number; source: string; of?: string }[] } };

async function cashAhead(): Promise<Walked> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  const block = (out.value as { blocks: Walked[] }).blocks.find((b) => b.heading === 'Cash ahead');
  assert.ok(block?.walk, '/p/money draws no Cash ahead');
  assert.deepEqual(block.refusals, []);
  return block;
}

test('CASH AHEAD OFFERS GROWTH, RATE DRIFT, COUNTING AND SELLING, and sells nothing on a record that holds nothing to sell', async () => {
  const block = await cashAhead();
  /* `leave` FOLDED INTO `count` AT money-core 3.0.0, and `sell` offers what a pack declares `sellable`. */
  assert.deepEqual(block.knobs, ['horizon', 'late', 'spend', 'count', 'grow', 'drift', 'sell']);
  assert.deepEqual(block.sells, [], 'the sample holds no holdings pack, so there is nothing to sell');
});

test('EVERY INSTALMENT STEP SAYS ITS PLAN, and each plan’s steps add up to its open parts, to the minor unit', async () => {
  const block = await cashAhead();
  const parts = block.walk!.steps.filter((s) => s.source === 'installments');
  assert.ok(parts.length > 0, 'the walk has no instalments to group');
  assert.deepEqual(
    parts.filter((s) => s.of === undefined).map((s) => s.label),
    [],
    'a part that names no plan',
  );
  /* WHAT THE ROWS SAY IS STILL TO MOVE, signed the way the leg signs it: `in` arrives, everything else leaves. */
  const open = new Map<string, number>();
  for (const r of INSTALLMENTS) {
    if (r.state !== 'open') continue;
    const amount = (r.amount as { amount: number }).amount;
    open.set(String(r.plan), (open.get(String(r.plan)) ?? 0) + (r.direction === 'in' ? amount : -amount));
  }
  const walked = new Map<string, number>();
  for (const s of parts) walked.set(s.of!, (walked.get(s.of!) ?? 0) + s.delta);
  assert.deepEqual(Object.fromEntries(walked), Object.fromEntries(open));
  /* AND THE NUMBERS THEMSELVES, so the comparison above cannot pass by both sides reading nothing. */
  assert.deepEqual(Object.fromEntries(walked), { 'Proofing press': -750_000, 'Halden licence': 480_000 });
});

test('A STEP FROM ANY OTHER LEG NAMES NO PLAN, so a monthly bill is still counted by its own label', async () => {
  const block = await cashAhead();
  const others = block.walk!.steps.filter((s) => s.source !== 'installments');
  assert.ok(others.length > 0);
  assert.deepEqual(others.filter((s) => 'of' in s).map((s) => s.label), []);
});
