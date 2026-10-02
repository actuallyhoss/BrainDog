/**
 * The words for adding, renaming and retiring a field say the person's own things and never the system's: no "row", no
 * "list", no "register", no "block" in anything a person reads (DIRECTION §35). A list somebody named is said by its
 * name, which the caller hands in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DURATION_WORDS, fieldWords, KIND_WORDS, kindSaid, SHEET_KIND_WORDS, sheetWords } from './field-words.ts';

const SYSTEM = /\b(rows?|lists?|registers?|blocks?|entity|entities|field id)\b/iu;

/** Every sentence a set of words can say, with the person's own names filled in. */
function said(words: Record<string, unknown>): string[] {
  return Object.values(words).flatMap((w) => (typeof w === 'string' ? [w] : typeof w === 'function' ? [String(w('Website', 'Suppliers', 'Kiln'))] : []));
}

test('nothing a person reads about a field names the system', () => {
  for (const line of [...said(fieldWords), ...said(sheetWords), ...said(KIND_WORDS), ...said(SHEET_KIND_WORDS), ...said(DURATION_WORDS)])
    assert.doesNotMatch(line, SYSTEM, `"${line}" says a system word`);
});

test("a list is said by the name its owner gave it", () => {
  assert.equal(sheetWords.title('Suppliers'), 'What Suppliers holds');
  assert.equal(fieldWords.question('Website', 'Suppliers'), 'Add a field called Website to Suppliers?');
  assert.equal(fieldWords.added('Website'), 'Everything here has Website now.');
});

test('the kind of a field already there is said in words, and a link by what it points at', () => {
  const name = (id: string) => (id === 'vendors' ? 'Suppliers' : id);
  assert.equal(kindSaid({ type: 'ref', to: 'vendors' }, name), 'Link to Suppliers');
  assert.equal(kindSaid({ type: 'list', of: 'ref', to: 'vendors' }, name), 'Links to Suppliers');
  assert.equal(kindSaid({ type: 'list', of: 'text' }, name), 'Tags');
  for (const t of ['list', 'enum', 'money', 'nonsense']) assert.doesNotMatch(kindSaid({ type: t }, name), SYSTEM);
});
