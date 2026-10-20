/**
 * TEAMS_HELD: while a member's writes are not yet held to their row rule, nobody new is invited or joins.
 * Existing members keep working, and a host without the var is unchanged.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TEAMS_HELD_SAID } from '@braindog/record/directory';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };

async function studio(extra: Record<string, unknown>) {
  const c = await cloud(extra);
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  const invite = async (email: string) => {
    const res = await c.ask('/api/invite', { method: 'POST', cookie, body: JSON.stringify({ email, level: 'read' }) });
    return { status: res.status, body: (await res.json()) as Out };
  };
  return { ...c, cookie, invite };
}

type Dir = { invitee(e: string): { ok: boolean; value: { id: string } }; joinRecord(r: string, p: string): Out; joinable(r: string, p: string): Out['refusal'] | null };

test('WITH TEAMS_HELD=1 AN INVITATION IS REFUSED, in the plain sentence', async () => {
  const c = await studio({ TEAMS_HELD: '1' });
  const out = await c.invite('bo@example.test');
  assert.equal(out.status, 403, JSON.stringify(out.body));
  assert.equal(out.body.refusal?.code, 'FORBIDDEN');
  assert.equal(out.body.refusal?.at, 'plan');
  assert.equal(out.body.refusal?.fix, TEAMS_HELD_SAID);
});

test('WITH TEAMS_HELD=1 A JOIN IS REFUSED', async () => {
  const c = await studio({ TEAMS_HELD: '1' });
  const dir = c.directory as unknown as Dir;
  const bo = dir.invitee('bo@example.test');
  assert.ok(bo.ok);
  const stop = dir.joinable(REC, bo.value.id);
  assert.equal(stop?.code, 'FORBIDDEN');
  assert.equal(stop?.fix, TEAMS_HELD_SAID);
  assert.equal(dir.joinRecord(REC, bo.value.id).refusal?.fix, TEAMS_HELD_SAID);
});

test('WITHOUT TEAMS_HELD THE SAME INVITATION AND JOIN GO THROUGH', async () => {
  const c = await studio({});
  const out = await c.invite('bo@example.test');
  assert.equal(out.status, 200, JSON.stringify(out.body));
  const dir = c.directory as unknown as Dir;
  const bo = dir.invitee('bo@example.test');
  assert.ok(bo.ok);
  assert.equal(dir.joinable(REC, bo.value.id), null);
  assert.equal(dir.joinRecord(REC, bo.value.id).ok, true);
});
