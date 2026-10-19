/**
 * The per-record limits a stranger's volume would hit: a day of upload bytes (`FileDeps.bytes`), a day of Slash asks
 * on the person's allowance (`slashDayStop`), and an hour of arrivals answered 429 with `Retry-After` (`serveIngest`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { ABUSE, tooManyLine } from '@braindog/host/abuse';
import { slashDayStop } from '@braindog/host';

import { serveFiles, type FileBucket, type FileDeps } from '../src/files.ts';
import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const HOST = 'https://brain.example.test';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const hashOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function bucket() {
  const files = new Map<string, Uint8Array>();
  const blobs: FileBucket = {
    async put(key, value) {
      files.set(key, Uint8Array.from(value));
      return {};
    },
    async get() {
      return null;
    },
    async head(key) {
      const f = files.get(key);
      return f === undefined ? null : { size: f.byteLength };
    },
    async delete() {},
  };
  return { blobs, files };
}

const depsOf = (blobs: FileBucket, bytes: FileDeps['bytes']): FileDeps => ({
  blobs,
  session: { origin: HOST, session: async () => ({ status: 401, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' } }), access: async () => null },
  bearer: {
    knows: async (record) => record === REC,
    verify: async () => ({ id: 'tok_ada', person_id: 'p_ada', scope: 'write' }),
    access: async () => ({ level: 'owner', registers: null, levels: {} }),
  },
  limit: async () => null,
  bytes,
});

const put = (): Request =>
  new Request(`${HOST}/api/files/${hashOf(PNG)}`, { method: 'PUT', headers: { authorization: `Bearer ${REC}.an-invented-secret-for-this-test`, 'content-type': 'image/png' }, body: Uint8Array.from(PNG) });

test('NEW BYTES ARE COUNTED AGAINST THE DAY AND A REFUSAL KEEPS NOTHING', async () => {
  const { blobs, files } = bucket();
  const seen: Array<[string, number]> = [];
  const refusing = async (record: string, n: number) => (seen.push([record, n]), new Response('{}', { status: 429 }));
  const out = await serveFiles(put(), depsOf(blobs, refusing));
  assert.equal(out.status, 429);
  assert.deepEqual(seen, [[REC, PNG.byteLength]]);
  assert.equal(files.size, 0);
});

test('THE SAME FILE PUT AGAIN COSTS NOTHING AGAINST THE DAY', async () => {
  const { blobs } = bucket();
  let spent = 0;
  const counting = async (_record: string, n: number) => ((spent += n), null);
  assert.equal((await serveFiles(put(), depsOf(blobs, counting))).status, 200);
  assert.equal((await serveFiles(put(), depsOf(blobs, counting))).status, 200);
  assert.equal(spent, PNG.byteLength, 'only the first put was counted');
});

test('SLASH’S DAY STOPS AT THE CEILING WITH A WAIT TO MIDNIGHT, AND ONLY ASKS ON THE PERSON’S ALLOWANCE COUNT', () => {
  const sql = openSqlite();
  sql.exec('CREATE TABLE slash_call (id TEXT PRIMARY KEY, ts TEXT NOT NULL, purpose TEXT, spends TEXT)');
  const now = Date.UTC(2026, 9, 20, 22, 0, 0);
  const row = (i: number, spends: string, ts: string) => sql.exec('INSERT INTO slash_call (id, ts, purpose, spends) VALUES (?, ?, ?, ?)', `c${i}`, ts, 'ask', spends);
  for (let i = 0; i < ABUSE.slashDay.most - 1; i++) row(i, 'person', '2026-10-20T08:00:00.000Z');
  for (let i = 0; i < 50; i++) row(1000 + i, 'none', '2026-10-20T08:00:00.000Z');
  for (let i = 0; i < 50; i++) row(2000 + i, 'person', '2026-10-19T23:00:00.000Z');
  assert.equal(slashDayStop(sql, now), null, 'one under, with yesterday’s and other spends not counted');
  row(9999, 'person', '2026-10-20T09:00:00.000Z');
  const stop = slashDayStop(sql, now);
  assert.equal(stop?.code, 'RATE_LIMITED');
  assert.equal(stop?.retry_after, 2 * 3600);
  assert.equal(stop?.fix, tooManyLine(2 * 3600));
});
