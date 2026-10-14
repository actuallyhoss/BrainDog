/**
 * One field reads one way (`field.ts`): help alone, an error in its place, or no line; and a refusal lands under the field
 * it names and nowhere else.
 *
 * AND THE FORM DRAWS EVERY FIELD THROUGH IT, held by reading `RowForm.svelte`'s source, because a Svelte component does
 * not mount under `node --test` (as `value-said.test.ts` reads it).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A NAMESPACE AND NOT A NAMED IMPORT, so a missing export is one failing test rather than a file that will not load. */
import * as field from './field.ts';

test('HELP ALONE is the line, in the help tone, and the control is described by it and not invalid', () => {
  assert.deepEqual(field.fieldLine({ id: 'new-chores-title', help: 'What it is, in a few words.' }), {
    text: 'What it is, in a few words.',
    tone: 'help',
    lineId: 'new-chores-title-line',
    describedBy: 'new-chores-title-line',
    invalid: false,
  });
});

test('AN ERROR REPLACES THE HELP, never beside it, and the control is invalid', () => {
  const line = field.fieldLine({ id: 'new-chores-amount', help: 'In pounds.', error: 'An amount has two places.' });
  assert.deepEqual(line, {
    text: 'An amount has two places.',
    tone: 'danger',
    lineId: 'new-chores-amount-line',
    describedBy: 'new-chores-amount-line',
    invalid: true,
  });
});

test('NO HELP AND NO ERROR IS NO LINE, and blank words count as none', () => {
  assert.equal(field.fieldLine({ id: 'new-chores-note' }), null);
  assert.equal(field.fieldLine({ id: 'new-chores-note', help: '  ', error: '' }), null);
  assert.equal(field.fieldLine({ id: 'new-chores-note', help: null, error: undefined }), null);
});

test('A REFUSAL NAMING `amount` GIVES `amount` ITS SENTENCE AND `title` NONE', () => {
  const refusal = { code: 'VALUE_MALFORMED', fix: 'Plant pots takes an amount with at most two places.', at: 'amount' };
  assert.equal(field.errorFor(refusal, 'amount'), 'Plant pots takes an amount with at most two places.');
  assert.equal(field.errorFor(refusal, 'title'), undefined);
  /* And the foot says nothing, because the field already carries it. */
  assert.equal(field.loose(refusal, ['title', 'amount']), null);
});

test('EVERY SPELLING THE RECORD USES FOR ONE FIELD is that field', () => {
  for (const at of ['amount', 'fields.amount', 'jars.fields.amount', 'amount[2]', 'amount.amount'])
    assert.equal(field.errorFor({ fix: 'No.', at }, 'amount'), 'No.', at);
  assert.equal(field.errorFor({ fix: 'No.', at: 'amounts' }, 'amount'), undefined, 'a longer name is another field');
  assert.equal(field.errorFor({ fix: 'No.', at: 'jars' }, 'amount'), undefined);
});

test('A REFUSAL THAT NAMES NO FIELD OF THE FORM goes to its foot, said once', () => {
  assert.equal(field.loose({ fix: 'The jars list is full.' }, ['title', 'amount']), 'The jars list is full.');
  assert.equal(field.loose({ fix: 'The jars list is full.', at: 'jars' }, ['title']), 'The jars list is full.');
  assert.equal(field.loose(null, ['title']), null);
  assert.equal(field.errorFor({ fix: 'The jars list is full.' }, 'title'), undefined);
});

/** The form's source without its comments, so a comment quoting old markup cannot fail or pass a check. */
const FORM = readFileSync(new URL('RowForm.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const markup = FORM.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, '');

test('THE ROW FORM DRAWS EVERY FIELD THROUGH THE ONE FIELD, and no label or line by hand', () => {
  assert.match(FORM, /import Field from '\.\/Field\.svelte';/u, 'the field is not imported');
  assert.match(markup, /<Field\b/u, 'no field is drawn through it');
  assert.doesNotMatch(markup, /<label class="row-label"/u, 'a label is still drawn by hand');
  assert.doesNotMatch(markup, /class="row-why"/u, 'a line is still drawn by hand');
  /* Its refusal goes in by field, and what names none comes out for the foot. */
  assert.match(FORM, /errorFor\(/u);
  assert.match(FORM, /loose\(/u);
});
