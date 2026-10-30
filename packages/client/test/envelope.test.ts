/**
 * WHAT THIS CLIENT ACCEPTS AS AN ANSWER, which is the one thing between a broken hop and a caller
 * reading a field off `undefined`.
 *
 * `src/index.ts` already makes the argument: *"THE SHAPE IS CHECKED, not assumed. A proxy that
 * returns its own error page with a 200 would otherwise arrive as a successful call whose value is
 * an HTML string, and the first thing that reads a field off it fails somewhere unrelated."* The
 * check written under it tested `'ok' in body` and nothing about what `ok` was, so the argument
 * held for an HTML page and failed for a JSON one.
 *
 * MEASURED AGAINST THE CODE BEFORE THIS, by handing the client each body below through its own
 * injected `fetch`. `502 {"ok":1,"error":"upstream"}` came back as `{ ok: 1 }`, which every caller
 * in this repository reads with `if (out.ok)` and so treats as a success, with `out.value` at
 * `undefined`. `200 {"ok":true}` came back the same way. Both are the failure the paragraph above
 * says cannot happen, arriving as JSON instead of as markup.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '../src/index.ts';

/** A client whose whole network is one canned answer. */
const answering = (status: number, body: string, type = 'application/json') =>
  createClient({
    base: 'https://braindog.example',
    fetch: (async () => new Response(body, { status, headers: { 'content-type': type } })) as typeof globalThis.fetch,
  });

/* THE REASON IS IN `detail`, AND `fix` IS THE ONE SENTENCE A PERSON READS, the same for every way the record is not
   reached; so the cases below read the reason from `detail`. */
const refusalOf = (out: { ok: boolean } & Record<string, unknown>): { code: string; fix: string; detail?: string } | undefined =>
  (out as { refusal?: { code: string; fix: string; detail?: string } }).refusal;

test('AN `ok` THAT IS NOT A BOOLEAN IS NOT AN ANSWER, whatever else the body carries', async () => {
  for (const [status, body] of [
    [502, '{"ok":1,"error":"upstream"}'],
    [200, '{"ok":"yes"}'],
    [200, '{"ok":null}'],
    [503, '{"ok":0}'],
  ] as const) {
    const out = await answering(status, body).boot();
    assert.equal(out.ok, false, body);
    assert.equal(refusalOf(out)?.code, 'UNREACHABLE', body);
    assert.match(refusalOf(out)?.detail ?? '', new RegExp(`${status} with an answer this client does not recognise`), body);
  }
});

test('AND A SUCCESS THAT CARRIES NO VALUE IS NOT A SUCCESS', async () => {
  /* Every read route of the host was driven through `serveApi` on 2026-09-20 and not one answered
     `{ "ok": true }` with the key absent, so nothing this client talks to loses a value by
     answering correctly. What does answer it is a hop in the middle, and a caller handed
     `{ ok: true, value: undefined }` reads `value.registers` and fails somewhere with no hop in
     the stack. */
  const out = await answering(200, '{"ok":true}').boot();
  assert.equal(out.ok, false);
  assert.equal(refusalOf(out)?.code, 'UNREACHABLE');
  assert.match(refusalOf(out)?.detail ?? '', /carrying no value/);
});

test('and the answers that were already refused are refused in the same words', async () => {
  const html = await answering(502, '<html>bad gateway</html>', 'text/html').boot();
  assert.equal(refusalOf(html)?.fix, 'BrainDog could not be reached.');
  assert.equal(refusalOf(html)?.detail, '502 with a body that is not JSON');

  const bare = await answering(422, '{"ok":false}').boot();
  assert.match(refusalOf(bare)?.detail ?? '', /a failure carrying neither a refusal nor a conflict/);

  const notAnObject = await answering(200, '[]').boot();
  assert.match(refusalOf(notAnObject)?.detail ?? '', /an answer this client does not recognise/);
});

test('AND EVERY REAL ANSWER STILL PASSES THROUGH UNCHANGED, value, refusal and conflict alike', async () => {
  const value = await answering(200, '{"ok":true,"value":{"registers":[],"now":"2026-09-20T00:00:00Z"}}').boot();
  assert.ok(value.ok);
  assert.deepEqual(value.value, { registers: [], now: '2026-09-20T00:00:00Z' });

  /* `null` IS A VALUE AND ABSENT IS NOT. `revokeGrant` answers `Result<null>`, so the key is there
     and holds `null`, and refusing that would refuse the record's own answer. */
  const nothing = await answering(200, '{"ok":true,"value":null}').boot();
  assert.ok(nothing.ok);
  assert.equal(nothing.value, null);

  const refused = await answering(422, '{"ok":false,"refusal":{"code":"REGISTER_UNKNOWN","fix":"There is no register called atlantis."}}').boot();
  assert.equal(refused.ok, false);
  assert.equal(refusalOf(refused)?.code, 'REGISTER_UNKNOWN');

  const clashed = await answering(409, '{"ok":false,"conflict":{"version":41,"current":{"id":"x"},"actor":"p_ada"}}').boot();
  assert.equal(clashed.ok, false);
  assert.deepEqual((clashed as { conflict?: unknown }).conflict, { version: 41, current: { id: 'x' }, actor: 'p_ada' });
});

test('THE KEY DOORS ARE HELD TO THE SAME SHAPES, because they are the same wire and a different path', async () => {
  /* `putKey` and `openKey` do not go through `call` — they are a host step at a fixed path rather
     than a method in `ROUTES` — so the three checks were written out a second time beside them,
     and a repair to one had to be made twice or it was not made at all. */
  const put = await answering(502, '{"ok":1}').putKey({ label: 'Kiln deploy', value: 'bd_fake_value' });
  assert.equal(put.ok, false);
  assert.equal(refusalOf(put)?.code, 'UNREACHABLE');

  const opened = await answering(200, '{"ok":true}').openKey({ label: 'Kiln deploy' });
  assert.equal(opened.ok, false);
  assert.match(refusalOf(opened)?.detail ?? '', /carrying no value/);

  const fine = await answering(200, '{"ok":true,"value":{"credential":"credentials#1","label":"Kiln deploy","value":"bd_fake_value"}}').openKey({ label: 'Kiln deploy' });
  assert.ok(fine.ok);
  assert.equal(fine.value.credential, 'credentials#1');
});
