/**
 * The month's asks, spent by the only door Slash has.
 *
 * WHY THIS FILE EXISTS. `POST /api/slash/read` is the one route that reaches the engine, and it calls `read` and nothing else
 * (`packages/host/src/slash-ask.ts`). The meter counted `kind = 'propose'` rows alone while `read` writes `kind = 'read'`, so
 * `ask_cap` could not be reached through the product: measured before the repair, an owner who set the cap to 2 was answered
 * on five asks out of five, five model calls on the owner's own key, and `status()` said 0 of 2 after every one of them
 * (`loop/research-spark-seam.md` §4). The door already names `SLASH_BUDGET_SPENT` as the answer once the month's
 * asks are used, so that is the refusal asserted here, with no model call behind it.
 *
 * WHAT IS NOT COUNTED IS ASSERTED TOO. A record with no lists answers `nothing` without calling a model, and a meter that bills
 * for a model that never ran is the thing `propose`'s zero-rows arm already refuses to be.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf } from '@braindog/ports';

import { createSlash } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const PREDICATE = JSON.stringify({
  registers: ['obligations'],
  where: { all: [{ field: 'state', is: 'open' }] },
  q: null,
});

const build = (record = fakeRecord()) => {
  const sql = openSqlite();
  const inference = canned();
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference, record });
  return { sql, inference, slash };
};

test('A READ SPENDS ONE OF THE MONTH\'S ASKS, and the one past the cap is SLASH_BUDGET_SPENT with no model call', async () => {
  const { sql, inference, slash } = build();
  try {
    assert.ok(slash.configure({ ask_cap: 2 }, OWNER).ok);

    for (let i = 0; i < 2; i++) {
      inference.say(PREDICATE);
      const out = await slash.read('what is still open', OWNER);
      assert.equal(out.ok, true, JSON.stringify(out));
    }
    assert.equal(slash.status().asks.used, 2);
    assert.equal(inference.seen.length, 2);

    inference.say(PREDICATE);
    const third = await slash.read('what is still open', OWNER);
    assert.equal(codeOf(third), 'SLASH_BUDGET_SPENT', JSON.stringify(third));
    assert.equal(inference.seen.length, 2, 'the refused ask still called the model');
  } finally {
    sql.close();
  }
});

test('a read that called no model spends no ask', async () => {
  const { sql, inference, slash } = build(fakeRecord({ registers: [], open_questions: [] }, []));
  try {
    const out = await slash.read('anything', OWNER);
    assert.equal(out.ok, true);
    assert.equal(inference.seen.length, 0);
    assert.equal(slash.status().asks.used, 0);
  } finally {
    sql.close();
  }
});
