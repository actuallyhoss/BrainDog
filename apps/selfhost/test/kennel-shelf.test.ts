/**
 * The self-host's catalogue read through the Kennel (`catalogue.ts` over `kennel.ts` `kennelReader`): the arranger's
 * shelf and Slash's offers find an add-on published only to the public Kennel, and keep every add-on the host's own
 * folder holds. With the Kennel off or not answering, the folder alone, and a host off the network waits once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { emptyCatalogue, publishTo } from '../../../packages/declare/src/catalogue.ts';
import { catalogueOffersFrom, catalogueShelfFrom, kennelCatalogueReader } from '../src/catalogue.ts';
import { KENNEL_MISS_MS, type KennelDeps } from '../src/kennel.ts';

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

/** Each text published into one catalogue: its files by catalogue path, `index.json` among them. */
async function catalogue(name: string, texts: readonly string[]): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  let index = emptyCatalogue(name);
  for (const text of texts) {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null, new Date('2026-10-01T00:00:00Z'));
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, text);
  }
  files.set('index.json', JSON.stringify(index));
  return files;
}

/** The host's folder on disk, removed after the test. */
async function folder(t: { after: (fn: () => void) => void }): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-kennel-shelf-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of await catalogue('BrainDog', [packText('bookshelf', 'Bookshelf', '1.0.0')])) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/* EACH TEST ITS OWN KENNEL ADDRESS: what a Kennel answered is kept by address for the process. */
let kennels = 0;

/** The public Kennel at its own address, answering from `files`, or nothing at all with `down`. */
async function kennelOf(down = false): Promise<KennelDeps & { asked: string[]; at: { now: number } }> {
  const base = `https://kennel-${String(++kennels)}.test/api/kennel/v1/`;
  const files = await catalogue('BrainDog Kennel', [packText('tally', 'Tally', '1.0.0'), packText('tally', 'Tally', '1.1.0')]);
  const asked: string[] = [];
  const at = { now: Date.parse('2026-10-09T12:00:00Z') };
  return {
    kennel: base,
    asked,
    at,
    now: () => at.now,
    fetch: async (url) => {
      asked.push(url);
      if (down) throw new TypeError('fetch failed');
      const text = url.startsWith(base) ? files.get(url.slice(base.length)) : undefined;
      return text === undefined ? new Response('{}', { status: 404 }) : new Response(text, { headers: { 'content-type': 'application/json' } });
    },
  };
}

test('the shelf lists an add-on published only to the Kennel beside the folder one, and fetches each by its id', async (t) => {
  const dir = await folder(t);
  const shelf = catalogueShelfFrom(dir, await kennelOf());
  assert.deepEqual((await shelf.listed()).map((e) => `${e.id} ${e.version}`).sort(), ['bookshelf 1.0.0', 'tally 1.1.0']);
  const tally = await shelf.fetch('tally');
  assert.ok(tally?.ok, JSON.stringify(tally));
  assert.equal(tally.value.title, 'Tally');
  assert.ok(tally.value.doc);
  const bookshelf = await shelf.fetch('bookshelf');
  assert.ok(bookshelf?.ok, JSON.stringify(bookshelf));
  assert.equal(await shelf.fetch('nothing-here'), null);
});

test('with no folder, the Kennel alone is the shelf', async () => {
  const shelf = catalogueShelfFrom(undefined, await kennelOf());
  assert.deepEqual((await shelf.listed()).map((e) => e.id), ['tally']);
});

test('with BRAINDOG_KENNEL off, the folder alone, and nothing is asked of another host', async (t) => {
  const dir = await folder(t);
  const kennel = { ...(await kennelOf()), kennel: 'off' };
  const shelf = catalogueShelfFrom(dir, kennel);
  assert.deepEqual((await shelf.listed()).map((e) => e.id), ['bookshelf']);
  assert.equal(await shelf.fetch('tally'), null);
  assert.deepEqual(kennel.asked, []);
});

test('a Kennel that does not answer leaves the folder on offer, and is asked again only after a minute', async (t) => {
  const dir = await folder(t);
  const kennel = await kennelOf(true);
  const shelf = catalogueShelfFrom(dir, kennel);
  assert.deepEqual((await shelf.listed()).map((e) => e.id), ['bookshelf']);
  const bookshelf = await shelf.fetch('bookshelf');
  assert.ok(bookshelf?.ok, JSON.stringify(bookshelf));
  assert.equal(kennel.asked.length, 1);
  kennel.at.now += KENNEL_MISS_MS;
  await shelf.listed();
  assert.equal(kennel.asked.length, 2);
});

test('Slash is offered a newer Kennel version of an add-on the record holds, and a folder one stays current', async (t) => {
  const dir = await folder(t);
  const offers = catalogueOffersFrom(dir, await kennelOf());
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

test('only the two catalogue shapes are read, from the folder or the Kennel', async (t) => {
  const dir = await folder(t);
  writeFileSync(join(dir, 'notes.txt'), 'private');
  const kennel = await kennelOf();
  const read = kennelCatalogueReader(dir, kennel);
  for (const path of ['../index.json', 'notes.txt', 'counts.json', 'packs/Bad/1.0.0.pack.json']) assert.equal(await read(path), null, path);
  assert.ok(await read('packs/bookshelf/1.0.0.pack.json'));
  assert.ok(await read('packs/tally/1.0.0.pack.json'));
  assert.ok(kennel.asked.every((url) => url.endsWith('.pack.json')));
});

test('a Kennel add-on never stands in for one in the folder, and an unsigned one is offered as unsigned', async (t) => {
  const dir = await folder(t);
  const kennel = await kennelOf();
  /* THE PUBLIC KENNEL LISTS AN IMPOSTOR UNDER THE FOLDER'S ID: the folder's entry keeps the id. */
  const impostor = await catalogue('BrainDog Kennel', [packText('bookshelf', 'Bookshelf by BrainDog', '9.0.0')]);
  const own = kennel.fetch;
  kennel.fetch = async (url, init) => {
    const path = url.slice(kennel.kennel!.length);
    const text = path === 'index.json' ? undefined : impostor.get(path);
    if (path === 'index.json') {
      const theirs = JSON.parse(await (await own(url, init)).text()) as { entries: unknown[] };
      const more = JSON.parse(impostor.get('index.json')!) as { entries: unknown[] };
      return new Response(JSON.stringify({ ...theirs, entries: [...theirs.entries, ...more.entries] }), { headers: { 'content-type': 'application/json' } });
    }
    return text === undefined ? own(url, init) : new Response(text, { headers: { 'content-type': 'application/json' } });
  };
  const shelf = catalogueShelfFrom(dir, kennel);
  assert.deepEqual((await shelf.listed()).map((e) => `${e.title} ${e.version}`).sort(), ['Bookshelf 1.0.0', 'Tally 1.1.0']);
  const bookshelf = await shelf.fetch('bookshelf');
  assert.ok(bookshelf?.ok, JSON.stringify(bookshelf));
  assert.equal(`${bookshelf.value.title} ${bookshelf.value.version}`, 'Bookshelf 1.0.0');
  const offers = await catalogueOffersFrom(dir, kennel)([
    { id: 'bookshelf', version: '1.0.0', on: true },
    { id: 'tally', version: '1.0.0', on: true },
  ]);
  assert.deepEqual(offers.map((o) => `${o.title} ${o.to} ${String(o.signedBy)}`), ['Tally 1.1.0 null']);
});
