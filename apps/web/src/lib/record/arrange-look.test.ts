/**
 * Edit layout's Done as the person's own look: the order, widths and columns by key, what the live look held, when an
 * arrangement cannot be a look, and what Undo puts back. Invented blocks and pages only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { byLook, lookOfArrangement, lookUndo, type Laid } from './arrange-look.ts';
import type { LiveLook } from './page-live.ts';

const look = (over: Partial<LiveLook>): LiveLook => ({
  page: 'garden',
  basis: 'facts-1',
  lead: null,
  order: [],
  hide: [],
  headline: null,
  next: null,
  pinned: [],
  by: 'rule',
  kept: null,
  ...over,
});

const PAGE: Laid[] = [
  { key: 'intro', kind: 'note', span: 12, drawn: true },
  { key: 'beds', kind: 'table', span: 12, drawn: true },
  { key: 'seeds', kind: 'list', span: 6, drawn: true },
  { key: 'harvest', kind: 'stat', span: 6, drawn: true },
];

test('THE LOOK IS THE KEYS IN THEIR NEW ORDER, a width for every block, and the person as its author', () => {
  const laid = [PAGE[0]!, { ...PAGE[3]!, span: 4 }, PAGE[1]!, PAGE[2]!];
  const out = lookOfArrangement('garden', null, laid);
  assert.equal(Object.keys(out)[0], 'look', 'a declaration is read by its first key');
  assert.equal(out.look, 'garden');
  assert.equal(out.by, 'owner');
  assert.equal(out.basis, 'pinned', 'the basis is written as bodyOf writes it');
  assert.deepEqual(out.order, ['intro', 'harvest', 'beds', 'seeds']);
  assert.deepEqual(out.span, { intro: 12, harvest: 4, beds: 12, seeds: 6 });
  assert.equal('area' in out, false, 'a page with no rail says no column');
});

test('ON A PAGE WITH A RAIL EVERY BLOCK SAYS ITS COLUMN, and a width no look may give is left as read', () => {
  const laid: Laid[] = [
    { key: 'beds', kind: 'table', span: 12, drawn: true, area: 'main' },
    { key: 'seeds', kind: 'list', span: 5, drawn: true },
    { key: 'harvest', kind: 'stat', span: 12, drawn: true, area: 'rail' },
  ];
  const out = lookOfArrangement('garden', null, laid);
  assert.deepEqual(out.area, { beds: 'main', seeds: 'main', harvest: 'rail' });
  assert.deepEqual(out.span, { beds: 12, harvest: 12 });
});

test("THE PERSON'S PINS, HIDES, LINE AND NEXT STEP STAY; an engine's line and next step are never copied", () => {
  const next = { row: 'tasks#4', text: 'Water the beds.' };
  const owner = lookOfArrangement('garden', look({ by: 'owner', pinned: ['beds'], hide: ['seeds'], headline: 'All watered.', next }), PAGE);
  assert.deepEqual([owner.pinned, owner.hide, owner.headline, owner.next], [['beds'], ['seeds'], 'All watered.', next]);
  assert.equal(owner.basis, 'facts-1');

  const engine = lookOfArrangement('garden', look({ by: 'slash', hide: ['seeds'], headline: 'Two beds need water.', next }), PAGE);
  assert.equal('headline' in engine, false);
  assert.equal('next' in engine, false);
  assert.deepEqual(engine.hide, ['seeds'], 'what was hidden stays hidden');
  assert.equal(engine.by, 'owner');
});

test('A LEAD STAYS ONLY WHILE IT STILL LEADS, and a block taken off the page is hidden and unpinned', () => {
  const live = look({ lead: 'beds', pinned: ['seeds'], by: 'owner' });
  assert.equal(lookOfArrangement('garden', live, PAGE).lead, 'beds');
  const movedDown = [PAGE[0]!, PAGE[2]!, PAGE[1]!, PAGE[3]!];
  assert.equal('lead' in lookOfArrangement('garden', live, movedDown), false, 'the record would put it straight back on top');

  const out = lookOfArrangement('garden', live, [PAGE[0]!, PAGE[1]!, PAGE[3]!], ['seeds']);
  assert.deepEqual(out.hide, ['seeds']);
  assert.equal('pinned' in out, false);
});

test('A LOOK OVER A TEMPLATE IS WRITTEN UNDER THE TEMPLATE IT IS LAID OVER', () => {
  assert.equal(lookOfArrangement('plot-7', look({ page: 'plots' }), PAGE).look, 'plots');
});

const HEADED: Laid[] = [
  { key: 'today', kind: 'section', span: 12, drawn: true },
  { key: 'beds', kind: 'table', span: 12, drawn: true },
  { key: 'seeds', kind: 'list', span: 6, drawn: true },
  { key: 'later', kind: 'section', span: 12, drawn: true },
  { key: 'harvest', kind: 'stat', span: 6, drawn: true },
  { key: 'tools', kind: 'list', span: 6, drawn: true, area: 'rail' },
];

test('AN ARRANGEMENT IS A LOOK WHILE EVERY BLOCK KEEPS ITS HEADING in its column', () => {
  const swapped = [HEADED[0]!, HEADED[2]!, HEADED[1]!, HEADED[3]!, { ...HEADED[4]!, span: 12 }, HEADED[5]!];
  assert.equal(byLook(swapped, HEADED), true);
  /* To the rail, which has no heading: ordered among the rail's blocks. */
  const railed = [HEADED[0]!, HEADED[1]!, HEADED[3]!, HEADED[4]!, { ...HEADED[2]!, area: 'rail' as const }, HEADED[5]!];
  assert.equal(byLook(railed, HEADED), true);
});

test('A BLOCK MOVED UNDER ANOTHER HEADING, A HEADING MOVED, OR A KEY THE PAGE MADE UP GOES THE OLD WAY', () => {
  const crossed = [HEADED[0]!, HEADED[1]!, HEADED[3]!, HEADED[2]!, HEADED[4]!, HEADED[5]!];
  assert.equal(byLook(crossed, HEADED), false);
  const headingsSwapped = [HEADED[3]!, HEADED[4]!, HEADED[0]!, HEADED[1]!, HEADED[2]!, HEADED[5]!];
  assert.equal(byLook(headingsSwapped, HEADED), false);
  const madeUp = [{ ...PAGE[0]!, key: 'note||intro' }, PAGE[1]!];
  assert.equal(byLook(madeUp, [{ ...PAGE[0]!, key: 'note||intro' }, PAGE[1]!]), false);
});

test("UNDO PUTS BACK THE PERSON'S OWN LOOK AS IT WAS, and retires the new one over the rules' or Slash's or none", () => {
  assert.deepEqual(lookUndo('garden', null), { retire: 'garden' });
  assert.deepEqual(lookUndo('garden', look({ by: 'slash', order: ['seeds'] })), { retire: 'garden' });
  assert.deepEqual(lookUndo('plot-7', look({ page: 'plots' })), { retire: 'plots' });
  const mine = { ...look({ by: 'owner', pinned: ['beds'], order: ['beds', 'seeds'] }), span: { beds: 6 } };
  const back = lookUndo('garden', mine);
  assert.ok('write' in back);
  assert.deepEqual(back.write, { look: 'garden', basis: 'facts-1', by: 'owner', order: ['beds', 'seeds'], pinned: ['beds'], span: { beds: 6 } });
});
