/**
 * The self-host's copies, over a socket: taken with `VACUUM INTO`, listed, downloaded, put back, and a record deleted.
 *
 * REAL FILES IN A TEMPORARY DIRECTORY, because the claims are about files: that a copy is a SQLite database on disk,
 * that putting one back changes what the running record answers, and that deleting the record leaves nothing behind.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../src/server.ts';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true, search: true }] } as never,
};

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

async function server() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-snap-'));
  const file = join(dir, 'record.sqlite');
  const running = await start({ file, port: 0, pollMs: 0 });
  const port = (running.server.address() as { port: number }).port;
  assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);
  assert.ok(running.api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_self' } }).ok);
  const call = async (path: string, body?: unknown): Promise<{ status: number; body: Answer }> => {
    const res = await fetch(`http://127.0.0.1:${port}/api/${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Answer };
  };
  return { dir, file, port, running, call };
}

const titles = async (call: Awaited<ReturnType<typeof server>>['call']) =>
  ((await call('list?register=obligations')).body.value as { rows: { fields: { what: string } }[] }).rows.map((r) => r.fields.what);

test('A SNAPSHOT IS A SQLITE FILE BESIDE THE RECORD, downloadable, and putting it back rewinds what the record answers', async () => {
  const s = await server();
  try {
    assert.equal((await s.call('create', { register: 'obligations', fields: { what: 'Before the copy' } })).status, 200);

    const took = await s.call('snapshot', {});
    assert.equal(took.status, 200, JSON.stringify(took.body));
    const snap = took.body.value as { id: string; at: string; bytes: number };
    assert.match(snap.id, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-now$/);
    assert.ok(snap.bytes > 0);
    assert.ok(existsSync(join(s.dir, 'snapshots', `${snap.id}.dog`)), 'the copy is not beside the record');

    assert.equal((await s.call('create', { register: 'obligations', fields: { what: 'After the copy' } })).status, 200);
    assert.deepEqual((await titles(s.call)).sort(), ['After the copy', 'Before the copy']);

    const listed = await s.call('snapshots');
    assert.deepEqual((listed.body.value as { id: string }[]).map((x) => x.id), [snap.id]);

    /* The file, as it sits on disk. */
    const got = await fetch(`http://127.0.0.1:${s.port}/api/snapshots/${snap.id}`);
    assert.equal(got.status, 200);
    assert.match(got.headers.get('content-disposition') ?? '', /^attachment; filename="the-studio-.+\.dog"$/);
    assert.equal(got.headers.get('cache-control'), 'no-store');
    assert.equal(Buffer.from(await got.arrayBuffer()).subarray(0, 15).toString('latin1'), 'SQLite format 3');
    const missing = await fetch(`http://127.0.0.1:${s.port}/api/snapshots/2020-01-01T00-00-00Z-now`);
    assert.equal(missing.status, 422);
    assert.equal(((await missing.json()) as Answer).refusal?.code, 'OUT_OF_BOUNDS');

    const back = await s.call('restore', { bookmark: snap.id });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.deepEqual(await titles(s.call), ['Before the copy'], 'the restore did not rewind the rows');
    const kept = (back.body.value as { kept: string }).kept;
    assert.match(kept, /-before-restore$/);
    assert.equal((await s.call('snapshots')).body.value && ((await s.call('snapshots')).body.value as unknown[]).length, 2);

    /* The search index follows the rows it now holds, and the log says the record went back. */
    const fts = (word: string) => s.running.sql.one<{ n: number }>('SELECT count(*) AS n FROM entry_fts WHERE entry_fts MATCH ?', word)?.n;
    assert.equal(fts('after'), 0, 'search still finds a row the restore removed');
    assert.ok((fts('before') ?? 0) > 0);
    assert.equal(s.running.sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind = 'restore.pitr'")?.n, 1);

    /* And going back is itself undoable, from the copy taken just before. */
    assert.equal((await s.call('restore', { bookmark: kept })).status, 200);
    assert.deepEqual((await titles(s.call)).sort(), ['After the copy', 'Before the copy']);
  } finally {
    await s.running.close();
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test('DELETING THE RECORD REMOVES ITS FILE AND ITS COPIES, and every request after says it was deleted', async () => {
  const s = await server();
  try {
    assert.equal((await s.call('snapshot', {})).status, 200);
    assert.ok(existsSync(join(s.dir, 'snapshots')));

    const wrong = await s.call('deleteRecord', { slug: 'the-stud' });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.refusal?.code, 'VALUE_MALFORMED');
    assert.ok(existsSync(s.file), 'a wrong name deleted the record');

    const gone = await s.call('deleteRecord', { slug: 'the-studio' });
    assert.equal(gone.status, 200, JSON.stringify(gone.body));
    assert.equal(existsSync(s.file), false, 'the record file is still there');
    assert.equal(existsSync(`${s.file}-wal`), false);
    assert.equal(existsSync(join(s.dir, 'snapshots')), false, 'the copies outlived the record');

    const after = await s.call('boot');
    assert.equal(after.status, 503);
    assert.equal(after.body.refusal?.code, 'RECORD_UNAVAILABLE');
  } finally {
    await s.running.close();
    rmSync(s.dir, { recursive: true, force: true });
  }
});
