/**
 * `GET /healthz` and `GET /.well-known/braindog-key` on the self-host (ROADMAP W55, `53 §13 #9`, `03 §4`).
 *
 * MEASURED AT afb3b1b2, BEFORE THE FIRST TEST HERE: a server started with a token answered `GET /healthz` with 404
 * `ROUTE_UNKNOWN`, "A record method is at /api/<method>.", because the path fell through to the record's router. A
 * container's health check read the process as unhealthy for as long as it ran. deb5b703 answered `{ ok, app }`.
 *
 * MEASURED AT 1586f2a2, BEFORE THE REST: the answer carried `ok` and `app` and none of `53 §13 #9`'s `format`, `kernel`
 * and `primitives`; a record whose ledger names a migration this build does not have never reached a 503, because
 * `start()` called `process.exit(1)` on the module-level refusal, so the file running it died and a container's check
 * saw a process gone rather than a code; and `/.well-known/braindog-key` was the router's 404, so `braindog verify
 * --key <url>` had nowhere on a self-host to fetch the key from.
 *
 * `ok` STAYS BESIDE THE TUPLE. `apps/worker/test/healthz.test.ts` pins `{ ok: true, app }` on the Worker, and a monitor
 * pointed at both hosts reads one shape; the spec's four fields are added to it, not swapped for it.
 *
 * WITH A TOKEN SET, ON PURPOSE. A probe sends no credential, and a check that had to be handed the token to get an
 * answer would be a secret in a compose file for a question that needs none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { openSqlite, start } from '../src/server.ts';

const bound = (running: { server: { address(): unknown } }) => (running.server.address() as { port: number }).port;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const TOKEN = 'a-token-this-probe-does-not-carry';

test('GET /healthz IS 200 WITH ok, THE BUILD AND 53 §13 #9’s TUPLE, no-store, and needs no credential on a server that has one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-healthz-'));
  try {
    for (const [build, said] of [['2026.09.23+abc1234', '2026.09.23+abc1234'], ['', null]] as const) {
      const running = await start({ file: join(dir, `${said ?? 'none'}.sqlite`), port: 0, token: TOKEN, build });
      try {
        const base = `http://127.0.0.1:${bound(running)}`;
        const got = await fetch(`${base}/healthz`);
        assert.equal(got.status, 200, await got.clone().text());
        assert.equal(got.headers.get('cache-control'), 'no-store');
        assert.match(got.headers.get('content-type') ?? '', /^application\/json/);
        const body = (await got.json()) as Record<string, unknown>;
        /* THE SAME THREE NUMBERS `/api/version` ANSWERS BEHIND A CREDENTIAL, so a monitor and the app never disagree. */
        const version = (await (await fetch(`${base}/api/version`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()) as { value: Record<string, unknown> };
        assert.deepEqual(body, { ok: true, app: said, format: FORMAT_VERSION, kernel: KERNEL_MIGRATION, primitives: version.value.primitives });
        assert.equal(typeof body.primitives, 'number');

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

test('A RECORD THIS BUILD REFUSES KEEPS ITS PROCESS, AND /healthz IS 503 WITH THE CODE AND NO SLUG', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-healthz-refused-'));
  const file = join(dir, 'record.brain');
  try {
    const first = await start({ file, port: 0, pollMs: 0 });
    assert.ok(first.api.kernel.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_self' } }).ok);
    await first.close();
    /* A LEDGER ROW FROM A NEWER BUILD, which is what a rollback past a migration leaves: `SCHEMA_NEWER`. */
    const sql = openSqlite(file);
    sql.exec("INSERT INTO migration (version, applied_at, checksum) VALUES (9999, '2026-09-23T00:00:00.000Z', 'from-a-newer-build')");
    sql.close();

    const running = await start({ file, port: 0, pollMs: 0, token: TOKEN });
    try {
      const base = `http://127.0.0.1:${bound(running)}`;
      const got = await fetch(`${base}/healthz`);
      const raw = await got.text();
      assert.equal(got.status, 503, raw);
      assert.equal(got.headers.get('cache-control'), 'no-store');
      assert.deepEqual(JSON.parse(raw), { ok: false, code: 'SCHEMA_NEWER' });
      assert.ok(!raw.includes('the-studio') && !raw.includes(REC), 'the health answer named the record');
      assert.equal((await fetch(`${base}/healthz`, { method: 'HEAD' })).status, 503);
      /* AND EVERY RECORD CALL IS THE SAME REFUSAL, AT THE SAME STATUS, until a build that reads the file is deployed. */
      const boot = await fetch(`${base}/api/boot`, { headers: { authorization: `Bearer ${TOKEN}` } });
      assert.equal(boot.status, 503);
      assert.equal(((await boot.json()) as { refusal?: { code: string } }).refusal?.code, 'SCHEMA_NEWER');
    } finally {
      await running.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /.well-known/braindog-key IS THE KEY THE RECORD SIGNS WITH, to anybody, and a record with no signer says so', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-key-door-'));
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0, token: TOKEN, keys: store });
    try {
      const base = `http://127.0.0.1:${bound(running)}`;
      /* BEFORE THERE IS A RECORD THERE IS NO KEY, and the answer says so rather than inventing one. */
      const early = await fetch(`${base}/.well-known/braindog-key`);
      assert.equal(early.status, 404, await early.clone().text());
      assert.equal(((await early.json()) as { refusal?: { code: string } }).refusal?.code, 'NOT_IN_THIS_BUILD');

      assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' }, keys: await recordKeys(store, REC) } as never)).ok);
      const got = await fetch(`${base}/.well-known/braindog-key`);
      assert.equal(got.status, 200, await got.clone().text());
      assert.equal(got.headers.get('cache-control'), 'no-store');
      const key = (await got.json()) as { key_id: string; public_key: string };
      assert.deepEqual(Object.keys(key).sort(), ['key_id', 'public_key']);
      assert.match(key.public_key, /^[A-Za-z0-9_-]{43}$/);

      /* THE SAME KEY AN EXPORT'S `dog_sig` CARRIES, which is the whole use of it: `braindog verify --key <url>`. */
      const exported = await running.api.kernel.export();
      assert.ok(exported.ok);
      const at = exported.value.findIndex((l) => l.startsWith('#table dog_sig '));
      const columns = exported.value[at]!.slice('#table dog_sig '.length).split(' ')[0]!.split(',');
      const row = JSON.parse(exported.value[at + 1]!) as string[];
      assert.equal(key.key_id, row[columns.indexOf('key_id')]);
      assert.equal(key.public_key, row[columns.indexOf('public_key')]);

      assert.equal((await fetch(`${base}/.well-known/braindog-key`, { method: 'HEAD' })).status, 200);
      const posted = await fetch(`${base}/.well-known/braindog-key`, { method: 'POST', body: '{}' });
      assert.equal(posted.status, 405);
      assert.equal(posted.headers.get('allow'), 'GET, HEAD');
    } finally {
      await running.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
