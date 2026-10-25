/**
 * Canaries planted in a real self-host, and looked for in every answer of every route.
 *
 * THE CLASS THIS ENDS IS A NEW DOOR NOBODY SWEPT. A secret reached an answer, or a member read a list they were never
 * given, through a route written after the last audit, and each fix closed the one door it was found at. So nothing
 * here names a route: `ROUTES` is read when the test runs, `EXTRA_ROUTES` included, and a route added next month is
 * swept the day it lands without anybody writing a line for it.
 *
 * WHAT IS PLANTED:
 * - a value put into a `secret` field through the app's own key door, which the host seals into the keychain;
 * - the keychain's own keys, made here so their bytes are known, and wrapped under this host's key store as `init` would;
 * - the title of a row in `obligations`, a list the member was never given.
 *
 * WHO ASKS: the owner by the server key, a READ token the owner minted, a member invited to Reads on `tasks` and
 * nothing else, and a token that member holds, which can reach no further than they can. The first two canaries may
 * reach nobody. The third may reach the owner and their token, and never the member or the member's token.
 *
 * AND A HIDDEN LIST REFUSES AS A MISSING ONE DOES. Every route is asked by the member about `obligations`, which is
 * there and hidden from them, and about a list that is not there at all. The two answers must be one answer with the
 * name changed, or the refusal itself tells the member what the record holds.
 *
 * WRITTEN AND NOT RUN BY ITS AUTHOR. Every finding is collected before anything is asserted, so the first run lists
 * every leak at once; each is repaired at its door, never here. An exemption is a line in `EXEMPT` with its reason.
 *
 * THE RECORD IS BUILT AS `client.test.ts`'s `connected()` builds its own, a real `start` on port 0, with the Directory,
 * a session key and a key store beside it, because the one door that seals a value into a secret field is a browser
 * session's (`/api/keys/put`) and a session needs all three.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { webcrypto } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROUTES, handlersFor, serveApi, type Route } from '@braindog/host';
import { sessionContext } from '@braindog/host/auth';
import type { CallContext } from '@braindog/record';

import { openKeyStore, wrap, type KeyStore } from '../src/keys.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG';
const MEMBER = 'p_wren';
/** A list no record here declares, asked about beside the hidden one. */
const MISSING = 'atlantis';

/**
 * Routes this sweep leaves out, each with the reason, as `name: 'why'`.
 *
 * NONE AT LANDING, AND AN EXEMPTION IS NEVER THE REPAIR. A route that leaks is repaired at its door; a line here is
 * for a route that cannot be asked at all by this harness, and its reason says why.
 */
const EXEMPT: Readonly<Record<string, string>> = {};

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true, search: true }],
  } as never,
};

/** The Keys list the app's key door deposits into, as `keys-doors.test.ts` declares it, less the project. */
const KEYS = {
  id: 'register.credentials',
  kind: 'register' as const,
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true, max: 120 },
      { id: 'opens', type: 'text', required: true, max: 280 },
      { id: 'kind', type: 'enum', values: ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'], required: true },
      { id: 'value', type: 'secret' },
    ],
  } as never,
};

/**
 * Every way these bytes could be written into an answer: hex, both base64 alphabets, the numbers a JSON array or a
 * `Buffer` serialises to, and the numbered keys a `Uint8Array` serialises to.
 *
 * THE NUMBERED KEYS ARE TAKEN WHOLE. A signing key's exported bytes open with a header every Ed25519 key shares, so a
 * form cut short to its first keys named no key in particular.
 */
function written(bytes: Uint8Array): string[] {
  const b = Buffer.from(bytes);
  return [
    b.toString('hex'),
    b.toString('base64').replace(/=+$/u, ''),
    b.toString('base64url'),
    Array.from(bytes).join(','),
    Array.from(bytes, (v, i) => `"${i}":${v}`).join(','),
  ];
}

/** A canary: what a finding calls it, never its value, and every form it could be written in. */
type Canary = { name: string; forms: readonly string[] };

function isPair(k: webcrypto.CryptoKeyPair | webcrypto.CryptoKey): k is webcrypto.CryptoKeyPair {
  return 'privateKey' in k && 'publicKey' in k;
}

/**
 * The record's keychain keys, one for each `Purpose`, made here rather than by `recordKeys`, which zero-fills its bytes:
 * a canary nobody knows the bytes of cannot be looked for. Wrapped with `wrap`, which is what `recordKeys` calls.
 */
async function keychainKeys(store: KeyStore) {
  const generated: webcrypto.CryptoKeyPair | webcrypto.CryptoKey = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  if (!isPair(generated)) throw new Error('Ed25519 produced a single key where a keypair was asked for.');
  const signing = new Uint8Array(await crypto.subtle.exportKey('pkcs8', generated.privateKey));
  const record = new Uint8Array(randomBytes(32));
  const connector = new Uint8Array(randomBytes(32));
  return {
    held: [record, connector, signing],
    keys: {
      record: await wrap(store, REC, 'record', record),
      connector: await wrap(store, REC, 'connector', connector),
      signing: await wrap(store, REC, 'signing', signing),
    },
  };
}

/** The request one route is sent as: a write is a POST with a JSON body, a read a GET with its arguments in the query. */
function sent(base: string, route: Route, args: Record<string, unknown>, bearer?: string): [string, RequestInit] {
  const url = new URL(`${base}/api/${route.name}`);
  if (!route.writes)
    for (const [key, value] of Object.entries(args)) url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  const headers: Record<string, string> = {
    ...(route.writes ? { 'content-type': 'application/json' } : {}),
    ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
  };
  return [url.toString(), { method: route.writes ? 'POST' : 'GET', headers, ...(route.writes ? { body: JSON.stringify(args) } : {}) }];
}

type Answer = { status: number; raw: string };

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-canary-'));
  const serverKey = randomBytes(32).toString('base64url');
  const now = Date.UTC(2026, 8, 25, 12);
  const store = await openKeyStore(join(dir, 'kek.key'));
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    keys: store,
    now: () => now,
    pollMs: 0,
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const owner = person.value.id;
  const ownerCtx: CallContext = { principal: { kind: 'person', id: owner, level: 'owner' } };
  const keychain = await keychainKeys(store);
  const made = await running.api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: owner, email: 'ada@example.com', name: 'Ada' },
    keys: keychain.keys,
  });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  const installed = await running.api.kernel.install([OBLIGATIONS, TASKS, KEYS]);
  assert.ok(installed.ok, JSON.stringify(installed));

  /* THE ROW IS THE FIRST IN ITS LIST, so the generic `seq: 1` every route is sent names it. Its first word is one
     nothing else in the record says, and it is what `search` is sent, so a search that reaches it says so. */
  const mark = `quillon${randomBytes(6).toString('hex')}`;
  const row = running.api.kernel.create('obligations', { what: `${mark} renewal`, state: 'open' }, { actor: owner });
  assert.ok(row.ok, JSON.stringify(row));
  assert.ok(running.api.kernel.create('tasks', { what: 'Water the plants' }, { actor: owner }).ok);

  /* THE SECRET GOES IN AS A PERSON PUTS ONE IN: a session from the server key, then the key door with this origin. */
  const signedIn = await fetch(`${origin}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ serverKey }),
  });
  assert.equal(signedIn.status, 200, await signedIn.clone().text());
  const cookie = /^bd_s=([A-Za-z0-9_-]{43});/.exec(signedIn.headers.getSetCookie()[0] ?? '')?.[1] ?? assert.fail('no session cookie');
  const value = ['bd_fake_canary_value_', randomBytes(24).toString('hex')].join('');
  const put = await fetch(`${origin}/api/keys/put`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie: `bd_s=${cookie}` },
    body: JSON.stringify({ label: 'Canary deploy', opens: 'Deploys canary.example', kind: 'api_token', value }),
  });
  assert.equal(put.status, 200, 'the key door did not take the canary');

  /* THE MEMBER, invited to Reads on one list, and the token they hold, minted for them and so held to what they hold. */
  const invited = await running.api.invite({ person: MEMBER, name: 'Wren', registers: { tasks: 'read' } }, ownerCtx);
  assert.ok(invited.ok, JSON.stringify(invited));
  const held = running.api.kernel.access(MEMBER) ?? assert.fail('the member holds nothing on the record');
  assert.equal(held.level, null, 'the member holds the whole record');
  const scoped = await running.api.kernel.createToken(MEMBER, { scope: 'write', label: 'Canary scoped' });
  if (!scoped.ok) throw new Error(`the member's token was not minted: ${JSON.stringify(scoped)}`);
  const reader = await running.api.createToken({ scope: 'read', label: 'Canary reader' }, ownerCtx);
  assert.ok(reader.ok, JSON.stringify(reader));

  /* THE MEMBER IS ASKED THROUGH `serveApi`, WITH THE CONTEXT THIS HOST BUILDS FOR A SIGNED-IN MEMBER. A member signs in
     with a passkey (`invite.test.ts` walks it), and what the cookie then comes to is `sessionContext` over their access,
     handed to `serveApi` over `handlersFor` of this record, which is the table the socket serves. The socket's copy
     also signs `openShare`'s answer into a link (`withShareLinks`), and `openShare` is an owner's, so a member is
     answered the same without it. The bearers go over the socket itself. */
  const handlers = handlersFor(running.api);
  const member = sessionContext({ person: MEMBER, email: 'wren@example.com', record: REC, provedAt: now }, held);

  const canaries = {
    sealed: [
      { name: 'the value in a secret field', forms: [value, ...written(new TextEncoder().encode(value))] },
      { name: 'a keychain key', forms: keychain.held.flatMap((bytes) => written(bytes)) },
    ] as Canary[],
    /* THE OWNER AND THE OWNER'S READ TOKEN MAY READ THIS ONE, and nobody else asked here may. */
    row: { name: 'the title of a row in obligations', forms: [mark] } as Canary,
  };

  return {
    mark,
    canaries,
    serverKey,
    scoped: scoped.value.bearer,
    reader: (reader as { value: { bearer: string } }).value.bearer,
    async asBearer(route: Route, args: Record<string, unknown>, bearer: string): Promise<Answer> {
      const [url, init] = sent(origin, route, args, bearer);
      const res = await fetch(url, init);
      return { status: res.status, raw: await res.text() };
    },
    async asMember(route: Route, args: Record<string, unknown>): Promise<Answer> {
      const [url, init] = sent('http://localhost', route, args);
      const res = await serveApi(new Request(url, init), handlers, member);
      return { status: res.status, raw: await res.text() };
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Both list names as one, and a crash's reference as one, so two answers compare on what they say. */
const LISTS = new RegExp(`\\b(?:obligations|${MISSING})\\b`, 'giu');
const REF = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const normal = (text: string): string => text.replace(LISTS, '<list>').replace(REF, '<ref>');

/** What an answer says, as far as a refusal goes: its status, and its code, sentence, place and choices. */
function shapeOf(answer: Answer): string {
  let body: { ok?: unknown; refusal?: { code?: unknown; fix?: unknown; at?: unknown; allowed?: unknown } };
  try {
    body = JSON.parse(answer.raw) as typeof body;
  } catch {
    return normal(`${answer.status} ${answer.raw}`);
  }
  if (body.ok === true) return `${answer.status} answered`;
  const r = body.refusal ?? {};
  return normal(`${answer.status} ${JSON.stringify({ code: r.code, fix: r.fix, at: r.at, allowed: r.allowed })}`);
}

test('NO ROUTE ANSWERS A SEALED VALUE TO ANYBODY, OR A HIDDEN ROW TO A MEMBER, and a hidden list refuses as a missing one does', async () => {
  const s = await stack();
  try {
    for (const name of Object.keys(EXEMPT)) assert.ok(ROUTES.some((r) => r.name === name), `EXEMPT names ${name}, which is no route`);

    /* THE GENERIC ARGUMENTS `client.test.ts` SENDS EVERY ROUTE, with the row's first word as the search. */
    const args = { register: 'obligations', seq: 1, fields: { what: 'x' }, patch: {}, q: s.mark };
    const leaks: string[] = [];
    const tells: string[] = [];
    let ownerSaw = false;

    const look = (route: string, who: string, answer: Answer, canaries: readonly Canary[]) => {
      for (const c of canaries) if (c.forms.some((f) => answer.raw.includes(f))) leaks.push(`${route} as ${who}: ${c.name}`);
    };

    for (const route of ROUTES) {
      if (Object.hasOwn(EXEMPT, route.name)) continue;
      /* THE MEMBER AND THE MEMBER'S TOKEN FIRST, and the owner last, because an owner's write can change what a later
         call finds, and nothing the other three may do changes a row. */
      const hidden = await s.asMember(route, args);
      const missing = await s.asMember(route, { ...args, register: MISSING });
      const scoped = await s.asBearer(route, args, s.scoped);
      const reader = await s.asBearer(route, args, s.reader);
      const owner = await s.asBearer(route, args, s.serverKey);

      const everything = [...s.canaries.sealed, s.canaries.row];
      look(route.name, 'the member', hidden, everything);
      look(route.name, 'the member, about a missing list', missing, everything);
      look(route.name, "the member's token", scoped, everything);
      look(route.name, 'a READ token', reader, s.canaries.sealed);
      look(route.name, 'the owner', owner, s.canaries.sealed);
      ownerSaw ||= owner.raw.includes(s.mark);

      /* A ROUTE THAT READS NO LIST ANSWERS BOTH ALIKE, so asking every route is asking every route that takes one,
         the writes among them, whose rows in the table say nothing about what their bodies carry. */
      const a = shapeOf(hidden);
      const b = shapeOf(missing);
      if (a !== b) tells.push(`${route.name}: about obligations ${a}; about ${MISSING} ${b}`);
    }

    /* THE SWEEP REACHED THE ROW, or every "not found" above is about a row nobody could have found. */
    assert.ok(ownerSaw, 'no route answered the owner with the row, so the sweep never reached it');
    assert.deepEqual(leaks, [], 'a canary reached an answer it may not');
    assert.deepEqual(tells, [], 'a hidden list was refused differently from a missing one');
  } finally {
    await s.close();
  }
});
