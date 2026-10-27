/**
 * A VALUE OF MORE THAN ONE LINE STAYS IN ITS CELL (the audit of 25 October, Z21).
 *
 * WHAT WAS WRONG. Crumb.gg's page drew three cards under Keeping it alive for its two services: the domain's note is
 * "The earner." then a blank line then "Registrar notes: …", and the line break inside the cell broke the row, so the
 * rest of the note became a card of its own, titled with the registrar note and with the renewal day as its figure
 * over the word "cost" (`project-1512-light.png`). A row is one line of the page's dialect, so a value's own line
 * breaks are said as spaces inside its cell.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Row } from 'braindog-render';

import { REGISTERS } from './held.ts';
import { blockOf } from './page-live.ts';
import { toSegments } from './blocks.ts';
import type { RegisterDecl } from './schema.ts';

REGISTERS.services = {
  id: 'services',
  name: 'Services',
  one: 'service',
  title: 'name',
  mobile: ['name', 'cost'],
  fields: [
    { id: 'name', label: 'Name', type: 'text' },
    { id: 'cost', label: 'Cost', type: 'money' },
    { id: 'cycle', label: 'Every', type: 'enum', values: ['monthly', 'yearly'] },
    { id: 'note', label: 'Note', type: 'text' },
    { id: 'renews', label: 'Renews', type: 'day' },
  ],
} as unknown as RegisterDecl;

const service = (seq: number, fields: Record<string, unknown>) => ({
  id: `01JSERVICE${String(seq).padStart(16, '0')}`,
  register: 'services',
  seq,
  fields,
  version: 1,
  created_at: '2026-09-28T09:00:00.000Z',
  updated_at: '2026-09-28T09:00:00.000Z',
  deleted_at: null,
});

const drawn = (rows: unknown[]): Row[] =>
  toSegments(
    blockOf(
      {
        kind: 'cards',
        source: 'register.services',
        heading: 'Keeping it alive',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'cost', as: 'figure' },
          { field: 'cycle', label: 'Every', as: 'fact' },
          { field: 'note', label: 'Note', as: 'fact' },
          { field: 'renews', label: 'Renews', as: 'when' },
        ],
        rows: rows as never,
        matched: rows.length,
        refusals: [],
      } as never,
      new Map(),
      Date.UTC(2026, 9, 24, 12),
    ) as never,
  ).flatMap((seg) => ('rows' in seg ? seg.rows : []));

test('a note of two paragraphs is one card, its whole note in its own cell', () => {
  const rows = drawn([
    service(5, { name: 'crumb.gg', cycle: 'yearly', renews: '2027-02-28', note: 'The earner.\n\nRegistrar notes: whois.gg publishes no registrar.' }),
    service(9, { name: 'crumb (A1.Flex)', cycle: 'monthly', cost: { amount: 0, currency: 'USD' }, note: 'Uses the free allowance.' }),
  ]).slice(1);
  assert.equal(rows.length, 2, 'a line break inside a note made a card of its own');
  assert.match(rows[0]!.cells[0] ?? '', /crumb\.gg/u);
  assert.ok(rows.every((r) => !/^Registrar notes/u.test(r.cells[0] ?? '')), 'the registrar note is drawn as a card title');
  assert.ok(rows[0]!.cells.some((c) => c.includes('The earner. Registrar notes: whois.gg publishes no registrar.')));
});
