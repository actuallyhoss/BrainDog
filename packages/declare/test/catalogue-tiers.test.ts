/**
 * The store's tiers on an index entry: a private add-on, an example setup and the shelf an add-on stands on. `readCatalogue`
 * keeps each only in its shape, a private entry is unlisted whatever the index says beside it, and `listedEntries` never
 * lists one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listedEntries, readCatalogue } from '../src/catalogue.ts';

const CHECKSUM = 'a'.repeat(64);
const version = { version: '1.0.0', checksum: CHECKSUM, bytes: 10, published_at: '2026-01-01T00:00:00.000Z', bump: null, reach: {} };
const entry = (kind: 'pack' | 'usecase', id: string, extra: Record<string, unknown> = {}) => ({
  kind,
  id,
  title: id,
  summary: 'Something.',
  author: 'Nobody in particular',
  license: 'MIT',
  audience: kind === 'pack' ? 'addon' : 'individual',
  latest: '1.0.0',
  versions: [version],
  ...extra,
});
const index = (...entries: Record<string, unknown>[]) => ({ format: 1, name: 'Test', entries });

test('a private add-on is unlisted and never listed, even where the index left unlisted off', () => {
  const read = readCatalogue(index(entry('pack', 'bank-x', { private: true }), entry('pack', 'shelf')));
  assert.ok(read.ok);
  const bank = read.value.entries.find((e) => e.id === 'bank-x')!;
  assert.equal(bank.private, true);
  assert.equal(bank.unlisted, true);
  assert.deepEqual(listedEntries(read.value).map((e) => e.id), ['shelf']);
});

test('a shelf is kept only when it is one of the store\'s, and an example only on a starter', () => {
  const read = readCatalogue(
    index(
      entry('pack', 'a', { shelf: 'money' }),
      entry('pack', 'b', { shelf: 'garden' }),
      entry('pack', 'c', { example: true }),
      entry('usecase', 'd', { example: true }),
      entry('usecase', 'e', { example: 'yes', private: 'yes' }),
    ),
  );
  assert.ok(read.ok);
  const by = new Map(read.value.entries.map((e) => [e.id, e]));
  assert.equal(by.get('a')!.shelf, 'money');
  assert.equal('shelf' in by.get('b')!, false);
  assert.equal('example' in by.get('c')!, false);
  assert.equal(by.get('d')!.example, true);
  assert.equal('example' in by.get('e')!, false);
  assert.equal('private' in by.get('e')!, false);
});
