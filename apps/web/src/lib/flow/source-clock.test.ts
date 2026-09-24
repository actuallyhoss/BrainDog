/**
 * The sample's dry run matches its rows at the clock its condition was put in order at: the mirror's `NOW`.
 *
 * TWO CLOCKS ON ONE CONDITION. `compile` in `record/where.ts` puts the two ends of a range of days in order at `NOW`
 * (3 September), the checker of `3187be5a` having measured that the wall clock refused what the record answered. The
 * sample then matched the same rows at whatever clock the sample was made with, which is the wall clock by default. So
 * `due between today and 2026-09-20` was accepted as a range from the 3rd to the 20th and then walked from the 24th,
 * where "today" is already past its high end. Measured before the fix with the sample made on the 24th: the dry run
 * answered 0 matches where the mirror holds four open obligations due in that range.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NOW, ROWS } from '../record/data.ts';
import { sample } from './source.ts';

/** The day the checker measured on, three weeks past the mirror's clock. */
const WALL = Date.UTC(2026, 8, 24, 12);

test('A RANGE WITH ONE DAY WRITTEN OUT AND ONE RELATIVE WORD IS MATCHED AT THE CLOCK IT WAS ORDERED AT, whatever the sample was made with', async () => {
  assert.ok(new Date(NOW).toISOString().startsWith('2026-09-03'), 'the mirror moved its clock, so the range below proves nothing');
  const today = new Date(NOW).toISOString().slice(0, 10);
  /* COUNTED BY HAND FROM THE ROWS, NOT BY `where.ts` AGAIN, so the test does not grade the engine with itself. */
  const held = ROWS.obligations!.filter((e) => String(e.fields.due) >= today && String(e.fields.due) <= '2026-09-20');
  assert.ok(held.length > 0, 'the mirror has obligations due in the range, or this proves nothing');

  const body = { rule: 'x', register: 'obligations', when: 'due between today and 2026-09-20', then: [{ tag: 'soon' }] };
  for (const at of [WALL, NOW]) {
    const out = await sample(() => at).dryRun(body);
    assert.ok(out.ok, `the range is in order, so it is not refused (sample made at ${new Date(at).toISOString()})`);
    assert.equal(out.value.matches, held.length, `made at ${new Date(at).toISOString()}`);
    assert.deepEqual(
      out.value.sample.map((r) => r.spoken),
      held.map((e) => `obligations#${e.seq}`),
    );
  }
});
