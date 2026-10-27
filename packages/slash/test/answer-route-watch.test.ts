/**
 * AN AUTOMATION'S ASK READS THE LAST ATTEMPT'S THROW. On a route, the included model may throw and the next
 * candidate answer on its own wire. What `answer` reads off a throw (stopped, touched, unsent, heard, the name sent) is
 * the last attempt's, so a provider's 401 after the included model fell over is a status no retry mends, and not an
 * `UNREACHABLE` the outbox ladder asks again with the operator's key. Every model is canned.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf } from '@braindog/ports';

import { answering } from '../src/answer.ts';
import { core, openStore } from '../src/call.ts';
import type { Ask } from '../src/types.ts';
import { canned, fixedClock, NOW, openSqlite } from './double.ts';

const ASK: Ask = { rule: 'rate', step: 1, question: 'What monthly rate does the rent suggest?', shape: 'number', about: {} };

test("A PROVIDER'S 401 AFTER THE INCLUDED MODEL THREW IS STOPPED, read off the provider's own throw", async () => {
  const sql = openSqlite();
  openStore(sql);
  sql.exec("INSERT INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, 'a', NULL, NULL, 80, '2026-11-14')");
  const included = canned();
  const provider = canned();
  /* THE INCLUDED MODEL WAS CALLED AND THREW (`reached`), and the provider refused the key outright. */
  included.say(Object.assign(new Error('the included model fell over'), { reached: true }));
  provider.say(Object.assign(new Error('401 Unauthorized'), { refused: 401, key: 'the operator key' }));
  const fallback = canned();
  const c = core(sql, fixedClock(NOW), fallback, ['a'], ['a', 'b', 'byo'], () => [
    { id: 'flash', model: 'glm-5.3-flash', inference: included },
    { id: 'provider', model: 'glm-5.3', inference: provider },
  ]);
  const out = await answering(c, fallback).answer(ASK);
  assert.equal(included.seen.length, 1);
  assert.equal(provider.seen.length, 1, 'the walk reached the provider');
  assert.equal(codeOf(out), 'PULL_REQUEST_REFUSED', "the provider's 401 is a status no retry mends");
});
