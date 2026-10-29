/**
 * The hosted app's catalogue: a folder bundled with the web shell (`apps/web/static/catalogue`), served read-only by the
 * Worker's static assets at `/catalogue/`, the same paths a self-host serves a folder at. No binding, secret or bucket.
 *
 * EVERY FILE IN IT IS WHAT ITS INDEX SAYS: held to its checksum and signature and read through its door, so a hand edit
 * that would be refused in the app is refused here first. And the Worker never runs first on `/catalogue/`, so the asset
 * is what answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { catalogueFile, readCatalogue, readCatalogueFile, reachOf, verifyVersion } from '../../../packages/declare/src/catalogue.ts';

const folder = new URL('../../web/static/catalogue/', import.meta.url);

test('every version in the bundled catalogue verifies and reads, and reaches what the index says', async () => {
  const index = readCatalogue(JSON.parse(readFileSync(fileURLToPath(new URL('index.json', folder)), 'utf8')));
  assert.ok(index.ok, JSON.stringify(index));
  assert.ok(index.value.entries.length > 0);
  for (const entry of index.value.entries)
    for (const version of entry.versions) {
      const text = readFileSync(fileURLToPath(new URL(catalogueFile(entry.id, version.version, entry.kind), folder)), 'utf8');
      const held = await verifyVersion(entry, version, text);
      assert.ok(held.ok, `${entry.id} ${version.version}: ${JSON.stringify(held)}`);
      const read = await readCatalogueFile(text);
      assert.ok(read.ok && read.value.kind === entry.kind, `${entry.id} ${version.version} does not read`);
      assert.deepEqual(reachOf(read.value), version.reach);
    }
});

test('the Worker does not run first on /catalogue/, so its static assets answer there', () => {
  const config = readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8');
  const lists = [...config.matchAll(/"run_worker_first":\s*\[([^\]]*)\]/gu)].map((m) => m[1] ?? '');
  assert.ok(lists.length > 0);
  /* THE WORKER RUNS FIRST ON EVERY PATH (`/*`), now the app is at the root, so the catalogue is the files' by a negative,
     which takes precedence over every other entry, and never by being left off. A list that runs first on `/*` without
     it answers the catalogue with the Worker. */
  for (const list of lists) {
    assert.doesNotMatch(list, /"\/catalogue/u, 'the Worker is named first on /catalogue');
    assert.ok(!/"\/\*"/u.test(list) || /"!\/catalogue\/\*"/u.test(list), 'the Worker runs first on every path and the catalogue is not taken out');
  }
});
