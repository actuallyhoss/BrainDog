/**
 * The browser's half of the invitation-proof doors: reading an invitation link that carries a proof, accepting for a new address,
 * the stale answer, and the sessions a person can see and end.
 *
 * THE HOST IS A FUNCTION HERE, answering exactly what `packages/host/src/auth.ts` and `invite.ts` answer, so what is
 * pinned is how this file reads those answers and what it sends back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { acceptInvite, acceptProved, removePasskey, sessions, signOutEverywhere, takeInvite, type Io } from './auth.ts';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (path: string) => Response) {
  const sent: { path: string; body: unknown }[] = [];
  const io: Io = {
    fetch: async (url, init) => {
      sent.push({ path: url, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      return answer(url);
    },
    credentials: undefined,
  };
  return { io, sent };
}

test('AN INVITATION LINK IS READ ALONE, OR WITH THE PROOF A MAILED LINK CARRIES, and the address is cleared first', () => {
  let cleared = 0;
  const clear = () => void (cleared += 1);
  assert.deepEqual(takeInvite('#rec_x.tok', clear), { token: 'rec_x.tok', proof: null });
  assert.deepEqual(takeInvite('#rec_x.tok&proof=abc_-9', clear), { token: 'rec_x.tok', proof: 'abc_-9' });
  assert.deepEqual(takeInvite('#rec_x.tok&proof=', clear), { token: 'rec_x.tok', proof: null });
  assert.equal(takeInvite('#&proof=abc', clear), null);
  assert.equal(cleared, 4, 'a link was read without clearing the address');
  assert.equal(takeInvite('', clear), null);
  assert.equal(cleared, 4, 'an empty address was cleared');
});

test('ACCEPTING FOR A NEW ADDRESS ANSWERS WHERE THE PROOF WENT, and the proof comes back beside the invitation', async () => {
  const proving = host(() => json(202, { ok: true, value: { proving: true, to: 'bo@example.com' } }));
  const asked = await acceptInvite('rec_x.tok', 'Bo Tanner', proving.io);
  assert.deepEqual(asked, { ok: true, value: { kind: 'proving', to: 'bo@example.com' } });

  const who = { person: 'p_01', email: 'bo@example.com', record: 'rec_x', provedAt: 1_758_800_000_000 };
  const joining = host(() => json(200, { ok: true, value: who }));
  const joined = await acceptProved('rec_x.tok', 'proof_43', undefined, joining.io);
  assert.deepEqual(joined, { ok: true, value: { kind: 'joined', who } });
  assert.deepEqual(joining.sent, [{ path: '/auth/invite', body: { inviteToken: 'rec_x.tok', accept: true, proof: 'proof_43' } }]);
});

test('A HOST THAT CANNOT PROVE AN ADDRESS IS A REFUSAL WITH ITS OWN SENTENCE', async () => {
  const fix = 'This BrainDog cannot send mail, so a new address cannot be proved here.';
  const { io } = host(() => json(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix, at: 'email' } }));
  assert.deepEqual(await acceptInvite('rec_x.tok', undefined, io), { ok: false, kind: 'refused', fix });
});

test('A STALE ANSWER IS NOT A FAILED SIGN-IN: with no passkey to ask for, it comes back as stale with the host sentence', async () => {
  const fix = 'Sign in again to change your passkeys. It has been more than fifteen minutes since you last did.';
  const { io, sent } = host(() => json(401, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix }, reason: 'stale' }));
  assert.deepEqual(await removePasskey('pk_1', io), { ok: false, kind: 'stale', fix });
  assert.equal(sent.length, 1, 'a removal was sent twice with nothing proved in between');

  const failed = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' } }));
  assert.deepEqual(await removePasskey('pk_1', failed.io), { ok: false, kind: 'refused', fix: 'That did not sign you in.' });
});

test('THE SESSIONS A PERSON HAS, AND SIGNING OUT EVERYWHERE ELSE, read the host shapes', async () => {
  const rows = [
    { ref: 'a1b2c3d4e5f6', current: true, authedAt: 1, activeAt: 2, record: 'rec_x' },
    { ref: '0f9e8d7c6b5a', current: false, authedAt: 3, activeAt: 4, record: null },
  ];
  const listed = host(() => json(200, { ok: true, value: { sessions: rows } }));
  /* AN APP'S SESSION SAYS ITS DEVICE (01c7e01cb): a row with no device, from a browser or an older host, is `null`. */
  assert.deepEqual(await sessions(listed.io), { ok: true, value: rows.map((r) => ({ ...r, device: null })) });
  const named = host(() => json(200, { ok: true, value: { sessions: [{ ...rows[0]!, device: 'iPhone' }] } }));
  assert.deepEqual(await sessions(named.io), { ok: true, value: [{ ...rows[0]!, device: 'iPhone' }] });
  assert.deepEqual(listed.sent, [{ path: '/auth/sessions', body: undefined }]);

  const ended = host(() => json(200, { ok: true, value: { ended: 2 } }));
  assert.deepEqual(await signOutEverywhere(undefined, ended.io), { ok: true, value: 2 });
  assert.deepEqual(ended.sent, [{ path: '/auth/logout/all', body: { keep: 'this' } }]);
  assert.deepEqual(await signOutEverywhere('none', ended.io), { ok: true, value: 2 });
  assert.deepEqual(ended.sent.at(-1), { path: '/auth/logout/all', body: { keep: 'none' } });
});
