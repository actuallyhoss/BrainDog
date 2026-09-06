/**
 * The cookie the shell reads before it paints, and the two settings that were lost on every reload.
 *
 * WHAT IS BEING TESTED IS THE MERGE, mostly. Each preference is written by its own control, and a
 * write that carried only the field it knew about would silently reset every other one — which is
 * the shape of bug that makes people think a product forgets things at random, and is exactly what
 * a per-control store invites.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as pref from './pref.ts';

/** A document with a cookie jar, since that is the whole of what `pref` touches. */
function jar(initial = '') {
  (globalThis as { document?: { cookie: string } }).document = {
    get cookie() {
      return initial;
    },
    set cookie(next: string) {
      initial = next.split(';')[0] ?? '';
    },
  };
}

test('a write merges rather than replaces', () => {
  jar();
  pref.write({ scheme: 'dark' });
  pref.write({ density: 'roomy' });
  assert.deepEqual(pref.read(), { scheme: 'dark', density: 'roomy' });
});

test('HIDDEN COLUMNS SURVIVE A RELOAD, per register', () => {
  /* 50 §5.2 names the store `prefs.columns[register]` and it did not exist: untick a column, press
     Done, reload, and it is back — on a screen whose search, filters and sort all survive in the
     URL, which is why a reader expects this to. */
  jar();
  pref.write({ columns: { obligations: ['party', 'due'] } });
  pref.write({ columns: { ...pref.read().columns, services: ['cost'] } });

  assert.deepEqual(pref.read().columns, { obligations: ['party', 'due'], services: ['cost'] });
  // And the scheme somebody set earlier is still there, which is the merge doing its job.
  pref.write({ scheme: 'dark' });
  assert.deepEqual(pref.read().columns?.obligations, ['party', 'due']);
});

test('and clearing one register leaves the others alone', () => {
  jar();
  pref.write({ columns: { obligations: ['party'], services: ['cost'] } });
  const all = { ...pref.read().columns };
  delete all.obligations;
  pref.write({ columns: all });
  assert.deepEqual(pref.read().columns, { services: ['cost'] });
});

test('THE NAV ORDER SURVIVES A RELOAD', () => {
  /* The rail's header claims "position lives in a per-user store and wins", and there was no store:
     Move up reordered the rail on screen and a reload put it back, silently — while `Hide`, one item
     below it in the same menu, was honest about writing nothing. */
  jar();
  pref.write({ nav: ['/p/money', '/r/obligations', '/'] });
  assert.deepEqual(pref.read().nav, ['/p/money', '/r/obligations', '/']);
});

test('a cookie this build cannot read is not a crash', () => {
  // A preference from an older version, or one somebody edited. The default is the right answer and
  // the next write replaces it.
  jar('bd_pref=%7Bnot-json');
  assert.deepEqual(pref.read(), {});
});

test('and an absent document reads empty rather than throwing', () => {
  delete (globalThis as { document?: unknown }).document;
  assert.deepEqual(pref.read(), {});
  pref.write({ scheme: 'dark' });
});
