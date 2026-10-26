/**
 * An add-on held private or unlisted (installed by its link, never listed) is left out of the Kennel's public index, so
 * a later version of it never reached the Updates card, while the record's own check, which reads the whole index, said
 * one had arrived and waited. The updates are now looked for in the public index with the shipped catalogue's entry for
 * every add-on this record holds that the public index leaves out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { listedEntries, readCatalogue, type CatalogueIndex } from '@braindog/declare/catalogue';

import { indexForUpdates } from './catalogue.ts';

const read = readCatalogue(JSON.parse(readFileSync(new URL('../../../static/catalogue/index.json', import.meta.url), 'utf8')));
if (!read.ok) throw new Error('the shipped catalogue does not read');
const shipped: CatalogueIndex = read.value;
const publicIndex: CatalogueIndex = { ...shipped, entries: listedEntries(shipped) };
const hidden = shipped.entries.find((e) => e.kind === 'pack' && e.private === true && e.versions.length > 1)!;
const state = (id: string, version: string) => ({ id, version, disabled_at: null, registers: [] });

test('A PRIVATE ADD-ON THIS RECORD HOLDS IS LOOKED FOR IN UPDATES, though the public index leaves it out', async () => {
  assert.ok(hidden, 'the shipped catalogue holds a private add-on with more than one version');
  assert.equal(
    publicIndex.entries.some((e) => e.id === hidden.id),
    false,
  );
  const older = hidden.versions[1]!.version;
  const got = await indexForUpdates(publicIndex, shipped, [state(hidden.id, older)]);
  assert.equal(got.entries.filter((e) => e.id === hidden.id).length, 1);
  const { catalogueUpdates } = await import('@braindog/declare/catalogue');
  const files = (path: string): Promise<string | null> => {
    try {
      return Promise.resolve(readFileSync(new URL(`../../../static/catalogue/${path}`, import.meta.url), 'utf8'));
    } catch {
      return Promise.resolve(null);
    }
  };
  const found = await catalogueUpdates(got, [state(hidden.id, older)], files);
  const mine = found.updates.find((u) => u.entry.id === hidden.id);
  assert.ok(mine, 'the later version is offered');
  assert.equal(mine.from, older);
});

test('NOTHING IS ADDED for an add-on this record does not hold, nor twice for one the public index lists', async () => {
  assert.equal(await indexForUpdates(publicIndex, shipped, []), publicIndex);
  const listed = publicIndex.entries.find((e) => e.kind === 'pack')!;
  assert.equal(await indexForUpdates(publicIndex, shipped, [state(listed.id, '0.0.1')]), publicIndex);
  assert.equal(await indexForUpdates(publicIndex, null, [state(hidden.id, '0.0.1')]), publicIndex);
});
