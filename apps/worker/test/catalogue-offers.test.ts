/**
 * Spark's catalogue offers on the Worker: read from the catalogue bundled with the shell through the static assets, the same
 * offers a self-host gives from its folder, and nothing for a file the assets answer with the shell instead.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { emptyCatalogue, newAuthorKey, publishTo } from '../../../packages/declare/src/catalogue.ts';
import { assetsReader, workerCatalogueOffers, type Assets } from '../src/catalogue.ts';

const SHELL = '<!doctype html><title>BrainDog</title>';

/** Static assets as Cloudflare answers them with `single-page-application`: a file by its path, or the shell with a 200. */
const assetsOf = (files: (path: string) => string | null): Assets & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      asked.push(path);
      const text = path.startsWith('/catalogue/') ? files(path.slice('/catalogue/'.length)) : null;
      return text === null ? new Response(SHELL, { headers: { 'content-type': 'text/html' } }) : new Response(text, { headers: { 'content-type': 'application/json' } });
    },
  };
};

const bundled = new URL('../../web/static/catalogue/', import.meta.url);
const fromBundle = (path: string): string | null => {
  try {
    return readFileSync(fileURLToPath(new URL(path, bundled)), 'utf8');
  } catch {
    return null;
  }
};

test('the bundled catalogue offers a newer version of what a hosted record holds, and nothing for one current', async () => {
  const offers = workerCatalogueOffers(assetsOf(fromBundle));
  assert.ok(offers);
  const index = JSON.parse(fromBundle('index.json')!) as { entries: { kind: string; id: string; title: string; latest?: string; versions: { version: string }[] }[] };
  const entry = index.entries[0]!;
  const id = entry.kind === 'usecase' ? `usecase-${entry.id}` : entry.id;
  const latest = entry.versions.map((v) => v.version).sort().at(-1)!;
  const got = await offers([{ id, version: '0.0.1', on: true }]);
  assert.equal(got.length, 1);
  assert.equal(got[0]!.title, entry.title);
  assert.equal(got[0]!.to, latest);
  assert.deepEqual(await offers([{ id, version: latest, on: true }]), []);
  assert.deepEqual(await offers([{ id, version: '0.0.1', on: false }]), []);
  assert.equal(workerCatalogueOffers(undefined), undefined);
});

test('a signed update is offered with its key, and one whose file the assets do not hold is not offered', async () => {
  const key = await newAuthorKey('Halden');
  const books = { register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
  const text = (version: string, extra: unknown[] = []) => JSON.stringify({ pack: 'bookshelf', version, title: 'Bookshelf', summary: 'Books.', author: 'Halden', license: 'MIT', declarations: [books, ...extra] });
  const files = new Map<string, string>();
  let index = emptyCatalogue('Test');
  for (const t of [text('1.0.0'), text('1.1.0', [{ page: 'shelf', title: 'Shelf', requires: ['register.books'], blocks: [{ kind: 'table', source: 'register.books', span: 12 }] }])]) {
    const out = await publishTo(index, t, (p) => files.get(p) ?? null, new Date(), key);
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, t);
  }
  files.set('index.json', JSON.stringify(index));
  const offers = workerCatalogueOffers(assetsOf((p) => files.get(p) ?? null))!;
  const got = await offers([{ id: 'bookshelf', version: '1.0.0', on: true }]);
  assert.equal(got.length, 1);
  assert.equal(got[0]!.signedBy, key.key_id);
  assert.equal((got[0]!.body as { install?: string }).install, 'bookshelf');

  files.delete('packs/bookshelf/1.1.0.pack.json');
  assert.deepEqual(await offers([{ id: 'bookshelf', version: '1.0.0', on: true }]), []);
  assert.deepEqual(await workerCatalogueOffers(assetsOf(() => null))!([{ id: 'bookshelf', version: '1.0.0', on: true }]), []);
});

test('only the two catalogue shapes are read from the assets, and the shell is never taken for a file', async () => {
  const assets = assetsOf(() => '{"ok":true}');
  const read = assetsReader(assets);
  assert.equal(await read('index.json'), '{"ok":true}');
  for (const path of ['../index.html', 'packs/x/1.0.0.pack.json/../../secret', 'notes.txt', 'packs/Bad/1.0.0.pack.json']) assert.equal(await read(path), null, path);
  assert.deepEqual(assets.asked, ['/catalogue/index.json']);
  assert.equal(await assetsReader(assetsOf(() => null))('index.json'), null);
});

test('the record on the Worker is handed the offers, from its assets binding', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  assert.match(source, /catalogueOffers: workerCatalogueOffers\(this\.env\.ASSETS\)/u);
});
