/**
 * An `/api` body is weighed as it arrives.
 *
 * THE WORKER HAD NO CAP AT ALL. `serveApi` read every POST with `request.json()`, so the only ceiling on the Cloud was
 * the platform's own, and the whole body was held in the record's Durable Object, whose memory is 128 MB
 * (`docs/01-ARCHITECTURE.md`), before one byte of it was looked at. The self-host weighed it against 100 MiB at its
 * socket, which is a number chosen for `import` and applied to every method. `51-SPEC-WORKER` has said 1 MB for the
 * API since it was written; `/mcp` already holds it (`packages/mcp/src/http.ts`, `MAX_BODY_BYTES`).
 *
 * `import` IS THE ONE METHOD WHOSE BODY IS A WHOLE FILE, and a flat megabyte would have broken it: a real copy measured
 * 95 bytes a row, so 1 MiB is about 11,000 rows. It keeps a ceiling of its own, and the
 * argument for its number is at its declaration in `src/index.ts`.
 *
 * THE HANDLERS HERE ARE FAKES THAT COUNT. Whether the record would have accepted the row is not the question; whether
 * the handler was reached at all is, because a 413 that arrives after the handler ran has already spent the memory.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

/* A NAMESPACE IMPORT, so this file loads against a tree that does not export the ceilings yet: the red is then an
   assertion about a handler that ran, rather than a link error that says nothing about the body. */
import * as host from '../src/index.ts';

const MiB = 1_048_576;

type Answer = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };

/** Handlers for `create` and `import` that remember what reached them. */
function counting() {
  const reached: { name: string; args: Record<string, unknown> }[] = [];
  const handlers: Record<string, host.Handler> = {
    create: async (args) => (reached.push({ name: 'create', args }), ok({ id: 'r_1' })),
    import: async (args) => (reached.push({ name: 'import', args }), ok({ tables: 1, rows: 1 })),
  };
  return { reached, handlers };
}

/** A JSON body of about `bytes` bytes, as `create` would send it. */
const createOf = (bytes: number): string => JSON.stringify({ list: 'notes', values: { what: 'x'.repeat(bytes) } });

/** A `.brainl` in the body `import` takes: one line per row, each about the 95 bytes a real copy measured. */
function importOf(bytes: number): { body: string; lines: string[] } {
  const line = JSON.stringify({ t: 'dog_row', id: 'r_01JZ8QK3F7R2M9V4XN6TCB5HAD', v: 'x'.repeat(40) });
  const lines = Array.from({ length: Math.ceil(bytes / (line.length + 3)) }, () => line);
  return { body: JSON.stringify({ lines, replace: true }), lines };
}

/**
 * A body sent in 64 KiB pieces with no `Content-Length`, counting the pieces that were asked for.
 *
 * CHUNKED IS THE CASE THAT MATTERS. A declared length is a claim the sender makes, and a sender that makes none is
 * weighed only by counting; `pulled` is how the test sees the reading stop rather than run to the end.
 */
function streamed(text: string): { body: ReadableStream<Uint8Array>; pulled: () => number; pieces: number } {
  const bytes = new TextEncoder().encode(text);
  const size = 64 * 1024;
  let at = 0;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.byteLength) return controller.close();
      pulls += 1;
      controller.enqueue(bytes.subarray(at, at + size));
      at += size;
    },
  });
  return { body, pulled: () => pulls, pieces: Math.ceil(bytes.byteLength / size) };
}

const post = (name: string, body: RequestInit['body'], headers: Record<string, string> = {}): Request =>
  new Request(`https://record.test/api/${name}`, { method: 'POST', body, headers, duplex: 'half' } as RequestInit);

test('A 2 MIB CREATE IS 413 BEFORE THE HANDLER RUNS, AND A 5 MIB IMPORT STILL REACHES ITS HANDLER', async () => {
  const { reached, handlers } = counting();

  const big = createOf(2 * MiB);
  const res = await host.serveApi(post('create', big), handlers, {});
  assert.equal(res.status, 413, await res.clone().text());
  const body = (await res.json()) as Answer;
  /* `BODY_MALFORMED`, AS `/in/*` ANSWERS IT (`src/ingest.ts`, `tooBig`): the registry has no code for "too big", and
     the status is what says it was the size. */
  assert.equal(body.refusal?.code, 'BODY_MALFORMED');
  assert.equal(body.refusal?.at, 'body');
  assert.match(body.refusal?.fix ?? '', /create/);
  assert.equal(reached.length, 0, 'the handler ran on a 2 MiB body');

  const file = importOf(5 * MiB);
  assert.ok(file.body.length > 5 * MiB);
  const back = await host.serveApi(post('import', file.body), handlers, {});
  assert.equal(back.status, 200, await back.clone().text());
  assert.equal(reached.length, 1);
  assert.equal(reached[0]?.name, 'import');
  assert.equal((reached[0]?.args.lines as string[]).length, file.lines.length, 'every line arrived');
});

test('A FOUR-MEBIBYTE PART OF A SEALED FILE REACHES sealedPut, AND A BODY PAST SIX IS 413 BEFORE IT RUNS', async () => {
  const reached: number[] = [];
  const handlers: Record<string, host.Handler> = {
    sealedPut: async (args) => (reached.push(String(args.bytes).length), ok({ key: 'sync/key', part: 0, parts: 2, complete: false })),
    create: async () => ok({ id: 'r_1' }),
  };
  const part = JSON.stringify({ key: 'sync/key', part: 0, parts: 2, size: 5 * MiB, sha256: 'a'.repeat(64), bytes: Buffer.alloc(4 * MiB, 7).toString('base64') });
  assert.ok(part.length > host.API_BODY_MOST_BYTES && part.length < host.SEALED_BODY_MOST_BYTES);
  const fits = await host.serveApi(post('sealedPut', part), handlers, {});
  assert.equal(fits.status, 200, await fits.clone().text());
  assert.equal(reached[0], 5_592_408, 'the part did not arrive whole');

  const heavy = await host.serveApi(post('sealedPut', JSON.stringify({ key: 'sync/key', bytes: 'A'.repeat(7 * MiB) })), handlers, {});
  assert.equal(heavy.status, 413);
  assert.match(((await heavy.json()) as Answer).refusal?.fix ?? '', /sealedPut/);
  assert.equal(reached.length, 1, 'the handler ran on a body past the part ceiling');

  /* AND THE CEILING IS THE PUT'S ALONE: the same body to any other method is past its megabyte. */
  assert.equal((await host.serveApi(post('create', part), handlers, {})).status, 413);
});

test('a body with no Content-Length is counted as it arrives, and the reading stops at the first piece over', async () => {
  const { reached, handlers } = counting();
  const sent = streamed(createOf(4 * MiB));
  const res = await host.serveApi(post('create', sent.body), handlers, {});
  assert.equal(res.status, 413);
  assert.equal(reached.length, 0);
  /* SEVENTEEN PIECES OF 64 KiB IS THE FIRST COUNT OVER A MEBIBYTE, and a reader that read to the end first would have
     asked for all sixty-five. A stream may be pulled one piece ahead of the reader, so one more is allowed. */
  assert.ok(sent.pulled() <= 18, `read ${sent.pulled()} of ${sent.pieces} pieces before refusing`);
});

test('a declared Content-Length over the cap is refused on the claim, before a byte is read', async () => {
  const { reached, handlers } = counting();
  const sent = streamed(createOf(2 * MiB));
  const res = await host.serveApi(post('create', sent.body, { 'content-length': String(2 * MiB + 40) }), handlers, {});
  assert.equal(res.status, 413);
  assert.equal(reached.length, 0);
  assert.ok(sent.pulled() <= 1, `read ${sent.pulled()} pieces of a body its own header had already refused`);
});

test('a body just under the cap is answered as it always was, and so is one that is not JSON', async () => {
  const { reached, handlers } = counting();
  const res = await host.serveApi(post('create', createOf(MiB - 1024)), handlers, {});
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(reached.length, 1);

  const bad = await host.serveApi(post('create', '{"list":'), handlers, {});
  assert.equal(bad.status, 400);
  assert.equal(((await bad.json()) as Answer).refusal?.code, 'BODY_MALFORMED');

  /* A BYTE-ORDER MARK, WHICH `request.json()` READ PAST. The body is decoded by hand now, and a client that writes one
     (Windows PowerShell 5.1's `Out-File -Encoding utf8` does) must not start getting 400s it never got before. */
  const marked = await host.serveApi(post('create', new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"list":"notes"}')])), handlers, {});
  assert.equal(marked.status, 200, await marked.clone().text());
});

test('the two ceilings are exported by name, and import has its own above the megabyte', async () => {
  assert.equal(host.API_BODY_MOST_BYTES, MiB);
  assert.ok(typeof host.IMPORT_BODY_MOST_BYTES === 'number' && host.IMPORT_BODY_MOST_BYTES > 5 * MiB);

  const { reached, handlers } = counting();
  const res = await host.serveApi(
    post('import', '{}', { 'content-length': String(host.IMPORT_BODY_MOST_BYTES + 1) }),
    handlers,
    {},
  );
  assert.equal(res.status, 413, 'import has a ceiling, not an exemption');
  assert.equal(reached.length, 0);
});
