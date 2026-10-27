/**
 * A replacing import puts a record back as the file held it, but not a shared link the owner has since closed: a closure
 * has no inverse, so the live one is the later truth and is carried over the file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { testSigner } from './signer.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 1, 12);

test('A LINK CLOSED AFTER THE EXPORT STAYS CLOSED WHEN THE EXPORT REPLACES THE RECORD', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: testSigner() });
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const at = new Date(NOW).toISOString();
  /* A LINK IS TWO EVENTS, as `methods/shares.ts` writes them. */
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v) VALUES ('ev_open', ?, 'p_1', 'share.open', 'share:sh_1', 'share', 'board', ?)", at, at);
  const file = await k.export();
  assert.ok(file.ok, JSON.stringify(file));
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, field) VALUES ('ev_close', ?, 'p_1', 'share.close', 'share:sh_1', 'share', 'board')", at);

  const back = await k.import(file.value, { replace: true, by: 'p_1' });
  assert.ok(back.ok, JSON.stringify(back));
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE target = 'share:sh_1' AND kind = 'share.close'")?.n, 1, 'the closed link is open again');
  sql.close();
});
