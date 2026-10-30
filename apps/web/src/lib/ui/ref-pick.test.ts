/**
 * A link field is picked by name (`RefPick.svelte`, `ref-pick.ts`): "Insurance" finds the row, a held `15` or
 * `categories#15` is the row it names, and both forms that edit a link draw the picker, not a number box.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matching, meant, seqOf } from './ref-pick.ts';

const CATEGORIES = [
  { value: 3, label: 'Groceries' },
  { value: 9, label: 'Car insurance' },
  { value: 12, label: 'Insurance' },
  { value: 15, label: 'Transfers' },
  { value: 18, label: 'Café' },
];

test('a held value names its row by number or spoken id, and nothing else', () => {
  assert.equal(seqOf('15'), 15);
  assert.equal(seqOf('categories#15'), 15);
  assert.equal(seqOf(''), null);
  assert.equal(seqOf('Insurance'), null);
});

test('typing narrows by name, the names that start with it first', () => {
  assert.deepEqual(
    matching(CATEGORIES, 'insur').map((o) => o.label),
    ['Insurance', 'Car insurance'],
  );
  assert.deepEqual(
    matching(CATEGORIES, 'cafe').map((o) => o.value),
    [18],
    'accents do not stand in the way',
  );
  assert.equal(matching(CATEGORIES, '').length, CATEGORIES.length);
  assert.deepEqual(matching(CATEGORIES, 'zzz'), []);
});

test('a name typed and left means the row named exactly, else the only match, else none', () => {
  assert.equal(meant(CATEGORIES, 'Insurance')?.value, 12);
  assert.equal(meant(CATEGORIES, ' insurance ')?.value, 12);
  assert.equal(meant(CATEGORIES, 'groc')?.value, 3);
  assert.equal(meant(CATEGORIES, 'insur'), null, 'two rows match, so neither is guessed');
  assert.equal(meant(CATEGORIES, ''), null);
});

test('the row page and the new-row form both edit a link with RefPick', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(join(here, '../../routes/r/[register]/[seq]/+page.svelte'), 'utf8');
  const form = readFileSync(join(here, 'RowForm.svelte'), 'utf8');
  assert.match(page, /f\.type === 'ref' && f\.to\}\s*<RefPick /u);
  assert.match(form, /f\.type === 'ref' && f\.to\}\s*<RefPick /u);
});
