/**
 * Sealed files on a self-host (`src/sealed.ts`): put in parts through `/api`, a four-mebibyte part through the door's
 * body cap, read back as they went, kept in `blobs/sealed/` readable by this user alone, and never served by the file
 * door, which reads `blobs/` beside them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SEALED_NAME, sealedName } from '@braindog/record';

import { diskSealed, sealedFolder } from '../src/sealed.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const MIB = 1_048_576;
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const listed = (folder: string): string[] => {
  try {
    return readdirSync(folder).sort();
  } catch {
    return [];
  }
};

test('THE STORE KEEPS A PART UNDER ITS NAME, READABLE BY THIS USER ALONE, AND REFUSES A NAME IT DID NOT MAKE', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'bd-sealed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const blobs = join(root, 'blobs');
  const store = diskSealed(blobs);
  const name = await sealedName('sync/key', 'c'.repeat(64), 0);
  await store.put(name, Uint8Array.of(1, 2, 3));
  assert.deepEqual(listed(sealedFolder(blobs)), [name], 'a temporary name was left behind');
  if (process.platform !== 'win32') assert.equal(statSync(join(sealedFolder(blobs), name)).mode & 0o777, 0o600);
  assert.deepEqual(await store.get(name), Uint8Array.of(1, 2, 3));
  assert.equal(await store.get(await sealedName('sync/key', 'c'.repeat(64), 1)), null);
  for (const bad of ['sync/key', `../${'a'.repeat(64)}`, `${'a'.repeat(64)}.${'c'.repeat(64)}.9`]) await assert.rejects(store.put(bad, Uint8Array.of(1)), /named by its key/);
  await store.drop([name, name]);
  assert.deepEqual(listed(sealedFolder(blobs)), []);
});

test('A FILE IN TWO PARTS GOES IN THROUGH /api, A FOUR-MEBIBYTE PART INCLUDED, AND COMES BACK AS IT WENT', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-sealed-'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, pollMs: 0 });
  try {
    assert.ok(running.api.kernel.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_self' } }).ok);
    const port = (running.server.address() as { port: number }).port;
    const call = async (path: string, body?: unknown): Promise<{ status: number; body: { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; at?: string } } }> => {
      const res = await fetch(`http://127.0.0.1:${port}/api/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as never };
    };

    const file = Uint8Array.from({ length: 4 * MIB + 10 }, (_, i) => (i * 7) % 256);
    const part = (n: number) => ({ key: 'carry/notes/1', part: n, parts: 2, size: file.byteLength, sha256: sha(file), bytes: Buffer.from(n === 0 ? file.subarray(0, 4 * MIB) : file.subarray(4 * MIB)).toString('base64') });
    const first = await call('sealedPut', part(0));
    assert.equal(first.status, 200, JSON.stringify(first.body.refusal));
    assert.equal(first.body.value?.complete, false);
    const second = await call('sealedPut', part(1));
    assert.equal(second.body.value?.complete, true);

    const files = (await call('sealedList?prefix=carry/')).body.value?.files as { key: string; complete: boolean; size: number }[];
    assert.deepEqual(files.map((f) => [f.key, f.complete, f.size]), [['carry/notes/1', true, 4 * MIB + 10]]);
    const back = await call('sealedGet?key=carry/notes/1&part=0');
    assert.deepEqual(Buffer.from(String(back.body.value?.bytes), 'base64'), Buffer.from(file.subarray(0, 4 * MIB)));

    const folder = sealedFolder(join(dir, 'blobs'));
    const names = listed(folder);
    assert.equal(names.length, 2);
    for (const name of names) assert.match(name, SEALED_NAME);
    assert.deepEqual(names, [await sealedName('carry/notes/1', sha(file), 0), await sealedName('carry/notes/1', sha(file), 1)].sort());

    /* THE FILE DOOR READS `blobs/` BY HASH, and a sealed part is under no address it answers. */
    const door = await fetch(`http://127.0.0.1:${port}/api/files/sealed`);
    assert.equal(door.status, 404);
    await door.body?.cancel();

    assert.deepEqual((await call('sealedDelete', { key: 'carry/notes/1' })).body.value, { key: 'carry/notes/1', deleted: true });
    assert.deepEqual(listed(folder), []);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
