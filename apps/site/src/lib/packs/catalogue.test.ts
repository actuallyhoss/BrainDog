/**
 * The plugin store's cards: who made one is the catalogue's word, never the file's, and the categories the store
 * offers as its one control.
 *
 *   node --test apps/site/src/lib/packs/catalogue.test.ts
 *
 * "MADE BY BRAINDOG" IS A CLAIM A STRANGER TRUSTS, so it rests on `publisher.kind`, which only the catalogue writes,
 * and not on `author`, which anybody can type. A planted listing with BrainDog as its author line and a person as its
 * publisher is the fault this would let through.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cardOf, entriesOf, filtersOf, type Card } from './catalogue.ts';

const version = { version: '1.0.0', published_at: '2026-10-01T00:00:00Z', bump: null, reach: { lists: ['rents'], pages: [], rules: [] } };

const entry = (id: string, publisher: unknown, author = 'BrainDog', categories = ['modules', 'made-by-braindog']) => ({
  kind: 'pack',
  id,
  title: id,
  summary: 'One line.',
  author,
  license: 'Apache-2.0',
  latest: '1.0.0',
  versions: [version],
  categories,
  ...(publisher === undefined ? {} : { publisher }),
});

const cards = (doc: unknown): Card[] =>
  entriesOf(doc)
    .map((e) => cardOf(e, new Map(), null))
    .filter((c): c is Card => c !== null);

test('made by BrainDog only where the catalogue says BrainDog published it', () => {
  const [ours, typed, keyed, none] = cards({
    format: 1,
    entries: [
      entry('ours', { kind: 'braindog', id: 'braindog', name: 'BrainDog' }),
      entry('typed', { kind: 'person', id: 'p1', name: 'BrainDog' }),
      entry('keyed', { kind: 'key', id: 'k1', name: 'Sam' }, 'Sam'),
      entry('none', undefined),
    ],
  });
  assert.equal(ours?.ours, true);
  assert.equal(typed?.ours, false, 'a person who calls themself BrainDog is not BrainDog');
  assert.equal(keyed?.ours, false);
  assert.equal(keyed?.publisher, 'Sam');
  assert.equal(none?.ours, false, 'no publisher is not BrainDog either');
});

test('a card says what kind of listing it is', () => {
  const [card] = cards({ format: 1, entries: [{ ...entry('rent', { kind: 'braindog', id: 'braindog', name: 'BrainDog' }), kind: 'usecase' }] });
  assert.equal(card?.kind, 'usecase');
  assert.equal(card?.slug, 'usecase-rent');
});

test('the control offers what a plugin does, never who made it', () => {
  const all = cards({
    format: 1,
    entries: [
      entry('a', { kind: 'braindog', id: 'braindog', name: 'BrainDog' }, 'BrainDog', ['modules', 'made-by-braindog']),
      entry('b', { kind: 'braindog', id: 'braindog', name: 'BrainDog' }, 'BrainDog', ['automations', 'made-by-braindog']),
    ],
  });
  const offered = filtersOf(all).map((f) => f.category);
  assert.deepEqual(offered, ['modules', 'automations']);
  assert.ok(!offered.includes('made-by-braindog'));
});
