/**
 * One clock (SF3), held where two screens say the same thing: on the seed, a bill's own page and the list's Due cell
 * say the same days late, and Kiln's hero says the same late count as Work does for Kiln.
 *
 * WHY THESE TWO. They are where the review saw the two clocks disagree on screen: "64 days late" in the list over
 * "overdue by 111 days" on the row's page for the same bill, and a project hero counting late work against another day
 * from the Work screen. Each side is read through the function its screen draws with, at `recordNow()` once the
 * record's `boot` has said its instant, which is the whole of the rule: one clock, read by both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { REGISTERS, ROWS } from './held.ts';
import { NOW } from './fixtures/sample.ts';
import { forgetNow, learnNow, recordNow } from './boot-live.ts';
import { dueOf } from '../../routes/r/[register]/parts/list.ts';
import { dueSaid, localDay } from '../../routes/r/[register]/[seq]/said.ts';
import { openWorkOf, viaOf } from '../../routes/r/[register]/[seq]/figures.ts';
import { bandOf, dayOf, shapeOf } from '../work/board.ts';
import type { Entry } from './schema.ts';

/** The record's `boot` said the seed's instant a moment ago, as the root layout's read would have. */
function booted(): number {
  forgetNow();
  learnNow(new Date(NOW).toISOString(), performance.now());
  return recordNow();
}

const digits = (said: string | null | undefined): number => Number(/\d+/u.exec(said ?? '')?.[0] ?? Number.NaN);

test("/r/obligations/20: THE ROW PAGE'S DAYS LATE ARE THE LIST'S DUE CELL'S", () => {
  const now = booted();
  const decl = REGISTERS['obligations'];
  const row = (ROWS['obligations'] ?? []).find((r) => r.seq === 20) as Entry | undefined;
  assert.ok(decl && row, 'the seed holds obligations#20');
  const due = row.fields['due'];
  assert.equal(typeof due, 'string');
  const cell = dueOf(decl, row, now);
  assert.ok(cell?.late, `the list does not call obligations#20 late: ${JSON.stringify(cell)}`);
  const page = dueSaid(due as string, now);
  assert.ok(digits(cell.text) > 0, cell.text);
  assert.equal(digits(page), digits(cell.text), `the page says "${page}" and the list "${cell.text}"`);
  forgetNow();
});

test("KILN'S HERO COUNTS AS MANY LATE AS WORK DOES FOR KILN", () => {
  const now = booted();
  const tasks = REGISTERS['tasks'];
  assert.ok(tasks, 'the seed holds tasks');
  const via = viaOf(tasks, 'things');
  assert.ok(via, 'tasks point at projects');
  const kiln = (ROWS['tasks'] ?? []).filter((r) => r.fields[via.field] === 1);
  assert.ok(kiln.length > 0, 'Kiln has work');
  /* The hero reads the open rows on the reader's day of the record's clock (`ProjectShape.svelte`). */
  const hero = openWorkOf(kiln, via, localDay(now), false)?.late ?? 0;
  /* Work bands every row on the record's day (`WorkClassic.svelte`), and its Late is the overdue band. */
  const shape = shapeOf(tasks);
  const work = kiln.filter((r) => bandOf(r.fields, shape, dayOf(now)) === 'overdue').length;
  assert.ok(hero > 0, 'the seed has late work on Kiln to count');
  assert.equal(hero, work, `Kiln's hero says ${hero} late and Work ${work}`);
  forgetNow();
});
