/**
 * The nightly copy: due once a day at a time in UTC, caught up on start, pruned with the other copies, and put back.
 *
 * REAL FILES IN A TEMPORARY DIRECTORY and a clock the test moves, because the claims are about days: that a host asleep
 * at the hour takes the copy when it wakes, that a restart takes no second one, and that the copy restores.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lastDue, minutesOf, nightlyBackups } from '../src/backup.ts';
import { KEEP } from '../src/snapshots.ts';
import { start } from '../src/server.ts';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true, search: true }] } as never,
};

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

test('A TIME OF DAY IS HH:MM, and the copy last fell due today at that time or yesterday', () => {
  assert.equal(minutesOf('03:20'), 200);
  assert.equal(minutesOf('3:20'), null);
  assert.equal(minutesOf('24:00'), null);
  const at = Date.parse('2026-09-17T03:20:00Z');
  assert.equal(lastDue(Date.parse('2026-09-17T09:00:00Z'), 200), at);
  assert.equal(lastDue(at, 200), at);
  assert.equal(lastDue(Date.parse('2026-09-17T03:19:59Z'), 200), at - 86_400_000);
  assert.throws(() => nightlyBackups({ sql: {} as never, file: 'x', now: Date.now, at: 'nightly', tickMs: 0 }), /HH:MM in UTC/);
});

test('ONE NIGHTLY COPY A DAY, caught up when the host wakes after the hour, never a second on restart, and it restores', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-nightly-'));
  const file = join(dir, 'record.sqlite');
  let now = Date.parse('2026-09-16T22:00:00Z');
  const running = await start({ file, port: 0, pollMs: 0, now: () => now });
  const logged: string[] = [];
  const nightly = nightlyBackups({ sql: running.sql, file, now: () => now, at: '03:20', tickMs: 0, logged: (n) => logged.push(n) });
  try {
    const port = (running.server.address() as { port: number }).port;
    assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);
    assert.ok(running.api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_self' } }).ok);
    const call = async (path: string, body?: unknown) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as Answer };
    };
    const titles = async () => ((await call('list?register=obligations')).body.value as { rows: { fields: { what: string } }[] }).rows.map((r) => r.fields.what).sort();

    /* The first look on a new host takes one: nothing has been kept since 03:20 today. */
    const first = await nightly.check();
    assert.match(first ?? '', /^2026-09-16T22-00-00Z-nightly$/);
    assert.equal(await nightly.check(), null, 'a second look the same night took a second copy');

    assert.equal((await call('create', { register: 'obligations', fields: { what: 'Written on the 16th' } })).status, 200);

    /* Asleep at 03:20 on the 17th; it wakes at 08:00 and takes that day's copy then. */
    now = Date.parse('2026-09-17T02:00:00Z');
    assert.equal(await nightly.check(), null, 'a copy was taken before the hour came');
    now = Date.parse('2026-09-17T08:00:00Z');
    const second = await nightly.check();
    assert.match(second ?? '', /^2026-09-17T08-00-00Z-nightly$/);

    /* A restart the same day: a new process over the same file finds the copy and takes none. */
    const again = nightlyBackups({ sql: running.sql, file, now: () => now, at: '03:20', tickMs: 0 });
    assert.equal(await again.check(), null);

    assert.equal((await call('create', { register: 'obligations', fields: { what: 'Written on the 17th' } })).status, 200);
    assert.deepEqual(await titles(), ['Written on the 16th', 'Written on the 17th']);

    /* The copy is listed in the app's own list and puts the record back. */
    const listed = ((await call('snapshots')).body.value as { id: string }[]).map((s) => s.id);
    assert.deepEqual(listed, [second, first]);
    const back = await call('restore', { bookmark: second });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.deepEqual(await titles(), ['Written on the 16th']);
    assert.equal(logged.length, 2);
    assert.match(logged[0]!, /^snapshot 2026-09-16T22-00-00Z-nightly \d+ bytes$/);

    /* Rotation: a month and more of nights keeps the newest thirty copies, the restore's own among them. */
    for (let d = 18; d < 18 + KEEP + 5; d++) {
      now = Date.parse('2026-09-18T04:00:00Z') + (d - 18) * 86_400_000;
      assert.ok(await nightly.check());
    }
    const files = readdirSync(join(dir, 'snapshots')).filter((n) => n.endsWith('.brain'));
    assert.equal(files.length, KEEP);
    assert.ok(!files.includes(`${String(first)}.brain`), 'the oldest copy was kept past thirty');
  } finally {
    nightly.stop();
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
