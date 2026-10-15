/**
 * What a block may become from its own menu: the kinds that read the same cells, never its own, and a chart only where
 * its fields are numbers or days.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, isKind } from './kinds.ts';
import { kindsFor, type KindColumn } from './kinds-for.ts';

const text = (field: string): KindColumn => ({ field, type: 'text' });
const money = (field: string): KindColumn => ({ field, type: 'money' });
const day = (field: string): KindColumn => ({ field, type: 'date' });

test('A TABLE OFFERS CARDS AND A LIST, never itself', () => {
  const offered = kindsFor('table', [text('title'), text('note')]);
  assert.ok(offered.includes('cards'));
  assert.ok(offered.includes('todo'));
  assert.ok(!offered.includes('table'));
  assert.deepEqual(offered, ['cards', 'todo'], 'names and notes are no chart, no board and no calendar');
});

test('A BAR OVER NUMBERS OFFERS A LINE where its first field is a day, and its parts of a whole either way', () => {
  const byMonth = kindsFor('bar', [day('month'), money('spent')]);
  assert.ok(byMonth.includes('lines'));
  assert.ok(byMonth.includes('split'));
  assert.ok(!byMonth.includes('bar'));
  assert.ok(byMonth.includes('table') && byMonth.includes('cards'), 'the same rows as rows');
  const byPayee = kindsFor('bar', [text('payee'), money('spent')]);
  assert.ok(byPayee.includes('split'));
  assert.ok(!byPayee.includes('lines'), 'a line runs along days, and a payee is not one');
});

test('A CHART ONLY WHERE ITS FIELDS ARE NUMBERS OR DAYS: a list of words is never offered one', () => {
  for (const chart of ['bar', 'split', 'lines'])
    assert.ok(!kindsFor('cards', [text('name'), text('note')]).includes(chart as never), chart);
  /* A COLUMN WHOSE TYPE IS NOT KNOWN IS NEVER A NUMBER. */
  assert.ok(!kindsFor('table', [{ field: 'name' }, { field: 'spent' }]).includes('bar'));
  assert.deepEqual(kindsFor('table', [text('name'), money('spent')]).filter((k) => k === 'bar' || k === 'split'), ['bar', 'split']);
});

test('A BOARD WHERE THE FIRST FIELD IS A STATE, and a calendar where the second is a day', () => {
  assert.ok(kindsFor('table', [{ field: 'state', type: 'enum' }, text('title')]).includes('board'));
  assert.ok(!kindsFor('table', [text('title'), text('state')]).includes('board'));
  assert.ok(kindsFor('todo', [text('title'), day('due')]).includes('calendar'));
});

test('A BLOCK THAT WRITES ITS OWN ROWS IS OFFERED ITS PRIMITIVE\'S KINDS THAT READ THE SAME CELLS', () => {
  assert.deepEqual(kindsFor('spec', []), ['params']);
  assert.deepEqual(kindsFor('steps', []), ['timeline']);
  assert.deepEqual(kindsFor('bar', []), ['split']);
  assert.deepEqual(kindsFor('note', []), [], 'a note has nothing that reads a paragraph the same');
  for (const kind of ['spec', 'steps', 'code', 'bar'])
    for (const to of kindsFor(kind, [])) assert.equal(KINDS[to as keyof typeof KINDS].primitive, KINDS[kind as keyof typeof KINDS].primitive, `${kind} to ${to}`);
});

test('WHAT IT READS IS ITS OWN: a feed, a form and a kind a pack declares are offered nothing', () => {
  assert.deepEqual(kindsFor('feed', [text('who'), text('what')]), []);
  assert.deepEqual(kindsFor('form', [text('title')]), []);
  assert.deepEqual(kindsFor('block.mood', [text('title')]), []);
  assert.deepEqual(kindsFor('block.mood', []), []);
});

test('EVERY KIND OFFERED IS ONE THIS BUILD DRAWS, and never the kind asked about', () => {
  const columns = [day('when'), money('amount'), text('note')];
  for (const kind of Object.keys(KINDS)) {
    for (const to of [...kindsFor(kind, columns), ...kindsFor(kind, [])]) {
      assert.ok(isKind(to), to);
      assert.notEqual(to, kind);
    }
  }
});
