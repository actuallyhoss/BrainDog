/**
 * The one address check (`src/address.ts`): an address stands only where the record says what it does with
 * one, a `data:` address stands nowhere, and the plan and the install both say so before anything is staged.
 *
 * EVERY FIRST-PARTY FILE IS WALKED HERE TOO, so an add-on in `packs/` that holds an address the walker refuses fails
 * this file by its own name, before a build stops on it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { addressFault, addressFaults, install, installFault, listingFault, normalise, plan, type Host, type Installed, type Pack } from '../src/index.ts';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const BOOKS = {
  register: 'library',
  name: 'Books',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'shop', type: 'url' },
    { id: 'about', type: 'document' },
    { id: 'tags', type: 'list', of: 'text' },
  ],
};
const page = (...blocks: Record<string, unknown>[]): Record<string, unknown> => ({ page: 'shelf', title: 'Shelf', requires: ['register.library'], blocks });
const TABLE = { kind: 'table', source: 'register.library', span: 12 };
const doc = (extra: Record<string, unknown> = {}, declarations: Record<string, unknown>[] = [BOOKS, page(TABLE)]): Record<string, unknown> => ({
  pack: 'bookshelf',
  version: '1.0.0',
  title: 'Bookshelf',
  summary: 'Books you own.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations,
  ...extra,
});

const at = (d: unknown): string | null => addressFault(d)?.at ?? null;

test('an address stands in a link row, an embed row, a door, a script it calls, a url field and the homepage line', () => {
  const allowed = doc({ homepage: 'https://halden.example/bookshelf', seeds: [{ register: 'library', fields: { name: 'Dune', shop: 'https://shop.example/dune', tags: ['example', 'https://git.example/dune.git'] } }] }, [
    { ...BOOKS, fields: [...BOOKS.fields.slice(0, 1), { id: 'shop', type: 'url', default: 'https://shop.example' }, ...BOOKS.fields.slice(2)] },
    page(
      { kind: 'link', authored: [{ cells: ['Handbook', 'https://halden.example/handbook', 'Read first'] }] },
      { kind: 'embed', authored: [{ cells: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'A tour'] }] },
      { kind: 'note', body: 'Write the whole https:// address of the shop.' },
    ),
    { ingest: 'prices', channel: 'poll', url: 'https://prices.example/v1/books', every: '1d' },
    { ingest: 'orders', channel: 'pull', fetch: { base: 'https://orders.example', path: '/v1/orders' }, every: '1d' },
    { digest: 'weekly', channels: ['webhook'], webhook: { url: 'https://hooks.example/in' } },
    { script: 'sync', egress: ['https://api.example.com'], source: '// see https://api.example.com/docs\nawait fetch(`https://api.example.com/v1/books/${id}`);' },
  ]);
  assert.deepEqual(addressFaults(allowed), []);
});

test('an image address in a page note is refused REMOTE_ASSET, naming the declaration and the key', () => {
  const r = addressFault(doc({}, [BOOKS, page(TABLE, { kind: 'note', body: 'Our shelf ![](https://cdn.example/logo.png)' })]));
  assert.equal(r?.code, 'REMOTE_ASSET');
  assert.equal(r?.at, 'page.shelf.blocks[1].body');
  assert.match(r?.fix ?? '', /page\.shelf\.blocks\[1\]\.body holds the address "https:\/\/cdn\.example\/logo\.png"/u);
  assert.doesNotMatch(r?.fix ?? '', /—/u, 'an em dash in a sentence a person reads');
});

test('the same address is refused in every other place, each named', () => {
  const note = (body: string) => doc({}, [BOOKS, page({ kind: 'note', body })]);
  assert.equal(at(note('See http://plain.example/a')), 'page.shelf.blocks[0].body');
  assert.equal(at(note('![](//cdn.example/p.png)')), 'page.shelf.blocks[0].body', 'an address with no scheme');
  /* AND THE TWO OTHER PLACES A PAGE LOADS ONE WITH NO SCHEME. */
  assert.equal(at(note('<i style="background: url(//cdn.example/p.png)">x</i>')), 'page.shelf.blocks[0].body', 'a stylesheet url()');
  assert.equal(at(note('![a][r]\n\n[r]: //cdn.example/p.png')), 'page.shelf.blocks[0].body', 'a reference a note defines');
  assert.deepEqual(addressFaults(note('Two slashes // in a sentence, and a path like a//b, load nothing.')), []);
  assert.equal(at(doc({}, [BOOKS, page({ kind: 'table', source: 'register.library', empty: 'https://cdn.example/x' })])), 'page.shelf.blocks[0].empty');
  /* A LINK'S OTHER CELLS, AND WORDS BESIDE ITS ADDRESS. */
  assert.equal(at(doc({}, [BOOKS, page({ kind: 'link', authored: [{ cells: ['https://a.example', '/p/handbook'] }] })])), 'page.shelf.blocks[0].authored[0].cells[0]');
  assert.equal(at(doc({}, [BOOKS, page({ kind: 'link', authored: [{ cells: ['Handbook', 'https://a.example ![](https://b.example/p.png)'] }] })])), 'page.shelf.blocks[0].authored[0].cells[1]');
  /* A DOOR'S OTHER KEYS, AND A SCRIPT NAMING A HOST IT DOES NOT SAY IT CALLS. */
  assert.equal(at(doc({}, [BOOKS, { ingest: 'prices', channel: 'poll', url: 'https://prices.example/v1', every: '1d', map: [{ name: { value: 'https://cdn.example/x' } }] }])), 'ingest.prices.map[0].name.value');
  const stray = addressFault(doc({}, [BOOKS, { script: 'sync', egress: ['https://api.example.com'], source: 'await fetch("https://other.example/v1");' }]));
  assert.equal(stray?.at, 'script.sync.source');
  assert.match(stray?.fix ?? '', /not one the script's egress lists/u);
  /* A LABEL, AN EXAMPLE ROW'S DOCUMENT AND NOTE, A SETTING, AND WHAT IT LAYS ON OTHER PACKS. */
  assert.equal(at(doc({}, [{ ...BOOKS, name: 'Books from https://shop.example' }, page(TABLE)])), 'register.library.name');
  assert.equal(at(doc({ seeds: [{ register: 'library', fields: { name: 'Dune', about: 'https://cdn.example/cover.png' } }] })), 'seeds[0].fields.about');
  assert.equal(at(doc({ seeds: [{ register: 'library', fields: { name: 'Dune ![](https://cdn.example/c.png)' } }] })), 'seeds[0].fields.name');
  assert.equal(at(doc({ seeds: [{ register: 'library', fields: { name: 'Dune' }, note: 'From https://cdn.example' }] })), 'seeds[0].note');
  assert.equal(at(doc({ config: { logo: { type: 'text', default: 'https://cdn.example/logo.png' } } })), 'config.logo.default');
  assert.equal(at(doc({ adds: [{ page: 'page.project', block: { kind: 'note', body: '![](https://cdn.example/p.png)' } }] })), 'adds[0].block.body');
  assert.equal(at(doc({ extends: { 'register.people': { fields: [{ id: 'site', type: 'text', label: 'https://cdn.example' }] } } })), 'extends.register.people.fields[0].label');
});

test('a data: address is refused in every place, an allowed one included', () => {
  const inLink = addressFault(doc({}, [BOOKS, page({ kind: 'link', authored: [{ cells: ['Logo', 'data:image/png;base64,iVBORw0KGgo='] }] })]));
  assert.equal(inLink?.code, 'REMOTE_ASSET');
  assert.equal(inLink?.at, 'page.shelf.blocks[0].authored[0].cells[1]');
  assert.match(inLink?.fix ?? '', /data: address/u);
  assert.equal(at(doc({}, [BOOKS, page({ kind: 'note', body: '![](data:image/svg+xml,%3Csvg/%3E)' })])), 'page.shelf.blocks[0].body');
  assert.equal(addressFault(doc({}, [BOOKS, page({ kind: 'note', body: 'The data: what the feed answers.' })])), null, 'the word data and a colon is not an address');
});

test('a normalised pack is read as the file is', async () => {
  const read = await normalise(doc({}, [BOOKS, page(TABLE, { kind: 'note', body: '![](https://cdn.example/logo.png)' })]));
  assert.ok(read.ok, JSON.stringify(read));
  assert.equal(at(read.value), 'page.shelf.blocks[1].body');
});

test('a listing that says price, paid, rating or stars is refused by that name', () => {
  for (const key of ['price', 'paid', 'rating', 'stars', 'Price']) {
    const r = listingFault(doc({ [key]: 5 }));
    assert.equal(r?.code, 'PACK_MALFORMED', key);
    assert.equal(r?.at, key);
    assert.match(r?.fix ?? '', new RegExp(`This file says ${key}\\.`, 'u'));
  }
  assert.match(listingFault(doc({ price: '5 USD' }))?.fix ?? '', /nothing for sale/u);
  assert.match(listingFault(doc({ stars: 4 }))?.fix ?? '', /no ratings/u);
  assert.equal(listingFault(doc()), null);
});

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, fields as never, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

async function packOf(d: Record<string, unknown>): Promise<Pack> {
  const read = await normalise(d, { kind: 'local' });
  assert.ok(read.ok, JSON.stringify(read));
  return read.value;
}

test('a plan with an image address in a page note says REMOTE_ASSET, and the install refuses it with nothing staged', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const p = await packOf(doc({}, [BOOKS, page(TABLE, { kind: 'note', body: '![](https://cdn.example/logo.png)' })]));
  const before = k.declarations().length;
  const diff = await plan(p, stateOf(k));
  assert.equal(diff.remote?.code, 'REMOTE_ASSET');
  assert.equal(diff.remote?.at, 'page.shelf.blocks[1].body');
  assert.equal(installFault(p, diff)?.code, 'REMOTE_ASSET');

  const done = await install(p, diff, hostFor(k), diff.planHash);
  assert.ok(!done.ok && 'refusal' in done, JSON.stringify(done));
  assert.equal(done.refusal.code, 'REMOTE_ASSET');
  assert.equal(k.declarations().length, before, 'something was staged before the address was refused');
  assert.deepEqual(k.packs().map((x) => x.id).includes('bookshelf'), false);

  /* A PLAN THAT DID NOT SAY IT IS REFUSED ALL THE SAME: the install reads the add-on, not the plan's word. */
  const { remote: _remote, ...silent } = diff;
  assert.equal(installFault(p, silent)?.code, 'REMOTE_ASSET');
});

test('the same add-on without the address plans clean and installs', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const p = await packOf(doc({}, [BOOKS, page(TABLE, { kind: 'note', body: 'Every book you own.' })]));
  const diff = await plan(p, stateOf(k));
  assert.equal(diff.remote, undefined);
  assert.equal(installFault(p, diff), null);
  const done = await install(p, diff, hostFor(k), diff.planHash);
  assert.ok(done.ok, JSON.stringify(done));
});

test('a setting sent with the install cannot carry an address into a note', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const p = await packOf(doc({ config: { motto: { type: 'text', default: 'Read more', label: 'Motto' } } }, [BOOKS, page(TABLE, { kind: 'note', body: '{{config:motto}}' })]));
  assert.equal(addressFault(p), null);
  assert.equal((await plan(p, stateOf(k))).remote, undefined);
  const diff = await plan(p, stateOf(k), { settings: { motto: '![](https://cdn.example/logo.png)' } });
  assert.equal(diff.remote?.at, 'page.shelf.blocks[1].body');
  assert.equal(installFault(p, diff)?.code, 'REMOTE_ASSET');
});

test('every first-party add-on file passes the walker and says nothing a listing may not', () => {
  const root = fileURLToPath(new URL('../../../packs/', import.meta.url));
  const files = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(`${root}${d.name}`).filter((f) => f.endsWith('.pack.json')).map((f) => `${root}${d.name}/${f}`));
  assert.ok(files.length >= 18, `only ${files.length} add-on files were found under packs/`);
  for (const file of files) {
    const read = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    const name = file.slice(root.length);
    assert.deepEqual(addressFaults(read).map((r) => r.fix), [], name);
    assert.equal(listingFault(read), null, name);
  }
});
