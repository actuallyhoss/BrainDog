/**
 * The note an import leaves, cleaned on the way in: the status line and name heading go, a chips block stays only when
 * every value is real, and "Key: value" metadata moves into a declared field or is dropped. Real sentences always stay.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanImportedNote, type NoteFields } from '../src/note-clean.ts';

const NONE: NoteFields = { text: new Set(), closed: new Map() };
const LISTED: NoteFields = { text: new Set(['repo']), closed: new Map([['lane', new Set(['ship', 'idea'])]]) };

test('THE STATUS LINE AND A HEADING REPEATING THE NAME ARE NOT CARRIED, AND THE PROSE IS', () => {
  const got = cleanImportedNote('# Lanternfish\n\nStatus in Old Tool: live. Kind: work.\n\nFan pages that pay their makers.', 'Lanternfish', NONE);
  assert.equal(got.note, 'Fan pages that pay their makers.');
  assert.deepEqual(got.moved, {});
});

test('A CHIPS BLOCK WITH AN UNFILLED SLOT GOES, AND ONE WITH REAL VALUES STAYS', () => {
  const slotted = 'Intro line.\n\n```chips\ndollar | {{revenue.monthly}} | Monthly | good\nusers | 12 | Fans | info\n```\n\nAfter line.';
  assert.equal(cleanImportedNote(slotted, 'X', NONE).note, 'Intro line.\n\nAfter line.');
  const real = 'Intro line.\n\n```chips\nusers | 12 | Fans | info\n```';
  assert.equal(cleanImportedNote(real, 'X', NONE).note, real);
  const code = 'Run it:\n\n```sh\necho {{name}}\n```';
  assert.equal(cleanImportedNote(code, 'X', NONE).note, code, 'only a chips block is judged by its slots');
});

test('METADATA MOVES INTO A DECLARED FIELD, A CLOSED LIST TAKES ONLY ITS OWN WORDS, AND THE REST IS DROPPED', () => {
  const note = '**Status:** building · **Lane:** ship · **Repo:** github.example/fish\n\nA real sentence stays.';
  const got = cleanImportedNote(note, 'X', LISTED);
  assert.equal(got.note, 'A real sentence stays.');
  assert.deepEqual(got.moved, { lane: 'ship', repo: 'github.example/fish' });
  const odd = cleanImportedNote('**Lane:** someday · **Repo:** r', 'X', LISTED);
  assert.deepEqual(odd.moved, { repo: 'r' }, 'a word the closed list does not hold is dropped, not sent');
});

test('A FIELD THE ROW ALREADY HAS IS NEVER OVERWRITTEN, AND A NOTE WITH NOTHING REAL LEFT COMES BACK EMPTY', () => {
  const got = cleanImportedNote('Status in Old Tool: live. Kind: work.\n**Lane:** ship · **Repo:** r', 'X', LISTED, { lane: 'idea' });
  assert.deepEqual(got.moved, { repo: 'r' });
  assert.equal(got.note, '');
});

test('A LINE WITH ONE COLON IS A SENTENCE, NOT METADATA', () => {
  const line = 'Note: the launch is set for spring.';
  assert.equal(cleanImportedNote(line, 'X', LISTED).note, line);
});
