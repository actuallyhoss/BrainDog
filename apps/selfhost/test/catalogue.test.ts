/**
 * A catalogue folder served read-only under `/catalogue/`: the index and each version's file, and nothing else in the
 * folder, whatever the path says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../src/server.ts';

test('the index and a version are answered, and any other path in the folder is not', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bd-catalogue-'));
  const folder = join(dir, 'catalogue');
  mkdirSync(join(folder, 'usecases', 'study'), { recursive: true });
  writeFileSync(join(folder, 'index.json'), '{"format":1,"name":"Test","entries":[]}');
  writeFileSync(join(folder, 'usecases', 'study', '1.0.0.usecase.json'), '{"usecase":"study"}');
  mkdirSync(join(folder, 'packs', 'bookshelf'), { recursive: true });
  writeFileSync(join(folder, 'packs', 'bookshelf', '1.0.0.pack.json'), '{"pack":"bookshelf"}');
  writeFileSync(join(dir, 'outside.json'), '{"not":"yours"}');
  writeFileSync(join(folder, 'notes.txt'), 'private');
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, pollMs: 0, catalogue: folder });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
  const get = (path: string, init?: RequestInit) => fetch(`${base}${path}`, init);

  const index = await get('/catalogue/index.json');
  assert.equal(index.status, 200);
  assert.deepEqual(await index.json(), { format: 1, name: 'Test', entries: [] });
  const file = await get('/catalogue/usecases/study/1.0.0.usecase.json');
  assert.equal(file.status, 200);
  assert.equal(await file.text(), '{"usecase":"study"}');

  const pack = await get('/catalogue/packs/bookshelf/1.0.0.pack.json');
  assert.equal(pack.status, 200);
  assert.equal(await pack.text(), '{"pack":"bookshelf"}');

  for (const path of ['/catalogue/packs/bookshelf/1.0.0.usecase.json', '/catalogue/usecases/study/1.0.0.pack.json', '/catalogue/notes.txt', '/catalogue/usecases/study/1.0.1.usecase.json', '/catalogue/%2e%2e/outside.json', '/catalogue/usecases/..%2f..%2foutside/1.0.0.usecase.json', '/catalogue/']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(await res.text(), /yours|private/u, path);
  }
  assert.equal((await get('/catalogue/index.json', { method: 'POST', body: '{}' })).status, 405);
});

test('a host with no catalogue says so under /catalogue/, and answers everything else as before', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bd-catalogue-'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, pollMs: 0 });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
  const res = await fetch(`${base}/catalogue/index.json`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /BRAINDOG_CATALOGUE/u);
  assert.equal((await fetch(`${base}/.well-known/braindog-build`)).status, 200);
});

test('the folder offers Spark a newer version of an installed add-on, verified, and nothing for one current or off', async (t) => {
  const { catalogueOffersFrom } = await import('../src/catalogue.ts');
  const { emptyCatalogue, publishTo, newAuthorKey } = await import('@braindog/declare/catalogue');
  const dir = mkdtempSync(join(tmpdir(), 'bd-offers-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const books = { register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
  const poll = { ingest: 'poll_books', channel: 'poll', url: 'https://books.example.org/new', every: '1d', map: [{ name: { path: '$.title' } }], writes: { register: 'books' } };
  const text = (version: string, declarations: unknown[]) => JSON.stringify({ pack: 'bookshelf', version, title: 'Bookshelf', summary: 'Books.', author: 'Halden', license: 'MIT', declarations });
  const key = await newAuthorKey('Halden');
  let index = emptyCatalogue('Test');
  for (const t of [text('1.0.0', [books]), text('1.1.0', [books, poll])]) {
    const out = await publishTo(index, t, (p) => {
      try {
        return readFileSync(join(dir, ...p.split('/')), 'utf8');
      } catch {
        return null;
      }
    }, new Date(), key);
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    mkdirSync(join(dir, 'packs', 'bookshelf'), { recursive: true });
    writeFileSync(join(dir, ...out.value.path.split('/')), t);
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index));
  const offers = catalogueOffersFrom(dir);
  const got = await offers([{ id: 'bookshelf', version: '1.0.0', on: true }]);
  assert.equal(got.length, 1);
  assert.equal(got[0]!.to, '1.1.0');
  assert.equal(got[0]!.signedBy, key.key_id);
  assert.deepEqual(got[0]!.hostsAdded, ['books.example.org']);
  assert.equal((got[0]!.body as { install?: string }).install, 'bookshelf');
  assert.deepEqual(await offers([{ id: 'bookshelf', version: '1.1.0', on: true }]), []);
  assert.deepEqual(await offers([{ id: 'bookshelf', version: '1.0.0', on: false }]), []);
  /* A file changed after it was signed is not offered. */
  writeFileSync(join(dir, 'packs', 'bookshelf', '1.1.0.pack.json'), text('1.1.0', [books]));
  assert.deepEqual(await offers([{ id: 'bookshelf', version: '1.0.0', on: true }]), []);
});

test('with no BRAINDOG_CATALOGUE, the catalogue bundled in the built shell is served read-only, by the same two shapes', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bd-bundled-'));
  const shell = join(dir, 'build');
  const folder = join(shell, 'catalogue');
  mkdirSync(join(folder, 'packs', 'reading-list'), { recursive: true });
  writeFileSync(join(shell, 'index.html'), '<!doctype html><title>BrainDog</title>');
  writeFileSync(join(dir, 'secret.json'), '{"not":"yours"}');
  writeFileSync(join(folder, 'index.json'), '{"format":1,"name":"Bundled","entries":[]}');
  writeFileSync(join(folder, 'packs', 'reading-list', '1.0.0.pack.json'), '{"pack":"reading-list"}');
  writeFileSync(join(folder, 'notes.txt'), 'private');
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, pollMs: 0, shell });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
  const get = (path: string, init?: RequestInit) => fetch(`${base}${path}`, init);

  const index = await get('/catalogue/index.json');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type') ?? '', /json/u);
  assert.deepEqual(await index.json(), { format: 1, name: 'Bundled', entries: [] });
  assert.equal(await (await get('/catalogue/packs/reading-list/1.0.0.pack.json')).text(), '{"pack":"reading-list"}');
  for (const path of ['/catalogue/notes.txt', '/catalogue/..%2f..%2fsecret.json', '/catalogue/packs/..%2f..%2f..%2fsecret/1.0.0.pack.json', '/catalogue/packs/reading-list/1.0.1.pack.json', '/catalogue/']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(await res.text(), /yours|private|doctype/u, path);
  }
  /* A PATH THE CLIENT FOLDS OUT OF /catalogue/ is the shell's to answer, and the shell never reads outside its build. */
  for (const path of ['/catalogue/%2e%2e/%2e%2e/secret.json', '/catalogue/../../secret.json']) assert.doesNotMatch(await (await get(path)).text(), /yours|private/u, path);
  assert.equal((await get('/catalogue/index.json', { method: 'PUT', body: '{}' })).status, 405);
});

test('the folder named wins over the bundled one, and a shell with no bundled catalogue serves none', async () => {
  const { catalogueFolder } = await import('../src/catalogue.ts');
  const dir = mkdtempSync(join(tmpdir(), 'bd-folder-'));
  try {
    mkdirSync(join(dir, 'with', 'catalogue'), { recursive: true });
    writeFileSync(join(dir, 'with', 'catalogue', 'index.json'), '{}');
    mkdirSync(join(dir, 'without'), { recursive: true });
    assert.equal(catalogueFolder('/named', join(dir, 'with')), '/named');
    assert.equal(catalogueFolder(undefined, join(dir, 'with')), join(dir, 'with', 'catalogue'));
    assert.equal(catalogueFolder(undefined, join(dir, 'without')), undefined);
    assert.equal(catalogueFolder(undefined, undefined), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
