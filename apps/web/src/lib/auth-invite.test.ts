/**
 * Accepting an invitation, and the name that travels with it. `loop/research-batch-fourteen-audit.md` finding 1.
 *
 * THE PAGE WAS THE FIRST HOP THAT DROPPED IT. `acceptInvite` posted `{ inviteToken, accept: true }` and nothing else,
 * so the host's name handling, the Directory's column and the record's mirror were all waiting on a field no page
 * ever sent. The host decides what a name may be (`packages/host/src/invite.ts`, `personName`); this only carries it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { acceptInvite, type Io } from './auth.ts';

const WHO = { person: 'p_01', email: 'bo@example.com', record: null, provedAt: 1_757_000_000_000 };

function host() {
  const sent: unknown[] = [];
  const io: Io = {
    fetch: async (_url, init) => {
      sent.push(typeof init.body === 'string' ? JSON.parse(init.body) : undefined);
      return new Response(JSON.stringify({ ok: true, value: WHO }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    credentials: undefined,
  };
  return { io, sent };
}

test('A NAME TYPED ON THE INVITATION PAGE IS SENT with the accept', async () => {
  const { io, sent } = host();
  const out = await acceptInvite('rec_x.tok', 'Bo Tanner', io);
  assert.ok(out.ok);
  assert.deepEqual(sent, [{ inviteToken: 'rec_x.tok', accept: true, name: 'Bo Tanner' }]);
});

test('NO NAME, OR ONE OF SPACES, SENDS NO FIELD, so the host is not asked to judge an empty box', async () => {
  const { io, sent } = host();
  assert.ok((await acceptInvite('rec_x.tok', undefined, io)).ok);
  assert.ok((await acceptInvite('rec_x.tok', '   ', io)).ok);
  assert.deepEqual(sent, [
    { inviteToken: 'rec_x.tok', accept: true },
    { inviteToken: 'rec_x.tok', accept: true },
  ]);
});
