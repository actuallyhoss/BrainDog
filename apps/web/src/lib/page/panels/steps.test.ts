/**
 * LEFT FOR THE NEXT RUN, ONE LINE A STEP (`steps.ts`): a step three runs left is one line holding all three runs, so
 * Drop closes every one, and a row with no step or no run is not a step.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stepsOf } from './steps.ts';

const row = (run: string, next: string, mark = 'next', at = '2026-09-03T11:00:00Z') => ({ fields: { run, agent: 'Codex', next, left_at: at, mark } });

test('A STEP LEFT THREE TIMES IS ONE LINE WITH ITS THREE RUNS, in the order the record sent them', () => {
  const steps = stepsOf({
    rows: [row('S4', 'Sign off instances 4 to 6'), row('S9', 'Wire the pulse endpoint'), row('S2', 'sign off  instances 4 to 6.', 'earlier'), row('S1', 'Sign off instances 4 to 6')],
  });
  assert.deepEqual(
    steps.map((s) => [s.next, s.runs]),
    [
      ['Sign off instances 4 to 6', ['S4', 'S2', 'S1']],
      ['Wire the pulse endpoint', ['S9']],
    ],
  );
  assert.equal(steps[0]!.earlier, false, 'the newest leaving says whether it is old');
});

test('A ROW WITH NO STEP, OR NO RUN THAT LEFT IT, IS NOT DRAWN', () => {
  assert.deepEqual(stepsOf({ rows: [row('', 'A step'), row('S3', '  '), { fields: null }, 'odd'] }), []);
  assert.deepEqual(stepsOf(null), []);
});

test('A STEP SAYS THE PROJECT IT WAS LEFT IN, by the name the block gives its row, and none where it gives none', () => {
  const steps = stepsOf({ rows: [row('S4', 'Ship the page'), row('S5', 'Write the note')], scopes: ['Kiln', null] });
  assert.deepEqual(
    steps.map((s) => [s.next, s.project]),
    [
      ['Ship the page', 'Kiln'],
      ['Write the note', null],
    ],
  );
});
