/**
 * A job's cost from Claude Code's `result` line: whole cents, rounded up, so a run that cost anything is never nought,
 * and a cost the run did not state sends nothing rather than a guess.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { costOf } from '../src/runner.ts';

const line = (total_cost_usd: unknown): Record<string, unknown> => ({ type: 'result', subtype: 'success', total_cost_usd });

test('a fraction of a cent is one cent, never nought', () => {
  assert.deepEqual(costOf(line(0.0042)), { cost_minor: 1, cost_currency: 'USD' });
});

test('a cost past a whole cent rounds up to the next one', () => {
  assert.deepEqual(costOf(line(1.234)), { cost_minor: 124, cost_currency: 'USD' });
});

test('a whole number of cents is kept as it is, not pushed up by the float', () => {
  assert.deepEqual(costOf(line(1.23)), { cost_minor: 123, cost_currency: 'USD' });
  assert.deepEqual(costOf(line(0.07)), { cost_minor: 7, cost_currency: 'USD' });
});

test('a run that cost nothing says nought', () => {
  assert.deepEqual(costOf(line(0)), { cost_minor: 0, cost_currency: 'USD' });
});

test('a cost that is missing, text, not a number or below nought sends nothing', () => {
  assert.equal(costOf(null), null);
  assert.equal(costOf({ type: 'result', subtype: 'success' }), null);
  assert.equal(costOf(line('0.12')), null);
  assert.equal(costOf(line(Number.NaN)), null);
  assert.equal(costOf(line(Number.POSITIVE_INFINITY)), null);
  assert.equal(costOf(line(-0.5)), null);
});
