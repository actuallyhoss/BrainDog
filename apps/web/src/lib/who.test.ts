/**
 * "Who are you?", read deterministically. Every case is a sentence a person could type into the
 * first field of the product, including the four chips on their own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from './copy.ts';
import { firstRun } from './first-run.ts';
import { hear, introduce, personRow, withChip } from './who.ts';

test('A NAME BEFORE A COMMA, and the rest kept as the bio', () => {
  assert.deepEqual(hear('Sami, I run BrainDog and a couple of side projects.'), {
    name: 'Sami',
    bio: 'I run BrainDog and a couple of side projects.',
  });
  assert.deepEqual(hear('Sami I run a studio'), { name: 'Sami', bio: 'I run a studio' });
  assert.deepEqual(hear('Ludwig van Beethoven, I compose'), { name: 'Ludwig van Beethoven', bio: 'I compose' });
});

test('"I\'m Sami", with and without more after it', () => {
  assert.deepEqual(hear("I'm Sami"), { name: 'Sami', bio: '' });
  assert.deepEqual(hear("I'm Sami, I freelance"), { name: 'Sami', bio: 'I freelance' });
  assert.deepEqual(hear("Hi, I'm Sami."), { name: 'Sami', bio: '' });
  assert.deepEqual(hear("I am Sam O'Neill, I build furniture"), { name: "Sam O'Neill", bio: 'I build furniture' });
});

test('A LOWERCASE NAME is kept as typed, and only where the sentence puts a name', () => {
  assert.deepEqual(hear('sami, I run a studio'), { name: 'sami', bio: 'I run a studio' });
  /* Not after "I'm": that is where a chip's own words go. */
  assert.deepEqual(hear("i'm sami"), { name: null, bio: "i'm sami" });
});

test('A NAME WITH AN ACCENT', () => {
  assert.deepEqual(hear('Élodie Marchand, I run a bakery in Lyon'), { name: 'Élodie Marchand', bio: 'I run a bakery in Lyon' });
  assert.deepEqual(hear('Zoë I freelance'), { name: 'Zoë', bio: 'I freelance' });
});

test('NO NAME, and the whole sentence is the bio', () => {
  assert.deepEqual(hear('I run a studio'), { name: null, bio: 'I run a studio' });
  assert.deepEqual(hear('yes, I run a studio'), { name: null, bio: 'yes, I run a studio' });
  assert.deepEqual(hear('Maria and I run a studio'), { name: null, bio: 'Maria and I run a studio' });
  assert.deepEqual(hear(''), { name: null, bio: '' });
});

test('A SENTENCE THAT IS ONLY A CHIP names nobody', () => {
  for (const chip of firstRun.whoChips) assert.deepEqual(hear(chip), { name: null, bio: chip }, chip);
});

test('ONE LINE, whatever the field was given', () => {
  assert.deepEqual(hear('  Sami,\n  I run   a studio  '), { name: 'Sami', bio: 'I run a studio' });
});

test('A CHIP APPENDS WORDS, as a clause of what is there', () => {
  assert.equal(withChip('', 'I freelance'), 'I freelance');
  assert.equal(withChip('Sami', 'I freelance'), 'Sami, I freelance');
  assert.equal(withChip('Sami, ', 'I freelance'), 'Sami, I freelance');
  assert.equal(withChip('Sami, I run a studio.', "I'm part of a team"), "Sami, I run a studio. I'm part of a team");
  assert.deepEqual(hear(withChip('Sami', 'I run a studio')), { name: 'Sami', bio: 'I run a studio' });
});

test('THE PEOPLE ROW IS ASKED FOR ONLY WITH A NAME AND WITH PEOPLE ON', () => {
  const on = [{ id: 'people', disabled_at: null }];
  const heard = hear('Sami, I run a studio');
  assert.deepEqual(introduce(heard, 'sami@example.com', on), { name: 'Sami', email: 'sami@example.com', where: 'onboarding' });
  assert.deepEqual(introduce(heard, null, on), { name: 'Sami', where: 'onboarding' });
  assert.equal(introduce(hear('I run a studio'), 'sami@example.com', on), null, 'no name, no row');
  assert.equal(introduce(heard, null, [{ id: 'people', disabled_at: '2026-09-15T10:00:00.000Z' }]), null, 'People is off');
  assert.equal(introduce(heard, null, [{ id: 'work', disabled_at: null }]), null, 'People is not installed');
  assert.equal(introduce(heard, null, null), null, 'the record did not say');
});

test('THE DEMO ROW carries the name and the bio', () => {
  assert.deepEqual(personRow({ name: 'Sami', where: 'onboarding' }, 'I run a studio'), { name: 'Sami', note: 'I run a studio' });
  assert.deepEqual(personRow({ name: 'Sami', email: 'h@example.com', where: 'onboarding' }, ''), { name: 'Sami', email: 'h@example.com' });
});

test('"I" IS NEVER PART OF A NAME', () => {
  assert.deepEqual(hear("I'm Sami I freelance"), { name: 'Sami', bio: 'I freelance' });
});
