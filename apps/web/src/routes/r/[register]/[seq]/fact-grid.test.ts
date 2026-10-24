/**
 * A fact's label touches its value (the audit of 25 October, Y28): in the two-column facts a cell beside a long note was
 * stretched to the note's height, and its label floated to the middle with its value at the foot, six lines apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const style = page.slice(page.indexOf('<style'));

test('A FACT STARTS AT ITS TOP: its label and value are packed together, however tall the fact beside it', () => {
  const fact = /\n {2}\.fact \{([^}]*)\}/u.exec(style)?.[1] ?? '';
  assert.match(fact, /align-content: start;/u, 'a stretched fact spreads its label and value apart');
  assert.match(fact, /align-self: start;/u, 'a fact is stretched to the height of the one beside it');
});
