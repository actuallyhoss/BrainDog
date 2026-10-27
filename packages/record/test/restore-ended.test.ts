/**
 * A restore that reopens the object puts back every table as the copy held it, and a credential ended since stays ended.
 *
 * On the Cloud the copy is a point-in-time bookmark, and the object PITR brings back holds the token table, the device
 * grants, the invitations and the events as they were at the copy. A token revoked after it answered again. `restore`
 * reads what the record has ended before the port arms, and `restored` ends it again on the object that comes back.
 *
 * THE REWIND IS PLAYED BY HAND: the revocations and the close are taken out of the same database, which is what PITR does
 * to those rows, and a new record is opened over it the way the reopened object opens one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Snapshot, Snapshots } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 8, 23, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const kept: Snapshot = { id: 'nightly-2026-09-22', at: '2026-09-22T03:00:00.000Z', bytes: 9141 };

test('A REOPENING RESTORE LEAVES A TOKEN REVOKED SINCE THE COPY REVOKED, AND A CLOSED LINK CLOSED', async () => {
  const port: Snapshots & { reopens: true } = {
    reopens: true,
    take: async (label) => ({ id: `${label}-2026-09-23`, at: new Date(NOW).toISOString(), bytes: 1 }),
    list: async () => [kept],
    restore: async () => {},
    prune: async () => {},
  };
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW }, snapshots: port });
  assert.ok((await api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.com', name: 'Ada' } })).ok);

  const token = await api.createToken({ scope: 'read', label: 'an agent' }, owner);
  if (!token.ok) return assert.fail(JSON.stringify(token));
  const { id, bearer } = token.value as { id: string; bearer: string };
  assert.ok((await api.kernel.verifyToken(bearer, 'api')).ok);
  assert.ok((await api.revokeToken({ id }, owner)).ok);
  assert.equal((await api.kernel.verifyToken(bearer, 'api')).ok, false);

  /* A shared link, opened and then closed, as `openShare` and `closeShare` write it. */
  const at = new Date(NOW).toISOString();
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, field) VALUES ('ev_open', ?, 'p_owner', 'share.open', 'share:sh_1', 'share', 'board')", at);
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, field) VALUES ('ev_close', ?, 'p_owner', 'share.close', 'share:sh_1', 'share', 'board')", at);

  const out = await api.restore({ bookmark: kept.id }, owner);
  if (!out.ok) return assert.fail(JSON.stringify(out));

  /* PITR: the copy was taken before the revoke and the close. */
  sql.exec('UPDATE token SET revoked_at = NULL WHERE id = ?', id);
  sql.exec("DELETE FROM event WHERE kind = 'share.close'");

  const reopened = await createRecordApi({ sql, clock: { now: () => NOW }, snapshots: port });
  const { bookmark, kept: before, ended } = out.value;
  const written = await reopened.restored({ bookmark, kept: before, by: 'p_owner', ended });
  assert.ok(written.ok, JSON.stringify(written));

  assert.equal((await reopened.kernel.verifyToken(bearer, 'api')).ok, false, 'the restore handed a revoked token back');
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'share.close' AND target = 'share:sh_1'")!.n, 1, 'the restore reopened a closed link');
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'restore.pitr'")!.n, 1);

  /* AND NAMING IT TWICE CHANGES NOTHING. */
  assert.ok((await reopened.restored({ bookmark, kept: before, by: 'p_owner', ended })).ok);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'share.close'")!.n, 1);
});
