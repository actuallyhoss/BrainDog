/**
 * Spark is called Slash, and a self-host that ran the old build has its ledger in `<dir>/spark.sqlite`.
 *
 * WHAT A RENAME WITHOUT THIS LOSES. The file holds the `settings` row an owner chose and the `call` ledger the month is
 * metered from (`46 §4.1`, `test/slash-meter-persists.test.ts`). A build that opened `slash.sqlite` and nothing else
 * would start both from the defaults on the first boot after the upgrade: the cap an owner lowered goes back to 80 and
 * the asks already spent this month are forgotten. So the file is moved.
 *
 * THE ROW IS IN THE WAL AND NOT IN THE MAIN FILE, on purpose. `openSqlite` runs every file in WAL mode, so an old process
 * that died between checkpoints leaves its newest rows in `spark.sqlite-wal` alone. A move that renamed the main file and
 * left the WAL behind would open a database with no `settings` table at all, and this test would read `undefined`.
 *
 * AND THE OLD DOOR IS GONE. The rename leaves no alias, so `/api/spark/read` is a path this host does not know and
 * `serveApi` answers it the way it answers any unknown method, 404 `ROUTE_UNKNOWN`.
 *
 * RED BEFORE THE MOVE, MEASURED against the tree before the rename: 2 tests, 0 pass. The first failed at
 * its first assertion, "spark.sqlite is still beside the record after the boot"; the second at its premise, because a
 * boot on a fresh directory wrote `spark.sqlite` and no `slash.sqlite`.
 *
 * THE MODEL IS THE ONLY DOUBLE: a real `start`, a real socket, real files on disk.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { openSqlite, start } from '../src/server.ts';

const DRAFT = '{"registers":["things"],"where":null,"q":"Kiln"}';
const OLD = ['spark.sqlite', 'spark.sqlite-wal', 'spark.sqlite-shm'];

const model = {
  url: 'http://127.0.0.1:11434/v1/chat/completions',
  model: 'small',
  key: 'fake-operator-key',
  send: async () =>
    new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: DRAFT } }], usage: { prompt_tokens: 400, completion_tokens: 12 } }), {
      status: 200,
    }),
};

/**
 * `<dir>/spark.sqlite` as the old build left it: WAL mode, autocheckpoint off, and the `settings` row an owner chose
 * (`ask_cap` 7, which no default is) living in `spark.sqlite-wal` alone. Written in a staging directory and copied while
 * the writer is still open, because closing the last connection checkpoints the WAL into the main file and deletes it.
 */
function oldLedger(dir: string): void {
  const staging = mkdtempSync(join(tmpdir(), 'braindog-slash-staging-'));
  const db = new DatabaseSync(join(staging, 'spark.sqlite'));
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA wal_autocheckpoint = 0');
    db.exec(`CREATE TABLE settings (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1), tier TEXT NOT NULL DEFAULT 'a', model TEXT, grant_id TEXT,
      ask_cap INTEGER NOT NULL DEFAULT 80, updated_at TEXT NOT NULL)`);
    db.exec("INSERT INTO settings (singleton, tier, ask_cap, updated_at) VALUES (1, 'a', 7, '2026-09-20T00:00:00.000Z')");
    copyFileSync(join(staging, 'spark.sqlite'), join(dir, 'spark.sqlite'));
    copyFileSync(join(staging, 'spark.sqlite-wal'), join(dir, 'spark.sqlite-wal'));
  } finally {
    db.close();
    rmSync(staging, { recursive: true, force: true });
  }
  assert.ok(statSync(join(dir, 'spark.sqlite-wal')).size > 0, 'the premise: the old row is in the WAL');
}

const askAt = async (origin: string, path: string) => {
  const res = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ question: 'Kiln' }),
  });
  const raw = await res.text();
  return { status: res.status, raw, code: (raw ? (JSON.parse(raw) as { refusal?: { code?: string } }).refusal?.code : undefined) };
};

test("AN OLD SELF-HOST'S spark.sqlite, WAL AND ALL, IS slash.sqlite AFTER THE FIRST BOOT, and the owner's cap is still 7", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-slash-file-'));
  try {
    oldLedger(dir);
    const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0, host: '127.0.0.1', slash: model });
    try {
      for (const p of OLD) assert.equal(existsSync(join(dir, p)), false, `${p} is still beside the record after the boot`);
      assert.ok(existsSync(join(dir, 'slash.sqlite')), 'no slash.sqlite beside the record');
      /* IT HOLDS THE CONVERSATIONS, so it is the owner's alone, as the record's own file is. */
      if (process.platform !== 'win32') assert.equal(statSync(join(dir, 'slash.sqlite')).mode & 0o777, 0o600);

      const origin = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
      const now = await askAt(origin, '/api/slash/read');
      assert.equal(now.status, 200, now.raw);
      const old = await askAt(origin, '/api/spark/read');
      assert.deepEqual({ status: old.status, code: old.code }, { status: 404, code: 'ROUTE_UNKNOWN' }, old.raw);
    } finally {
      await running.close();
    }

    const own = openSqlite(join(dir, 'slash.sqlite'));
    try {
      assert.equal(own.one<{ ask_cap: number }>('SELECT ask_cap FROM slash_settings WHERE singleton = 1')?.ask_cap, 7, 'the cap the owner chose did not survive the move');
      assert.deepEqual(
        own.all<{ kind: string }>('SELECT kind FROM slash_call').map((c) => c.kind),
        ['read'],
        'the ask over the new door was not written to the moved ledger',
      );
    } finally {
      own.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* A FILE OF EACH NAME: the new one is the truth and the old one is left where it is, because a boot that moved it would
   overwrite a month of rows with an older month's. It can only happen where the old build ran again after the new one,
   and deleting the record then still takes both, or the old file outlives the record it metered. */
test('WHERE slash.sqlite ALREADY EXISTS, THE OLD FILE IS NOT MOVED OVER IT, and deleting the record removes both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-slash-both-'));
  const file = join(dir, 'record.sqlite');
  try {
    const first = await start({ file, port: 0, pollMs: 0, host: '127.0.0.1' });
    await first.close();
    assert.ok(existsSync(join(dir, 'slash.sqlite')), 'the premise: a boot on a fresh directory writes slash.sqlite');
    oldLedger(dir);

    const running = await start({ file, port: 0, pollMs: 0, host: '127.0.0.1' });
    try {
      assert.ok(existsSync(join(dir, 'spark.sqlite')), 'the old file was moved over a newer one');
      assert.ok(running.api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_self' } }).ok);
      const port = (running.server.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/deleteRecord`, { method: 'POST', body: JSON.stringify({ slug: 'the-studio' }) });
      assert.equal(res.status, 200, await res.text());
      for (const p of [...OLD, 'slash.sqlite', 'slash.sqlite-wal', 'slash.sqlite-shm'])
        assert.equal(existsSync(join(dir, p)), false, `${p} outlived the record it metered`);
    } finally {
      await running.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
