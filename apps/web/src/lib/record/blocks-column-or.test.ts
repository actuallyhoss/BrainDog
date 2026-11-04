/**
 * A TIMELINE LINE WITH NO PAYEE SAYS THE DESCRIPTION (batch 6, "payees on the Ledger").
 *
 * WHAT WAS SEEN. Money's Ledger tile declares its middle column `payee`, or `what` where the bank named nobody, and
 * `toRows` reads it so (`api-column-or.test.ts`, `page-live-column-or.test.ts`). The fence a block is drawn from was then
 * written again from the raw fields (`projectRows`), which knew nothing of `or`, so every line the bank named no payee on
 * drew its day over its amount with nobody between them. This goes through `blockOf` and `toSegments`, as a page does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { blockOf } from './page-live.ts';
import { toSegments } from './blocks.ts';

const entry = (seq: number, fields: Record<string, unknown>) => ({
  id: `01JMOVED${String(seq).padStart(18, '0')}`,
  register: 'transactions',
  seq,
  fields: { on: '2026-10-05', direction: 'out', amount: { minor: 250_000, currency: 'GBP' }, ...fields },
  version: 1,
  created_at: '2026-10-05T09:00:00.000Z',
  updated_at: '2026-10-05T09:00:00.000Z',
  deleted_at: null,
});

test('a line with no payee draws the bank’s own words between the day and the amount, and a payee is still the payee', () => {
  const block = blockOf(
    {
      kind: 'timeline',
      source: 'register.transactions',
      heading: 'Ledger',
      columns: [{ field: 'on' }, { field: 'payee', or: 'what' }, { field: 'amount' }],
      rows: [entry(1, { what: 'GRANGEMOOR EVENTS' }), entry(2, { payee: 'Chillout', what: 'POS 9' })] as never,
      matched: 2,
      refusals: [],
    } as never,
    new Map(),
    Date.UTC(2026, 9, 7, 12),
  );
  const fence = toSegments(block).find((s) => s.type === 'block');
  assert.ok(fence && fence.type === 'block', 'the tile draws no fence');
  /* THE BANK'S CAPITALS READ AS WORDS on the Ledger's lines (57a8634c9), and they are still the bank's words. */
  assert.ok(JSON.stringify(fence.rows[0]).includes('Grangemoor Events'), `the line with no payee drew ${JSON.stringify(fence.rows[0])}`);
  assert.ok(JSON.stringify(fence.rows[1]).includes('Chillout'));
  assert.ok(!/pos 9/iu.test(JSON.stringify(fence.rows[1])), 'the description is said only where no payee is');
});
