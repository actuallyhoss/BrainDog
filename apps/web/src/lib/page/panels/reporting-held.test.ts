/**
 * "SEND NUMBERS HERE" IS NEVER AN EMPTY CARD THE SCREEN CALLS DRAWN (the audit of 25 October, Z21).
 *
 * WHAT WAS WRONG. A look of his record caught the section empty on every project (`project-1512-light.png`,
 * `-more/p-braindog-1512-light.png`), and again on BrainDog's phone page after the hero came back: the panel's reads
 * were not among the screen's calls, so the page said it was drawn while they were out, and a read that threw left the
 * place it held empty for good. The panel is read as text, as `segmented.test.ts` reads markup: there is no component
 * test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('./Reporting.svelte', import.meta.url), 'utf8');

test('the panel’s reads are one of the screen’s calls, closed whatever they come to', () => {
  assert.match(panel, /const at = opened\(\);\s*try \{\s*await read\(\);/u, 'the screen is said drawn while the panel reads');
  assert.match(panel, /finally \{\s*closed\(true, at\);/u);
});

test('a read that fails lets go of the place it held', () => {
  assert.match(panel, /catch \{\s*from = 'absent';\s*held = false;/u);
});
