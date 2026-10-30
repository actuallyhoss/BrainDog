/**
 * BrainDog's own lines in a feed grouped by who: the host signs them as rules and says their who as BrainDog, and they
 * are their own group after the rules, not counted under "Rules" (polish-f L3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FEED_GROUPS, FEED_OWN, feedPlan } from './feed.ts';

const row = (...cells: string[]) => ({ cells });

test("BRAINDOG'S OWN LINES ARE THEIR OWN GROUP, AFTER THE RULES", () => {
  const plan = feedPlan([
    row('agent', 'Claude', '1', 'changed Kiln', '2h'),
    row('rule', 'Filing', '1', 'filed 3 payments', '3h'),
    row('rule', FEED_OWN, '1', 'closed a question', '4h'),
  ]);
  assert.deepEqual(
    plan.groups.map((g) => [g.label, g.rows.length]),
    [
      [FEED_GROUPS.agent, 1],
      [FEED_GROUPS.rule, 1],
      [FEED_OWN, 1],
    ],
  );
});

test('A FEED OF ONLY BRAINDOG\'S OWN LINES IS ONE GROUP, WITH NO HEAD', () => {
  const plan = feedPlan([row('rule', FEED_OWN, '1', 'closed a question', '4h')]);
  assert.equal(plan.lone, true);
  assert.equal(plan.groups[0]?.label, FEED_OWN);
});
