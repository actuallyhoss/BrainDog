/**
 * Sign-in over HTTP: the table, the cookie, the origin check and the loop, against a real Directory.
 *
 * THE STRINGS ARE PINNED EXACTLY. A cookie attribute that goes missing is a session a network can read or a
 * page elsewhere can send, and nothing on the screen would ever show it; an exact string is the only test
 * that fails when it happens. The route table is pinned the same way, because the web app is written
 * against it by somebody else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthFlow } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { createDirectory, type AuthConfig } from '@braindog/record/directory';

import {
  AUTH_ROUTES,
  clearCookie,
  cookieMode,
  deriveSessionKey,
  readSid,
  relyingParty,
  safeNext,
  sameKey,
  sameOrigin,
  heldContext,
  serveAuth,
  sessionContext,
  sessionCookie,
  type AuthDoor,
} from '../src/auth.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const ORIGIN = 'https://studio.example';
const KEY = 'a-throwaway-server-key-for-these-tests-only';
const SID = 'A'.repeat(43);

/* ── the table ────────────────────────────────────────────────────────── */

test('THE ROUTE TABLE IS THE CONTRACT, pinned row by row', () => {
  assert.deepEqual(
    AUTH_ROUTES.map((r) => `${r.method} ${r.path} ${r.on}`),
    [
      'GET /auth/methods both',
      'GET /auth/session both',
      'POST /auth/token selfhost',
      'POST /auth/passkey/register/options both',
      'POST /auth/passkey/register both',
      'POST /auth/passkey/assert/options both',
      'POST /auth/passkey/assert both',
      'POST /auth/magic/start both',
      'POST /auth/magic/redeem both',
      'POST /auth/magic/whose both',
      'GET /auth/passkeys both',
      'POST /auth/passkey/remove both',
      'POST /auth/passkey/rename both',
      'POST /auth/logout both',
      'GET /auth/sessions both',
      'POST /auth/logout/all both',
      'POST /auth/session/end both',
      'POST /auth/app/refresh both',
      'POST /auth/keychain/lock both',
      'POST /auth/switch both',
      'POST /auth/signup/start worker',
      'POST /auth/signup/verify worker',
      'GET /auth/signup/name worker',
      'GET /auth/google/start worker',
      'GET /auth/google/callback worker',
      'POST /auth/google/desktop worker',
      'POST /auth/desktop worker',
      'POST /auth/desktop/handoff worker',
      'POST /auth/app worker',
      'POST /auth/app/handoff worker',
      'POST /auth/app/code worker',
      'POST /auth/claim/mint worker',
      'POST /auth/provision worker',
      'POST /auth/suspend worker',
      'POST /auth/device both',
      'POST /auth/device/token both',
      'POST /auth/invite both',
    ],
  );
});

test('every flow has one route, named by the rule, and only reads are GETs', () => {
  const flows: AuthFlow[] = [
    'methods', 'session', 'key.exchange', 'passkey.register.options', 'passkey.register', 'passkey.assert.options',
    'passkey.assert', 'magic.start', 'magic.redeem', 'magic.whose', 'passkeys', 'passkey.remove', 'logout', 'switch', 'claim.mint',
    'sessions', 'logout.all', 'keychain.lock', 'suspend',
  ];
  for (const flow of flows) {
    const rows = AUTH_ROUTES.filter((r) => r.flow === flow);
    assert.equal(rows.length, 1, `${flow} has ${rows.length} routes`);
    const expected = flow === 'key.exchange' ? '/auth/token' : `/auth/${flow.replaceAll('.', '/')}`;
    assert.equal(rows[0]?.path, expected);
  }
  for (const flow of ['device', 'device.token'] as const) {
    const rows = AUTH_ROUTES.filter((r) => r.flow === flow);
    assert.equal(rows.length, 1, `${flow} has ${rows.length} routes`);
    assert.equal(rows[0]?.path, `/auth/${flow.replaceAll('.', '/')}`);
    assert.equal(rows[0]?.needs, 'nothing', 'a device has no credential yet');
  }
  assert.equal(new Set(AUTH_ROUTES.map((r) => r.path)).size, AUTH_ROUTES.length, 'two routes share a path');
  assert.deepEqual(AUTH_ROUTES.filter((r) => r.method === 'GET').map((r) => r.flow), ['methods', 'session', 'passkeys', 'sessions', 'signup.name', 'google.start', 'google.callback']);
  /* AN INVITATION'S PROOF HAS NO ROUTE OF ITS OWN: routed alone, it would mail a proof to any address typed. */
  for (const flow of ['invite.prove', 'invite.proved'] as const) assert.equal(AUTH_ROUTES.filter((r) => r.flow === flow).length, 0, `${flow} is routed`);
  for (const r of AUTH_ROUTES.filter((x) => x.needs === 'operator')) assert.equal(r.on, 'worker', `${r.path} is an operator route off the Worker`);
});

/* ── the cookie ───────────────────────────────────────────────────────── */

test('THE COOKIE, EXACTLY: __Host- on https, bd_s on loopback http, and the clears', () => {
  assert.equal(sessionCookie(SID, 'secure'), `__Host-bd_s=${SID}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax`);
  assert.equal(sessionCookie(SID, 'local'), `bd_s=${SID}; Path=/; Max-Age=7776000; HttpOnly; SameSite=Lax`);
  assert.equal(clearCookie('secure'), '__Host-bd_s=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  assert.equal(clearCookie('local'), 'bd_s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
});

test('which origins may hold a cookie, and which may run a passkey', () => {
  assert.equal(cookieMode('https://app.brain.dog'), 'secure');
  assert.equal(cookieMode('http://localhost:8080'), 'local');
  assert.equal(cookieMode('http://127.0.0.1:8080'), 'local');
  assert.equal(cookieMode('http://[::1]:8080'), 'local');
  assert.equal(cookieMode('http://studio.lan:8080'), null);
  assert.equal(cookieMode('http://192.168.1.4:8080'), null);
  assert.equal(cookieMode('not an origin'), null);

  assert.deepEqual(relyingParty('https://app.brain.dog'), { id: 'app.brain.dog', origin: 'https://app.brain.dog' });
  assert.deepEqual(relyingParty('http://localhost:8080'), { id: 'localhost', origin: 'http://localhost:8080' });
  /* An IP literal is not a valid RP ID, and a network http origin is not a secure context. */
  assert.equal(relyingParty('http://127.0.0.1:8080'), null);
  assert.equal(relyingParty('https://10.0.0.1'), null);
  assert.equal(relyingParty('http://studio.lan'), null);
});

test('AN RP ID THE HOST NAMES MUST BE THE HOST OR A DOT-SUFFIX OF IT, and anything else is no passkeys at all', () => {
  /* THE MOVE TO ONE DOMAIN IS WHY THIS EXISTS. A passkey made at
     `app.brain.dog` under the exact host is never offered at `brain.dog`, and production has no magic links, so the
     owner's only passkey would lock him out the day the app moves. Under `brain.dog` it is offered on both names. */
  assert.deepEqual(relyingParty('https://app.brain.dog', 'brain.dog'), { id: 'brain.dog', origin: 'https://app.brain.dog' });
  assert.deepEqual(relyingParty('https://brain.dog', 'brain.dog'), { id: 'brain.dog', origin: 'https://brain.dog' });
  assert.deepEqual(relyingParty('https://app.alpha.brain.dog', 'alpha.brain.dog'), { id: 'alpha.brain.dog', origin: 'https://app.alpha.brain.dog' });
  /* A name the origin is not under is one a browser refuses at the ceremony; saying so here keeps the refusal on the
     server's side of the wire, where an operator's typo in `RP_ID` is a switched-off passkey and not a broken one. */
  assert.equal(relyingParty('https://app.brain.dog', 'evil.dog'), null);
  /* AND A SUFFIX WITHOUT THE DOT IS NOT A PARENT: `rain.dog` ends `app.brain.dog` as text and is somebody else's domain. */
  assert.equal(relyingParty('https://app.brain.dog', 'rain.dog'), null);
  assert.equal(relyingParty('https://app.brain.dog', 'app.brain.dog.evil'), null);
  assert.equal(relyingParty('https://app.brain.dog', '.brain.dog'), null);
  /* A BARE TOP-LEVEL NAME IS A DOT-SUFFIX TOO, and it is a public suffix every browser refuses as an RP ID, so a
     passkey offered under it would be one no ceremony completes. Only the exact host may be a single label. */
  assert.equal(relyingParty('https://app.brain.dog', 'dog'), null);
  assert.deepEqual(relyingParty('http://localhost:8080', 'localhost'), { id: 'localhost', origin: 'http://localhost:8080' });
  /* EMPTY IS UNSET, so a var declared `""` in `wrangler.jsonc` is the exact host, which is what the Worker was. */
  assert.deepEqual(relyingParty('https://app.brain.dog', ''), { id: 'app.brain.dog', origin: 'https://app.brain.dog' });
  assert.deepEqual(relyingParty('https://app.brain.dog', undefined), { id: 'app.brain.dog', origin: 'https://app.brain.dog' });
  /* Case is not a different name, and the origin's refusals still come first. */
  assert.deepEqual(relyingParty('https://app.brain.dog', 'Brain.Dog'), { id: 'brain.dog', origin: 'https://app.brain.dog' });
  assert.equal(relyingParty('http://studio.lan', 'studio.lan'), null);
});

test('readSid reads the one cookie by the name its origin uses, and says nothing about validity', () => {
  const at = (cookie: string) => new Request('https://x/', { headers: { cookie } });
  assert.equal(readSid(at(`a=1; bd_s=${SID}; b=2`), 'local'), SID);
  assert.equal(readSid(at(`bd_s=${SID}`), 'secure'), undefined, 'a local name was read on https');
  assert.equal(readSid(at(`__Host-bd_s=${SID}`), 'secure'), SID);
  assert.equal(readSid(at('bd_s='), 'local'), '', 'an empty cookie read as no cookie');
  assert.equal(readSid(new Request('https://x/'), 'local'), undefined);
});

/* ── the origin ───────────────────────────────────────────────────────── */

test('THE sameOrigin MATRIX', () => {
  const at = (headers: Record<string, string>) => new Request(`${ORIGIN}/auth/token`, { method: 'POST', headers });
  const cases: [Record<string, string>, boolean][] = [
    [{ origin: ORIGIN }, true],
    [{ origin: 'https://evil.example' }, false],
    [{ origin: `${ORIGIN}/` }, false],
    [{ origin: 'https://studio.example:8443' }, false],
    [{ origin: 'http://studio.example' }, false],
    [{ origin: 'null' }, false],
    /* Origin wins over a Sec-Fetch-Site that says otherwise. */
    [{ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' }, false],
    [{ 'sec-fetch-site': 'same-origin' }, true],
    [{ 'sec-fetch-site': 'none' }, true],
    [{ 'sec-fetch-site': 'same-site' }, false],
    [{ 'sec-fetch-site': 'cross-site' }, false],
    [{}, false],
  ];
  for (const [headers, expected] of cases) assert.equal(sameOrigin(at(headers), ORIGIN), expected, JSON.stringify(headers));
});

test('safeNext keeps a path on this origin and turns everything else into /', () => {
  const kept: [string, string][] = [
    ['/r/tasks', '/r/tasks'],
    ['/r/tasks?where=open#top', '/r/tasks?where=open#top'],
    ['/', '/'],
    ['/settings/recovery', '/settings/recovery'],
  ];
  for (const [next, expected] of kept) assert.equal(safeNext(next), expected, next);
  const sent = [
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '/%2F%2Fevil.example',
    '/%2f/evil.example',
    '/%5Cevil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    'r/tasks',
    '',
    '/%E0%A4%A',
    `/${'a'.repeat(2048)}`,
  ];
  for (const next of sent) assert.equal(safeNext(next), '/', JSON.stringify(next));
  assert.equal(safeNext(undefined), '/');
  assert.equal(safeNext(['/r/tasks']), '/');
});

/* ── the helpers ──────────────────────────────────────────────────────── */

test('sameKey compares whole secrets, and the derived key is 32 bytes for this job only', async () => {
  assert.equal(await sameKey(KEY, KEY), true);
  assert.equal(await sameKey(KEY, `${KEY}x`), false);
  assert.equal(await sameKey(KEY, KEY.slice(0, -1)), false);
  assert.equal(await sameKey('', KEY), false);

  const material = new Uint8Array(32).fill(9);
  const one = await deriveSessionKey(material);
  assert.equal(one.length, 32);
  assert.deepEqual(one, await deriveSessionKey(material), 'the derivation is not deterministic');
  assert.notDeepEqual(one, material, 'the key was used as it is');
  assert.notDeepEqual(one, await deriveSessionKey(new Uint8Array(32).fill(8)));
  assert.deepEqual(material, new Uint8Array(32).fill(9), "the caller's bytes were changed");
});

test('sessionContext is the bearer-shaped context, with the proof time and nothing it was not given', () => {
  const who = { person: 'p_1', email: 'ada@example.com', record: 'rec_1', provedAt: NOW };
  assert.deepEqual(sessionContext(who, { level: 'owner', registers: null, levels: {} }), {
    principal: { kind: 'person', id: 'p_1', level: 'owner' },
    credentialed: true,
    provedAt: NOW,
    confirmable: false,
  });
  assert.deepEqual(sessionContext(who, { level: null, registers: ['tasks'], levels: { tasks: 'write' } }), {
    principal: { kind: 'person', id: 'p_1', level: null },
    registers: ['tasks'],
    levels: { tasks: 'write' },
    credentialed: true,
    provedAt: NOW,
    confirmable: false,
  });
});

test('heldContext carries what the lens adds, and leaves off every key that says nothing', () => {
  const grant = { epoch: 4, until: null, via: ['sh_1'], agents: true };
  const held = {
    level: null,
    registers: ['tasks'],
    levels: { tasks: 'comment' },
    wheres: { tasks: { field: 'thing', is: 'r_kiln' } },
    writes: {},
    hides: { tasks: ['rate'] },
    nots: { tasks: ['delete' as const] },
    grant,
  };
  assert.deepEqual(heldContext(held), {
    registers: ['tasks'],
    levels: { tasks: 'comment' },
    wheres: { tasks: { field: 'thing', is: 'r_kiln' } },
    hides: { tasks: ['rate'] },
    nots: { tasks: ['delete'] },
    grant,
  });
  const who = { person: 'p_2', email: 'sam@example.com', record: 'rec_1', provedAt: NOW };
  assert.deepEqual(sessionContext(who, held), { principal: { kind: 'person', id: 'p_2', level: null }, ...heldContext(held), credentialed: true, provedAt: NOW, confirmable: false });
  /* AND A PERSON WITH A PASSKEY CAN CONFIRM INLINE, as a share that widens asks (the sharing plan's §6). */
  assert.equal(sessionContext({ ...who, passkey: true }, held).confirmable, true);
  assert.deepEqual(heldContext({ level: 'owner', registers: null, levels: {} }), {}, 'an owner’s context gains nothing');
});

/* ── the loop, against a real Directory ───────────────────────────────── */

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string }; retryAfter?: number };

function setup(o: { auth?: AuthConfig | null; door?: Partial<AuthDoor> } = {}) {
  const sql = openSqlite();
  const config: AuthConfig | undefined =
    o.auth === null
      ? undefined
      : (o.auth ?? { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: ORIGIN }, magic: true, key: { serverKey: KEY } });
  const d = createDirectory(sql, fixedClock(NOW), config);
  const person = d.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  assert.ok(d.provision({ slug: 'the-studio', email: 'ada@example.com' }).ok);
  const sent: { to: string; link: string }[] = [];
  const door: AuthDoor = { on: 'selfhost', origin: ORIGIN, auth: d.auth, ip: '203.0.113.9', mail: (to, link) => void sent.push({ to, link }), ...o.door };
  const call = async (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = method === 'POST' ? { origin: ORIGIN, 'content-type': 'application/json', ...init.headers } : { ...init.headers };
    const res = await serveAuth(
      new Request(`${ORIGIN}${path}`, { method, headers, ...(init.body === undefined ? {} : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }) }),
      door,
    );
    const raw = await res.text();
    return { status: res.status, headers: res.headers, raw, body: JSON.parse(raw) as Body };
  };
  return { sql, d, call, sent, id: person.ok ? person.value.id : '' };
}

test('methods, fresh: every way this host has, nobody signed in, and it is the first run', async () => {
  const { call } = setup();
  const out = await call('/auth/methods');
  assert.equal(out.status, 200);
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.equal(out.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(out.body, { ok: true, value: { passkey: true, magic: true, key: true, open: false, me: null, firstRun: true } });
});

test('THE SERVER KEY FOR A SESSION: the exact cookie, the person in the body, and the id nowhere in it', async () => {
  const { call, id, sql } = setup();
  const out = await call('/auth/token', { body: { serverKey: KEY } });
  assert.equal(out.status, 200);
  const cookie = out.headers.getSetCookie();
  assert.equal(cookie.length, 1);
  assert.match(cookie[0] ?? '', /^__Host-bd_s=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax$/);
  assert.equal(out.body.value?.person, id);
  const sid = /=([^;]+)/.exec(cookie[0] ?? '')?.[1] ?? '';
  assert.ok(!out.raw.includes(sid), 'the session id is in the body');

  const who = await call('/auth/session', { headers: { cookie: `__Host-bd_s=${sid}` } });
  assert.equal(who.status, 200);
  assert.equal(who.body.value?.person, id);

  /* No session row holds the id itself. */
  for (const row of sql.all('SELECT * FROM dir_session')) for (const cell of Object.values(row)) assert.notEqual(String(cell), sid);
});

test('A PAGE ELSEWHERE IS REFUSED BEFORE THE DIRECTORY HEARS OF IT, and so is a body that is not JSON', async () => {
  const { call, sql } = setup();
  const foreign = await call('/auth/token', { body: { serverKey: KEY }, headers: { origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.refusal?.code, 'FORBIDDEN');
  assert.equal(sql.all('SELECT * FROM dir_fail').length, 0, 'a foreign request paid a strike');

  const plain = await call('/auth/token', { body: JSON.stringify({ serverKey: KEY }), headers: { 'content-type': 'text/plain' } });
  assert.equal(plain.status, 400);
  assert.equal(plain.body.refusal?.code, 'BODY_MALFORMED');
  assert.equal(sql.all('SELECT * FROM dir_session').length, 0);

  const array = await call('/auth/token', { body: '[1]' });
  assert.equal(array.status, 400);
});

test('a cookie that names nothing is a 401 with the one sentence, and it is cleared', async () => {
  const { call } = setup();
  const out = await call('/auth/session', { headers: { cookie: `__Host-bd_s=${SID}` } });
  assert.equal(out.status, 401);
  assert.deepEqual(out.body.refusal, { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' });
  assert.deepEqual(out.headers.getSetCookie(), [clearCookie('secure')]);
});

test('OPENING ANOTHER RECORD MOVES THE SESSION, from a page here only, and keeps the cookie it came with', async () => {
  const { call, d } = setup();
  const signed = await call('/auth/token', { body: { serverKey: KEY } });
  const cookie = (signed.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';
  const shop = d.provision({ slug: 'the-shop', email: 'ada@example.com' });
  assert.ok(shop.ok);

  const foreign = await call('/auth/switch', { body: { slug: 'the-shop' }, headers: { cookie, origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  assert.equal((await call('/auth/session', { headers: { cookie } })).body.value?.record, signed.body.value?.record, 'a page elsewhere moved the session');

  const moved = await call('/auth/switch', { body: { slug: 'the-shop' }, headers: { cookie } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.value?.record, shop.ok ? shop.value.record : '');
  assert.deepEqual(moved.headers.getSetCookie(), [], 'a switch wrote a cookie');
  assert.equal((await call('/auth/session', { headers: { cookie } })).body.value?.record, moved.body.value?.record);

  const elsewhere = await call('/auth/switch', { body: { slug: 'somebody-elses' }, headers: { cookie } });
  assert.equal(elsewhere.status, 403);
  assert.equal(elsewhere.body.refusal?.at, 'slug');
  assert.equal((await call('/auth/switch', { body: { slug: 'the-shop' } })).status, 401, 'no cookie opened a record');
});

test('TEN WRONG KEYS ARE COMPARED, THE ELEVENTH IS A 429 WITH Retry-After, and the right key during it is too', async () => {
  const { call } = setup();
  for (let i = 0; i < 10; i++) assert.equal((await call('/auth/token', { body: { serverKey: `wrong-${i}` } })).status, 401);
  const locked = await call('/auth/token', { body: { serverKey: KEY } });
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('retry-after'), '900');
  assert.deepEqual(locked.body, { ok: false, retryAfter: 900 });
  assert.deepEqual(locked.headers.getSetCookie(), []);
});

test('a path that is no route, the wrong verb, and a route this host does not serve', async () => {
  const { call } = setup();
  const nothing = await call('/auth/magic/some-token-somebody-pasted');
  assert.equal(nothing.status, 404);
  assert.equal(nothing.body.refusal?.code, 'ROUTE_UNKNOWN');
  assert.ok(!nothing.raw.includes('some-token'), 'the path was echoed');
  assert.equal((await call('/auth/token', { method: 'GET' })).status, 405);
  /* A CLOUD ROUTE IS NOT SERVED HERE, AND SAID SO (7f3dc0694): 501 and not a way in, so the operator's door stays shut. */
  const provision = await call('/auth/provision', { body: {} });
  assert.equal(provision.status, 501, 'the self-host served an operator route');
  assert.equal(provision.body.refusal?.code, 'NOT_IN_THIS_BUILD');
});

test('THE LINK IS MAILED AS A FRAGMENT, NEVER ANSWERED, and an unknown address looks the same', async () => {
  const { call, sent } = setup();
  const known = await call('/auth/magic/start', { body: { email: 'Ada@Example.com' } });
  const unknown = await call('/auth/magic/start', { body: { email: 'nobody@example.com' } });
  assert.deepEqual([known.status, known.raw], [unknown.status, unknown.raw]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, 'ada@example.com');
  const token = /^https:\/\/studio\.example\/signin#magic=([A-Za-z0-9_-]{43})$/.exec(sent[0]?.link ?? '')?.[1];
  assert.ok(token, `the link is ${sent[0]?.link}`);

  const redeemed = await call('/auth/magic/redeem', { body: { linkToken: token } });
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.headers.getSetCookie().length, 1);
  assert.equal((await call('/auth/magic/redeem', { body: { linkToken: token } })).status, 401, 'a link was spent twice');
});

test('an open self-host offers nothing and says so; an insecure origin and an unconfigured one say why', async () => {
  const open = setup({ door: { open: true } });
  assert.deepEqual((await open.call('/auth/methods')).body.value, { passkey: false, magic: false, key: false, open: true, me: null });
  assert.equal((await open.call('/auth/token', { body: { serverKey: KEY } })).status, 404);

  const lan = setup({ door: { origin: 'http://studio.lan:8080' } });
  assert.deepEqual((await lan.call('/auth/methods')).body.value, { passkey: false, magic: false, key: false, open: false, why: 'insecure', me: null });

  const bare = setup({ auth: null });
  const said = await bare.call('/auth/methods', { headers: { cookie: `__Host-bd_s=${SID}` } });
  assert.deepEqual(said.body.value, { passkey: false, magic: false, key: false, open: false, why: 'not-configured', me: null });
  assert.deepEqual(said.headers.getSetCookie(), [clearCookie('secure')], 'a cookie this host cannot have issued was kept');
  assert.equal((await bare.call('/auth/session', { headers: { cookie: `__Host-bd_s=${SID}` } })).status, 404);
});

test("MAIL THAT IS NOT GOING OUT IS SAID: `magic: 'down'`, and never for a host that offers no links", async () => {
  const magicOf = async (o: Parameters<typeof setup>[0]) => (await setup(o).call('/auth/methods')).body.value?.magic;
  const linksOff: AuthConfig = { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: ORIGIN }, magic: false };

  /* THE WORKER WITH NO SENDER SET: it always means to mail, so it is down whatever its Directory was told. */
  assert.equal(await magicOf({ auth: linksOff, door: { on: 'worker', mail: undefined } }), 'down');
  /* A DIRECTORY THAT OFFERS LINKS ON A HOST THAT GAVE NO SENDER: a link would be promised and never sent. */
  assert.equal(await magicOf({ door: { mail: undefined } }), 'down');
  /* A SELF-HOST WITH NO MAIL AND LINKS OFF OFFERS NONE, which is not a fault. */
  assert.equal(await magicOf({ auth: linksOff, door: { mail: undefined } }), false);
  assert.equal(await magicOf({ auth: linksOff, door: { mailDown: () => true } }), false);

  /* THE COUNT OF THE LAST SENDS, as the Worker's Directory keeps it: down when it says so, and only then. */
  assert.equal(await magicOf({ door: { mailDown: () => Promise.resolve(true) } }), 'down');
  assert.equal(await magicOf({ door: { mailDown: () => false } }), true);
  /* A COUNT THAT CANNOT BE READ, OR NEVER ANSWERS, NEVER HIDES A WAY IN THAT WORKS. */
  assert.equal(await magicOf({ door: { mailDown: () => { throw new Error('the Directory is away'); } } }), true);
  assert.equal(await magicOf({ door: { mailDown: () => new Promise<boolean>(() => {}) } }), true);

  /* DOWN TAKES NOTHING ELSE AWAY: the passkey is still offered beside it. */
  const down = (await setup({ door: { on: 'worker', mail: undefined } }).call('/auth/methods')).body.value;
  assert.equal(down?.passkey, true);
});

test('ONLY THE WORKER SAYS IT SERVES SIGN-UP, so a self-host is never asked /auth/signup/name (audit 31 Oct A29)', async () => {
  const worker = (await setup({ door: { on: 'worker' } }).call('/auth/methods')).body.value;
  assert.equal(worker?.signup, true);
  const self = (await setup().call('/auth/methods')).body.value;
  assert.equal(self?.signup, undefined);
  const open = (await setup({ door: { open: true } }).call('/auth/methods')).body.value;
  assert.equal(open?.signup, undefined);
});

test('THE OPERATOR: no key is no route, a wrong key is 401, and the claim link comes back and is never mailed', async () => {
  const made: { slug: string; email: string }[] = [];
  const provision = async (args: { slug: string; email: string }) => {
    made.push(args);
    return ok({ record: 'rec_01J8ZC0000000000000000000A', slug: args.slug, person: 'p_1' });
  };
  const off = setup({ door: { on: 'worker', operator: { key: undefined, provision } } });
  assert.equal((await off.call('/auth/provision', { body: { slug: 'the-studio', email: 'ada@example.com' } })).status, 404);

  const { call, sent } = setup({ door: { on: 'worker', operator: { key: KEY, provision } } });
  const bare = await call('/auth/provision', { body: { slug: 'the-studio', email: 'ada@example.com' } });
  assert.equal(bare.status, 401);
  const wrong = await call('/auth/provision', { body: { slug: 'x', email: 'ada@example.com' }, headers: { authorization: 'Bearer nope' } });
  assert.equal(wrong.status, 401);
  assert.equal(made.length, 0);

  const out = await call('/auth/provision', { body: { slug: 'the-studio', email: 'Ada@Example.com' }, headers: { authorization: `Bearer ${KEY}` } });
  assert.equal(out.status, 200);
  assert.deepEqual(made, [{ slug: 'the-studio', email: 'ada@example.com' }]);
  assert.match(String(out.body.value?.claim), /^https:\/\/studio\.example\/signin#claim=[A-Za-z0-9_-]{43}$/);
  assert.equal(out.body.value?.expires, NOW + 24 * 3_600_000);
  assert.equal(sent.length, 0, 'the operator route mailed the claim');

  const again = await call('/auth/claim/mint', { body: { email: 'ada@example.com' }, headers: { authorization: `Bearer ${KEY}` } });
  assert.equal(again.status, 200);
  assert.notEqual(again.body.value?.claim, out.body.value?.claim);
});
