/**
 * An invitation, end to end, over a real socket: the owner mints a link, a stranger opens it and is told this host
 * cannot prove a new address, because it sends no mail; signed in by a claim link instead, they accept it and reach
 * the record at the level it named. And every way the link must do less.
 *
 * NOTHING SECRET ANYWHERE. The link's token is in exactly one body, the mint's answer, and in no log line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_MAIL } from '@braindog/host/auth';

import { start } from '../src/server.ts';
import { asJSON, register, testKeys } from '../../../packages/record/test/fixtures/webauthn/authenticator.ts';

const HOUR = 3_600_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const KEYS = testKeys()!;

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string } } | null;

async function stack(o: { token?: string | null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-invite-'));
  const serverKey = o.token === null ? undefined : randomBytes(32).toString('base64url');
  let now = Date.UTC(2026, 8, 5, 12);
  const lines: string[] = [];
  const kept = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const name of ['log', 'error', 'warn', 'info'] as const) console[name] = (...args: unknown[]) => void lines.push(args.map(String).join(' '));

  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    ...(serverKey === undefined ? {} : { token: serverKey }),
    sessionKey: new Uint8Array(randomBytes(32)),
    now: () => now,
    pollMs: 0,
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const made = await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);

  const bodies: string[] = [];
  const call = async (path: string, init: { body?: unknown; sid?: string; bearer?: string } = {}) => {
    const method = init.body === undefined ? 'GET' : 'POST';
    const headers: Record<string, string> = {
      ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }),
      ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}` }),
      ...(init.bearer === undefined ? {} : { authorization: `Bearer ${init.bearer}` }),
    };
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
    const raw = await res.text();
    bodies.push(raw);
    const sid = res.headers.getSetCookie().map((c) => /^bd_s=([A-Za-z0-9_-]{43});/.exec(c)?.[1]).find(Boolean);
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body, sid };
  };
  const keyIn = async () => {
    const out = await call('/auth/token', { body: { serverKey } });
    assert.equal(out.status, 200, out.raw);
    return out.sid ?? assert.fail('no session');
  };
  /* THE OWNER ADDS A PASSKEY, so the server key's one-person rule no longer stands between them and a second person. */
  const passkey = async (sid: string) => {
    const options = await call('/auth/passkey/register/options', { sid, body: {} });
    const credential = await register(KEYS.es256, { rpId: 'localhost', origin, challenge: String(options.body?.value?.challenge) });
    assert.equal((await call('/auth/passkey/register', { sid, body: { credential: asJSON.registration(credential), label: 'Laptop' } })).status, 200);
  };
  const mint = async (sid: string, email: string, level = 'write') => {
    const out = await call('/api/invite', { sid, body: { email, level } });
    assert.equal(out.status, 200, out.raw);
    return { id: String((out.body?.value?.invitation as { id: string }).id), token: String(out.body?.value?.token) };
  };

  return {
    running,
    call,
    keyIn,
    passkey,
    mint,
    advance: (ms: number) => void (now += ms),
    /** The link's token reached one body, the mint's, and no log line. */
    clean(tokens: string[]) {
      for (const token of tokens) {
        const secret = token.slice(token.indexOf('.') + 1);
        assert.ok(bodies.filter((b) => b.includes(secret)).length <= 1, 'the link reached more than one body');
        assert.ok(!lines.some((l) => l.includes(secret)), 'the link reached a log');
      }
    },
    async close() {
      Object.assign(console, kept);
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('THE WHOLE INVITATION: minted by the owner, opened by a stranger who cannot prove a new address here, then accepted signed in, once', async () => {
  const s = await stack();
  try {
    const ada = await s.keyIn();

    /* WITH NO PASSKEY YET, a second person would end the owner's server-key sign-in, so the link waits. */
    const early = await s.mint(ada, 'bo@example.com');
    const blocked = await s.call('/auth/invite', { body: { inviteToken: early.token, accept: true } });
    assert.equal(blocked.status, 409, blocked.raw);
    assert.match(String(blocked.body?.refusal?.fix), /passkey/);

    await s.passkey(ada);
    const { token } = await s.mint(ada, 'Bo@Example.com', 'write');
    assert.ok(token.startsWith(`${REC}.`));

    /* LISTED WITHOUT ITS LINK, and the first link for that address was withdrawn by the second. */
    const listed = await s.call('/api/invitations', { sid: ada });
    assert.equal(listed.status, 200);
    assert.equal((listed.body?.value as unknown as unknown[]).length, 1);
    assert.equal((await s.call('/auth/invite', { body: { inviteToken: early.token } })).status, 401);

    /* LOOKED AT, then accepted, by nobody signed in: A NEW ADDRESS PROVES ITS MAILBOX FIRST, and this host sends no
       mail, so it says so in one sentence and makes nobody. The link is not spent. */
    const seen = await s.call('/auth/invite', { body: { inviteToken: token } });
    assert.equal(seen.status, 200, seen.raw);
    /* AND IT SAYS WHAT IT OPENS before anybody accepts: the record by its name, and the level the owner minted it at. */
    assert.deepEqual(seen.body?.value, {
      email: 'Bo@Example.com',
      expires_at: '2026-09-06T12:00:00.000Z',
      record: 'The Studio',
      level: 'write',
      lists: [],
      shared: null,
      /* AND WHO INVITED THEM, by the name they go by here, which is what the landing line says. */
      by: 'Ada',
      signedInAs: null,
    });
    const unproved = await s.call('/auth/invite', { body: { inviteToken: token, accept: true } });
    assert.equal(unproved.status, 501, unproved.raw);
    assert.equal(unproved.body?.refusal?.code, 'NOT_IN_THIS_BUILD');
    assert.equal(unproved.body?.refusal?.fix, NO_MAIL);
    assert.equal(unproved.sid, undefined, 'a session was made for an address nobody proved');
    assert.equal((await s.call('/auth/invite', { body: { inviteToken: token } })).status, 200, 'refusing to prove the address spent the link');

    /* SIGNED IN THE WAY THIS HOST DOES HAVE, a claim link the operator hands over, the same link is accepted. */
    assert.ok(s.running.directory.person$('Bo@Example.com').ok);
    const claim = await s.running.directory.auth({ flow: 'claim.mint', email: 'Bo@Example.com' });
    assert.ok(claim.status === 200 && claim.mail && 'claimToken' in claim.mail, JSON.stringify(claim.status));
    const redeemed = await s.call('/auth/magic/redeem', { body: { claimToken: claim.mail.claimToken } });
    assert.equal(redeemed.status, 200, redeemed.raw);
    const bo = redeemed.sid ?? assert.fail('no session for the new person');
    const accepted = await s.call('/auth/invite', { sid: bo, body: { inviteToken: token, accept: true } });
    assert.equal(accepted.status, 200, accepted.raw);
    assert.equal(accepted.body?.value?.email, 'Bo@Example.com');

    /* ON THE RECORD at the level named, and not an owner. */
    assert.equal((await s.call('/api/create', { sid: bo, body: { register: 'notes', fields: {} } })).status !== 401, true);
    const members = await s.call('/api/members', { sid: ada });
    const row = (members.body?.value as unknown as { email: string; level: string }[]).find((m) => m.email === 'Bo@Example.com');
    assert.equal(row?.level, 'write');
    assert.equal((await s.call('/api/members', { sid: bo })).status, 403);

    /* ONCE. */
    const twice = await s.call('/auth/invite', { body: { inviteToken: token, accept: true } });
    assert.equal(twice.status, 401);
    assert.deepEqual((await s.call('/api/invitations', { sid: ada })).body?.value, []);

    s.clean([early.token, token]);
  } finally {
    await s.close();
  }
});

test('WITHDRAWN, RUN OUT, THE WRONG PERSON, AN EXISTING SIGN-IN, AND A TOKEN: each does less', async () => {
  const s = await stack();
  try {
    const ada = await s.keyIn();
    await s.passkey(ada);

    /* WITHDRAWN. */
    const cy = await s.mint(ada, 'cy@example.com', 'read');
    assert.equal((await s.call('/api/revokeInvite', { sid: ada, body: { id: cy.id } })).status, 200);
    assert.equal((await s.call('/auth/invite', { body: { inviteToken: cy.token, accept: true } })).status, 401);

    /* RUN OUT. */
    const di = await s.mint(ada, 'di@example.com', 'read');
    s.advance(24 * HOUR + 1);
    assert.equal((await s.call('/auth/invite', { body: { inviteToken: di.token, accept: true } })).status, 401);

    /* THE OWNER IS SIGNED IN AND THE LINK IS SOMEBODY ELSE'S: refused, and not spent. */
    const ada2 = await s.keyIn().catch(() => ada);
    const ed = await s.mint(ada2, 'ed@example.com', 'read');
    const wrong = await s.call('/auth/invite', { sid: ada2, body: { inviteToken: ed.token, accept: true } });
    assert.equal(wrong.status, 403, wrong.raw);
    assert.equal((await s.call('/auth/invite', { body: { inviteToken: ed.token } })).status, 200, 'a refused acceptance spent the link');

    /* AN ADDRESS THAT ALREADY SIGNS IN HERE is sent to sign in first. The owner is on the record, so the mint refuses
       them outright; somebody removed from it still has their passkey, so that case is the Directory's. */
    const already = await s.call('/api/invite', { sid: ada2, body: { email: 'ada@example.com', level: 'read' } });
    assert.equal(already.body?.refusal?.code, 'ALREADY_KNOWN', already.raw);

    /* A TOKEN CANNOT INVITE. */
    const minted = await s.call('/api/createToken', { sid: ada2, body: { scope: 'write' } });
    const bearer = String(minted.body?.value?.bearer);
    const refused = await s.call('/api/invite', { bearer, body: { email: 'fi@example.com', level: 'read' } });
    assert.equal(refused.status, 403, refused.raw);
    assert.equal(refused.body?.refusal?.code, 'NEEDS_BROWSER_SESSION');
    assert.equal((await s.call('/api/invitations', { bearer })).status, 403);

    s.clean([cy.token, di.token, ed.token]);
  } finally {
    await s.close();
  }
});

test('A HOST IN OPEN MODE MINTS NO LINK: nobody else could sign in to use it', async () => {
  const s = await stack({ token: null });
  try {
    const out = await s.call('/api/invite', { body: { email: 'bo@example.com', level: 'read' } });
    assert.notEqual(out.status, 200, out.raw);
    assert.equal((await s.call('/auth/invite', { body: { inviteToken: `${REC}.${'a'.repeat(43)}` } })).status, 404);
  } finally {
    await s.close();
  }
});
