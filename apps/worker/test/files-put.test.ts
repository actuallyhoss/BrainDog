/**
 * A file put at the address its hash makes (`src/files.ts`, R.260), over a map standing in for R2: the right hash keeps
 * the bytes and answers their name, one byte changed is `CHECKSUM_MISMATCH` and keeps nothing, the same put twice is one
 * file, and a file read back says `noindex` beside the sandbox policy and `nosniff` (P.166). The Kennel's index carries
 * no CORS header.
 *
 * The bytes are invented: a PNG's eight-byte signature and a few made-up bytes after it, which is all the sniff reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { serveFiles, type FileBucket, type FileDeps } from '../src/files.ts';
import { serveKennel, type KennelDeps } from '../src/kennel.ts';

const HOST = 'https://brain.example.test';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const BEARER = { authorization: `Bearer ${REC}.an-invented-secret-for-this-test` };
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const hashOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** R2 as a map, counting the writes so a second put of the same bytes is seen to write nothing. */
function bucket() {
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  let writes = 0;
  const blobs: FileBucket = {
    async put(key, value, options) {
      writes += 1;
      files.set(key, { bytes: Uint8Array.from(value), type: options?.httpMetadata?.contentType ?? 'application/octet-stream' });
      return {};
    },
    async get(key) {
      const file = files.get(key);
      if (file === undefined) return null;
      const body = new Response(Uint8Array.from(file.bytes)).body as ReadableStream<Uint8Array>;
      return { size: file.bytes.byteLength, body, httpMetadata: { contentType: file.type } };
    },
    async head(key) {
      const file = files.get(key);
      return file === undefined ? null : { size: file.bytes.byteLength, httpMetadata: { contentType: file.type } };
    },
    async delete(keys) {
      for (const key of [keys].flat()) files.delete(key);
    },
  };
  return { blobs, files, writes: () => writes };
}

/** A write token on the record, no session, and a minute that is never spent. */
const depsOf = (blobs: FileBucket | undefined): FileDeps => ({
  blobs,
  session: { origin: HOST, session: async () => ({ status: 401, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' } }), access: async () => null },
  bearer: {
    knows: async (record) => record === REC,
    verify: async () => ({ id: 'tok_ada', person_id: 'p_ada', scope: 'write' }),
    access: async () => ({ level: 'owner', registers: null, levels: {} }),
  },
  limit: async () => null,
});

const put = (path: string, bytes: Uint8Array): Request =>
  new Request(`${HOST}${path}`, { method: 'PUT', headers: { ...BEARER, 'content-type': 'image/png' }, body: Uint8Array.from(bytes) });
const get = (path: string): Request => new Request(`${HOST}${path}`, { headers: BEARER });

type Envelope = { ok?: boolean; sha256?: string; mime?: string; bytes?: number; refusal?: { code: string; fix: string } };

test('a put at the right hash keeps the bytes and answers their name, in the shape PUT /api/files answers', async () => {
  const { blobs, files } = bucket();
  const sha = hashOf(PNG);
  const res = await serveFiles(put(`/api/files/${sha}`, PNG), depsOf(blobs));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Envelope;
  assert.deepEqual(body, { sha256: sha, mime: 'image/png', bytes: PNG.byteLength });
  assert.deepEqual([...files.keys()], [`${REC}/a/${sha}`]);

  const { blobs: other } = bucket();
  const old = await serveFiles(put('/api/files', PNG), depsOf(other));
  assert.deepEqual(await old.json(), body, 'the collection put still answers, in the same shape');
});

test('one byte changed is CHECKSUM_MISMATCH in one sentence, and nothing is kept', async () => {
  const { blobs, files } = bucket();
  const sha = hashOf(PNG);
  const bent = Uint8Array.from(PNG);
  bent[12] = 0xff;
  const res = await serveFiles(put(`/api/files/${sha}`, bent), depsOf(blobs));
  assert.equal(res.status, 422);
  const body = (await res.json()) as Envelope;
  assert.equal(body.ok, false);
  assert.equal(body.refusal?.code, 'CHECKSUM_MISMATCH');
  assert.match(body.refusal?.fix ?? '', /^[^.]+\.$/, 'one sentence');
  assert.equal(files.size, 0);

  const named = await serveFiles(put('/api/files/not-a-hash', PNG), depsOf(blobs));
  assert.equal(named.status, 422, 'a name no bytes could hash to is the same refusal');
  assert.equal(((await named.json()) as Envelope).refusal?.code, 'CHECKSUM_MISMATCH');
  assert.equal(files.size, 0);
});

test('the same put twice is one file, answered the same both times', async () => {
  const { blobs, files, writes } = bucket();
  const sha = hashOf(PNG);
  const first = await serveFiles(put(`/api/files/${sha}`, PNG), depsOf(blobs));
  const second = await serveFiles(put(`/api/files/${sha}`, PNG), depsOf(blobs));
  assert.equal(second.status, first.status);
  assert.deepEqual(await second.json(), await first.json());
  assert.equal(files.size, 1);
  assert.equal(writes(), 1, 'the second put found the bytes there and wrote nothing');
});

test('a file read back says noindex, nosniff and the sandbox policy', async () => {
  const { blobs } = bucket();
  const sha = hashOf(PNG);
  await serveFiles(put(`/api/files/${sha}`, PNG), depsOf(blobs));
  for (const method of ['GET', 'HEAD']) {
    const res = await serveFiles(new Request(`${HOST}/api/files/${sha}`, { method, headers: BEARER }), depsOf(blobs));
    assert.equal(res.status, 200, method);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', method);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', method);
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; sandbox", method);
    assert.equal(res.headers.get('content-type'), 'image/png', method);
  }
  const res = await serveFiles(get(`/app/ada/api/files/${sha}`), { ...depsOf(blobs), bearer: { ...depsOf(blobs).bearer, named: async () => REC } });
  assert.equal(res.headers.get('x-robots-tag'), 'noindex', 'under a record name as well');
});

test('GET /api/files/ with no hash is still 405, so nothing lists', async () => {
  const { blobs } = bucket();
  for (const path of ['/api/files/', '/api/files']) {
    const res = await serveFiles(get(path), depsOf(blobs));
    assert.equal(res.status, 405, path);
    assert.equal(res.headers.get('allow'), 'PUT', path);
  }
  const sha = hashOf(PNG);
  const del = await serveFiles(new Request(`${HOST}/api/files/${sha}`, { method: 'DELETE', headers: BEARER }), depsOf(blobs));
  assert.equal(del.status, 405);
  assert.equal(del.headers.get('allow'), 'GET, HEAD, PUT');
});

test("the Kennel's index answer carries no access-control-allow-origin, nor its refusals", async () => {
  const deps: KennelDeps = {
    blobs: undefined,
    assets: { fetch: async () => new Response(JSON.stringify({ format: 1, name: 'BrainDog', entries: [] }), { headers: { 'content-type': 'application/json' } }) },
    operator: undefined,
    origin: HOST,
    session: async () => ({ status: 401, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' } }),
    bearer: { knows: async () => false, verify: async () => null, access: async () => null },
    now: () => new Date('2026-10-15T10:00:00Z'),
  };
  for (const path of ['index.json', 'counts.json', 'packs/nothing/1.0.0.pack.json', 'nowhere']) {
    const res = await serveKennel(new Request(`${HOST}/api/kennel/v1/${path}`), deps);
    const cors = [...res.headers.keys()].filter((name) => name.startsWith('access-control-'));
    assert.deepEqual(cors, [], `${path} answered ${res.status} with ${cors.join(', ')}`);
    if (path === 'index.json') assert.equal(res.status, 200, 'the index itself answered');
  }
});
