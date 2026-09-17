/**
 * A catalogue folder served read-only under `/catalogue/`: the index and each version's file, and nothing else in the
 * folder, whatever the path says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
