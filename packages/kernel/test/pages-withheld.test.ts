/**
 * ONE RULE FOR WHETHER A PAGE IS THERE FOR ITS READER (PGS-A01, H.366): `whollyWithheld` is true when the page has a
 * block and every block carries a refusal that holds it back from the reader, never one that asks its author to fix it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WITHHELD_CODES, whollyWithheld } from '../src/pages.ts';

const by = (...codes: string[]) => ({ refusals: codes.map((code) => ({ code })) });

test('THE CODES are the ceiling and the level, and nothing else', () => {
  assert.deepEqual([...WITHHELD_CODES], ['FORBIDDEN', 'LEVEL_REQUIRED']);
});

test('EVERY BLOCK WITHHELD, by either code, is a page withheld', () => {
  assert.equal(whollyWithheld([by('FORBIDDEN'), by('LEVEL_REQUIRED')]), true);
  assert.equal(whollyWithheld([by('FIELD_UNKNOWN', 'FORBIDDEN')]), true);
});

test('ONE BLOCK THE READER MAY SEE keeps the page', () => {
  assert.equal(whollyWithheld([by('FORBIDDEN'), by()]), false);
  assert.equal(whollyWithheld([by('FORBIDDEN'), {}]), false);
});

test('A BLOCK REFUSED FOR ITS AUTHOR TO FIX is no block withheld: somebody has to see it to fix it', () => {
  assert.equal(whollyWithheld([by('FIELD_UNKNOWN')]), false);
  assert.equal(whollyWithheld([by('DECLARATION_INVALID'), by('FORBIDDEN')]), false);
});

test('A PAGE OF NO BLOCKS is empty, not withheld', () => {
  assert.equal(whollyWithheld([]), false);
});
