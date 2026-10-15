/**
 * What a page draws while the next one reads (`leaving.ts`): the page being left for a moment, then the next page's
 * head and bars, and never nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HOLD_MS, leaving } from './leaving.ts';

/* Invented pages; the answer is any value, as the route's `Opened` is to this. */
const orchard = { slug: 'orchard', got: { title: 'Orchard' } };
const kept = { title: 'Lantern, as this tab last drew it' };

test('UNDER 400 MS THE PAGE BEING LEFT STAYS, untouched, as itself and marked busy', () => {
  const drawn = leaving(orchard, { slug: 'lantern', got: null, reading: true }, 0);
  assert.deepEqual(drawn, { slug: 'orchard', got: orchard.got, busy: true, held: true });
  assert.equal(drawn.got, orchard.got, 'the very answer it had, not a copy');
  assert.equal(leaving(orchard, { slug: 'lantern', got: null, reading: true }, HOLD_MS - 1).held, true);
});

test('AFTER IT THE NEXT PAGE DRAWS ITS HEAD AND BARS, under its own name', () => {
  assert.equal(HOLD_MS, 400);
  assert.deepEqual(leaving(orchard, { slug: 'lantern', got: null, reading: true }, HOLD_MS), { slug: 'lantern', got: null, busy: true, held: false });
  assert.deepEqual(leaving(null, { slug: 'lantern', got: null, reading: true }, 0), { slug: 'lantern', got: null, busy: true, held: false }, 'the first page of a tab has nothing to keep');
});

test('WHAT THE NEXT PAGE HAS IS DRAWN AT ONCE: its kept copy busy while it reads, its answer still once it lands', () => {
  assert.deepEqual(leaving(orchard, { slug: 'lantern', got: kept, reading: true }, 0), { slug: 'lantern', got: kept, busy: true, held: false });
  assert.deepEqual(leaving(orchard, { slug: 'lantern', got: kept, reading: false }, 10), { slug: 'lantern', got: kept, busy: false, held: false });
});

test('A READ OF THE SAME PAGE AGAIN KEEPS WHAT IT HAD, however long it takes', () => {
  assert.deepEqual(leaving(orchard, { slug: 'orchard', got: null, reading: true }, 5_000), { slug: 'orchard', got: orchard.got, busy: true, held: false });
  assert.deepEqual(leaving(orchard, { slug: 'orchard', got: null, reading: false }, 5_000).busy, false);
});

test('NEVER NOTHING: every moment draws a page, or the next page as its head and bars', () => {
  for (const prev of [null, orchard]) {
    for (const got of [null, kept]) {
      for (const reading of [true, false]) {
        for (const ms of [0, 200, 399, 400, 2_000]) {
          const drawn = leaving(prev, { slug: 'lantern', got, reading }, ms);
          assert.ok(drawn.got !== null || (drawn.slug === 'lantern' && drawn.busy), `${prev?.slug} ${String(got)} ${reading} ${ms}`);
          if (drawn.held) assert.ok(ms < HOLD_MS && drawn.slug === 'orchard', 'only the page being left is held, and only for a moment');
        }
      }
    }
  }
});
