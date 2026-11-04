/**
 * The Worker's key doors: which paths they are, the order they check in, and that a keychain grant is the only bearer
 * that gets as far as the gap.
 *
 * WITHOUT `KEK` BOUND, a valid grant ends at `NOT_IN_THIS_BUILD`. What is held here is that nothing short of a valid
 * grant reaches that sentence, and that the record is only addressed once the Directory knows it, because naming a
 * Durable Object that does not exist creates it. The doors with the key store bound are `keychain-keys.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Result } from '@braindog/ports';
import type { KeychainGrantSeen } from '@braindog/host';

import { serveWorkerKeychain, servesKeychain, type GrantDeps } from '../src/keychain.ts';

const ORIGIN = 'https://app.brain.dog';
const REC = 'rec_01J8ZC0000000000000000000B';
const OTHER = 'rec_01J8ZC0000000000000000000C';
const GRANT = `${REC}.fake-keychain-grant-for-tests`;
const LOGIN = `${REC}.fake-login-token-for-tests`;
const SEEN: KeychainGrantSeen = { handle: 'feedfacefeedface', scope: '*', person: 'p_1', expires: '2099-01-01T00:00:00.000Z' };
const FORBIDDEN: Result<KeychainGrantSeen> = { ok: false, refusal: { code: 'FORBIDDEN', fix: 'That keychain grant is not known here.', at: 'vault' } };

function deps() {
  const asked: string[] = [];
  const d: GrantDeps = {
    knows: async (record) => (asked.push(`knows ${record}`), record === REC),
    keychainGrant: async (record, bearer) => (asked.push(`grant ${record}`), bearer === GRANT ? { ok: true, value: SEEN } : FORBIDDEN),
  };
  return { d, asked };
}

const post = (path: string, headers: Record<string, string> = {}, method = 'POST') =>
  new Request(`${ORIGIN}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: '{}' } : {}) });

const code = async (res: Response) => ((await res.json()) as { refusal?: { code: string; at?: string } }).refusal;

test('THE TWO DOORS ARE TWO PATHS, each under the old name and the new, and nothing near them is one', () => {
  assert.equal(servesKeychain('/api/vault/deposit'), 'deposit');
  assert.equal(servesKeychain('/api/keychain/deposit'), 'deposit');
  assert.equal(servesKeychain('/api/keychain/open/'), 'open');
  assert.equal(servesKeychain('/api/vault/open/'), 'open');
  for (const path of ['/api/vault', '/api/vault/read', '/api/keychainGrant', '/api/vault/open/x', '/keychain/open']) assert.equal(servesKeychain(path), null, path);
});

test('A VALID KEYCHAIN GRANT REACHES THE GAP, and only after the Directory knows its record', async () => {
  const { d, asked } = deps();
  for (const which of ['deposit', 'open']) {
    const res = await serveWorkerKeychain(post(`/api/vault/${which}`, { authorization: `Bearer ${GRANT}` }), d);
    assert.equal(res.status, 501);
    assert.equal((await code(res))?.code, 'NOT_IN_THIS_BUILD');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(asked, [`knows ${REC}`, `grant ${REC}`, `knows ${REC}`, `grant ${REC}`]);
});

test('/api/vault/open AND /api/keychain/open ARE THE SAME DOOR: a grant reaches the gap by either, and a wrong one is refused by either', async () => {
  for (const path of ['/api/vault/open', '/api/keychain/open']) {
    const { d } = deps();
    const ok = await serveWorkerKeychain(post(path, { authorization: `Bearer ${GRANT}` }), d);
    assert.equal(ok.status, 501, path);
    assert.equal((await code(ok))?.code, 'NOT_IN_THIS_BUILD', path);
    const wrong = await serveWorkerKeychain(post(path, { authorization: `Bearer ${REC}.fake-other` }), d);
    assert.equal(wrong.status, 403, path);
  }
});

test('A LOGIN TOKEN IS REFUSED BY THE RECORD, AND A RECORD NOBODY HOLDS IS NEVER ADDRESSED', async () => {
  const login = deps();
  const token = await serveWorkerKeychain(post('/api/vault/open', { authorization: `Bearer ${LOGIN}` }), login.d);
  assert.equal(token.status, 403);
  assert.equal((await code(token))?.code, 'FORBIDDEN');

  const unknown = deps();
  const stranger = await serveWorkerKeychain(post('/api/vault/open', { authorization: `Bearer ${OTHER}.fake` }), unknown.d);
  assert.equal(stranger.status, 403);
  assert.deepEqual(unknown.asked, [`knows ${OTHER}`]);

  const shapeless = deps();
  assert.equal((await serveWorkerKeychain(post('/api/vault/open', { authorization: 'Bearer not-a-bearer' }), shapeless.d)).status, 403);
  assert.deepEqual(shapeless.asked, []);
});

test('NO BEARER IS A 401, A GET IS A 405, AND A PAGE IS REFUSED BEFORE ANY BEARER IS READ', async () => {
  const { d, asked } = deps();
  const none = await serveWorkerKeychain(post('/api/vault/deposit'), d);
  assert.equal(none.status, 401);
  assert.equal(none.headers.get('www-authenticate'), 'Bearer');

  const get = await serveWorkerKeychain(post('/api/vault/open', { authorization: `Bearer ${GRANT}` }, 'GET'), d);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');

  const page = await serveWorkerKeychain(post('/api/vault/open', { authorization: `Bearer ${GRANT}`, origin: ORIGIN }), d);
  assert.equal(page.status, 403);
  assert.equal((await code(page))?.at, 'origin');
  assert.deepEqual(asked, []);
});

test('THE ROUTE ASKS FOR THE KEY DOORS BEFORE THE API, which would otherwise take the bearer as a login', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const keychain = source.indexOf('if (servesKeychain(url.pathname))');
  const api = source.indexOf('servesApi(');
  assert.ok(keychain > 0, 'the Worker does not route the key doors');
  assert.ok(api > 0 && keychain < api, 'the key doors are routed after the API');
});

test('THE ROOT KEY IS READ ONLY FROM env.KEK: the doors and the alarm get keys only when it is bound, and provisioning opens it first', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /keys: isBound\(env\.KEK\)\s*\?/, 'the key doors get keys whether or not KEK is bound');
  const provision = source.slice(source.indexOf('async function provision('));
  const opened = provision.indexOf('keyStoreOf(env.KEK)');
  assert.ok(opened > 0 && opened < provision.indexOf('directory.prepare('), 'provisioning writes before it opens the key store');
  assert.match(provision, /\.\.\.\(store \? \{ keys: await recordKeys\(store, id\) \} : \{\}\)/, 'provisioning does not wrap keys when the store is bound');
  /* THE ALARM READS IT TWICE, for two different things, and both are named here on purpose.
     `keyOpener` opens ONE grant for a single-request action and answers `null` when KEK is unbound.
     The connector runner needs the key STORE itself, because `@braindog/connect` unwraps the
     record's connector DEK inside the run and then opens the sealed credential against it. An
     opener cannot stand in for a store, and a store handed to the single-request path would be
     more key than that path has ever needed. */
  assert.match(source, /keyOpener\(api, this\.env\.KEK(, actor)?\)/, 'the alarm reads KEK some other way than through keyOpener');
  assert.match(source, /keyStoreOf\(this\.env\.KEK\)/, 'the connector runner reads KEK some other way than through keyStoreOf');
  /* AND THE SIGNER IS THE SIXTH READER, added with the nightly copy. It takes the store as a
     callback rather than a value so that a `KEK` which is bound and malformed is one failed export
     with a sentence, and not every record on the deployment refusing to open. */
  assert.match(source, /workerSigner\(sql, \(\) => keyStoreOf\(this\.env\.KEK\)/, 'the export signer reads KEK some other way');
  /* AND THE OUTBOX IS THE EIGHTH, added with the signed webhook: `leasedOpener` asks for the store only when a
     post names a key, so a malformed `KEK` fails that one post and not the email beside it. */
  assert.match(source, /leasedOpener\([\s\S]{0,200}?\(\) => keyStoreOf\(env\.KEK\)/, 'the outbox reads KEK some other way than through leasedOpener');
  /* AND THE SHARE LINKS (`shareKey`) AND THE KEYCHAIN PASSPHRASE (`passphraseRoot`, built once for both of
     the object's `serveApi` calls) READ IT TOO, AND SO DOES CONNECT GOOGLE (`#googleKeys`, 9d732d022), to seal and open the
     refresh token under the record's connector key, and answering null where a malformed `KEK` would otherwise throw. */
  assert.match(source, /async #googleKeys\(api: RecordApi\) \{\s*const store = await keyStoreOf\(this\.env\.KEK\)\.catch\(\(\) => null\);/, 'Connect Google reads KEK some other way than through keyStoreOf');
  assert.equal(
    (source.match(/env\.KEK\b/g) ?? []).length,
    11,
    'something other than the two doors, the half they share, provisioning, the alarm, the connector runner, the export signer, the outbox signer, the share links, the keychain password and Connect Google reads KEK',
  );
});
