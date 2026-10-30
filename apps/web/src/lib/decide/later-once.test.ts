/**
 * ONE RULE FOR LATER, ON A CARD AND ON ITS QUESTION'S PAGE (audit of 31 October, A24): the chase card in Needs you drew
 * "Chase £4,800", "Not yet" and Later, and the same question opened drew no Later, because the page counted "Not yet" as
 * a Later of the asker's own. It also said "6h ago" where the card said "3 Sep".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askedDay, putsOff } from './card.ts';

test('only an answer that puts the question off is a Later; "Not yet" on a chase is an answer', () => {
  for (const said of ['Later', 'Not now', 'Ask me later', 'maybe later.']) assert.equal(putsOff(said), true, said);
  for (const said of ['Not yet', 'Chase £4,800', 'Keep it']) assert.equal(putsOff(said), false, said);
});

test('the day a question was asked reads as its card says it', () => {
  assert.equal(askedDay('2026-09-03T06:00:00.000Z'), '3 Sep');
  assert.equal(askedDay('not a day'), '');
});

test('the question\'s page asks the card\'s rule for its Later and says a money row\'s day as the card does', () => {
  const page = readFileSync(new URL('../../routes/decide/[id]/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /\.some\(\(o\) => putsOff\(o\.title\)\)/u);
  assert.match(page, /moneyRow \? askedDay\(question\.opened\)/u);
});
