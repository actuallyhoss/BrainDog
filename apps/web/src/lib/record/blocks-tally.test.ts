/**
 * A payee's tally bar counts a split payment once (review of 30 October, R14).
 *
 * AS SEEN: the browser adds a split line up as its parts, each under its own label, and counted each part as a time
 * paid, so one £90 payment over three categories said "3 times" beside its payee. A row is counted once, by its id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Block } from 'braindog-render';

import './fixtures/fill.ts';
import { REGISTERS } from './api.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';
import type { RegisterDecl } from './schema.ts';

const NOW = Date.UTC(2026, 8, 3, 12);
const DAY = new Date(Date.UTC(2026, 7, 24, 9)).toISOString();

const SPENDS = {
  id: 'spends',
  name: 'Spends',
  one: 'spend',
  title: 'payee',
  fields: [
    { id: 'payee', type: 'text' },
    { id: 'on', type: 'day' },
    { id: 'category', type: 'text' },
    { id: 'amount', type: 'money' },
    { id: 'parts', type: 'json', parts_of: 'amount' },
  ],
} as unknown as RegisterDecl;

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

test('ONE SPLIT PAYMENT IS ONCE ON ITS PAYEE’S TALLY, and a second payment makes it twice', () => {
  REGISTERS.spends = SPENDS;
  try {
    const rows = [
      {
        id: 's1',
        fields: {
          payee: 'Corner Shop',
          on: '2026-08-24',
          amount: gbp(9_000),
          parts: [
            { category: 'Food', amount: gbp(4_000) },
            { category: 'Home', amount: gbp(3_000) },
            { category: 'Gifts', amount: gbp(2_000) },
          ],
        },
      },
    ];
    const answered = (rs: typeof rows) => ({
      kind: 'bar',
      source: 'register.spends',
      columns: [{ field: 'payee' }, { field: 'amount' }],
      tally: true,
      rows: rs.map((r, i) => ({ id: r.id, seq: i + 1, fields: r.fields, version: 1, created_at: DAY })),
      matched: rs.length,
      refusals: [],
    });
    const noteOf = (rs: typeof rows): string => {
      const segments = toSegments(blockOf(answered(rs) as never, new Map(), NOW));
      const drawn = segments.filter((s): s is Block => s.type === 'block').flatMap((b) => b.rows.map((r) => r.cells));
      return String(drawn.find((cells) => cells[0] === 'Corner Shop')?.[2] ?? '');
    };
    assert.match(noteOf(rows), /^once/u);
    const second = { id: 's2', fields: { payee: 'Corner Shop', on: '2026-08-20', category: 'Food', amount: gbp(500) } } as unknown as (typeof rows)[number];
    assert.match(noteOf([...rows, second]), /^2 times/u);
  } finally {
    delete REGISTERS.spends;
  }
});
