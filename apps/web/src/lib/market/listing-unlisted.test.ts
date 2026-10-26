/**
 * An add-on the catalogue holds unlisted has a page by its id. It installs by id and is left out of every listing, so
 * its address said there was nothing by that name, and a question asking to install it could not be followed anywhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CatalogueIndex } from '@braindog/declare/catalogue';

import { listingsOf, unlistedListing } from './listing.ts';

const v = (version: string, yanked = false) => ({ version, checksum: '0', bytes: 1, published_at: '2026-10-01T00:00:00.000Z', bump: null, reach: {}, ...(yanked ? { yanked: { reason: 'r', at: 'x' } } : {}) });
const entry = (id: string, title: string, versions: unknown[], unlisted = true) => ({
  kind: 'pack',
  id,
  title,
  summary: 's',
  author: 'a',
  license: 'MIT',
  audience: 'addon',
  latest: '1.1.0',
  versions,
  ...(unlisted ? { unlisted: true } : {}),
});
const index = {
  entries: [entry('quill', 'Quill', [v('1.1.0'), v('1.0.0')]), entry('husk', 'Husk', [v('1.0.0', true)]), entry('loam', 'Loam', [v('1.0.0')], false)],
} as unknown as CatalogueIndex;

test('AN UNLISTED ADD-ON IS FOUND BY ITS ID, at the version it offers, and stays out of every listing', () => {
  assert.equal(listingsOf({ kennel: index, counts: null }).some((l) => l.id === 'quill'), false);
  const quill = unlistedListing(index, 'quill', null);
  assert.deepEqual(quill && { key: quill.key, title: quill.title, latest: quill.latest, source: quill.source, installedId: quill.installedId }, {
    key: 'pack:quill',
    title: 'Quill',
    latest: '1.1.0',
    source: 'kennel',
    installedId: 'quill',
  });
  assert.equal(unlistedListing(index, 'quill', 'pack')?.id, 'quill');
});

test('NOT ONE OF ANOTHER KIND, one every version of is taken back, one listed, or none by that id', () => {
  assert.equal(unlistedListing(index, 'quill', 'usecase'), null);
  assert.equal(unlistedListing(index, 'husk', null), null);
  assert.equal(unlistedListing(index, 'loam', null), null);
  assert.equal(unlistedListing(index, 'nothing', null), null);
  assert.equal(unlistedListing(null, 'quill', null), null);
});
