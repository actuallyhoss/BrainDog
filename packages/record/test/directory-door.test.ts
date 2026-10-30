/**
 * The Directory keeps what verifies each webhook door by digest (sec-follow M6, RD1 of the review of 30 Oct), so the
 * arrival door's hold keeps only an arrival carrying the door's own token while the record cannot answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARRIED, createDirectory } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 30, 12);
const SIGN = 'a'.repeat(64);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

function studio() {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(NOW), { mac: new Uint8Array(32).fill(7), magic: true });
  value(d.person$('ada@example.com', 'Ada'));
  const record = value<{ record: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' })).record;
  return { d, sql, record };
}

test('A DOOR HOLDS ONLY ITS OWN DIGEST, follows a token minted again, and goes with its record', () => {
  const { d, sql, record } = studio();
  assert.equal(d.doorHolds(record, 'bank', SIGN), false, 'a door nobody told the Directory of');
  value(d.door$(record, 'bank', SIGN));
  assert.equal(d.doorHolds(record, 'bank', SIGN), true);
  assert.equal(d.doorHolds(record, 'bank', 'b'.repeat(64)), false);
  assert.equal(d.doorHolds(record, 'made-up', SIGN), false);
  value(d.door$(record, 'bank', 'b'.repeat(64)));
  assert.equal(d.doorHolds(record, 'bank', SIGN), false, 'the old token still held after a new one');
  value(d.door$(record, 'bank', null));
  assert.equal(sql.one('SELECT 1 AS x FROM dir_door'), undefined);
  value(d.door$(record, 'hook', 'signed'));
  assert.equal(d.doorHolds(record, 'hook', 'signed'), true);
  value(d.close(record));
  assert.equal(d.doorHolds(record, 'hook', 'signed'), false);
  assert.ok((CARRIED as readonly string[]).includes('dir_door'));
});

test('A TOKEN ITSELF IS NEVER TAKEN', () => {
  const { d, record } = studio();
  const out = d.door$(record, 'bank', 'tok-123') as { ok: boolean; refusal?: { code: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
});

test('A RECORD TELLS ALL ITS DOORS AT ONCE (DR1): the set becomes exactly what it names, and a token is refused', () => {
  const { d, sql, record } = studio();
  value(d.door$(record, 'gone', SIGN));
  value(d.doors$(record, [{ ingest: 'bank', sign: SIGN }, { ingest: 'hook', sign: 'signed' }]));
  assert.equal(d.doorHolds(record, 'bank', SIGN), true, 'known before its first arrival');
  assert.equal(d.doorHolds(record, 'hook', 'signed'), true);
  assert.equal(d.doorHolds(record, 'gone', SIGN), false, 'a door the record no longer names is forgotten');
  value(d.doors$(record, [{ ingest: 'bank', sign: 'b'.repeat(64) }]));
  assert.equal(d.doorHolds(record, 'bank', SIGN), false, 'a token minted again replaces the old');
  assert.equal(d.doorHolds(record, 'hook', 'signed'), false);
  const out = d.doors$(record, [{ ingest: 'bank', sign: 'tok-123' }]) as { ok: boolean; refusal?: { code: string } };
  assert.equal(out.ok, false);
  assert.equal(d.doorHolds(record, 'bank', 'b'.repeat(64)), true, 'a refusal writes nothing');
  value(d.close(record));
  assert.equal((d.doors$(record, []) as { ok: boolean }).ok, false);
  assert.equal(sql.one('SELECT 1 AS x FROM dir_door'), undefined);
});
