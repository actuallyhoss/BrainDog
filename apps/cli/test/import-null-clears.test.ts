/**
 * An end the old tool takes away comes off the row the next night, and a night with nothing changed writes nothing.
 *
 * WHAT WENT WRONG. `applyPlan` decides whether to patch a field by comparing the planned value with the stored one as
 * JSON, and the kernel leaves a field it holds no value for off the row. So a planned `null` read `null` against
 * `undefined`, differed, and was sent every night: every row named as updated, every night, over a record that had not
 * moved. That is why `planLegacyTool` sends `ends` only when the old tool has one (`src/legacy.ts`, "ONLY WHEN THERE IS
 * ONE"), and why an end he later removes stays on the row and stops the walk early for good.
 *
 * THE REPAIR IS IN `applyPlan`: a planned `null` and a field the row does not hold are the same value, so there is
 * nothing to send, and a planned `null` over a field that is there still clears it.
 *
 * WHAT THE PLANNER HAS TO SEND FOR IT. The line it needs is `{ ends: ends || null }` wherever it sends `{ ends }`, and
 * `src/legacy.ts` was not this change's to write. `sayNoEnd` below is that line, applied to the plan the planner
 * made, so the first test drives the whole path as it will run once the planner sends it; the second drives the planner
 * as it ships, which sends it.
 *
 * RED FIRST, against `applyPlan` as `5d4bbf8b` left it: the first test failed on night 3, which named both repeating
 * Money rows with no end, Quill retainer and Hosting, as updated with `ends` alone though nothing in the export had
 * moved. The second fails on night 2 with the end still on the row, and passed whole once a copy of the planner sent
 * `ends || null`, measured on 24 September and then thrown away.
 *
 * EVERY VALUE IS MADE UP; the bill is the shape `test/legacy-ends-ahead.test.ts` holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Leg } from '@braindog/kernel';
import { PAGES } from '@braindog/seed';

import { KEY_PREFIX, planLegacyTool, readSetup, type Plan, type Setup } from '../src/legacy.ts';
import { applyPlan, type Report } from '../src/import.ts';
import { syntheticExport } from './legacy-export.ts';
import { doorOf, exitOf, record } from './legacy-record.ts';

type Kernel = Awaited<ReturnType<typeof record>>['kernel'];
type Line = Record<string, unknown>;

const HOSTING: Line = { id: 7, name: 'Hosting', account_id: 'main', amount_minor: -4500, currency: 'USD', frequency: 'monthly', starts_on: '2026-01-03', ends_on: null };

/* THE MADE-UP EXPORT TAKEN ON `asOf`, with its bills replaced by `bill`. */
function exp(asOf: string, bill: Line): Record<string, unknown> {
  const e = syntheticExport();
  const money = e.money as Record<string, unknown>;
  money.asOf = asOf;
  money.recurring = [{ ...bill }];
  return e;
}

function setup(): Setup {
  const got = readSetup(JSON.stringify({ organisations: [], polls: [], paydays: { 4: [15, 30] } }));
  assert.ok(got.ok, `the setup file was refused: ${got.ok ? '' : got.fix}`);
  return got.value;
}

/**
 * THE LINE `src/legacy.ts` HAS TO GAIN, applied to the plan it made: every repeating Money row of an income or bill
 * line that carries no end says so with `null`, under the same `ifDeclared` the end itself rides.
 */
function sayNoEnd(plan: Plan): Plan {
  const line = (key: string) => key.startsWith(`${KEY_PREFIX}income:`) || key.startsWith(`${KEY_PREFIX}recurring:`);
  return {
    ...plan,
    rows: plan.rows.map((r) => (r.register === 'obligations' && line(r.key) && r.ifDeclared === undefined ? { ...r, ifDeclared: { needs: ['ends'], fields: { ends: null } } } : r)),
  };
}

/** The Hosting row's `ends`, `null` when the row holds none. */
function endOf(kernel: Kernel): unknown {
  const got = kernel.list({ register: 'obligations', limit: 200 });
  assert.ok(got.ok);
  const row = got.value.rows.find((r) => r.fields.what === 'Hosting');
  assert.ok(row, 'no Hosting row was written');
  return row.fields.ends ?? null;
}

/**
 * The Hosting steps the Money page's own "Cash ahead" legs walk up to the end of January, as `day delta`.
 *
 * THE LEGS AS money-core SHIPS THEM AND NOT A COPY, because whether the page names `ends` is half of what is tested.
 * This record holds the lists and not the pages (`test/legacy-record.ts`), so the walk is asked of the kernel. Only
 * the Money leg, because the made-up export's accounts put EGP on the other two and the whole walk then refuses
 * `MIXED_CURRENCY` with no step in it, measured when this was written.
 */
function walked(kernel: Kernel): string[] {
  const block = (PAGES.money!.blocks as { heading?: string; from?: Leg[] }[]).find((b) => b.heading === 'Cash ahead');
  const leg = block?.from?.find((l) => l.register === 'obligations');
  assert.ok(leg, 'the Money page walks no Money leg');
  const out = kernel.runway(0, [leg], 150);
  assert.ok(out.ok, 'the record would not walk');
  assert.deepEqual(out.value.refusals, [], 'the Money leg refused');
  return out.value.steps.filter((s) => s.label === 'Hosting' && s.day <= '2027-01-31').map((s) => `${s.day} ${String(s.delta)}`);
}

const NIGHT = Date.UTC(2026, 8, 23, 6);
const UNTIL_NOVEMBER = ['2026-10-03 -4500', '2026-11-03 -4500'];
const EVERY_MONTH = ['2026-10-03 -4500', '2026-11-03 -4500', '2026-12-03 -4500', '2027-01-03 -4500'];

/** Three nights on the shipped record: an end, the end taken away, and the same export again. */
async function threeNights(plan: (e: Record<string, unknown>, asOf: string) => Plan, look: (kernel: Kernel, night: Report, n: number) => void): Promise<void> {
  const { sql, kernel } = await record(NIGHT);
  let binned: Report['binned'] = [];
  const exports: [string, Record<string, unknown>][] = [
    ['2026-09-23', exp('2026-09-23', { ...HOSTING, ends_on: '2026-11-10' })],
    ['2026-09-24', exp('2026-09-24', HOSTING)],
    ['2026-09-25', exp('2026-09-25', HOSTING)],
  ];
  for (const [n, [asOf, e]] of exports.entries()) {
    const night = await applyPlan(plan(e, asOf), doorOf(kernel), { dryRun: false, binned: binned ?? [] });
    assert.equal(exitOf(night), 0, `night ${String(n + 1)} was refused: ${JSON.stringify(night.refused)}`);
    binned = [...(binned ?? []), ...(night.binned ?? [])];
    look(kernel, night, n + 1);
  }
  sql.close();
}

/** The two checks every night makes, and the one only a night with nothing moved can. */
function followsLegacyTool(kernel: Kernel, night: Report, n: number): void {
  if (n === 1) {
    assert.equal(endOf(kernel), '2026-11-10', 'night 1: the end was not written');
    assert.deepEqual(walked(kernel), UNTIL_NOVEMBER, 'night 1: the bill walked past its end');
    return;
  }
  assert.equal(endOf(kernel), null, `night ${String(n)}: the end the old tool took away is still on the row`);
  assert.deepEqual(walked(kernel), EVERY_MONTH, `night ${String(n)}: the bill still stops on an end the old tool no longer has`);
  /* THE NOTE MOVES WITH IT, since it said "Ends 2026-11-10." on night 1; the Bills row beside it moves its note alone. */
  if (n === 2)
    assert.deepEqual(
      night.changes.filter((c) => c.label === 'Hosting' && c.register === 'obligations').map((c) => [...c.fields].sort()),
      [['ends', 'note']],
      'night 2: the end did not come off the Money row the way the plan said',
    );
  /* A STEADY EXPORT IS A STEADY RECORD: a planned `null` over a field the row does not hold sends nothing. */
  if (n === 3)
    assert.deepEqual(
      night.changes.filter((c) => c.register === 'obligations'),
      [],
      'night 3: nothing in the old tool moved, and Money rows were patched anyway',
    );
}

test('an end the old tool removes is cleared the next night, the walk goes on again, and the night after writes nothing', async () => {
  await threeNights((e, asOf) => sayNoEnd(planLegacyTool(e, asOf, setup())), followsLegacyTool);
});

test('the planner as it ships clears an end the old tool removed, since it sends ends || null', async () => {
  await threeNights((e, asOf) => planLegacyTool(e, asOf, setup()), followsLegacyTool);
});
