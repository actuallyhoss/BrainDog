/**
 * An Admin (the Decides level) manages who is on the record, and cannot make an owner or touch one. A Member (Edits)
 * cannot manage anybody. Plus carries teams and Free and Cloud do not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { teamsOn } from '../src/plans.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);
const as = (id: string, level: 'owner' | 'decide' | 'write' | 'read'): CallContext => ({ principal: { kind: 'person', id, level }, credentialed: true });

async function team() {
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => NOW }, invitations: () => null });
  assert.ok((await api.kernel.install([])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com' } }).ok);
  return api;
}

test('AN ADMIN SEES THE TEAM AND INVITES A MEMBER, BUT CANNOT MAKE AN OWNER', async () => {
  const api = await team();
  assert.equal((await api.members(as('p_2', 'decide'))).ok, true);
  const made = await api.invite({ email: 'bo@example.com', level: 'owner' }, as('p_2', 'decide'));
  assert.equal(made.ok, false);
  assert.equal((made as { refusal: { at?: string } }).refusal.at, 'level');
});

test('AN ADMIN CANNOT REMOVE OR STOP AN OWNER', async () => {
  const api = await team();
  assert.equal((await api.removeMember({ person: 'p_1' }, as('p_2', 'decide'))).ok, false);
  assert.equal((await api.suspendMember({ person: 'p_1', suspended: true }, as('p_2', 'decide'))).ok, false);
});

test('A MEMBER AND A VIEWER CANNOT SEE OR CHANGE THE TEAM', async () => {
  const api = await team();
  for (const level of ['write', 'read'] as const) {
    assert.equal((await api.members(as('p_3', level))).ok, false);
    assert.equal((await api.invite({ email: 'cy@example.com', level: 'read' }, as('p_3', level))).ok, false);
  }
});

test('TEAMS BELONG TO PLUS AND TO A SELF-HOST', () => {
  assert.equal(teamsOn('free'), false);
  assert.equal(teamsOn('hosted'), false);
  assert.equal(teamsOn('plus'), true);
  assert.equal(teamsOn('selfhost'), true);
  assert.equal(teamsOn(null), true);
});
