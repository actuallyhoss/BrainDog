/**
 * The run sheet from Today opens on the run, not in its message box: it opened with a
 * heavy ring on the box, because the sheet put the caret in its first field. A text test over markup, as the rest of
 * this tree's component checks are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll(/<!--[\s\S]*?-->/gu, '');

test('the run sheet asks the sheet not to put the caret in its box', () => {
  assert.match(read('./RunSheet.svelte'), /<Sheet\b[^>]*\bcaret=\{false\}/u);
});

test('a sheet puts the caret in its first field only when it is asked to', () => {
  const sheet = read('../ui/Sheet.svelte');
  assert.match(sheet, /caret = true,/u, 'the caret is off by default');
  assert.match(sheet, /if \(caret\) el\.querySelector<HTMLElement>\('\.sheet-body input/u);
});
