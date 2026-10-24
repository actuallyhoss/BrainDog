/**
 * Settings > Notifications, the rules that tell you: which rule gets a switch, and what one switch keeps.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { actorOf, mutedAfter, mutedOf, tellsQuietly } from './muted.ts';

test('a rule is signed as rule:<its id>, however it was named', () => {
  assert.equal(actorOf('installment-due-soon'), 'rule:installment-due-soon');
  assert.equal(actorOf('rule.chase'), 'rule:chase');
});

test('only a rule with a notice that is not urgent gets a switch, at any depth of branch', () => {
  assert.equal(tellsQuietly({ on: { written: 'tasks' }, then: [{ tag: 'late' }] }), false);
  assert.equal(tellsQuietly({ then: [{ notify: { say: 'Due soon' } }] }), true);
  assert.equal(tellsQuietly({ then: [{ notify: { say: 'Payment failed', urgent: true } }] }), false);
  assert.equal(tellsQuietly({ steps: [{ if: { when: {}, then: [{ notify: { say: 'Late', urgent: false } }] } }] }), true);
  /* A `note` is the same plain notice to the kernel, on its own or held for later. */
  assert.equal(tellsQuietly({ then: [{ note: 'Chased' }] }), true);
  assert.equal(tellsQuietly({ then: [{ schedule: { in: '14d', note: 'Check in' } }] }), true);
  assert.equal(tellsQuietly(null), false);
});

test('a switch keeps the muted rules newest last, each once, and takes an empty list away', () => {
  assert.deepEqual(mutedAfter([], 'rule:a', false), ['rule:a']);
  assert.deepEqual(mutedAfter(['rule:a', 'rule:b'], 'rule:a', false), ['rule:b', 'rule:a']);
  assert.deepEqual(mutedAfter(['rule:a', 'rule:b'], 'rule:a', true), ['rule:b']);
  assert.equal(mutedAfter(['rule:a'], 'rule:a', true), null);
  assert.deepEqual(mutedOf(['rule:a', 'rule:a', 3, '/p/money']), ['rule:a']);
  assert.deepEqual(mutedOf(undefined), []);
});

test("A RULE'S OWN PAGE WRITES THE PERSON'S OWN PREF, through setPref, and offers it only on a rule that tells them something", () => {
  const src = readFileSync(new URL('../../automations/[id]/+page.svelte', import.meta.url), 'utf8');
  assert.match(src, /\.setPref\('notify\.muted', next\)/u);
  assert.match(src, /\{#if tellsQuietly\(row\.body\)\}/u);
});
