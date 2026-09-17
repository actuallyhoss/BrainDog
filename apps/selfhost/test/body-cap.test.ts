/**
 * A request body is weighed as it arrives, before anybody is known: a host bound to every interface held every byte of a
 * body in memory before it read the credential, so anybody who could reach it could send gigabytes with no key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BODY_MOST_BYTES, start } from '../src/server.ts';

/** Obviously not a real key. */
const SERVER_KEY = 'fake-server-key-for-body-cap';

/** The status a POST answers, sending `send` bytes in megabyte chunks, with `length` as its Content-Length when given. */
function post(port: number, send: number, length?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/api/report',
        headers: { 'content-type': 'application/json', ...(length === undefined ? {} : { 'content-length': String(length) }) },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    /* The server closes the socket once it has answered, so a write after that is expected to fail. */
    req.on('error', (e) => (/EPIPE|ECONNRESET|ECANCELED/.test(e.message) ? setTimeout(() => resolve(-1), 2000) : reject(e)));
    const chunk = Buffer.alloc(1024 * 1024, 32);
    let left = send;
    const pump = (): void => {
      while (left > 0) {
        const n = Math.min(left, chunk.length);
        left -= n;
        if (!req.write(chunk.subarray(0, n))) {
          req.once('drain', pump);
          return;
        }
      }
      req.end();
    };
    pump();
  });
}

test('A BODY PAST THE CAP IS 413 BEFORE ANY CREDENTIAL IS READ, by what it says it weighs and by what arrives', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-body-'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, token: SERVER_KEY, host: '127.0.0.1' });
  const port = (running.server.address() as { port: number }).port;
  try {
    /* SAYS IT IS LARGER, and sends a kilobyte: refused without waiting for the rest. */
    assert.equal(await post(port, 1024, BODY_MOST_BYTES + 1), 413);
    /* SAYS NOTHING, and keeps sending: cut off once the cap is passed. The 413 is written, and a sender still writing
       usually reads the closed connection first (-1). What it never reads is the 401 of a body that was held whole. */
    assert.ok([413, -1].includes(await post(port, BODY_MOST_BYTES + 2 * 1024 * 1024)));
    /* An ordinary body with no credential is still the 401 it was. */
    assert.equal(await post(port, 2), 401);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
