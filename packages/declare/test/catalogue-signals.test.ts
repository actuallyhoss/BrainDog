/**
 * A use case's entry says the words it is heard in and the modules it stands on: `publishTo` puts them on from
 * the file, `readCatalogue` keeps them in their shape, and an index written before either key existed reads as it did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emptyCatalogue, publishTo, readCatalogue } from '../src/catalogue.ts';

const CHECKSUM = 'a'.repeat(64);
const version = { version: '1.0.0', checksum: CHECKSUM, bytes: 10, published_at: '2026-01-01T00:00:00.000Z', bump: null, reach: {} };
const entry = (extra: Record<string, unknown> = {}) => ({
  kind: 'usecase',
  id: 'rent-book',
  title: 'Rent book',
  summary: 'The rent each lodger owes.',
  author: 'Nobody in particular',
  license: 'MIT',
  audience: 'individual',
  latest: '1.0.0',
  versions: [version],
  ...extra,
});
const index = (...entries: Record<string, unknown>[]) => ({ format: 1, name: 'Test', entries });

test('an index without signals or modules reads as it always did, and says neither', () => {
  const read = readCatalogue(index(entry()));
  assert.ok(read.ok);
  const e = read.value.entries[0]!;
  assert.equal(e.signals, undefined);
  assert.equal(e.modules, undefined);
  assert.equal('signals' in e, false);
  assert.equal('modules' in e, false);
});

test('an index with signals and modules keeps them on the use case', () => {
  const read = readCatalogue(index(entry({ signals: ['rent book', 'lodgers'], modules: ['people'] })));
  assert.ok(read.ok);
  assert.deepEqual(read.value.entries[0]!.signals, ['rent book', 'lodgers']);
  assert.deepEqual(read.value.entries[0]!.modules, ['people']);
});

test('signals or modules that are not lists of words are dropped, never heard', () => {
  const read = readCatalogue(index(entry({ signals: 'rent book', modules: ['people', 7] })));
  assert.ok(read.ok);
  assert.equal(read.value.entries[0]!.signals, undefined);
  assert.equal(read.value.entries[0]!.modules, undefined);
});

test('an add-on carries no signals, whatever its index says', () => {
  const read = readCatalogue(index(entry({ kind: 'pack', audience: 'addon', signals: ['shelf'], modules: ['people'] })));
  assert.ok(read.ok);
  assert.equal(read.value.entries[0]!.signals, undefined);
  assert.equal(read.value.entries[0]!.modules, undefined);
});

const RENT_BOOK = {
  usecase: 'rent-book',
  version: '1.0.0',
  title: 'Rent book',
  summary: 'The rent each lodger owes and what they paid.',
  author: 'Nobody in particular',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain',
  signals: ['rent book', 'lodgers'],
  modules: ['people'],
};

test('publishing a use case puts its signals and modules on its entry, and they read back', async () => {
  const out = await publishTo(emptyCatalogue('Test'), JSON.stringify(RENT_BOOK), () => null, new Date('2026-01-01T00:00:00Z'));
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value.entry.signals, ['rent book', 'lodgers']);
  assert.deepEqual(out.value.entry.modules, ['people']);
  const back = readCatalogue(JSON.parse(JSON.stringify(out.value.index)));
  assert.ok(back.ok);
  assert.deepEqual(back.value.entries[0]!.signals, ['rent book', 'lodgers']);
  assert.deepEqual(back.value.entries[0]!.modules, ['people']);
});

test('a use case whose file says no signals and no modules is published without either key', async () => {
  const out = await publishTo(emptyCatalogue('Test'), JSON.stringify({ ...RENT_BOOK, signals: [], modules: [] }), () => null);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal('signals' in out.value.entry, false);
  assert.equal('modules' in out.value.entry, false);
});
