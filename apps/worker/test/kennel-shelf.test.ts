/**
 * The Worker's catalogue read through the Kennel it hosts (`catalogue.ts` over `kennelReader`): the arranger's shelf
 * and Slash's offers find an add-on published only to the Kennel's bucket, and keep every add-on the bundled folder
 * ships. A Kennel index that does not read leaves the bundled folder alone, as the public door serves it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emptyCatalogue, publishTo, type CatalogueIndex } from '../../../packages/declare/src/catalogue.ts';
import { kennelCatalogueReader, workerCatalogueOffers, workerCatalogueShelf, type Assets } from '../src/catalogue.ts';
import type { KennelBucket } from '../src/kennel.ts';

const SHELL = '<!doctype html><title>BrainDog</title>';

/** A pack file with one list of its own, so the shelf has a document to hand the arranger. */
const packText = (pack: string, title: string, version: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    pack,
    version,
    title,
    summary: `${title}, for a test.`,
    author: 'Halden',
    license: 'MIT',
    ...extra,
    declarations: [{ register: pack.replace(/-/gu, '_'), name: title, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
  });

/** Each text published into one catalogue: its index and its files by catalogue path. */
async function catalogue(name: string, texts: readonly string[]): Promise<{ index: CatalogueIndex; files: Map<string, string> }> {
  const files = new Map<string, string>();
  let index = emptyCatalogue(name);
  for (const text of texts) {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null, new Date('2026-10-01T00:00:00Z'));
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, text);
  }
  files.set('index.json', JSON.stringify(index));
  return { index, files };
}

/** Static assets as Cloudflare answers them: a file under `/catalogue/`, or the shell with a 200. */
const assetsOf = (files: ReadonlyMap<string, string>): Assets => ({
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    const text = path.startsWith('/catalogue/') ? files.get(path.slice('/catalogue/'.length)) : undefined;
    return text === undefined ? new Response(SHELL, { headers: { 'content-type': 'text/html' } }) : new Response(text, { headers: { 'content-type': 'application/json' } });
  },
});

/** The Kennel's bucket as a map, every file under `kennel/`. */
const bucketOf = (files: ReadonlyMap<string, string>): KennelBucket => {
  const held = new Map([...files].map(([path, text]) => [`kennel/${path}`, text]));
  return {
    get: async (key) => {
      const text = held.get(key);
      return text === undefined ? null : { text: async () => text, etag: String(text.length) };
    },
    put: async (key, value) => (held.set(key, value), {}),
    delete: async (key) => void held.delete(key),
  };
};

async function both() {
  const bundled = await catalogue('BrainDog', [packText('bookshelf', 'Bookshelf', '1.0.0')]);
  const kennel = await catalogue('BrainDog Kennel', [
    packText('tally', 'Tally', '1.0.0'),
    packText('tally', 'Tally', '1.1.0'),
    packText('quiet-ledger', 'Quiet ledger', '1.0.0', { unlisted: true }),
  ]);
  return { bundled, kennel, assets: assetsOf(bundled.files), blobs: bucketOf(kennel.files) };
}

test('the shelf lists an add-on published only to the Kennel beside the bundled one, and fetches each by its id', async () => {
  const { assets, blobs } = await both();
  const shelf = workerCatalogueShelf(assets, blobs)!;
  const listed = await shelf.listed();
  assert.deepEqual(listed.map((e) => `${e.id} ${e.version}`).sort(), ['bookshelf 1.0.0', 'tally 1.1.0']);

  const tally = await shelf.fetch('tally');
  assert.ok(tally?.ok, JSON.stringify(tally));
  assert.equal(tally.value.title, 'Tally');
  assert.equal(tally.value.version, '1.1.0');
  assert.ok(tally.value.doc);

  const bookshelf = await shelf.fetch('bookshelf');
  assert.ok(bookshelf?.ok, JSON.stringify(bookshelf));
  assert.equal(bookshelf.value.title, 'Bookshelf');

  /* AN UNLISTED ADD-ON INSTALLS BY ITS ID and is left out of what is listed. */
  const quiet = await shelf.fetch('quiet-ledger');
  assert.ok(quiet?.ok, JSON.stringify(quiet));
  assert.equal(await shelf.fetch('nothing-here'), null);
});

test('with no bucket bound, the shelf is the bundled folder alone, as before', async () => {
  const { assets } = await both();
  const shelf = workerCatalogueShelf(assets)!;
  assert.deepEqual((await shelf.listed()).map((e) => e.id), ['bookshelf']);
  assert.equal(await shelf.fetch('tally'), null);
  assert.equal(workerCatalogueShelf(undefined), undefined);
  assert.equal(workerCatalogueOffers(undefined, undefined), undefined);
});

test('a Kennel index that does not read leaves the bundled add-ons on offer', async () => {
  const { assets, kennel } = await both();
  const broken = bucketOf(new Map([...kennel.files, ['index.json', '{"not":"a catalogue"']]));
  const shelf = workerCatalogueShelf(assets, broken)!;
  assert.deepEqual((await shelf.listed()).map((e) => e.id), ['bookshelf']);
  const bookshelf = await shelf.fetch('bookshelf');
  assert.ok(bookshelf?.ok, JSON.stringify(bookshelf));
});

test('a Kennel file that is not the one its index lists is refused, never installed', async () => {
  const { assets, kennel } = await both();
  const swapped = bucketOf(new Map([...kennel.files, ['packs/tally/1.1.0.pack.json', packText('tally', 'Tally', '1.1.0', { summary: 'Something else.' })]]));
  const got = await workerCatalogueShelf(assets, swapped)!.fetch('tally');
  assert.ok(got && !got.ok && 'refusal' in got);
  assert.match(got.refusal.fix, /^Tally is in this host's catalogue and was not offered\./u);
});

test('Slash is offered a newer Kennel version of an add-on the record holds, and a bundled one stays current', async () => {
  const { assets, blobs } = await both();
  const offers = workerCatalogueOffers(assets, blobs)!;
  const got = await offers([
    { id: 'tally', version: '1.0.0', on: true },
    { id: 'bookshelf', version: '1.0.0', on: true },
  ]);
  assert.deepEqual(
    got.map((o) => `${o.title} ${o.from} to ${o.to}`),
    ['Tally 1.0.0 to 1.1.0'],
  );
  assert.equal((got[0]!.body as { install?: string }).install, 'tally');
});

test('only the two catalogue shapes are read through the Kennel', async () => {
  const { assets, blobs } = await both();
  const read = kennelCatalogueReader({ assets, blobs });
  for (const path of ['../index.html', 'counts.json', 'review.json', 'publishers.json', 'packs/Bad/1.0.0.pack.json']) assert.equal(await read(path), null, path);
  assert.ok(await read('packs/tally/1.0.0.pack.json'));
  assert.ok(await read('packs/bookshelf/1.0.0.pack.json'));
});

test('a Kennel add-on never stands in for a bundled one, and an unsigned one is offered as unsigned', async () => {
  const { assets } = await both();
  /* AN IMPOSTOR UNDER A BUNDLED ID, at a higher version and a title of its own: the bundled entry keeps the id. */
  const impostor = await catalogue('BrainDog Kennel', [packText('tally', 'Tally', '1.0.0'), packText('tally', 'Tally', '1.1.0'), packText('bookshelf', 'Bookshelf by BrainDog', '9.0.0')]);
  const blobs = bucketOf(impostor.files);
  const shelf = workerCatalogueShelf(assets, blobs)!;
  assert.deepEqual((await shelf.listed()).filter((e) => e.id === 'bookshelf').map((e) => `${e.title} ${e.version}`), ['Bookshelf 1.0.0']);
  const bookshelf = await shelf.fetch('bookshelf');
  assert.ok(bookshelf?.ok, JSON.stringify(bookshelf));
  assert.equal(`${bookshelf.value.title} ${bookshelf.value.version}`, 'Bookshelf 1.0.0');
  const offers = await workerCatalogueOffers(assets, blobs)!([
    { id: 'bookshelf', version: '1.0.0', on: true },
    { id: 'tally', version: '1.0.0', on: true },
  ]);
  assert.deepEqual(offers.map((o) => `${o.title} ${o.to} ${String(o.signedBy)}`), ['Tally 1.1.0 null']);
});
