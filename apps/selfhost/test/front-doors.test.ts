/**
 * The self-host's front doors: one caller's minute over a real socket, and the guard in
 * front of every statement this process sends its driver.
 *
 * THE LIMITER'S CLOCK IS PINNED, so every request below falls in one minute and the count is the limiter's and not the
 * calendar's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { READ_PER_MINUTE, windowLimiter } from '@braindog/host/limits';
import { SqlError } from '@braindog/ports';
import { openSqlite, start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 8, 25, 12, 0, 10);
/** Obviously not a real key. */
const SERVER_KEY = 'fake-server-key-for-front-door-tests';

test('THE 601ST READ FROM ONE CALLER IN A MINUTE IS 429, AND ANOTHER TOKEN\'S FIRST IS NOT', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-front-doors-'));
  /* THE LIMITER THIS HOST BUILDS, OVER A PINNED CLOCK: its own default counts the wall clock's minute, which a run of
     six hundred requests could straddle. */
  const running = await start({
    file: join(dir, 'record.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: SERVER_KEY,
    now: () => NOW,
    pollMs: 0,
    limits: windowLimiter(() => NOW),
  });
  const port = (running.server.address() as { port: number }).port;
  /* A PLAIN READ, NOT THE VERSION POLL: `/api/version` spends its own poll budget (`POLL_PER_MINUTE`), so this reads
     the shell's boot, which spends the read budget this test is about. */
  const read = (bearer: string) =>
    fetch(`http://127.0.0.1:${port}/api/boot`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: '{}',
    });
  try {
    assert.ok(
      running.api.kernel.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
    );
    const minted = await running.api.createToken({ scope: 'read' }, { principal: { kind: 'person', id: 'p_1', level: 'owner' } });
    assert.ok(minted.ok, JSON.stringify(minted));
    const token = (minted as { value: { bearer: string } }).value.bearer;

    /* THE MINUTE'S WORTH, IN BATCHES, every one answered. */
    const statuses: number[] = [];
    for (let sent = 0; sent < READ_PER_MINUTE; sent += 50) {
      const batch = await Promise.all(Array.from({ length: Math.min(50, READ_PER_MINUTE - sent) }, () => read(SERVER_KEY)));
      for (const res of batch) {
        statuses.push(res.status);
        await res.body?.cancel();
      }
    }
    assert.equal(statuses.length, READ_PER_MINUTE);
    assert.deepEqual([...new Set(statuses)], [200]);

    /* ONE MORE IS REFUSED, with the registry's code and how long to wait. */
    const over = await read(SERVER_KEY);
    assert.equal(over.status, 429);
    assert.equal(((await over.json()) as { refusal?: { code?: string } }).refusal?.code, 'RATE_LIMITED');
    const wait = Number(over.headers.get('retry-after'));
    assert.ok(wait >= 1 && wait <= 60, `Retry-After was ${String(wait)}`);

    /* AND ANOTHER CALLER ON THE SAME RECORD HAS A MINUTE OF ITS OWN. */
    const other = await read(token);
    assert.equal(other.status, 200, await other.text());
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A 101ST PARAMETER NEVER REACHES THE DRIVER, AND A SAVEPOINT STILL DOES', () => {
  const sql = openSqlite(':memory:');
  try {
    sql.exec('CREATE TABLE t (n INTEGER)');
    /* `node:sqlite` BINDS THOUSANDS, so a refusal at 101 is the guard's and not the driver's. */
    const many = Array.from({ length: 101 }, (_, i) => i);
    assert.throws(
      () => sql.all(`SELECT n FROM t WHERE n IN (${many.map(() => '?').join(', ')})`, ...many),
      (e: unknown) => e instanceof SqlError && e.code === 'TOO_MANY_PARAMS',
    );
    assert.deepEqual(sql.all(`SELECT n FROM t WHERE n IN (${many.slice(1).map(() => '?').join(', ')})`, ...many.slice(1)), []);

    /* THE KERNEL'S `attempt()` RUNS A RAW SAVEPOINT ON THIS HOST, and a refusal inside one still rolls back its own row. */
    sql.transactionSync(() => {
      sql.exec('INSERT INTO t (n) VALUES (?)', 1);
      sql.exec('SAVEPOINT front_doors');
      sql.exec('INSERT INTO t (n) VALUES (?)', 2);
      sql.exec('ROLLBACK TO front_doors');
      sql.exec('RELEASE front_doors');
    });
    assert.deepEqual(sql.all<{ n: number }>('SELECT n FROM t ORDER BY n').map((r) => r.n), [1]);
  } finally {
    sql.close();
  }
});
