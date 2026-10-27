/**
 * The words of the key scan (`key-scan.ts`): where a key is said in words a person reads, so the
 * figure's `why` names "an entry", never "a row", and never an id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Sql } from '@braindog/ports';

import { KEYS_IN_TEXT, KEY_SCAN_META, placeOf, readKeysInText, type KeyFinding } from '../src/key-scan.ts';

/** A record whose `dog_meta` holds the walk's state, and nothing else: `readKeysInText` reads only that. */
function holding(findings: KeyFinding[]): Sql {
  const state = { in: 'row', after: 0, pass: 2, passes: 1, finished_at: null, findings: findings.map((f, i) => ({ ...f, at: i + 1, pass: 1 })) };
  return {
    one: (q: string, key: string) => (/dog_meta/.test(q) && key === KEY_SCAN_META ? { value: JSON.stringify(state) } : undefined),
  } as unknown as Sql;
}

const WORD = /\brows?\b|\bentity\b|list item/i;

test('A PLACE IS AN ENTRY, NEVER A ROW: every shape placeOf says', () => {
  const said: Array<[KeyFinding, string]> = [
    [{ in: 'row', list: null, number: null }, 'an entry'],
    [{ in: 'row', list: 'Tasks', number: null }, 'an entry of Tasks'],
    [{ in: 'row', list: 'Tasks', number: 12 }, 'Tasks number 12'],
    [{ in: 'note', list: null, number: null }, 'a note'],
    [{ in: 'note', list: 'Tasks', number: null }, 'a note on an entry of Tasks'],
    [{ in: 'note', list: 'Tasks', number: 3 }, 'a note on Tasks number 3'],
    [{ in: 'question', list: null, number: null }, 'a question'],
    [{ in: 'question', list: null, number: 7 }, 'question 7'],
  ];
  for (const [f, words] of said) {
    assert.equal(placeOf(f), words);
    assert.ok(!WORD.test(placeOf(f)), `"${placeOf(f)}" says a word a person should not read`);
  }
});

test('THE FIGURE SAYS THE FIRST PLACE IN THOSE WORDS, and right for one', () => {
  const one = readKeysInText(holding([{ in: 'row', list: 'Clients', number: null }]), null, KEYS_IN_TEXT);
  assert.ok(one.ok);
  assert.equal(one.value.value, 1);
  assert.equal(one.value.why, 'one place holds what looks like a key, the first in an entry of Clients');

  const two = readKeysInText(holding([{ in: 'note', list: null, number: null }, { in: 'row', list: null, number: null }]), null, KEYS_IN_TEXT);
  assert.ok(two.ok);
  assert.equal(two.value.value, 2);
  assert.equal(two.value.why, '2 places hold what looks like a key, the first in an entry');
  for (const r of [one, two]) {
    assert.ok(r.ok && !WORD.test(r.value.why), 'the why says "row"');
    assert.ok(r.ok && !/—/.test(r.value.why), 'the why holds an em dash');
  }
});

test('NOTHING FOUND IS SAID PLAINLY, and a clean record reads nought', () => {
  const none = readKeysInText(holding([]), null, KEYS_IN_TEXT);
  assert.ok(none.ok);
  assert.equal(none.value.value, 0);
  assert.equal(none.value.met, true);
  assert.equal(none.value.why, 'no text on this record holds a key');
});
