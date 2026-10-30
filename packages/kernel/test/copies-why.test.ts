/**
 * A failed night's reason as one plain sentence (`nightWhy`): read from the raw reason the fault keeps by what it is
 * about, never quoting it, and a reason none of the known ones fit is still said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nightWhy } from '../src/copies.ts';

test('EACH KIND OF FAILED NIGHT IS SAID IN ITS OWN PLAIN SENTENCE', () => {
  assert.equal(nightWhy('snapshot over 40 MiB: this record dumped 52428800 bytes'), 'Your BrainDog was too large to copy in one piece.');
  assert.equal(nightWhy('RangeError: Invalid string length'), 'Your BrainDog was too large to copy in one piece.');
  assert.equal(nightWhy('Durable Object exceeded its CPU time limit'), 'The copy took longer than BrainDog allows for one.');
  assert.equal(nightWhy('the record would not export: refused'), 'Your BrainDog could not be read for the copy.');
  assert.equal(nightWhy('The nightly copy did not run: age1<alpha-recipient> is not a recipient'), 'The key that locks your copies could not be used.');
  assert.equal(nightWhy('the dump ended 12 bytes short of the 900 it counted'), 'The copy came out shorter than your BrainDog, so it was not kept.');
  assert.equal(nightWhy('R2 put failed: 503 Service Unavailable'), 'The place your copies are kept could not be reached.');
});

test('A REASON NONE FIT IS STILL SAID, and no sentence quotes the raw words', () => {
  assert.equal(nightWhy('zzz'), 'It stopped partway, and the copy was not kept.');
  for (const raw of ['bucket braindog-copies/rec_1 refused', 'snapshot over 40 MiB', 'zzz']) assert.ok(!nightWhy(raw).includes(raw));
});
