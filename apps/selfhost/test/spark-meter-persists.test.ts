/**
 * Spark's own SQLite outlives the process (`src/server.ts`, `sparkSql`).
 *
 * `loop/research-spark-seam.md` found it opened as `:memory:` on every self-host, so the `settings` row and the
 * `call` ledger of `46 §4.1` began again at every restart. The ledger is what the month's meter counts: a
 * process restarted twice a day forgot every ask it had been made, and on tier `a` the cap of 80 was a cap per
 * uptime and not per month. The comment above the line called the tables a cache, which they are not: a cache
 * can be rebuilt from something, and the only copy of what Spark was asked is these rows.
 *
 * THE TEST READS THE LEDGER, NOT THE METER. When it was written `asksUsed` in `packages/spark/src/call.ts`
 * counted `kind = 'propose'` alone, and `POST /api/spark/read` is the only Spark door mounted here, so an ask
 * over this socket left `status().asks.used` at 0 either side of the fix. Reads have been metered since, but the
 * ledger is still the thing that was being thrown away and the thing the meter is counted from, so it is what
 * this test holds. The day a `propose` door is mounted here, its rows land in the same table and the same file.
 *
 * RED BEFORE THE FIX, MEASURED ON 22 SEPTEMBER: both asks answered 200 and `spark.sqlite` did not exist, so
 * the second process had no way to know the first had been asked anything.
 *
 * THE MODEL IS THE ONLY DOUBLE: a real `start`, a real socket, a real record on disk, restarted on the same file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openSqlite, start } from '../src/server.ts';

const DRAFT = '{"registers":["things"],"where":null,"q":"Kiln"}';

const completion = () =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: DRAFT } }], usage: { prompt_tokens: 400, completion_tokens: 12 } }), {
    status: 200,
  });

async function askOnce(file: string): Promise<{ status: number; body: string }> {
  const running = await start({
    file,
    port: 0,
    pollMs: 0,
    host: '127.0.0.1',
    spark: { url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'small', key: 'fake-operator-key', send: async () => completion() },
  });
  try {
    const port = (running.server.address() as { port: number }).port;
    const origin = `http://127.0.0.1:${port}`;
    const res = await fetch(`${origin}/api/spark/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ question: 'Kiln' }),
    });
    return { status: res.status, body: await res.text() };
  } finally {
    await running.close();
  }
}

test('AN ASK SURVIVES A RESTART: the call ledger the month is metered from is on disk beside the record', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-spark-meter-'));
  const file = join(dir, 'record.sqlite');
  try {
    const first = await askOnce(file);
    assert.equal(first.status, 200, first.body);
    const second = await askOnce(file);
    assert.equal(second.status, 200, second.body);

    const beside = join(dir, 'spark.sqlite');
    assert.ok(existsSync(beside), `Spark kept nothing beside the record: ${beside} does not exist after two asks and two restarts`);
    const own = openSqlite(beside);
    try {
      const calls = own.all<{ kind: string; tier: string }>('SELECT kind, tier FROM call ORDER BY ts');
      assert.deepEqual(
        calls.map((c) => c.kind),
        ['read', 'read'],
        'the second process did not see the first process ask',
      );
      /* AND THE METER READS THE SAME TABLE UNDER THE SAME MONTH, so the day this host mounts `propose` its
         count is the month's and not the process's. */
      assert.ok(calls.every((c) => c.tier === 'a'));
    } finally {
      own.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* DELETING THE RECORD TAKES SPARK'S FILE WITH IT, on both of `destroy`'s paths. Measured on 22 September with the
   `sparkSql.close()` in `destroy` removed: on Windows both cases below failed, because an open handle held
   `spark.sqlite` and `rmSync` with `force` left it, and its directory, behind without a word. `record.sqlite` is
   the path that removes named files; `record.brain` is the path that removes the directory whole. */
for (const name of ['record.sqlite', 'record.brain']) {
  test(`DELETING THE RECORD LEAVES NO SPARK FILE BEHIND (${name})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'braindog-spark-delete-'));
    const file = join(dir, name);
    const running = await start({ file, port: 0, pollMs: 0, host: '127.0.0.1' });
    try {
      assert.ok(
        running.api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_self' } }).ok,
      );
      assert.ok(existsSync(join(dir, 'spark.sqlite')), 'the premise: Spark opened its file beside the record');
      const port = (running.server.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/deleteRecord`, { method: 'POST', body: JSON.stringify({ slug: 'the-studio' }) });
      assert.equal(res.status, 200, await res.text());
      for (const p of ['spark.sqlite', 'spark.sqlite-wal', 'spark.sqlite-shm'])
        assert.equal(existsSync(join(dir, p)), false, `${p} outlived the record it metered`);
    } finally {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
