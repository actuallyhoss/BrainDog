/**
 * An add-on from outside that fewer than ten records hold is "New", not a hidden count; from ten up the rounded count
 * is said, and a built-in says neither. The store's index and counts are plain objects; the add-ons are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roundCount } from '@braindog/declare/kennel';

import { listingsOf } from './listing.ts';
import { words } from './words.ts';

const entry = (id: string) => ({
  kind: 'pack' as const,
  id,
  title: id,
  summary: `${id} does a thing`,
  author: 'Halden',
  license: 'MIT',
  audience: 'addon' as const,
  latest: '1.0.0',
  versions: [{ version: '1.0.0', checksum: 'a'.repeat(64), bytes: 10, published_at: '2026-10-01T09:00:00Z', bump: null, reach: { modules: [], lists: [], pages: [], rules: [], examples: 0, skills: [], calls_out: [] } }],
});

test('a new add-on from outside is New until ten records hold it, then the rounded count is said', () => {
  const kennel = { format: 1, name: 'Kennel', entries: [entry('fresh-one'), entry('settled-one')] } as never;
  /* THE COUNTS FILE LEAVES OUT ANYTHING UNDER TEN (`readCounts`), so a fresh add-on has no key at all. */
  const counts: Record<string, number> = {};
  const settled = roundCount(57);
  assert.equal(settled, 50);
  counts['pack:settled-one'] = settled as number;
  const all = listingsOf({ kennel, counts });
  const of = (id: string) => all.find((l) => l.id === id);
  assert.equal(words.held(of('fresh-one')?.count ?? null, 'kennel'), 'New in the store');
  assert.equal(words.held(of('settled-one')?.count ?? null, 'kennel'), 'On 50+ BrainDogs');
});

test('nothing is said for a built-in with no count, and nothing under ten is ever a number', () => {
  assert.equal(words.held(null, 'bundled'), null);
  assert.equal(roundCount(9), null);
  assert.equal(roundCount(10), 10);
  assert.equal(words.held(roundCount(9), 'kennel'), 'New in the store');
});
