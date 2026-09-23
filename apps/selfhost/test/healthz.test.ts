/**
 * `GET /healthz` on the self-host, answered as the Worker answers it (ROADMAP W55).
 *
 * MEASURED AT afb3b1b2, BEFORE THIS FILE: a server started with a token answered `GET /healthz` with 404
 * `ROUTE_UNKNOWN`, "A record method is at /api/<method>.", because the path fell through to the record's router. A
 * container's health check read the process as unhealthy for as long as it ran.
 *
 * WITH A TOKEN SET, ON PURPOSE. A probe sends no credential, and a check that had to be handed the token to get an
 * answer would be a secret in a compose file for a question that needs none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../src/server.ts';

const bound = (running: { server: { address(): unknown } }) => (running.server.address() as { port: number }).port;

test('GET /healthz IS 200 WITH ok AND THE BUILD, no-store, and needs no credential on a server that has one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-healthz-'));
  try {
    for (const [build, said] of [['2026.09.23+abc1234', '2026.09.23+abc1234'], ['', null]] as const) {
      const running = await start({ file: join(dir, `${said ?? 'none'}.sqlite`), port: 0, token: 'a-token-this-probe-does-not-carry', build });
      try {
        const base = `http://127.0.0.1:${bound(running)}`;
        const got = await fetch(`${base}/healthz`);
        assert.equal(got.status, 200, await got.clone().text());
        assert.equal(got.headers.get('cache-control'), 'no-store');
        assert.match(got.headers.get('content-type') ?? '', /^application\/json/);
        assert.deepEqual(await got.json(), { ok: true, app: said });

        const head = await fetch(`${base}/healthz`, { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(head.headers.get('cache-control'), 'no-store');
        assert.equal(await head.text(), '');

        const posted = await fetch(`${base}/healthz`, { method: 'POST', body: '{}' });
        assert.equal(posted.status, 405);
        assert.equal(posted.headers.get('allow'), 'GET, HEAD');

        assert.equal((await fetch(`${base}/healthz/`)).status, 200);
        assert.notEqual((await fetch(`${base}/healthz/x`)).status, 200);
      } finally {
        await running.close();
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
