/**
 * "Who are you?", read deterministically. Every case is a sentence a person could type into the
 * first field of the product, including the four chips on their own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from './copy.ts';
import { STARTING_POINTS } from './first-run.ts';
import { hear, heardAt, introduce, nameFromAddress, personRow, withChip } from './who.ts';

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
  for (const chip of STARTING_POINTS) assert.deepEqual(hear(chip), { name: null, bio: chip }, chip);
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

test('EVERY PERSON WHO SETS UP IS THE FIRST ENTRY IN PEOPLE, unless People is off', () => {
  const on = [{ id: 'people', disabled_at: null }];
  const heard = hear('Sami, I run a studio');
  assert.deepEqual(introduce(heard, 'sami@example.com', on), { name: 'Sami', email: 'sami@example.com', where: 'onboarding' });
  assert.deepEqual(introduce(heard, null, on), { name: 'Sami', where: 'onboarding' });
  /* NO NAME TYPED: the one answered, else the one in the address (the chip alone made nobody). */
  const student = hear("I'm a student");
  assert.deepEqual(introduce(student, 'l.haddad@example.com', on, { answered: 'Layla' }), { name: 'Layla', email: 'l.haddad@example.com', where: 'onboarding' });
  const address = { address: true };
  assert.deepEqual(introduce(student, 'layla.haddad+uni@example.com', on, address), { name: 'Layla Haddad', email: 'layla.haddad+uni@example.com', where: 'onboarding' });
  assert.deepEqual(introduce(student, 'layla.haddad@example.com', on, { answered: '  ', address: true }), { name: 'Layla Haddad', email: 'layla.haddad@example.com', where: 'onboarding' }, 'a blank answer is no answer');
  assert.equal(introduce(student, 'layla.haddad@example.com', on), null, 'the address is read only where the caller asks');
  assert.equal(introduce(student, '1987@example.com', on, address), null, 'no name anywhere, no entry');
  assert.equal(introduce(student, null, on, address), null);
  assert.equal(introduce(heard, null, [{ id: 'people', disabled_at: '2026-09-15T10:00:00.000Z' }]), null, 'People is off');
  assert.equal(introduce(heard, null, [{ id: 'work', disabled_at: null }]), null, 'People is not installed');
  assert.equal(introduce(heard, null, null), null, 'the record did not say');
});

test('THE NAME IN AN ADDRESS is its words, with capitals, and never its digits', () => {
  assert.equal(nameFromAddress('mariam.saleh@example.com'), 'Mariam Saleh');
  assert.equal(nameFromAddress('karim_92@example.com'), 'Karim');
  assert.equal(nameFromAddress('élodie-marchand@example.fr'), 'Élodie Marchand');
  assert.equal(nameFromAddress('2024@example.com'), null);
  assert.equal(nameFromAddress(''), null);
  assert.equal(nameFromAddress(null), null);
});

test('WHERE THE NAME AND EACH PHRASE SIT IN THE SENTENCE AS TYPED, so the screen lights the very words', () => {
  const said = "I'm Mariam. I run a small candle shop";
  const at = heardAt(said);
  assert.deepEqual(at.name, [4, 10]);
  assert.equal(said.slice(...at.name!), 'Mariam');
  const bio = hear(said).bio;
  const shop = bio.indexOf('candle shop');
  assert.equal(said.slice(...at.bio(shop, 'candle shop'.length)), 'candle shop');
  /* TWO SPACES AND A LINE BREAK, which the bio reads as one space, still land on the typed words. */
  const loose = '  Sami,\n  I run   a   studio  ';
  const where = heardAt(loose);
  assert.equal(loose.slice(...where.name!), 'Sami');
  const studio = hear(loose).bio.indexOf('a studio');
  assert.equal(loose.slice(...where.bio(studio, 'a studio'.length)), 'a   studio');
  /* NO NAME: the bio is the whole sentence, and a greeting is passed over. */
  assert.equal(heardAt('I run a studio').name, null);
  assert.deepEqual(heardAt("Hi, I'm Sami.").name, [8, 12]);
});

test('THE DEMO ROW carries the name and the bio', () => {
  assert.deepEqual(personRow({ name: 'Sami', where: 'onboarding' }, 'I run a studio'), { name: 'Sami', note: 'I run a studio' });
  assert.deepEqual(personRow({ name: 'Sami', email: 'h@example.com', where: 'onboarding' }, ''), { name: 'Sami', email: 'h@example.com' });
});

test('"I" IS NEVER PART OF A NAME', () => {
  assert.deepEqual(hear("I'm Sami I freelance"), { name: 'Sami', bio: 'I freelance' });
});

test('A NAME ENDS AT ITS FULL STOP, and an initial is still part of one', () => {
  assert.deepEqual(hear("Hi, I'm Tom. We run a little coffee shop"), { name: 'Tom', bio: 'We run a little coffee shop' });
  assert.deepEqual(hear("I'm Mariam. I run a small candle shop"), { name: 'Mariam', bio: 'I run a small candle shop' });
  assert.deepEqual(hear("I'm S. Marchetti, I teach"), { name: 'S. Marchetti', bio: 'I teach' });
});
