/**
 * `POST /auth/invite` on the Worker, signed in, through `export default`'s own `fetch` and a real `Directory$`.
 *
 * THE HOST'S HALF IS `packages/host/test/invite-session-move.test.ts`: path 1 of `serveInvite` moves the session when
 * `accept` answers a slug. This is the Worker's half, `invites(env).accept`, which joined the Directory and answered the
 * join's `null`, so the host had no slug to move to and a colleague who owns `books-co` stayed on it after accepting a
 * link to `the-studio`. The Directory here is the Worker's own object over `node:sqlite`, so `joinRecord`, `reaches` and
 * the `switch` flow are the code that ships. The records behind it are a double that admits the invitation, because what
 * a record does with an invitation is `packages/record`'s and is tested there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled, objectStorage } from './bundled-worker.ts';

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
const STUDIO = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const BOOKS = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const COLLEAGUE = 'bo@example.test';

test('A SIGNED-IN COLLEAGUE WHO OWNS A RECORD accepts a link to another, and the cookie opens the one they were invited to', async () => {
  const { default: worker, Directory$ } = await bundled();
  const records = { idFromName: (n: string) => n, get: () => ({
    acceptInvite: async (args: { person?: unknown }) => ({ ok: true, value: args.person ? {} : { email: COLLEAGUE, expires_at: '2099-01-01T00:00:00.000Z' } }),
    access: async () => ({ level: 'read', registers: null }),
  }) };
  const env: Record<string, unknown> = { PUBLIC_HOST: HOST, SESSION_SECRET: 'fake-session-secret-for-tests-only-0123456789', RECORD: records };
  /* THE KEY IS DERIVED UNDER THE BLOCK, asynchronously, so the test waits for it as the platform would. */
  const blocked: Promise<unknown>[] = [];
  const state = { storage: objectStorage(), id: { toString: () => 'directory' }, blockConcurrencyWhile: (f: () => Promise<unknown>) => (blocked.push(f()), blocked.at(-1)), waitUntil: () => {} };
  const directory = new Directory$(state, env);
  await Promise.all(blocked);
  env['DIRECTORY'] = { idFromName: (n: string) => n, get: () => directory };

  assert.ok(directory.prepare('the-studio', 'ada@example.test', null).person);
  assert.equal(directory.nameRecord('the-studio', 'ada@example.test', STUDIO), null);
  assert.ok(directory.prepare('books-co', COLLEAGUE, null).person);
  assert.equal(directory.nameRecord('books-co', COLLEAGUE, BOOKS), null);

  const claim = await directory.auth({ flow: 'claim.mint', email: COLLEAGUE });
  const signed = await directory.auth({ flow: 'magic.redeem', claimToken: claim.mail?.claimToken, ip: '' });
  assert.ok(signed.session && signed.session !== 'clear', JSON.stringify(signed));
  const sid = signed.session.sid;
  const opens = async (id: string) => ((await directory.auth({ flow: 'session', sid: id })).body as { record?: string } | undefined)?.record;
  assert.equal(await opens(sid), BOOKS, 'they start on their own record');

  const res = await worker.fetch(
    new Request(`${ORIGIN}/auth/invite`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: `__Host-bd_s=${sid}` },
      body: JSON.stringify({ inviteToken: `${STUDIO}.invite`, accept: true }),
    }),
    env,
    { waitUntil: () => {} },
  );
  const body = await res.text();
  assert.equal(res.status, 200, body);
  const set = res.headers.getSetCookie()[0];
  const held = set === undefined ? sid : (/^__Host-bd_s=([^;]*)/.exec(set)?.[1] ?? '');
  assert.equal(await opens(held), STUDIO, `the cookie still opens their own record: ${body}`);
});
