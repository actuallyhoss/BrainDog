/**
 * A Windows path is not a line break somebody forgot to decode.
 *
 * THE IMPORT OF A REAL EXPORT WAS REFUSED ON TWO ROWS FOR IT. `loop/research-import-real.md` (finding 1) measured two
 * agent runs refused on `cwd` with `TEXT_ESCAPED_NEWLINE`: both values began with a drive letter, both had a folder
 * whose name starts with `n`, and so both held the two characters backslash and `n` with no line break anywhere. 186 of
 * the 198 `cwd` values in that export were Windows paths, and every one whose folder happens to start with `n` would
 * have been refused, with a repair ("send a real newline") that nobody can apply to a path.
 *
 * AND THE REFUSAL IT EXISTS FOR STAYS. A multi-line text that was JSON-encoded once too often reads as a sentence with
 * `\n` in it; it does not begin with a drive letter, a UNC share or `.\`, and it usually carries a space-free run, a
 * quote or a colon a Windows path cannot hold. Every path here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coerce } from '../src/coerce.ts';
import type { FieldDecl } from '../src/coerce.ts';

const text: FieldDecl = { id: 'cwd', type: 'text' };
const code = (value: string): string | null => {
  const out = coerce(text, value, {});
  return out.ok ? null : out.refusal.code;
};

test('A WINDOWS PATH WITH A FOLDER STARTING WITH n IS STORED AS IT ARRIVED', () => {
  for (const path of [
    'C:\\Work\\notes',
    'D:\\nightly',
    'e:\\Projects\\new-site\\src',
    'C:\\Users\\Someone\\Documents\\n',
    'C:\\Program Files\\Northwind App',
    'C:/Work\\notes',
    '\\\\fileserver\\notes\\2026',
    '\\\\?\\C:\\very\\long\\name',
    '\\\\?\\UNC\\fileserver\\notes',
    '.\\node_modules',
    '..\\notes',
  ])
    assert.equal(code(path), null, `${path} was refused as an escaped newline`);
});

test('A DOUBLE-ENCODED MULTI-LINE TEXT IS STILL REFUSED', () => {
  for (const escaped of [
    'Paid on Tuesday\\nchased twice',
    'first\\nsecond',
    'line one\\n\\nline three',
    'see C:\\Work\\notes\\nthen ask',
    'C: is full\\nclean it',
    'He said \\"no\\"\\nand left',
    'Work\\notes',
    '\\notes',
    '\\\\nfirst line\\nsecond line',
  ])
    assert.equal(code(escaped), 'TEXT_ESCAPED_NEWLINE', `${escaped} was accepted`);
});

test('a path-shaped value that a Windows path cannot be is refused', () => {
  /* A quote, a pipe, a second colon or a tab after the drive is not a Windows filename, so the value is
     text that happens to open with a drive letter, and the refusal it would have had stands. */
  for (const escaped of ['C:\\Work\\n"quoted"', 'C:\\a\\nb|c', 'C:\\notes\\nat 10:30', 'C:\\notes\\n\tindented'])
    assert.equal(code(escaped), 'TEXT_ESCAPED_NEWLINE', `${escaped} was accepted`);
});
