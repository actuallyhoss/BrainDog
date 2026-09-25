/**
 * THE FIRST IMPORT SAYS TO APPROVE HOLDINGS ON DECIDE, NOT TO INSTALL IT, WHEN THE SAME RUN HAS JUST FILED IT THERE.
 *
 * `loop/research-switch-today.md` brief 50-B. Measured on the made-up export, the first run's report said "Packs: 1 filed
 * on Decide for you to approve" and then, under "Left out", "This BrainDog has no Holdings list. Install Holdings beside
 * Solo founder, then run the import again". Two instructions for one step, and the second is not the one he should
 * take: the list arrives when he approves the question the run filed. The skip line is written before the packs are
 * offered, which is why it could not know.
 *
 * THE INSTALL SENTENCE STAYS WHERE NOTHING IS ON DECIDE: a dry run files nothing, and a Money too old for the pack holds
 * the offer back and already says why (`import-holdings-pack.test.ts`).
 *
 * EVERY VALUE IS MADE UP, from `test/legacy-export.ts`, with one asset in the shape the live route answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { planLegacyTool } from '../src/legacy.ts';
import { applyPlan, holdingsOf, said, type Door, type Report } from '../src/import.ts';
import { syntheticExport } from './legacy-export.ts';
import { doorOf, record } from './legacy-record.ts';

const TODAY = '2026-09-22';
const NOW = Date.UTC(2026, 8, 22, 6);
const QUESTION = 'Keep what you hold in a Holdings list?';

function exp(): Record<string, unknown> {
  const e = syntheticExport();
  (e.money as Record<string, unknown>).assets = [
    { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost_minor: 500_000, currency: 'EGP', acquired_on: '2025-02-10', matures_on: null, meta_json: null },
  ];
  return e;
}

/** The record's door, which `legacy-record.ts` gives no `packs`, answering the Money it holds. */
const withMoney = (door: Door, version: string): Door => ({ ...door, packs: async () => ok([{ id: 'money-core', version }]) });

const holdingsLine = (report: Report) => {
  const line = report.plan.skipped.find((s) => s.items.some((i) => i.startsWith('Gold 24c')));
  assert.ok(line, `the holding was neither written nor named as left out: ${JSON.stringify(report.plan.skipped)}`);
  return line.reason;
};

test('THE FIRST RUN files Holdings on Decide, and the line for what it left out says to approve that question there', async () => {
  const { sql, kernel } = await record(NOW);
  const e = exp();
  const report = await applyPlan(planLegacyTool(e, TODAY), withMoney(doorOf(kernel), '2.0.0'), { dryRun: false, packs: holdingsOf(e) });
  assert.deepEqual(report.packs, { filed: 1, before: 0, waiting: [] });
  const reason = holdingsLine(report);
  assert.ok(reason.includes(`Approve "${QUESTION}" on Decide`), reason);
  assert.doesNotMatch(reason, /Install Holdings/u);
  assert.ok(said(report, { dryRun: false, file: 'export.json' }).some((l) => l.includes(`Approve "${QUESTION}" on Decide`)));

  /* THE NEXT NIGHT, BEFORE HE HAS PRESSED IT: filed before, still waiting on him, and the line says the same. */
  const again = await applyPlan(planLegacyTool(e, TODAY), withMoney(doorOf(kernel), '2.0.0'), { dryRun: false, packs: holdingsOf(e) });
  assert.deepEqual(again.packs, { filed: 0, before: 1, waiting: [] });
  assert.ok(holdingsLine(again).includes(`Approve "${QUESTION}" on Decide`), holdingsLine(again));
  sql.close();
});

test('WHERE NOTHING IS ON DECIDE the install sentence stays: a dry run, and a Money too old for the pack', async () => {
  const { sql, kernel } = await record(NOW);
  const e = exp();
  const dry = await applyPlan(planLegacyTool(e, TODAY), doorOf(kernel), { dryRun: true, packs: holdingsOf(e) });
  assert.match(holdingsLine(dry), /Install Holdings beside Solo founder/u);
  const old = await applyPlan(planLegacyTool(e, TODAY), withMoney(doorOf(kernel), '1.8.0'), { dryRun: false, packs: holdingsOf(e) });
  assert.equal(old.packs?.filed, 0);
  assert.match(holdingsLine(old), /Install Holdings beside Solo founder/u);
  sql.close();
});
