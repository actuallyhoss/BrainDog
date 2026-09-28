/**
 * Every starter use case's voice, held to the phone it is read on (PGS-24): a line that names a tab fits the tab bar's
 * label, and every line wraps inside the 358px column at 390.
 *
 * THE TAB BAR DRAWS HOME, DECIDE AND THE INBOX SIDE BY SIDE, and a label longer than its tab is cut off mid-word, so a
 * use case's name for one of them is held to `VOICE_TAB_CHARS`. The same limit refuses a use case file a stranger
 * shares (`normaliseUseCase`), and this holds the ones the build ships to it, the house lines included.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES, VOICE_KEYS } from '@braindog/seed/usecases';
import { VOICE_TAB_CHARS, VOICE_TAB_KEYS } from '@braindog/declare';

import { VOICE_LINES } from './voice.ts';

/**
 * THE LONGEST WORD THAT STILL WRAPS IN THE PHONE'S COLUMN. A sentence breaks at its spaces, so a line of any length
 * wraps inside 358px; a single word does not, and one longer than this would run past the column's edge.
 */
const LONGEST_WORD = 24;

test('EVERY LINE THAT NAMES A TAB FITS THE TAB BAR, in every use case and in the house voice', () => {
  for (const key of VOICE_TAB_KEYS) {
    assert.ok((VOICE_KEYS as readonly string[]).includes(key), `${key} is a voice key`);
    assert.ok([...VOICE_LINES[key]].length <= VOICE_TAB_CHARS, `the house ${key} fits its tab`);
    for (const u of USE_CASES) {
      const line = (u.voice as Readonly<Record<string, string | undefined>>)[key];
      if (line !== undefined) assert.ok([...line].length <= VOICE_TAB_CHARS, `${u.usecase}: ${key} "${line}" is longer than a tab`);
    }
  }
});

test('EVERY VOICE LINE WRAPS INSIDE THE PHONE COLUMN: no word is too long to break', () => {
  for (const u of USE_CASES)
    for (const [key, line] of Object.entries(u.voice as Readonly<Record<string, string | undefined>>)) {
      if (line === undefined) continue;
      const longest = line.split(/\s+/u).reduce((most, word) => Math.max(most, [...word].length), 0);
      assert.ok(longest <= LONGEST_WORD, `${u.usecase}: ${key} has a word too long to wrap`);
    }
});

test('EVERY STARTER USE CASE SAYS MORE THAN ITS HEADINGS: an empty line of Home is its own', () => {
  const emptyLines = ['nothing_now', 'nothing_due', 'fills_with', 'nothing_waiting', 'record_empty', 'no_questions', 'inbox_clear'];
  for (const u of USE_CASES) {
    const voice = u.voice as Readonly<Record<string, string | undefined>>;
    assert.ok(
      emptyLines.some((key) => voice[key] !== undefined),
      `${u.usecase} says none of the empty lines its own way`,
    );
  }
});
