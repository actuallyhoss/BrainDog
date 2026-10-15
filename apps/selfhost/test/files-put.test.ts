/**
 * A file put at the address its hash makes on the self-host (`src/files.ts`), held to the Worker's answers
 * (`apps/worker/test/files-put.test.ts`): the right hash keeps the bytes and answers their name, one byte changed is
 * `CHECKSUM_MISMATCH` and keeps nothing, the same put twice is one file, and a file read back says `noindex` beside the
 * sandbox policy and `nosniff`. The Kennel's index carries no CORS header, as on the Cloud.
 *
 * The bytes are invented: a PNG's eight-byte signature and a few made-up bytes after it, which is all the sniff reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CallContext } from '@braindog/record';
import { KENNEL_BASE } from '@braindog/declare/kennel';

import { serveFiles } from '../src/files.ts';
import { kennelAnswer } from '../src/kennel.ts';

const HOST = 'http://localhost:4242';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const hashOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const WRITER = { principal: { kind: 'token', id: 'tok_ada', scope: 'write', person: 'p_ada', level: 'owner' } } as unknown as CallContext;

/** A fresh `blobs/` folder per test, gone when the test is. */
function folder(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(join(tmpdir(), 'bd-files-put-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return join(root, 'blobs');
}
const kept = (blobs: string): string[] => {
  try {
    return readdirSync(blobs);
  } catch {
    return [];
  }
};

const put = (path: string, bytes: Uint8Array): Request =>
  new Request(`${HOST}${path}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: Uint8Array.from(bytes) });

type Envelope = { ok?: boolean; sha256?: string; mime?: string; bytes?: number; refusal?: { code: string; fix: string } };

test('a put at the right hash keeps the bytes and answers their name, in the shape PUT /api/files answers', async (t) => {
  const blobs = folder(t);
  const sha = hashOf(PNG);
  const res = await serveFiles(put(`/api/files/${sha}`, PNG), WRITER, blobs);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Envelope;
  assert.deepEqual(body, { sha256: sha, mime: 'image/png', bytes: PNG.byteLength });
  assert.deepEqual(kept(blobs), [sha]);

  const old = await serveFiles(put('/api/files', PNG), WRITER, folder(t));
  assert.deepEqual(await old.json(), body, 'the collection put still answers, in the same shape');
});

test('one byte changed is CHECKSUM_MISMATCH in one sentence, and nothing is kept', async (t) => {
  const blobs = folder(t);
  const sha = hashOf(PNG);
  const bent = Uint8Array.from(PNG);
  bent[12] = 0xff;
  const res = await serveFiles(put(`/api/files/${sha}`, bent), WRITER, blobs);
  assert.equal(res.status, 422);
  const body = (await res.json()) as Envelope;
  assert.equal(body.ok, false);
  assert.equal(body.refusal?.code, 'CHECKSUM_MISMATCH');
  assert.match(body.refusal?.fix ?? '', /^[^.]+\.$/, 'one sentence');
  assert.deepEqual(kept(blobs), []);

  const named = await serveFiles(put('/api/files/not-a-hash', PNG), WRITER, blobs);
  assert.equal(named.status, 422, 'a name no bytes could hash to is the same refusal');
  assert.equal(((await named.json()) as Envelope).refusal?.code, 'CHECKSUM_MISMATCH');
  assert.deepEqual(kept(blobs), []);
});

test('the same put twice is one file, answered the same both times', async (t) => {
  const blobs = folder(t);
  const sha = hashOf(PNG);
  const first = await serveFiles(put(`/api/files/${sha}`, PNG), WRITER, blobs);
  const written = statSync(join(blobs, sha)).ino;
  const second = await serveFiles(put(`/api/files/${sha}`, PNG), WRITER, blobs);
  assert.equal(second.status, first.status);
  assert.deepEqual(await second.json(), await first.json());
  assert.deepEqual(kept(blobs), [sha], 'one file, and no stray temporary one');
  assert.equal(statSync(join(blobs, sha)).ino, written, 'the second put found the bytes there and wrote nothing');
});

test('a file read back says noindex, nosniff and the sandbox policy', async (t) => {
  const blobs = folder(t);
  const sha = hashOf(PNG);
  await serveFiles(put(`/api/files/${sha}`, PNG), WRITER, blobs);
  for (const method of ['GET', 'HEAD']) {
    const res = await serveFiles(new Request(`${HOST}/api/files/${sha}`, { method }), WRITER, blobs);
    assert.equal(res.status, 200, method);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', method);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', method);
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; sandbox", method);
    assert.equal(res.headers.get('content-type'), 'image/png', method);
  }
});

test('GET /api/files/ with no hash is still 405, so nothing lists', async (t) => {
  const blobs = folder(t);
  for (const path of ['/api/files/', '/api/files']) {
    const res = await serveFiles(new Request(`${HOST}${path}`), WRITER, blobs);
    assert.equal(res.status, 405, path);
    assert.equal(res.headers.get('allow'), 'PUT', path);
  }
  const del = await serveFiles(new Request(`${HOST}/api/files/${hashOf(PNG)}`, { method: 'DELETE' }), WRITER, blobs);
  assert.equal(del.status, 405);
  assert.equal(del.headers.get('allow'), 'GET, HEAD, PUT');
});

test("the Kennel's index answer carries no access-control-allow-origin, nor its refusals", async () => {
  const deps = { kennel: 'off', fetch: async () => new Response(null, { status: 404 }), now: () => Date.parse('2026-10-15T10:00:00Z') };
  for (const path of ['index.json', 'counts.json', 'packs/nothing/1.0.0.pack.json', 'nowhere']) {
    const answer = await kennelAnswer('GET', `${KENNEL_BASE}${path}`, undefined, deps);
    const cors = Object.keys(answer.headers).filter((name) => name.toLowerCase().startsWith('access-control-'));
    assert.deepEqual(cors, [], `${path} answered ${answer.status} with ${cors.join(', ')}`);
    if (path === 'index.json') assert.equal(answer.status, 200, 'the index itself answered');
  }
});
