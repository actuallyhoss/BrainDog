/**
 * A REFUSED LINK SAYS WHY (first-run-honest-81, left): the mailed link's failure is one of three answers
 * (`Asked` in `lib/signup.ts`), and only a refusal with no sentence of its own is "A link works once, within a day".
 * Read off the page's source, as `signup.test.ts` reads it, since the screen has no seam a test can press.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { words } from './words.ts';

const PAGE = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

/** The body of `verify()`, up to the next function. */
const VERIFY = PAGE.slice(PAGE.indexOf('async function verify('), PAGE.indexOf('const shown = read ??'));
/** The step's markup, up to the next step. */
const DRAWN = PAGE.slice(PAGE.indexOf("{:else if step === 'link-failed'}"), PAGE.indexOf("{:else if step === 'making'}"));

test('the failed answer is kept before the step changes', () => {
  assert.match(PAGE, /let linkWhy = \$state<string \| null>\(null\);/);
  assert.ok(VERIFY.indexOf('linkWhy =') > 0 && VERIFY.indexOf('linkWhy =') < VERIFY.indexOf("step = 'link-failed'"));
});

test('refused draws the host\'s own fix, and no fix leaves the expired sentence', () => {
  assert.match(VERIFY, /out\.kind === 'refused' \? out\.fix :/);
  assert.match(DRAWN, /\{linkWhy \?\? copy\.signupLinkFailedWhy\}/);
});

test('locked draws the wait, in whole minutes', () => {
  assert.match(VERIFY, /out\.kind === 'locked' \? copy\.signupLocked\(Math\.ceil\(out\.retryAfter \/ 60\)\)/);
});

test('unreachable has its own words, and they do not call the link spent', () => {
  assert.match(VERIFY, /: words\.linkUnreached;/);
  assert.equal(words.linkUnreached, 'We could not reach BrainDog. Open the link again in a minute.');
  assert.doesNotMatch(words.linkUnreached, /once|expired|—/);
});

test('the reason is said aloud, and the way on is still drawn', () => {
  assert.match(DRAWN, /role="alert"/);
  assert.match(DRAWN, /copy\.signupStartAgain/);
});
