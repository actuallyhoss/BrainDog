/**
 * A LEDGER THAT ANSWERED ITS WHOLE LIMIT IS NEWS THE MORNING AFTER A NIGHT WHOSE LEDGER HELD A ROW LEFT OUT
 * (`loop/research-batch-fifty-five-audit.md` section 5).
 *
 * `sinceSaid` keys last night's skips by item, so a reworded reason is not news, and `dc9ec9e4` split `the ledger`
 * into two items so that its reasons stopped hiding each other. Two of the three were left on one item, `ledger rows
 * deleted in the old tool`: a ledger row left out above is still in the old tool, and the ledger answered 5,000 rows. The
 * second is the one of the two he can act on (raise the export's limit), and the morning read is where he reads.
 * MEASURED BEFORE THIS FILE: the second night was said as "Nothing moved in the old tool since the run before."
 *
 * EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planLegacyTool } from '../src/legacy.ts';
import { sinceSaid, type Run } from '../src/import.ts';
import { syntheticExport } from './legacy-export.ts';

const UTC = () => 0;

const night = (at: string, skipped: Run['skipped']): Run => ({ at, host: 'h', file: 'e.json', taken: at, created: [], updated: [], refused: [], skipped });

test('THE LEDGER ANSWERING ITS WHOLE LIMIT IS SAID, after a night whose ledger could not close anything for another reason', () => {
  const first = syntheticExport({ takenAt: '2026-09-21T02:00:00.000Z' });
  const money = first.money as Record<string, unknown>;
  (money.accounts as Record<string, unknown>[]).push({ id: 'old', name: 'Old savings', kind: 'bank', currency: 'EGP', opening_minor: 0, balance_minor: 0, is_liability: 0, archived: 1 });
  money.ledger = { txns: [{ id: 'T9', account_id: 'old', day: '2026-08-31', description: 'Interest before it closed', amount_minor: 1_200 }], categories: [] };

  const second = syntheticExport({ takenAt: '2026-09-22T02:00:00.000Z' });
  const txns = Array.from({ length: 5_000 }, (_, i) => ({
    id: `L${String(i)}`,
    account_id: 'main',
    day: `2026-0${String(1 + Math.floor(i / 700))}-${String(1 + (i % 28)).padStart(2, '0')}`,
    description: `Card payment ${String(i)}`,
    amount_minor: -(100 + i),
  }));
  (second.money as Record<string, unknown>).ledger = { txns, categories: [] };

  const one = night('2026-09-21T03:00:00.000Z', planLegacyTool(first, '2026-09-21').skipped);
  const two = night('2026-09-22T03:00:00.000Z', planLegacyTool(second, '2026-09-22').skipped);
  assert.ok(one.skipped.some((s) => /still in the old tool and the two cannot be told apart/u.test(s.reason)), JSON.stringify(one.skipped.map((s) => s.reason)));
  assert.ok(two.skipped.some((s) => /answered 5,000 rows/u.test(s.reason)), JSON.stringify(two.skipped.map((s) => s.reason)));

  const lines = sinceSaid([one, two], 'last', UTC).lines;
  assert.ok(
    lines.some((l) => l.startsWith('- Newly left out: ') && /answered 5,000 rows/u.test(l) && /Raise the export's limit and import again/u.test(l)),
    lines.join('\n'),
  );
  /* AND THE OTHER WAY ROUND: the limit the night before, a row left out tonight, and that is news as well. */
  const back = sinceSaid([{ ...two, at: '2026-09-21T03:00:00.000Z' }, { ...one, at: '2026-09-22T03:00:00.000Z' }], 'last', UTC).lines;
  assert.ok(back.some((l) => /still in the old tool and the two cannot be told apart/u.test(l)), back.join('\n'));
});
