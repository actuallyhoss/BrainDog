/**
 * Sign-in, end to end, over a real socket: the server key, the lockout, a session against `/api`, a passkey
 * made and used by the software authenticator, rotation, and the keychain's fifteen minutes.
 *
 * ONE CLOCK, MOVED BY THE TEST. `start({ now })` takes a function, and the record and the Directory both read
 * it, so "twenty-five hours later" is one assignment rather than a day of waiting or a mocked `Date`.
 *
 * AND NOTHING SECRET ANYWHERE. Every body the server answered and every line it logged is kept, and at the end
 * of each test none of them holds the server key or any session id. The boot line is checked the same way,
 * from a real `serve` process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { start } from '../src/server.ts';
import { answers, serveUntil } from './serving.ts';
import { asJSON, assert as authenticate, register, testKeys } from '../../../packages/record/test/fixtures/webauthn/authenticator.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOT_YOU = { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' };
const KEYS = testKeys()!;
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
};

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string }; retryAfter?: number } | null;

/** Everything the process logs while a test runs, through every console method the server could use. */
function listen() {
  const lines: string[] = [];
  const kept = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const name of ['log', 'error', 'warn', 'info'] as const)
    console[name] = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  return {
    lines,
    stop: () => Object.assign(console, kept),
  };
}

/** A self-host with a server key, a Directory holding one person, and the record that person owns. */
async function stack(o: { token?: string | null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-signin-'));
  const serverKey = o.token === null ? undefined : (o.token ?? randomBytes(32).toString('base64url'));
  let now = Date.UTC(2026, 8, 5, 12);
  const sessionKey = new Uint8Array(randomBytes(32));
  const logs = listen();
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    ...(serverKey === undefined ? {} : { token: serverKey }),
    sessionKey,
    now: () => now,
    pollMs: 0,
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  /* THE ORDER \`init\` USES: the person, the record they own, then the Directory row that names it. */
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const id = person.value.id;
  const made = await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id, email: 'ada@example.com', name: 'Ada' } });
  assert.ok(made.ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);

  const bodies: string[] = [];
  const sids: string[] = [];
  const call = async (path: string, init: { method?: string; body?: unknown; sid?: string; bearer?: string; headers?: Record<string, string> } = {}) => {
    const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = {
      ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }),
      ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}` }),
      ...(init.bearer === undefined ? {} : { authorization: `Bearer ${init.bearer}` }),
      ...init.headers,
    };
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
    const raw = await res.text();
    bodies.push(raw);
    const cookies = res.headers.getSetCookie();
    for (const c of cookies) {
      const sid = /^bd_s=([A-Za-z0-9_-]{43});/.exec(c)?.[1];
      if (sid) sids.push(sid);
    }
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body, cookies, headers: res.headers };
  };
  const sidOf = (cookies: string[]): string => {
    const sid = /^bd_s=([A-Za-z0-9_-]{43}); Path=\/; Max-Age=7776000; HttpOnly; SameSite=Lax$/.exec(cookies[0] ?? '')?.[1];
    return sid ?? assert.fail(`no session cookie in ${JSON.stringify(cookies)}`);
  };
  const keyIn = async (sid?: string) => {
    const out = await call('/auth/token', { body: { serverKey }, ...(sid === undefined ? {} : { sid }) });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    return sidOf(out.cookies);
  };

  return {
    call,
    keyIn,
    directory: running.directory,
    api: running.api,
    /** A session for somebody the server key cannot sign in, written the way the Directory writes one. */
    plant(person: string): string {
      const sid = randomBytes(32).toString('base64url');
      const db = new DatabaseSync(join(dir, 'directory.sqlite'));
      try {
        db.prepare('INSERT INTO dir_session (id_hash, person, record, expires, rotated_at, authed_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(createHmac('sha256', sessionKey).update(`s:${sid}`).digest('hex'), person, REC, now + HOUR, now, now);
      } finally {
        db.close();
      }
      return sid;
    },
    sidOf,
    origin,
    id,
    serverKey,
    advance: (ms: number) => void (now += ms),
    /** No body the server answered and no line it logged holds the key or any session id. */
    clean() {
      const secrets = [...(serverKey === undefined ? [] : [serverKey]), ...sids];
      for (const where of [...bodies, ...logs.lines]) for (const secret of secrets) assert.ok(!where.includes(secret), 'a secret reached a body or a log');
    },
    async close() {
      logs.stop();
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('METHODS, THE LOCKOUT WITH Retry-After, AND THE WINDOW THAT FORGETS IT', async () => {
  const s = await stack();
  try {
    const methods = await s.call('/auth/methods');
    assert.deepEqual(methods.body, { ok: true, value: { passkey: true, magic: false, key: true, open: false, me: null, firstRun: true } });

    for (let i = 0; i < 10; i++) {
      const wrong = await s.call('/auth/token', { body: { serverKey: `wrong-${i}` } });
      assert.equal(wrong.status, 401);
      assert.deepEqual(wrong.body?.refusal, NOT_YOU);
    }
    /* THE ELEVENTH IS NOT COMPARED, and the right key is refused like any other while the lock holds. */
    const locked = await s.call('/auth/token', { body: { serverKey: s.serverKey } });
    assert.equal(locked.status, 429);
    assert.equal(locked.headers.get('retry-after'), '900');
    assert.deepEqual(locked.body, { ok: false, retryAfter: 900 });
    assert.deepEqual(locked.cookies, []);

    s.advance(15 * MINUTE + 1);
    const sid = await s.keyIn();
    const me = await s.call('/auth/methods', { sid });
    assert.equal((me.body?.value?.me as { person: string } | null)?.person, s.id);
    s.clean();
  } finally {
    await s.close();
  }
});

test('A SESSION READS AND WRITES /api, A PAGE ELSEWHERE CANNOT USE IT, AND AN AGENT IS STILL NOT A PERSON', async () => {
  const s = await stack();
  try {
    const sid = await s.keyIn();
    assert.equal((await s.call('/api/boot', { sid })).status, 200);
    assert.equal((await s.call('/api/create', { sid, body: { register: 'obligations', fields: { what: 'Invoice 41' } } })).status, 200);

    /* THE COOKIE RIDES ALONG ON A CROSS-SITE REQUEST IN SOME BROWSERS AND SOME CASES; THE ORIGIN IS WHAT SAYS NO. */
    const foreign = await s.call('/api/create', { sid, body: { register: 'obligations', fields: { what: 'x' } }, headers: { origin: 'https://evil.example' } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.body?.refusal?.code, 'FORBIDDEN');
    /* A cookie is only ever sent by a browser, and a browser always says where a POST came from. */
    const unsaid = await s.call('/api/create', { sid, body: { register: 'obligations', fields: { what: 'x' } }, headers: { origin: '' } });
    assert.equal(unsaid.status, 403);
    assert.equal((await s.call('/auth/logout', { sid, body: {}, headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await s.call('/api/boot', { sid })).status, 200, 'a refused logout signed the session out');

    /* A BEARER MINTED FROM THE SESSION READS, AND IS REFUSED BY EVERY ADMIN ROUTE. */
    const minted = await s.call('/api/createToken', { sid, body: { scope: 'write' } });
    assert.equal(minted.status, 200, JSON.stringify(minted.body));
    const bearer = String(minted.body?.value?.bearer);
    assert.equal((await s.call('/api/boot', { bearer })).status, 200);
    const admin = await s.call('/api/listTokens', { bearer });
    assert.equal(admin.status, 403);
    assert.equal(admin.body?.refusal?.code, 'NEEDS_BROWSER_SESSION');
    assert.equal((await s.call('/api/listTokens', { sid })).status, 200);

    /* A fresh proof opens the keychain. */
    assert.equal((await s.call('/api/listGrants', { sid })).status, 200);

    /* AND THE ONE KEYCHAIN WRITE A SCREEN REACHES. The session gets as far as the record, which says there is no such
       grant; the bearer minted from that same session never gets that far. */
    const revoked = await s.call('/api/revokeGrant', { sid, body: { id: 'g_nowhere' } });
    assert.equal(revoked.status, 422, JSON.stringify(revoked.body));
    assert.equal(revoked.body?.refusal?.code, 'OUT_OF_BOUNDS', 'the record, not the router, is what answered');
    const barred = await s.call('/api/revokeGrant', { bearer, body: { id: 'g_nowhere' } });
    assert.equal(barred.status, 403);
    assert.equal(barred.body?.refusal?.code, 'NEEDS_BROWSER_SESSION');
    s.clean();
  } finally {
    await s.close();
  }
});

test('A PASSKEY: MADE BEHIND A SESSION, SIGNED OUT, SIGNED IN WITH, ROTATED AFTER A DAY, AND ASKED AGAIN BY THE KEYCHAIN', async () => {
  const s = await stack();
  try {
    const first = await s.keyIn();

    /* MADE, behind the session, for this origin and nowhere else. */
    const options = await s.call('/auth/passkey/register/options', { sid: first, body: {} });
    assert.equal(options.status, 200);
    const challenge = String(options.body?.value?.challenge);
    assert.deepEqual(options.body?.value?.rp, { id: 'localhost', name: 'BrainDog' });
    const made = await register(KEYS.es256, { rpId: 'localhost', origin: s.origin, challenge });
    const kept = await s.call('/auth/passkey/register', { sid: first, body: { credential: asJSON.registration(made), label: 'This laptop' } });
    assert.equal(kept.status, 200, JSON.stringify(kept.body));
    assert.equal(kept.body?.value?.label, 'This laptop');
    assert.equal(((await s.call('/auth/passkeys', { sid: first })).body?.value as unknown as unknown[]).length, 1);

    /* SIGNED OUT: the row is gone, the cookie is cleared exactly, and the old id is a 401 that clears it again. */
    const out = await s.call('/auth/logout', { sid: first, body: {} });
    assert.equal(out.status, 200);
    assert.deepEqual(out.cookies, ['bd_s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
    const gone = await s.call('/api/boot', { sid: first });
    assert.equal(gone.status, 401);
    assert.deepEqual(gone.body?.refusal, NOT_YOU);
    assert.deepEqual(gone.cookies, ['bd_s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
    assert.equal((await s.call('/auth/methods')).body?.value?.firstRun, false);

    /* SIGNED IN WITH IT. */
    const passkeyIn = async (signCount: number, sid?: string) => {
      const asked = await s.call('/auth/passkey/assert/options', { body: {} });
      const signed = await authenticate(KEYS.es256, { rpId: 'localhost', origin: s.origin, challenge: String(asked.body?.value?.challenge), signCount, person: s.id });
      const answer = await s.call('/auth/passkey/assert', { body: { credential: asJSON.assertion(signed) }, ...(sid === undefined ? {} : { sid }) });
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.equal(answer.body?.value?.person, s.id);
      return s.sidOf(answer.cookies);
    };
    const second = await passkeyIn(1);
    assert.equal((await s.call('/api/listGrants', { sid: second })).status, 200);

    /* THE KEYCHAIN ASKS AGAIN after fifteen minutes, and nothing else does. */
    s.advance(16 * MINUTE);
    const stale = await s.call('/api/listGrants', { sid: second });
    assert.equal(stale.status, 403);
    assert.deepEqual(stale.body?.refusal, { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to open the keychain.', at: 'proof' });
    assert.equal((await s.call('/api/boot', { sid: second })).status, 200);

    /* ROTATED AFTER A DAY OF USE: a new id on the answer, the old one good for a minute, then not. */
    s.advance(25 * HOUR);
    const rotated = await s.call('/api/boot', { sid: second });
    assert.equal(rotated.status, 200);
    const third = s.sidOf(rotated.cookies);
    assert.notEqual(third, second);
    assert.equal((await s.call('/api/boot', { sid: second })).status, 200, 'the grace minute did not hold');
    assert.equal((await s.call('/api/boot', { sid: third })).status, 200);
    s.advance(61_000);
    assert.equal((await s.call('/api/boot', { sid: second })).status, 401);
    assert.equal((await s.call('/api/boot', { sid: third })).status, 200);

    /* ROTATION IS NOT A PROOF, so the keychain still asks; a new sign-in is one, and it retires the cookie it replaced. */
    assert.equal((await s.call('/api/listGrants', { sid: third })).status, 403);
    const fourth = await passkeyIn(2, third);
    assert.equal((await s.call('/api/listGrants', { sid: fourth })).status, 200);
    assert.equal((await s.call('/api/boot', { sid: third })).status, 401, 'the session a sign-in replaced still works');
    s.clean();
  } finally {
    await s.close();
  }
});

test('A BAD COOKIE ON AN OPEN SELF-HOST IS A 401 AND IS CLEARED, never the owner', async () => {
  const s = await stack({ token: null });
  try {
    assert.deepEqual((await s.call('/auth/methods')).body?.value, { passkey: false, magic: false, key: false, open: true, me: null });
    const bad = await s.call('/api/boot', { sid: 'A'.repeat(43) });
    assert.equal(bad.status, 401);
    assert.deepEqual(bad.body?.refusal, NOT_YOU);
    assert.deepEqual(bad.cookies, ['bd_s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
    const booted = await s.call('/api/boot');
    assert.equal(booted.status, 200, 'open mode stopped answering the owner');
    assert.equal((booted.body?.value as { signIn?: unknown } | undefined)?.signIn, false, 'boot did not say nobody signs in here');
    assert.equal((await s.call('/auth/token', { body: { serverKey: 'anything' } })).status, 404);
  } finally {
    await s.close();
  }
});

test('THE BOOT LINE NAMES THE WAYS IN AND NEVER THE KEY, on stdout or stderr', async () => {
  const data = mkdtempSync(join(tmpdir(), 'braindog-boot-'));
  const serverKey = randomBytes(32).toString('base64url');
  try {
    const env = { ...process.env, BRAINDOG_DATA: data, PORT: '0' };
    const made = spawnSync(process.execPath, [MAIN, 'init', 'the-studio', '--owner', 'ada@example.com'], { encoding: 'utf8', env });
    assert.equal(made.status, 0, made.stderr);
    /* `serve` RUNS UNTIL IT IS STOPPED, so it is stopped, once the line is out and it answers a request: the lines
       under this one have been said by then, so the key is looked for in all of them (`serving.ts`). A fixed five
       second timeout was measured too short for the boot under a loaded test run. */
    const served = await serveUntil({ ...env, BRAINDOG_TOKEN: serverKey, BRAINDOG_HOST: '127.0.0.1' }, async (so) => {
      const port = /sign in at http:\/\/localhost:(\d+)\/signin/.exec(so)?.[1];
      return port !== undefined && (await answers(`http://127.0.0.1:${port}/healthz`));
    });
    const said = `${served.stdout ?? ''}${served.stderr ?? ''}`;
    assert.match(served.stderr ?? '', /behind BRAINDOG_SERVER_KEY; sign in at http:\/\/localhost:\d+\/signin with a passkey or the server key/);
    assert.equal(served.stdout ?? '', '', 'serve wrote to stdout, which belongs to the CLI');
    assert.ok(!said.includes(serverKey), 'the boot printed the server key');
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('GET /account/usage IS THE SIGNED-IN PERSON’S LEDGER: a cookie and nothing else, and a day written as a day', async () => {
  const s = await stack();
  try {
    const nobody = await s.call('/account/usage?from=2026-09-01&to=2026-09-30');
    assert.equal(nobody.status, 401);
    assert.equal(nobody.body?.refusal?.code, 'UNAUTHORIZED');

    /* THE SERVER KEY AS A BEARER IS NOT A PERSON, so it reads no account. */
    const bearer = await s.call('/account/usage?from=2026-09-01&to=2026-09-30', { bearer: s.serverKey ?? '' });
    assert.equal(bearer.status, 401);

    const sid = await s.keyIn();
    const mine = await s.call('/account/usage?from=2026-09-01&to=2026-09-30', { sid });
    assert.equal(mine.status, 200, mine.raw);
    const value = mine.body?.value as unknown as { from: string; to: string; records: { record: string; totals: { runs: number } }[] };
    assert.equal(value.from, '2026-09-01');
    assert.equal(value.to, '2026-09-30');
    assert.deepEqual(value.records.map((r) => [r.record, r.totals.runs]), [[REC, 0]]);

    const wrong = await s.call('/account/usage?from=September&to=2026-09-30', { sid });
    assert.notEqual(wrong.status, 200);
    assert.equal(wrong.body?.refusal?.code, 'VALUE_MALFORMED');

    const posted = await s.call('/account/usage', { body: {}, sid });
    assert.equal(posted.status, 405);
    const elsewhere = await s.call('/account/nothing', { sid });
    assert.equal(elsewhere.status, 404);
    s.clean();
  } finally {
    await s.close();
  }
});

test('GET /account/records IS THE SWITCHER\'S ROW: the one record this process holds, named by itself, at the level the caller actually holds there', async () => {
  const s = await stack();
  try {
    const nobody = await s.call('/account/records');
    assert.equal(nobody.status, 401);
    assert.equal(nobody.body?.refusal?.code, 'UNAUTHORIZED');

    /* THE SERVER KEY AS A BEARER IS NOT A PERSON EITHER, the same as `/account/usage` above. */
    const bearer = await s.call('/account/records', { bearer: s.serverKey ?? '' });
    assert.equal(bearer.status, 401);

    const sid = await s.keyIn();
    const mine = await s.call('/account/records', { sid });
    assert.equal(mine.status, 200, mine.raw);
    /* THE NAME AND THE LEVEL ARE THE RECORD'S OWN ANSWER, not a second copy of either: `The Studio`
       is `createRecord`'s own `name`, and `owner` is what `access(person)` reads off the `member`
       table `createRecord` wrote, never a constant this test asserts because the Directory said so. */
    assert.deepEqual(mine.body?.value as unknown as { slug: string; name: string; level: string }[], [{ slug: 'the-studio', name: 'The Studio', level: 'owner' }]);

    const posted = await s.call('/account/records', { body: {}, sid });
    assert.equal(posted.status, 405);
    s.clean();
  } finally {
    await s.close();
  }
});

test('POST /auth/switch OPENS ONLY THE RECORD THIS PROCESS SERVES, and never moves the session to one it does not', async () => {
  const s = await stack();
  try {
    const sid = await s.keyIn();
    /* A SECOND RECORD IN THE SAME DIRECTORY, owned by the same person, that this process never opened. */
    assert.ok(s.directory.provision({ slug: 'the-other-shop', email: 'ada@example.com' }).ok);
    const here = await s.call('/auth/switch', { body: { slug: 'the-studio' }, sid });
    assert.equal(here.status, 200, here.raw);
    assert.equal(here.body?.value?.record, REC);

    const elsewhere = await s.call('/auth/switch', { body: { slug: 'the-other-shop' }, sid });
    assert.equal(elsewhere.status, 403);
    assert.deepEqual(elsewhere.body?.refusal, { code: 'FORBIDDEN', fix: 'You are on no open record by that name.', at: 'slug' });

    /* AND THE SESSION STILL READS AND WRITES THIS RECORD. */
    const who = await s.call('/auth/session', { sid });
    assert.equal(who.body?.value?.record, REC);
    assert.equal((await s.call('/api/boot', { sid })).status, 200);
    s.clean();
  } finally {
    await s.close();
  }
});

test('POST /auth/switch ASKS THE RECORD: a person removed from it is refused, and nobody signed out learns which name is served', async () => {
  const s = await stack();
  try {
    const sid = await s.keyIn();
    assert.ok(s.directory.provision({ slug: 'the-other-shop', email: 'ada@example.com' }).ok);
    for (const cookie of [undefined, 'A'.repeat(43)]) {
      const here = await s.call('/auth/switch', { body: { slug: 'the-studio' }, ...(cookie ? { sid: cookie } : {}) });
      const there = await s.call('/auth/switch', { body: { slug: 'the-other-shop' }, ...(cookie ? { sid: cookie } : {}) });
      assert.deepEqual([here.status, here.raw], [there.status, there.raw], 'the served name answered differently to somebody signed out');
      assert.equal(here.status, 401);
    }

    const bob = s.directory.person$('bob@example.com', 'Bob');
    assert.ok(bob.ok);
    assert.equal((await s.call('/api/invite', { body: { person: bob.value.id, email: 'bob@example.com', name: 'Bob', level: 'read' }, sid })).status, 200);
    assert.ok(s.directory.join(REC, bob.value.id).ok);
    const bobs = s.plant(bob.value.id);
    assert.equal((await s.call('/auth/switch', { body: { slug: 'the-studio' }, sid: bobs })).status, 200);
    assert.equal((await s.call('/api/removeMember', { body: { person: bob.value.id }, sid })).status, 200);
    const gone = await s.call('/auth/switch', { body: { slug: 'the-studio' }, sid: bobs });
    assert.equal(gone.status, 403, gone.raw);
    assert.deepEqual(gone.body?.refusal, { code: 'FORBIDDEN', fix: 'You are on no open record by that name.', at: 'slug' });
  } finally {
    await s.close();
  }
});
