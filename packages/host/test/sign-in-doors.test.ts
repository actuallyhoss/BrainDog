/**
 * Sign-in's doors, against a real Directory: an invitation that proves the mailbox before it makes anybody, the
 * sessions a person can see and end, the step-up answer a page can tell from a failed sign-in, the account table's
 * new rows, and the operator key's lockout. `loop/finish/ops.md` OPS-7.
 *
 * THE DIRECTORY IS THE REAL ONE, so the proof, the sessions and the fifteen minutes are the flows that ship, and
 * only the record behind an invitation is a double: what a record does with an invitation is `packages/record`'s.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { createDirectory, type AuthConfig } from '@braindog/record/directory';

import { NO_MAIL, serveAccount, serveAuth, type AccountDoor, type AuthDoor, type InviteDoor } from '../src/auth.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ORIGIN = 'https://studio.example';
const KEY = 'a-throwaway-server-key-for-these-tests-only';
const INVITE = `rec_01JZ8QK3F7R2M9V4XN6TCB5HAD.${'a'.repeat(43)}`;
const ELSEWHERE = `rec_01JZ8QK3F7R2M9V4XN6TCB5HAD.${'b'.repeat(43)}`;

type Body = {
  ok: boolean;
  value?: Record<string, unknown>;
  refusal?: { code: string; fix: string; at?: string };
  reason?: string;
  retryAfter?: number;
};

function setup(o: { mail?: boolean; door?: Partial<AuthDoor> } = {}) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const config: AuthConfig = { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: ORIGIN }, magic: true, key: { serverKey: KEY } };
  const d = createDirectory(sql, clock, config);

  /* TWO INVITATIONS ON ONE RECORD, for two addresses, so a proof minted for one can be offered to the other. */
  const invitations: Record<string, string> = { [INVITE]: 'bo@example.com', [ELSEWHERE]: 'cy@example.com' };
  const accepted: { token: string; email: string; name?: string }[] = [];
  const invite: InviteDoor = {
    look: (token) => {
      const email = Object.hasOwn(invitations, token) ? invitations[token] : undefined;
      return Promise.resolve(
        email === undefined
          ? { ok: false as const, refusal: { code: 'UNAUTHORIZED', fix: 'That invitation has been used or has run out.', at: 'token' } }
          : ok({ email, expires_at: new Date(NOW + DAY).toISOString() }),
      );
    },
    accept: (token, person) => {
      accepted.push({ token, email: person.email, ...(person.name ? { name: person.name } : {}) });
      return Promise.resolve(ok(null) as Result<unknown>);
    },
    known: () => Promise.resolve(false),
    person: (email, name) => Promise.resolve(d.person$(email, name)),
  };

  const sent: { to: string; link: string; kind: string | null }[] = [];
  const door: AuthDoor = {
    on: 'worker',
    origin: ORIGIN,
    auth: d.auth,
    ip: '203.0.113.9',
    invite,
    now: clock.now,
    ...(o.mail === false ? {} : { mail: (to: string, link: string, kind?: string) => void sent.push({ to, link, kind: kind ?? null }) }),
    ...o.door,
  };

  const call = async (path: string, init: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) => {
    const method = init.body === undefined ? 'GET' : 'POST';
    const headers: Record<string, string> = {
      ...(method === 'POST' ? { origin: ORIGIN, 'content-type': 'application/json' } : {}),
      ...(init.cookie === undefined ? {} : { cookie: `__Host-bd_s=${init.cookie}` }),
      ...init.headers,
    };
    const res = await serveAuth(
      new Request(`${ORIGIN}${path}`, { method, headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) }),
      door,
    );
    const raw = await res.text();
    const sid = res.headers.getSetCookie().map((c) => /^__Host-bd_s=([A-Za-z0-9_-]{43});/.exec(c)?.[1]).find((x) => x !== undefined);
    return { status: res.status, headers: res.headers, raw, body: JSON.parse(raw) as Body, sid };
  };

  /** The self-host's owner, and a session for them by the server key: the one way in that needs no mailbox. */
  const keyIn = async (): Promise<string> => {
    if (!sql.one('SELECT 1 AS x FROM dir_person WHERE email = ?', 'ada@example.com')) {
      assert.ok(d.person$('ada@example.com', 'Ada').ok);
      assert.ok(d.provision({ slug: 'the-studio', email: 'ada@example.com' }).ok);
    }
    const out = await call('/auth/token', { body: { serverKey: KEY } });
    assert.equal(out.status, 200, out.raw);
    return out.sid ?? assert.fail('no session');
  };

  const people = () => sql.all<{ email: string; name: string | null }>('SELECT email, name FROM dir_person ORDER BY email');
  return { d, clock, call, keyIn, sent, accepted, people };
}

/* ── an invitation to a new address ───────────────────────────────────────────────────────────────── */

test('A NEW ADDRESS IS MADE NOBODY UNTIL ITS MAILBOX ANSWERS, and the proof then makes, joins and signs in', async () => {
  const s = setup();
  const asked = await s.call('/auth/invite', { body: { inviteToken: INVITE, accept: true, name: 'Bo Tanner' } });
  assert.equal(asked.status, 202, asked.raw);
  assert.deepEqual(asked.body, { ok: true, value: { proving: true, to: 'bo@example.com' } });
  assert.equal(asked.sid, undefined, 'a session was made before the mailbox answered');
  assert.deepEqual(s.people(), [], 'a person was made before the mailbox answered');
  assert.equal(s.accepted.length, 0, 'the invitation was spent before the mailbox answered');

  /* ONE MAIL, TO THE INVITED ADDRESS, NAMED AS A PROOF, carrying the invitation and the proof in the fragment. */
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0]?.to, 'bo@example.com');
  assert.equal(s.sent[0]?.kind, 'invite.prove');
  const prefix = `${ORIGIN}/app/invite#${INVITE}&proof=`;
  const link = s.sent[0]?.link ?? '';
  assert.ok(link.startsWith(prefix), 'the proof is not mailed to the invitation page');
  const proof = link.slice(prefix.length);
  assert.match(proof, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!asked.raw.includes(proof), 'the proof was answered as well as mailed');

  /* THE PAGE THE MAIL OPENS sends the invitation and the proof, and no name: the name travelled with the proof. */
  const joined = await s.call('/auth/invite', { body: { inviteToken: INVITE, accept: true, proof } });
  assert.equal(joined.status, 200, joined.raw);
  assert.ok(joined.sid, 'the new person was not signed in');
  assert.equal(joined.body.value?.email, 'bo@example.com');
  assert.deepEqual(s.accepted, [{ token: INVITE, email: 'bo@example.com', name: 'Bo Tanner' }]);
  assert.deepEqual(s.people(), [{ email: 'bo@example.com', name: 'Bo Tanner' }]);

  /* ONCE. */
  const again = await s.call('/auth/invite', { body: { inviteToken: INVITE, accept: true, proof } });
  assert.equal(again.status, 401, again.raw);
  assert.equal(again.body.refusal?.at, 'proof');
});

test('A PROOF OPENS ONLY THE INVITATION IT WAS MINTED FOR, and offering it to another spends it', async () => {
  const s = setup();
  assert.equal((await s.call('/auth/invite', { body: { inviteToken: INVITE, accept: true } })).status, 202);
  const proof = (s.sent[0]?.link ?? '').split('&proof=')[1] ?? '';

  const crossed = await s.call('/auth/invite', { body: { inviteToken: ELSEWHERE, accept: true, proof } });
  assert.equal(crossed.status, 401, crossed.raw);
  assert.equal(crossed.body.refusal?.code, 'UNAUTHORIZED');
  assert.equal(crossed.body.refusal?.at, 'proof');
  assert.equal(crossed.sid, undefined);
  assert.deepEqual(s.people(), [], 'a proof for one invitation made somebody on another');
  assert.equal(s.accepted.length, 0);

  assert.equal((await s.call('/auth/invite', { body: { inviteToken: INVITE, accept: true, proof } })).status, 401, 'a proof offered to the wrong invitation still worked on its own');
});

test('A HOST THAT SENDS NO MAIL SAYS SO IN ONE SENTENCE, and makes nobody', async () => {
  const s = setup({ mail: false });
  const out = await s.call('/auth/invite', { body: { inviteToken: INVITE, accept: true, name: 'Bo Tanner' } });
  assert.equal(out.status, 501, out.raw);
  assert.deepEqual(out.body.refusal, { code: 'NOT_IN_THIS_BUILD', fix: NO_MAIL, at: 'email' });
  assert.equal(out.sid, undefined);
  assert.deepEqual(s.people(), []);
  assert.equal(s.accepted.length, 0);
  /* AND THE LINK IS NOT SPENT: the same invitation still looks. */
  assert.equal((await s.call('/auth/invite', { body: { inviteToken: INVITE } })).status, 200);
});

/* ── sessions, and the fifteen minutes ────────────────────────────────────────────────────────────── */

test('A PERSON SEES THEIR SESSIONS, THIS ONE MARKED, and ends the others or every one', async () => {
  const s = setup({ door: { on: 'selfhost' } });
  const here = await s.keyIn();
  const there = await s.keyIn();

  const listed = await s.call('/auth/sessions', { cookie: here });
  assert.equal(listed.status, 200, listed.raw);
  const rows = listed.body.value?.sessions as { ref: string; current: boolean }[];
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((r) => r.current).length, 1);
  assert.ok(!listed.raw.includes(here) && !listed.raw.includes(there), 'a session id was answered');
  assert.equal((await s.call('/auth/sessions')).status, 401, 'nobody signed in was shown sessions');

  const others = await s.call('/auth/logout/all', { cookie: here, body: { keep: 'this' } });
  assert.deepEqual(others.body, { ok: true, value: { ended: 1 } });
  assert.equal((await s.call('/auth/session', { cookie: there })).status, 401, 'the other session lived on');
  assert.equal((await s.call('/auth/session', { cookie: here })).status, 200, 'this session was ended as well');

  /* A PAGE ELSEWHERE ENDS NOTHING. */
  const foreign = await s.call('/auth/logout/all', { cookie: here, body: { keep: 'none' }, headers: { origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  assert.equal((await s.call('/auth/session', { cookie: here })).status, 200);

  const all = await s.call('/auth/logout/all', { cookie: here, body: { keep: 'none' } });
  assert.deepEqual(all.body, { ok: true, value: { ended: 1 } });
  assert.equal((await s.call('/auth/session', { cookie: here })).status, 401, 'keep: none kept this session');
});

test('A STALE SESSION IS TOLD SO, BESIDE ITS REFUSAL, and keeps its cookie', async () => {
  const s = setup({ door: { on: 'selfhost' } });
  const sid = await s.keyIn();
  s.clock.advance(16 * MINUTE);
  const out = await s.call('/auth/passkey/register/options', { cookie: sid, body: {} });
  assert.equal(out.status, 401, out.raw);
  assert.equal(out.body.reason, 'stale');
  assert.equal(out.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.deepEqual(out.headers.getSetCookie(), [], 'a stale session had its cookie cleared');

  /* AND A FAILED SIGN-IN CARRIES NO REASON, so the page never mistakes one for the other. */
  const nobody = await s.call('/auth/session', { cookie: 'C'.repeat(43) });
  assert.equal(nobody.status, 401);
  assert.equal(nobody.body.reason, undefined);
});

/* ── the account table ────────────────────────────────────────────────────────────────────────────── */

test('AN ACCOUNT ROW THIS HOST WAS NOT HANDED IS 404, A POST IS A PAGE HERE SENDING JSON, AND THE WEBHOOK GETS THE REQUEST UNTOUCHED', async () => {
  const s = setup({ door: { on: 'selfhost' } });
  const sid = await s.keyIn();
  const checkouts: { email: string; body: Record<string, unknown> }[] = [];
  let hooked: string | null = null;
  const base: AccountDoor = { origin: ORIGIN, auth: s.d.auth, usage: () => ok({}), records: () => ok([]) };
  const full: AccountDoor = {
    ...base,
    checkout: (who, body) => {
      checkouts.push({ email: who.email, body });
      return ok({ url: 'https://pay.example/session' });
    },
    webhook: async (request) => {
      hooked = await request.text();
      return new Response(null, { status: 200 });
    },
  };
  const at = (door: AccountDoor, path: string, init: { body?: string; cookie?: string; origin?: string } = {}) =>
    serveAccount(
      new Request(`${ORIGIN}${path}`, {
        method: init.body === undefined ? 'GET' : 'POST',
        headers: {
          ...(init.body === undefined ? {} : { 'content-type': 'application/json', origin: init.origin ?? ORIGIN }),
          ...(init.cookie === undefined ? {} : { cookie: `__Host-bd_s=${init.cookie}` }),
        },
        ...(init.body === undefined ? {} : { body: init.body }),
      }),
      door,
    );

  /* NOT HANDED, AS ON A SELF-HOST: the same 404 as a path that is no row. */
  assert.equal((await at(base, '/account/billing', { cookie: sid })).status, 404);
  assert.equal((await at(base, '/account/billing/webhook', { body: '{}' })).status, 404);
  assert.equal((await at(base, '/account/nothing-here', { cookie: sid })).status, 404);
  assert.equal((await at(base, '/account/billing/checkout', { cookie: sid })).status, 405);

  /* THE WEBHOOK: no cookie, no origin, and the body exactly as it was sent. */
  const signed = '{"id":"evt_1","type":"invoice.paid"}';
  const hook = await serveAccount(
    new Request(`${ORIGIN}/account/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' }, body: signed }),
    full,
  );
  assert.equal(hook.status, 200);
  assert.equal(hooked, signed);

  /* A CHECKOUT: from a page elsewhere, nothing; signed out, nothing; from here and signed in, the door's answer. */
  const ask = JSON.stringify({ slug: 'the-shop' });
  assert.equal((await at(full, '/account/billing/checkout', { cookie: sid, body: ask, origin: 'https://evil.example' })).status, 403);
  assert.equal((await at(full, '/account/billing/checkout', { body: ask })).status, 401);
  assert.equal(checkouts.length, 0, 'a checkout door was reached without a session from this origin');
  const paid = await at(full, '/account/billing/checkout', { cookie: sid, body: ask });
  assert.equal(paid.status, 200);
  assert.deepEqual(await paid.json(), { ok: true, value: { url: 'https://pay.example/session' } });
  assert.deepEqual(checkouts, [{ email: 'ada@example.com', body: { slug: 'the-shop' } }]);
});

/* ── the operator ─────────────────────────────────────────────────────────────────────────────────── */

test('THE OPERATOR KEY IS LOCKED OUT LIKE EVERY OTHER: ten wrong keys, then 429 with Retry-After, the right key during it included', async () => {
  const provision = async () => ok({ record: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', person: 'p_1' });
  const s = setup({ door: { ip: '198.51.100.7', operator: { key: KEY, provision } } });
  assert.ok(s.d.person$('ada@example.com', 'Ada').ok);
  const mint = (key: string) => s.call('/auth/claim/mint', { body: { email: 'ada@example.com' }, headers: { authorization: `Bearer ${key}` } });

  for (let i = 0; i < 10; i++) assert.equal((await mint(`wrong-${i}`)).status, 401, `wrong key ${i + 1} was not compared`);
  const locked = await mint(KEY);
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('retry-after'), '900');
  assert.deepEqual(locked.body, { ok: false, retryAfter: 900 });

  /* FIFTEEN MINUTES ON, the right key is compared again and answered. */
  s.clock.advance(15 * MINUTE + 1);
  const back = await mint(KEY);
  assert.equal(back.status, 200, back.raw);
  assert.equal(typeof back.body.value?.claim, 'string');
});
