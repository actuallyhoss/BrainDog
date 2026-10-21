/**
 * That a motion token reads in milliseconds whatever unit the minified skin writes it in (VERIFY H1: `.18s` was read
 * as 0.18, so rows never visibly moved).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ms, msIn } from './motion.ts';

test('seconds and milliseconds both read as milliseconds', () => {
  assert.equal(msIn('.18s', 0), 180);
  assert.equal(msIn(' 0.18s ', 0), 180);
  assert.equal(msIn('180ms', 0), 180);
  assert.equal(msIn('1.5s', 0), 1500);
  assert.equal(msIn('0s', 99), 0);
});

test('an unset or unreadable token is the fallback', () => {
  assert.equal(msIn('', 180), 180);
  assert.equal(msIn('fast', 220), 220);
});

test('with no document the fallback stands', () => {
  assert.equal(ms('--d-rows', 180), 180);
});
