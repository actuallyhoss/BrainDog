/**
 * An add-on's settings fit on a phone (the audit of 25 October, Y10): the Money add-on drew fourteen empty "Most …"
 * limit boxes, each followed by "Takes effect now.", 4,000 px of the same two lines. The set ones are shown, the blank
 * limits fold under "More limits", and when they take hold is said once at the foot.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { foldOf, sharedNotes } from './fold.ts';
import { holdsFoot } from './takes-hold.ts';

const LIMIT = { type: 'money' } as const;

test('blank limits fold, the set ones and every other kind stay out', () => {
  const config = {
    heading: { type: 'text' },
    most_clay: LIMIT,
    most_glaze: LIMIT,
    most_kiln: LIMIT,
    most_wood: { type: 'number' },
    most_fuel: { type: 'money', default: { amount: 100, currency: 'EUR' } },
  } as const;
  const got = foldOf(Object.entries(config), { most_glaze: { amount: 5000, currency: 'EUR' } });
  assert.deepEqual(got.shown, ['heading', 'most_glaze', 'most_fuel']);
  assert.deepEqual(got.folded, ['most_clay', 'most_kiln', 'most_wood']);
  assert.equal(got.label, 'More limits');
});

test('two blanks are not worth a fold', () => {
  const got = foldOf(Object.entries({ a: LIMIT, b: LIMIT, c: { type: 'text' } }), {});
  assert.deepEqual(got.shown, ['a', 'b', 'c']);
  assert.deepEqual(got.folded, []);
});

test('a note three settings share is said once, and a setting own note stays under it', () => {
  const same = 'Held to this once it is kept.';
  const entries = Object.entries({
    a: { type: 'money', note: same },
    b: { type: 'money', note: same },
    c: { type: 'money', note: same },
    d: { type: 'text', note: 'The heading over the kiln.' },
  });
  assert.deepEqual(sharedNotes(entries), [same]);
  assert.deepEqual(sharedNotes(entries.slice(0, 2)), []);
});

test('when settings take hold is said once, at the foot', () => {
  const names = { most_clay: 'Most clay', heading: 'Heading', shade: 'Shade' };
  assert.equal(holdsFoot({ most_clay: 'now' }, names, 'Kiln'), 'Each setting takes effect as soon as it is saved.');
  assert.equal(holdsFoot({ heading: 'next-update', shade: 'next-update' }, names, 'Kiln'), 'Each setting takes effect when Kiln next updates.');
  assert.equal(
    holdsFoot({ most_clay: 'now', heading: 'next-update', shade: 'next-update' }, names, 'Kiln'),
    'Each setting takes effect as soon as it is saved, but Heading and Shade wait until Kiln next updates.',
  );
  assert.equal(holdsFoot(null, names, 'Kiln'), null);
  assert.equal(holdsFoot({}, names, 'Kiln'), null);
});
