/** Work read ahead of the press (`warm.ts`): the key it keeps under, and the layout reads it on hover, touch and focus. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { workKey } from './warm.ts';

test('THE KEY IS THE ADDRESS AND THE FILTER, the one Work keeps under', () => {
  assert.equal(workKey('https://brain.dog', {}), 'https://brain.dog {}');
  assert.notEqual(workKey('https://brain.dog', { state: 'open' }), workKey('https://brain.dog', {}));
});

test('THE LAYOUT READS WORK AHEAD on a resting pointer, a touch and focus, and loads the reader only then', () => {
  const layout = readFileSync(new URL('../../routes/+layout.svelte', import.meta.url), 'utf8');
  assert.match(layout, /<svelte:document onpointerover=\{\(e\) => readAhead\(e, 60\)\} ontouchstart=\{\(e\) => readAhead\(e, 0\)\} onfocusin=\{\(e\) => readAhead\(e, 0\)\} \/>/u);
  assert.match(layout, /import\('\$lib\/work\/warm\.ts'\)/u);
  /* ONLY A LINK TO THE WORK SCREEN, by the nav's own word. The old screen is gone (C32), so `classic` is not read. */
  assert.match(layout, /placeOf\('\/', new URLSearchParams\(link\.search\)\) !== WORK\)/u);
  assert.doesNotMatch(layout, /has\('classic'\)/u);
  assert.doesNotMatch(layout, /^\s*import [^;]*from '\$lib\/work\/warm\.ts';$/mu, 'the reader is in the shell');
});
