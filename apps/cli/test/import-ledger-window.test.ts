/**
 * A LEDGER ROW IS VOID HERE ONLY WHEN ITS DAY LIES INSIDE THE DAYS TONIGHT'S LEDGER ANSWER COVERS.
 *
 * `loop/research-batch-fifty-three-audit.md` sections 3 and 9. The void pass closed every carried `txn:` key tonight's
 * plan did not name, on the reading that `/api/money/txn?limit=5000` has no date window. Two roads broke that reading,
 * each measured on a real record before the fix:
 * - a ledger answer that starts later than a row an earlier night carried (a window on the route, or a ceiling on
 *   `limit` below 5,000, both of which cut the oldest days first) voided that row, the account's opening row among them;
 * - an export older than the night before's, imported after it (a saved backup, which is older by construction), voided
 *   the row the newer export carried and the older one never saw.
 * Both are rows the answer did not speak about, not rows it dropped, so the pass now reads only the days strictly
 * between the oldest and the newest day the answer holds. The two edge days are left out as well, because a ceiling
 * can cut inside the oldest day and a newer export can add a row on the older one's newest day.
 *
 * EVERY VALUE BELOW IS MADE UP: `test/legacy-export.ts` with a ledger added in the shape the route answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planLegacyTool } from '../src/legacy.ts';
import { applyPlan, said } from '../src/import.ts';
import { syntheticExport } from './legacy-export.ts';
import { doorOf, exitOf, record } from './legacy-record.ts';

type Obj = Record<string, unknown>;
type Kernel = Awaited<ReturnType<typeof record>>['kernel'];

const NOW = Date.UTC(2026, 8, 16, 6);
const TODAY = '2026-09-16';

const txn = (id: string, description: string, day: string, amount_minor: number): Obj => ({ id, account_id: 'main', day, description, amount_minor, category_id: 'C1' });

/** An export whose ledger answer is exactly these rows. */
function withLedger(txns: Obj[], takenAt = `${TODAY}T03:30:00.000Z`): Obj {
  const e = syntheticExport({ takenAt });
  (e.money as Obj).ledger = { txns, categories: [{ id: 'C1', name: 'Food', grp: 'life', is_income: 0 }] };
  return e;
}

const ledgerState = (kernel: Kernel, what: string): unknown[] => {
  const got = kernel.list({ register: 'transactions', limit: 200 });
  assert.ok(got.ok);
  return got.value.rows.filter((r) => r.fields.what === what).map((r) => r.fields.state);
};

async function twoNights(first: Obj, second: Obj) {
  const { sql, kernel } = await record(NOW);
  const one = await applyPlan(planLegacyTool(first, TODAY), doorOf(kernel), { dryRun: false });
  assert.deepEqual(one.refused, [], 'the first night was refused a row');
  const two = await applyPlan(planLegacyTool(second, TODAY), doorOf(kernel), { dryRun: false });
  assert.deepEqual(two.refused, [], 'the second night was refused a row');
  assert.equal(exitOf(two), 0);
  return { sql, kernel, two };
}

const WEEK = [txn('T1', 'Market run', '2026-09-10', -4_500), txn('T2', 'Bakery', '2026-09-11', -900), txn('T3', 'Store fee', '2026-09-12', -990), txn('T4', 'Cafe', '2026-09-13', -1_200)];

test('A ROW OLDER THAN THE FIRST DAY TONIGHT\'S LEDGER ANSWERED stays cleared, and a row gone from inside it is void', async () => {
  const opening = txn('T0', 'Opening balance', '2026-08-01', 50_000);
  /* THE SECOND NIGHT'S ROUTE ANSWERS FROM 10 SEPTEMBER ON, as a window or a lower ceiling would, and T3 is deleted. */
  const { sql, kernel, two } = await twoNights(withLedger([opening, ...WEEK]), withLedger(WEEK.filter((t) => t.id !== 'T3')));
  assert.deepEqual(ledgerState(kernel, 'Opening balance'), ['cleared'], 'a row the answer never reached was voided as though the old tool had deleted it');
  assert.deepEqual(ledgerState(kernel, 'Store fee'), ['void'], 'a row gone from inside the days the answer covers was not voided');
  for (const what of ['Market run', 'Bakery', 'Cafe']) assert.deepEqual(ledgerState(kernel, what), ['cleared'], what);
  assert.deepEqual(
    two.retired.map((r) => r.label),
    ['Store fee 2026-09-12'],
  );
  sql.close();
});

test('AN OLDER EXPORT IMPORTED AFTER A NEWER ONE voids nothing the newer one carried past the older one\'s last day', async () => {
  const newer = withLedger([...WEEK, txn('T5', 'Late lunch', '2026-09-15', -2_000)], '2026-09-16T03:30:00.000Z');
  const older = withLedger(WEEK, '2026-09-13T21:00:00.000Z');
  const { sql, kernel, two } = await twoNights(newer, older);
  assert.deepEqual(ledgerState(kernel, 'Late lunch'), ['cleared'], 'the older export closed a row only the newer one could see');
  assert.deepEqual(two.retired, []);
  sql.close();
});

test('A ROW ON EITHER EDGE DAY is not voided, because a ceiling cuts inside the oldest day and a newer export adds to the newest', async () => {
  /* THE NEWER EXPORT HOLDS ONE MORE ROW ON 13 SEPTEMBER, the older export's newest day, and one more on 10 September,
     its oldest: neither is in the older answer, and neither is gone from the old tool. */
  const newer = withLedger([txn('T6', 'Early tea', '2026-09-10', -300), ...WEEK, txn('T7', 'Evening taxi', '2026-09-13', -1_500)]);
  const { sql, kernel, two } = await twoNights(newer, withLedger(WEEK));
  assert.deepEqual(ledgerState(kernel, 'Early tea'), ['cleared']);
  assert.deepEqual(ledgerState(kernel, 'Evening taxi'), ['cleared']);
  assert.deepEqual(two.retired, []);
  sql.close();
});

test('THE REPORT NAMES THE DAYS A VOID WAS READ INSIDE, so a row left cleared outside them is not a surprise', async () => {
  const { sql, two } = await twoNights(withLedger(WEEK), withLedger(WEEK.filter((t) => t.id !== 'T3')));
  const text = said(two, { dryRun: false, file: 'hb-export.json' }).join('\n');
  const closed = text.split('\n\n').find((part) => part.startsWith('Closed, and why:'));
  assert.ok(closed, text);
  assert.match(closed, /after 2026-09-10 and before 2026-09-13/u);
  assert.match(closed, /Store fee/u);
  sql.close();
});
