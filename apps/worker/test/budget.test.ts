/**
 * The Worker's own subrequest ceiling, and the two lines that connect it to the kernel.
 *
 * THE ARITHMETIC IS TESTED WHERE IT LIVES, in `packages/kernel/test/budget.test.ts`. What is here
 * is the wiring, because the wiring is what can be removed without a single test going red: the
 * kernel's check is skipped entirely when no budget is passed, so an alarm that stopped passing one
 * would keep every assertion in this repository green and take the invocation down in production.
 *
 * AND THE RE-ARM WITH IT. `more` means rows went back on the shelf still due, with their schedule
 * untouched — so nothing will fire for them. If the alarm does not set itself, they wait for the
 * next unrelated wake, which on a quiet record is hours.
 *
 * A SOURCE READ AND NOT A RUN, because driving it needs a Durable Object, an alarm and a Directory
 * stub, and what it would prove is that one argument is present. `keychain.test.ts` guards the KEK
 * readers the same way and for the same reason.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SUBREQUESTS, invocation, spent } from '../src/actions.ts';

test('a fresh invocation has the whole ceiling and has spent none of it', () => {
  const budget = invocation();
  assert.equal(budget.total, SUBREQUESTS);
  assert.equal(budget.left, SUBREQUESTS);
  assert.equal(spent(budget), 0);

  budget.left -= 26;
  assert.equal(spent(budget), 26);
});

test('THE CEILING IS UNDER CLOUDFLARE’S OWN, so the two hundred left over covers what this file cannot see', () => {
  /* The Paid plan allows a thousand. The gap is the object's reads, the Directory calls and the
     queue sends: a limit set at the real one is a limit reached by surprise. */
  assert.equal(SUBREQUESTS, 800);
  assert.ok(SUBREQUESTS < 1000);
});

test('the alarm passes a budget to `runActions`, and rings again when the pass says there is more', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

  assert.match(source, /const budget = \{ \.\.\.invocation\(\), until: Date\.now\(\) \+ ALARM_ACT_MS,/, 'the alarm stopped making a budget');
  assert.match(source, /runActions\(execute, \{[^}]*\bbudget,/, 'the budget stopped reaching runActions, so nothing is counted');
  assert.match(source, /if \(out\.more\) await this\.#alarm\.set\(/, 'rows released for room are no longer re-armed');
});
