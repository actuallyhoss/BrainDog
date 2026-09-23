/**
 * "NEWLY LEFT OUT" IS AN ITEM THE NIGHT BEFORE DID NOT LEAVE OUT, WHATEVER THE SENTENCE BESIDE IT SAYS.
 *
 * `loop/BACKLOG.md`, left by waves forty-eight to fifty-two: the first morning after wave fifty-two reworded the skip
 * lines for a decided and a dismissed question and for a deleted task, `--since` listed every one of those items once
 * as "Newly left out", because it compared `reason` and item together, and a reason is a sentence this code writes and
 * rewrites. The item is what the old tool holds, so it is what the morning compares: a new wording is not news, and a new
 * item under the old wording still is.
 *
 * EVERY VALUE BELOW IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planLegacyTool } from '../src/legacy.ts';
import { sinceSaid, type Run } from '../src/import.ts';
import { syntheticExport } from './legacy-export.ts';

const UTC = () => 0;

const night = (at: string, skipped: Run['skipped'], host = 'h'): Run => ({ at, host, file: 'e.json', taken: at, created: [], updated: [], refused: [], skipped });

test('A REASON REWORDED BETWEEN TWO NIGHTS says none of its items again', () => {
  const before = night('2026-09-21T03:00:00.000Z', [
    { reason: 'Already decided, and carried with its decision', items: ['SG7 as D5', 'SG8 as D6'] },
    { reason: 'Dismissed in the old tool', items: ['SG9'] },
    { reason: 'Deleted in the old tool', items: ['#104'] },
  ]);
  const after = night('2026-09-22T03:00:00.000Z', [
    { reason: 'Already decided in the old tool. If an earlier import asked it, it is still open on Decide here', items: ['SG7 as D5', 'SG8 as D6'] },
    { reason: 'Dismissed in the old tool. If an earlier import asked it, dismiss it on Decide here', items: ['SG9'] },
    { reason: 'Deleted in the old tool, and closed here if an earlier import carried it', items: ['#104'] },
  ]);
  assert.deepEqual(sinceSaid([before, after], 'last', UTC).lines, ['2026-09-22 03:00 UTC into h, export of 2026-09-22:', '- Nothing moved in the old tool since the run before.']);
});

test('AN ITEM NOT LEFT OUT THE NIGHT BEFORE is news, under an old reason or a new one, and is said with tonight\'s reason', () => {
  const before = night('2026-09-21T03:00:00.000Z', [{ reason: 'Dismissed in the old tool', items: ['SG9'] }]);
  const after = night('2026-09-22T03:00:00.000Z', [
    { reason: 'Dismissed in the old tool', items: ['SG9', 'SG10'] },
    { reason: 'Put off in the old tool until a later day', items: ['SG11 (until 2026-10-01)'] },
  ]);
  assert.deepEqual(sinceSaid([before, after], 'last', UTC).lines.slice(1), [
    '- Newly left out: SG10. Dismissed in the old tool.',
    '- Newly left out: SG11 (until 2026-10-01). Put off in the old tool until a later day.',
  ]);
});

/**
 * THE ONE ITEM SEVERAL REASONS USED TO SHARE. The ledger's two "closed nothing" lines and "The export holds no ledger"
 * all named `the ledger`, so once the comparison keys on the item, a night whose export lost its ledger after a night
 * whose ledger held a row left out would have said nothing. Measured: with the comparison on the item and the three
 * lines still sharing `the ledger`, this test failed on the missing line.
 */
test('A NIGHT WHOSE EXPORT HOLDS NO LEDGER is said, after a night whose ledger could not close anything', () => {
  const first = syntheticExport({ takenAt: '2026-09-21T02:00:00.000Z' });
  const money = first.money as Record<string, unknown>;
  (money.accounts as Record<string, unknown>[]).push({ id: 'old', name: 'Old savings', kind: 'bank', currency: 'EGP', opening_minor: 0, balance_minor: 0, is_liability: 0, archived: 1 });
  money.ledger = { txns: [{ id: 'T9', account_id: 'old', day: '2026-08-31', description: 'Interest before it closed', amount_minor: 1_200 }], categories: [] };
  const second = syntheticExport({ takenAt: '2026-09-22T02:00:00.000Z' });
  delete (second.money as Record<string, unknown>).ledger;
  const one = night('2026-09-21T03:00:00.000Z', planLegacyTool(first, '2026-09-21').skipped);
  const two = night('2026-09-22T03:00:00.000Z', planLegacyTool(second, '2026-09-22').skipped);
  assert.ok(
    one.skipped.some((s) => /still in the old tool and the two cannot be told apart/u.test(s.reason)),
    JSON.stringify(one.skipped.map((s) => s.reason)),
  );
  const lines = sinceSaid([one, two], 'last', UTC).lines;
  assert.ok(
    lines.some((l) => l.startsWith('- Newly left out: the ledger. The export holds no ledger')),
    lines.join('\n'),
  );
});
