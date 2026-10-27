/**
 * What a plain line in the palette says besides its words: a day, a project, a priority, who holds it and an
 * amount, each read only where the list it goes into has the field, and each given back as words by `untoken`.
 *
 * THE LISTS ARE WRITTEN HERE, invented, so each rule is driven by the field types alone and nothing leans on a pack.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RegisterDecl } from '../record/schema.ts';
import { chipFields, tokensOf, untoken } from './tokens.ts';

/** Wednesday 14 October 2026 at noon, on the reader's own clock. */
const NOW = new Date(2026, 9, 14, 12).getTime();

const decl = (fields: RegisterDecl['fields'], extra: Partial<RegisterDecl> = {}): RegisterDecl =>
  ({ id: 'chores', name: 'Chores', one: 'chore', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields], ...extra }) as RegisterDecl;

const WITH_DAY = decl([{ id: 'due', type: 'day' }]);
const WITH_PROJECT = decl([{ id: 'due', type: 'day' }, { id: 'project', type: 'ref', to: 'plots', label: 'Project' }]);
const PLAIN = decl([]);
const PLOTS = new Map([[3, 'Kiln Lane allotment'], [4, 'Orchard']]);
const names = (register: string) => (register === 'plots' ? PLOTS : undefined);

test('"call the bank tomorrow" is "call the bank", with a day chip holding tomorrow\'s date', () => {
  const read = tokensOf('call the bank tomorrow', { decl: WITH_DAY, now: NOW });
  assert.equal(read.text, 'call the bank');
  assert.equal(read.chips.length, 1);
  const [day] = read.chips;
  assert.equal(day?.kind, 'day');
  assert.equal(day?.field, 'due');
  assert.equal(day?.value, '2026-10-15');
  assert.equal(day?.label, 'tomorrow', 'the chip says what was typed');
  assert.equal(day?.said, 'due Thu 15 Oct');
  assert.equal('call the bank tomorrow'.slice(day!.from, day!.to), 'tomorrow');
  assert.deepEqual(chipFields(read.chips), { due: '2026-10-15' });
});

test('a day is read at the end only, after "by" too, and a list with no day reads the line as its words', () => {
  assert.equal(tokensOf('write the monday newsletter', { decl: WITH_DAY, now: NOW }).chips.length, 0);
  const by = tokensOf('pay the plumber by fri', { decl: WITH_DAY, now: NOW });
  assert.equal(by.text, 'pay the plumber');
  assert.equal(by.chips[0]?.value, '2026-10-16');
  assert.equal(by.chips[0]?.label, 'fri');
  assert.equal(tokensOf('sort the shed next week', { decl: WITH_DAY, now: NOW }).chips[0]?.value, '2026-10-19');
  assert.deepEqual(tokensOf('call the bank tomorrow', { decl: PLAIN, now: NOW }), { text: 'call the bank tomorrow', chips: [] });
  /* A LINE THAT WOULD BE LEFT WITH NO WORDS IS NOT READ AT ALL. */
  assert.deepEqual(tokensOf('tomorrow', { decl: WITH_DAY, now: NOW }), { text: 'tomorrow', chips: [] });
});

test('#kiln names the project field only when the list has one', () => {
  const read = tokensOf('dig the beds #kiln tomorrow', { decl: WITH_PROJECT, now: NOW, names });
  assert.equal(read.text, 'dig the beds');
  assert.deepEqual(
    read.chips.map((c) => [c.kind, c.field, c.value, c.label]),
    [
      ['project', 'project', 3, 'Kiln Lane allotment'],
      ['day', 'due', '2026-10-15', 'tomorrow'],
    ],
  );
  /* NO PROJECT FIELD, OR A NAME NO PROJECT HAS: the `#word` stays in the words. */
  assert.equal(tokensOf('dig the beds #kiln', { decl: WITH_DAY, now: NOW, names }).text, 'dig the beds #kiln');
  assert.equal(tokensOf('dig the beds #quarry', { decl: WITH_PROJECT, now: NOW, names }).text, 'dig the beds #quarry');
});

test('@name names a person where the list holds a person\'s link, and an amount is read only with its currency', () => {
  const owed = decl([{ id: 'who', type: 'ref', to: 'neighbours' }, { id: 'amount', type: 'money' }], { hand: { person: 'who' } } as Partial<RegisterDecl>);
  const neighbours = (register: string) => (register === 'neighbours' ? new Map([[7, 'Tamsin Rook']]) : undefined);
  const read = tokensOf('return the ladder @tam EGP 450', { decl: owed, now: NOW, names: neighbours });
  assert.equal(read.text, 'return the ladder');
  assert.deepEqual(
    read.chips.map((c) => [c.kind, c.value]),
    [
      ['person', 7],
      ['amount', { amount: 45000, currency: 'EGP' }],
    ],
  );
  assert.equal(read.chips[1]?.label, 'EGP 450.00');
  assert.deepEqual(tokensOf('seeds £12.50 from the market', { decl: owed, now: NOW }).chips[0]?.value, { amount: 1250, currency: 'GBP' });
  /* A BARE NUMBER HAS NO CURRENCY, so it is words, and money is never written in a guessed one. */
  assert.equal(tokensOf('buy 3 trays', { decl: owed, now: NOW }).chips.length, 0);
  assert.equal(tokensOf('buy 3 trays EGP 4.505', { decl: owed, now: NOW }).chips.length, 0, 'more places than the currency counts in');
});

test('untoken gives a chip back as its own words, and words given back stay words', () => {
  const line = 'call the bank tomorrow';
  const read = tokensOf(line, { decl: WITH_DAY, now: NOW });
  const [day] = read.chips;
  assert.equal(untoken(read.text, day!), line);
  assert.equal(untoken('', day!), 'tomorrow');
  assert.deepEqual(tokensOf(line, { decl: WITH_DAY, now: NOW }, ['tomorrow']), { text: line, chips: [] });
});
