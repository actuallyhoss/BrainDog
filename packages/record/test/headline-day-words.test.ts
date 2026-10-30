/**
 * A HEADLINE'S DAYS ARE SAID AGAINST THE RECORD'S YEAR, not the machine's (F36): the record hands its own day through,
 * so a record on its New Year's morning, or a test with a fixed clock, says the year its clock says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayWords, figureText, plainLine, rulesLine } from '../src/headlines.ts';

test("a day in the record's own year is said without its year, and any other with it", () => {
  assert.equal(dayWords('2027-01-13', '2027-01-01'), '13 Jan');
  assert.equal(dayWords('2027-01-13', '2026-12-31'), '13 Jan 2027');
  assert.equal(dayWords('2026-10-29', Date.UTC(2026, 9, 30)), '29 Oct');
  assert.equal(dayWords('2026-10-29', Date.UTC(2031, 0, 1)), '29 Oct 2026');
});

test("the record's day reaches every line that says a day", () => {
  assert.equal(plainLine('Cash lasts to 2027-01-13', [], '2027-01-02'), 'Cash lasts to 13 Jan');
  assert.equal(figureText('2027-01-13', '2026-12-31'), '13 Jan 2027');
  assert.equal(rulesLine('Next due {{due}}', { due: '2031-04-13' }, '2031-01-01'), 'Next due 13 Apr');
});
