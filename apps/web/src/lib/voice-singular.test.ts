/**
 * A renamed list's singular is the record's: the rule `voice.ts` says it by is `singularOf` in
 * `packages/record/src/slash.ts`, word for word, so Slash renaming a list and a screen renaming it give one word.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NOT_PLURAL, inSentence, oneOf, relabel, singularOf } from './voice.ts';

const SLASH = readFileSync(new URL('../../../../packages/record/src/slash.ts', import.meta.url), 'utf8');
const VOICE = readFileSync(new URL('./voice.ts', import.meta.url), 'utf8');

/** The source of the arrow that turns the last word, spaces folded, from either file. */
const turnedIn = (src: string): string => {
  const m = /const turned = \(\(\): string \| null => \{[\s\S]*?\}\)\(\);/u.exec(src);
  assert.ok(m, 'the turning rule is where it was');
  return m[0].replace(/\s+/gu, ' ');
};

/** The words of a `NOT_PLURAL` set, from either file. */
const notPluralIn = (src: string): string[] => {
  const m = /const NOT_PLURAL: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\);/u.exec(src);
  assert.ok(m, 'the list of words not to cut is where it was');
  return [...m[1]!.matchAll(/'([^']+)'/gu)].map((w) => w[1]!).sort();
};

test('THE TURNING RULE AND THE WORDS IT LEAVES ALONE ARE THE RECORD’S, character for character', () => {
  assert.equal(turnedIn(VOICE), turnedIn(SLASH));
  assert.deepEqual(notPluralIn(VOICE), notPluralIn(SLASH));
  assert.deepEqual([...NOT_PLURAL].sort(), notPluralIn(SLASH));
  const sentence = (src: string) => /const inSentence = \(name: string\): string => (.*);/u.exec(src)?.[1];
  assert.equal(sentence(VOICE), sentence(SLASH));
});

test('ONE OF A LIST, AS SLASH SAYS IT: the last word turns, a name keeps its case, and a name that does not say is null', () => {
  const cases: [string, string | null][] = [
    ['Issues', 'issue'],
    ['HSBC cards', 'HSBC card'],
    ['Deliveries', 'delivery'],
    ['Boxes', 'box'],
    ['APIs', 'API'],
    ['iPhones', 'iPhone'],
    ['Series', null],
    ['Movies', null],
    ['People', null],
    ['Status', null],
    ['', null],
  ];
  for (const [name, one] of cases) assert.equal(oneOf(name), one, name);
  assert.equal(inSentence('Client HSBC cards'), 'client HSBC cards');
});

test('A RENAMED LIST SAYS ITS OWN WORD, and where the ending does not say, the name itself and never the old singular', () => {
  const tickets = { id: 'tickets', name: 'Tickets', one: 'ticket' };
  assert.equal(relabel(tickets, { tickets: 'HSBC cards' }).one, 'HSBC card', 'it was "hsbc card"');
  assert.equal(relabel(tickets, { tickets: 'Boxes' }).one, 'box', 'it was "boxe"');
  assert.equal(relabel(tickets, { tickets: 'Series' }).one, 'series', 'it was "sery"');
  assert.equal(singularOf('News'), 'news');
});
