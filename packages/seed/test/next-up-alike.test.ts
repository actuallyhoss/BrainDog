/**
 * A WIDGET THE GALLERY SAYS TODAY ALREADY SHOWS READS WHAT TODAY'S TILE READS (audit of 31 October, A35): Next up said
 * "Today shows this as Your work this week" and listed 7 tasks, the late one among them, beside Today's 2.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORK_WIDGETS } from '../src/modules/work.ts';

const clauses = (where: string): string => where.split(/,\s*/u).map((c) => c.trim()).sort().join(', ');

test('Next up reads the tasks Today\'s Your work this week reads', () => {
  const next = WORK_WIDGETS.widgets.find((w) => w.id === 'next-up');
  assert.ok(next, 'Work brings Next up');
  assert.ok((next.alike as readonly string[] | undefined)?.includes('work-due'));
  const home = readFileSync(new URL('../../../apps/web/src/lib/home/default-home.ts', import.meta.url), 'utf8');
  const today = /keyed\('work-due'\)[\s\S]*?where: '([^']+)'/u.exec(home)?.[1];
  assert.ok(today, 'Today\'s work-due tile has a filter');
  assert.equal(clauses(String((next.block as { where?: string }).where)), clauses(today));
});
