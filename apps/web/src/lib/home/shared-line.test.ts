import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sharedFrom, sharedLine } from './shared-line.ts';

const out = (o: Partial<Parameters<typeof sharedLine>[0]> = {}) => ({ live: 2, names: ['Priya', 'Accountants'], more: 0, fresh: [], needs: false, ...o });

test('NOTHING SHARED SAYS NOTHING, and shares made before today say who by name, quietly', () => {
  assert.equal(sharedLine(out({ live: 0 })), null);
  assert.deepEqual(sharedLine(out()), { words: 'Shared with Priya and Accountants.', go: 'See who', needs: false });
  assert.deepEqual(sharedLine(out({ names: ['Priya', 'Sam', 'Ana'], more: 2 })), { words: 'Shared with Priya, Sam, Ana and 2 more.', go: 'See who', needs: false });
  assert.deepEqual(sharedLine(out({ names: ['Priya'] })), { words: 'Shared with Priya.', go: 'See who', needs: false });
});

test('A SHARE MADE TODAY IS SAID BY ITS OWN WORDS, red only when the record says it needs him', () => {
  const fresh = [{ id: 'sh_1', said: 'You shared Kiln with priya@studio.co.' }];
  assert.deepEqual(sharedLine(out({ fresh })), { words: 'You shared Kiln with priya@studio.co.', go: 'Not you? Stop it', needs: false });
  assert.equal(sharedLine(out({ fresh, needs: true }))?.needs, true);
  assert.deepEqual(sharedLine(out({ fresh: [...fresh, { id: 'sh_2', said: 'x' }] })), { words: '2 shares were made today.', go: 'Not you? See them', needs: false });
});

test('AN ANSWER IN ANOTHER SHAPE, OR NOTHING SHARED, IS NO LINE', () => {
  assert.equal(sharedFrom(null), undefined);
  assert.equal(sharedFrom({ live: 0, names: [], more: 0, fresh: [] }), undefined);
  assert.equal(sharedFrom({ live: '2' }), undefined);
  assert.deepEqual(sharedFrom({ live: 1, names: ['Priya', 4], more: 0, fresh: [{ id: 'a', said: 'b' }, 'x'], needs: 'yes' }), { live: 1, names: ['Priya'], more: 0, fresh: [{ id: 'a', said: 'b' }], needs: false });
});

test('THE WORDS HOLD NO EM DASH AND NO ID', () => {
  for (const l of [sharedLine(out()), sharedLine(out({ fresh: [{ id: 'sh_1', said: 'You shared Kiln with Priya.' }] }))]) {
    assert.ok(l);
    assert.doesNotMatch(`${l.words} ${l.go}`, /\u2014|sh_/u);
  }
});
