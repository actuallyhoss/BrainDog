/**
 * The design agent's navigation recommendation, read against fixed record shapes.
 *
 * Every case is a record `19 §3` already describes: the
 * freelancer with four entries, the studio with eighteen across six sections, and the record with
 * nothing placed yet. Each assertion checks the shape AND that a reason was actually stated, because
 * `29 §4`'s rule this recommendation is held to is that a recommendation with no reason is an
 * advertisement.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { navShapeSignals, recommendNavShape, SHAPE_MIN_WIDTH, type NavShapeSignals } from './nav-shape.ts';

const base: NavShapeSignals = { entries: 0, sections: 0, handArranged: false, current: undefined };

test('nothing placed yet recommends the menu, and says why', () => {
  const rec = recommendNavShape({ ...base, entries: 0 });
  assert.equal(rec?.shape, 'menu');
  assert.match(rec!.reason, /nothing/i);
});

test('THE FREELANCER, four entries, fits the top bar with nothing behind More', () => {
  const rec = recommendNavShape({ ...base, entries: 4, sections: 1, current: 'rail' });
  assert.equal(rec?.shape, 'bar');
  assert.match(rec!.reason, /4 nav entries/);
});

test("THE STUDIO, eighteen across six sections, is exactly 19 §3's own example against the top bar", () => {
  const rec = recommendNavShape({ ...base, entries: 18, sections: 6, current: 'bar' });
  assert.equal(rec?.shape, 'rail');
  assert.match(rec!.reason, /18 entries across 6 sections/);
  assert.match(rec!.reason, /hiding 14/);
});

test('already on the shape that suits the record recommends nothing', () => {
  assert.equal(recommendNavShape({ ...base, entries: 18, sections: 6, current: 'rail' }), null);
  assert.equal(recommendNavShape({ ...base, entries: 4, sections: 1, current: 'bar' }), null);
  assert.equal(recommendNavShape({ ...base, entries: 0, current: 'menu' }), null);
});

test('A RECORD THAT NEVER CHOSE IS ON THE RAIL CARD, so the studio is told nothing it already has', () => {
  assert.equal(recommendNavShape({ ...base, entries: 18, sections: 6 }), null);
  assert.equal(recommendNavShape({ ...base, entries: 1, handArranged: true }), null, 'a hand-arranged nav was offered the rail it is on');
});

test('AND IS NEVER TALKED INTO THE TOP BAR, which stays a choice; a rail somebody picked can still hear it', () => {
  for (const entries of [2, 3, 4]) assert.equal(recommendNavShape({ ...base, entries, sections: 1 }), null, `${entries} entries`);
  assert.equal(recommendNavShape({ ...base, entries: 4, sections: 1, current: 'rail' })?.shape, 'bar');
  assert.equal(recommendNavShape({ ...base, entries: 3, sections: 1, current: 'menu' })?.shape, 'bar');
});

test('a hand-arranged nav is never told to hide behind a menu, even at one entry', () => {
  const rec = recommendNavShape({ ...base, entries: 1, handArranged: true, current: 'menu' });
  assert.equal(rec?.shape, 'rail');
  assert.match(rec!.reason, /arranged your nav by hand/);
});

test('below 900px nothing is recommended, because no shape chosen there would be seen', () => {
  assert.equal(recommendNavShape({ ...base, entries: 18, sections: 6, viewportWidth: 480 }), null);
});

test('THE EDGE IS SHAPE_MIN_WIDTH: 899px gives nothing, 900px gives the offer', () => {
  assert.equal(SHAPE_MIN_WIDTH, 900);
  const studio = { ...base, entries: 18, sections: 6, current: 'bar' as const };
  assert.equal(recommendNavShape({ ...studio, viewportWidth: 899 }), null);
  assert.equal(recommendNavShape({ ...studio, viewportWidth: 900 })?.shape, 'rail');
});

test('never recommends without a stated reason, across the whole matrix', () => {
  for (const entries of [0, 1, 2, 4, 5, 10, 40])
    for (const sections of [0, 1, 3, 8])
      for (const current of ['rail', 'bar', 'menu', undefined] as const) {
        const rec = recommendNavShape({ entries, sections, handArranged: false, current });
        if (rec) assert.ok(rec.reason.length > 0, `${entries}/${sections}/${current}`);
      }
});

test('navShapeSignals reads entries and sections off the nav list and the register count', () => {
  const nav = [{ section: 'Money' }, { section: 'Money' }, { section: 'Estate' }];
  const signals = navShapeSignals(nav, 2, { nav: [], navShape: 'bar' }, 1440);
  assert.equal(signals.entries, 5);
  assert.equal(signals.sections, 3);
  assert.equal(signals.handArranged, false);
  assert.equal(signals.current, 'bar');
  assert.equal(signals.viewportWidth, 1440);
});

test('navShapeSignals reads a hand-arranged nav from a non-empty Pref.nav', () => {
  const signals = navShapeSignals([{ section: 'Money' }], 0, { nav: ['/p/money'], navShape: undefined });
  assert.equal(signals.handArranged, true);
});
