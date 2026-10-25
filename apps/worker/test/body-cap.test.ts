/**
 * The net under every POST (`body-cap.ts`): a body over its door's ceiling is a 413 with a plain line, before anything
 * reads it; a body at or under passes whole; a door with its own cap is left to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BODY_MOST } from '@braindog/host/abuse';

import { capFor, guardBody } from '../src/body-cap.ts';

const HOST = 'https://brain.example.test';
const post = (path: string, body: string | ReadableStream<Uint8Array> | null, headers: Record<string, string> = {}): Request => new Request(`${HOST}${path}`, { method: 'POST', body, headers });

test('EACH DOOR HAS ITS CEILING, AND A DOOR WITH ITS OWN CAP HAS NONE HERE', () => {
  assert.equal(capFor('/api/create'), BODY_MOST.api.bytes);
  assert.equal(capFor('/app/studio/api/create'), BODY_MOST.api.bytes);
  assert.equal(capFor('/api/import'), BODY_MOST.import.bytes);
  assert.equal(capFor('/app/studio/api/import'), BODY_MOST.import.bytes);
  assert.equal(capFor('/api/sealedPut'), BODY_MOST.sealed.bytes);
  assert.equal(capFor('/app/studio/api/sealedPut'), BODY_MOST.sealed.bytes);
  assert.equal(capFor('/api/sealedGet'), BODY_MOST.api.bytes, 'only the put carries a part');
  assert.equal(capFor('/api/seen'), BODY_MOST.seen.bytes);
  assert.equal(capFor('/api/vault/deposit'), BODY_MOST.keychain.bytes);
  assert.equal(capFor('/mcp'), BODY_MOST.mcp.bytes);
  assert.equal(capFor('/auth/magic/start'), BODY_MOST.auth.bytes);
  assert.equal(capFor('/oauth/token'), BODY_MOST.oauth.bytes);
  assert.equal(capFor('/account/usage'), BODY_MOST.account.bytes);
  assert.equal(capFor('/api/files/abc'), null);
  assert.equal(capFor('/in/webhook/rec_x/y'), null);
  assert.equal(capFor('/app/studio/'), null);
});

test('A DECLARED LENGTH OVER THE CEILING IS A 413 WITH THE PLAIN LINE, UNREAD', async () => {
  const out = await guardBody(post('/api/seen', 'x', { 'content-length': String(BODY_MOST.seen.bytes + 1) }));
  assert.ok(out instanceof Response);
  assert.equal(out.status, 413);
  const body = (await out.json()) as { ok: boolean; refusal: { code: string; fix: string } };
  assert.equal(body.ok, false);
  assert.equal(body.refusal.fix, 'That request is too large. The most this door takes is 2 KB.');
});

test('A BODY AT THE CEILING PASSES, AND ONE WITHOUT A LENGTH IS COUNTED AS IT IS READ', async () => {
  const fits = 'a'.repeat(BODY_MOST.seen.bytes);
  const passed = await guardBody(post('/api/seen', fits));
  assert.ok(passed instanceof Request);
  assert.equal((await passed.text()).length, fits.length, 'handed on whole');

  const chunks = (n: number) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < n; i++) c.enqueue(new Uint8Array(1_024));
        c.close();
      },
    });
  const chunked = (n: number) => new Request(`${HOST}/api/seen`, { method: 'POST', body: chunks(n), duplex: 'half' } as RequestInit);
  assert.ok((await guardBody(chunked(2))) instanceof Request);
  const refused = await guardBody(chunked(3));
  assert.ok(refused instanceof Response);
  assert.equal(refused.status, 413);
});

test('A GET AND A DOOR WITH NO CEILING ARE NEVER TOUCHED', async () => {
  const get = new Request(`${HOST}/api/boot`);
  assert.equal(await guardBody(get), get);
  const filePut = new Request(`${HOST}/api/files`, { method: 'PUT', body: 'x', headers: { 'content-length': '999999999' } });
  assert.equal(await guardBody(filePut), filePut);
});
