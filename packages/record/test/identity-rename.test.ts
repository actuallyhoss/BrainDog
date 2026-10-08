/**
 * A passkey's name, and the passkey domain a Directory refuses (LCH-A04, RQ-LCH-200 and RQ-LCH-203).
 *
 * `passkey.rename` RENAMES THE PERSON'S OWN KEY AND NOBODY ELSE'S: one line, 64 characters at most, never empty, and
 * a refusal that says what to do and carries no id. `rp.id` ON A SHARED SUFFIX STOPS THE DIRECTORY AT ITS START with
 * the sentence the self-host prints. Real registrations through the fixture authenticator, as `identity.test.ts` does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { createDirectory, type Directory } from '../src/directory.ts';
import { PASSKEY_NAME_MOST, passkeyName, sharedSuffix, type PasskeyRename } from '../src/identity.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { asJSON, register, testKeys, type TestKey } from './fixtures/webauthn/authenticator.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const MINUTE = 60_000;
const ORIGIN = 'https://studio.example';
const RP_ID = 'studio.example';
const KEYS = testKeys()!;

let seq = 0;
const nextIp = () => `203.0.113.${(++seq % 250) + 1}`;

function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, { mac: new Uint8Array(32).fill(9), rp: { id: RP_ID, origin: ORIGIN }, magic: true });
  d.person$('ada@example.com', 'Ada');
  d.person$('bo@example.com', 'Bo');
  return { sql, clock, d };
}

function ok<B>(r: AuthResult<B>) {
  if (r.status !== 200) assert.fail(`expected 200, got ${r.status}${'refusal' in r ? ` ${r.refusal.code}` : ''}`);
  return r;
}

/** A session for `email`, by a sign-in link minted and spent on the spot. */
async function signIn(d: Directory, email: string): Promise<string> {
  const mail = ok(await d.auth({ flow: 'magic.start', email, ip: nextIp() })).mail;
  if (!mail || !('linkToken' in mail)) return assert.fail('no sign-in link was handed over');
  const s = ok(await d.auth({ flow: 'magic.redeem', linkToken: mail.linkToken, ip: nextIp() })).session;
  if (!s || s === 'clear') return assert.fail('no session was set');
  return s.sid;
}

async function addPasskey(d: Directory, sid: string, key: TestKey, label?: string) {
  const options = ok(await d.auth({ flow: 'passkey.register.options', sid })).body;
  const made = await register(key, { rpId: RP_ID, origin: ORIGIN, challenge: options.challenge });
  return ok(await d.auth({ flow: 'passkey.register', sid, credential: asJSON.registration(made), ...(label === undefined ? {} : { label }) })).body;
}

const rename = (d: Directory, sid: string, id: string, label: string) => d.auth({ flow: 'passkey.rename', sid, id, label } satisfies PasskeyRename);

const labels = async (d: Directory, sid: string) => ok(await d.auth({ flow: 'passkeys', sid })).body.map((k) => k.label);

test('A PERSON RENAMES THEIR OWN PASSKEY, one line, and the new name is what the list shows', async () => {
  const { clock, d } = setup();
  const ada = await signIn(d, 'ada@example.com');
  const key = await addPasskey(d, ada, KEYS.es256, 'iCloud Keychain');
  assert.deepEqual(await labels(d, ada), ['iCloud Keychain']);

  /* AN HOUR ON, PAST THE FIFTEEN MINUTES ADDING ONE ASKS FOR: a name opens nothing, so no fresh proof is asked. */
  clock.advance(60 * MINUTE);
  const out = ok(await rename(d, ada, key.id, "  Ada's\n\tiPhone  "));
  assert.equal(out.body.label, "Ada's iPhone");
  assert.equal(out.body.id, key.id);
  assert.equal(out.mail, undefined, 'a rename sends no letter');
  assert.deepEqual(await labels(d, ada), ["Ada's iPhone"]);

  /* CUT TO A LINE: 64 characters, whole ones, so an emoji at the edge is never halved. */
  const long = ok(await rename(d, ada, key.id, `${'a'.repeat(63)}🔑🔑🔑`)).body.label!;
  assert.equal(Array.from(long).length, PASSKEY_NAME_MOST);
  assert.ok(long.endsWith('🔑'));
  /* A FLAG IS TWO CODE POINTS AND ONE CHARACTER: at the edge it goes whole, never as half a flag. */
  assert.equal(passkeyName(`${'a'.repeat(63)}🇬🇧`), 'a'.repeat(63));
  assert.equal(passkeyName(`${'a'.repeat(62)}🇬🇧`), `${'a'.repeat(62)}🇬🇧`);
});

test('AN EMPTY NAME IS REFUSED WITH THE FIX, and the name stands as it was', async () => {
  const { d } = setup();
  const ada = await signIn(d, 'ada@example.com');
  const key = await addPasskey(d, ada, KEYS.es256, 'MacBook');
  for (const empty of ['', '   ', '\n\t ']) {
    const out = await rename(d, ada, key.id, empty);
    assert.equal(out.status, 422);
    const refusal = 'refusal' in out ? out.refusal : null;
    assert.deepEqual(refusal, { code: 'VALUE_MALFORMED', fix: 'A passkey needs a name. Type one, such as the device it lives on.', at: 'label' });
  }
  assert.deepEqual(await labels(d, ada), ['MacBook']);
});

test("A STRANGER CANNOT RENAME ANOTHER PERSON'S PASSKEY, and is told what an unknown key is told", async () => {
  const { d } = setup();
  const ada = await signIn(d, 'ada@example.com');
  const bo = await signIn(d, 'bo@example.com');
  const adas = await addPasskey(d, ada, KEYS.es256, 'MacBook');

  const crossed = await rename(d, bo, adas.id, 'Mine now');
  const unknown = await rename(d, bo, 'AAAAAAAAAAAAAAAAAAAAAA', 'Mine now');
  assert.equal(crossed.status, 422);
  assert.deepEqual('refusal' in crossed ? crossed.refusal : null, 'refusal' in unknown ? unknown.refusal : 'no refusal');
  const fix = 'refusal' in crossed ? crossed.refusal.fix : '';
  assert.ok(!fix.includes(adas.id), 'the refusal carries the key id');
  assert.deepEqual(await labels(d, ada), ['MacBook']);

  /* NO SESSION, NO RENAME: the one failure, and the cookie cleared. */
  const nobody = await rename(d, 'x'.repeat(43), adas.id, 'Mine now');
  assert.equal(nobody.status, 401);
  assert.equal(nobody.session, 'clear');
  assert.deepEqual(await labels(d, ada), ['MacBook']);
});

test('REGISTRATION KEEPS A NAME BY THE SAME RULE', async () => {
  const { d } = setup();
  const ada = await signIn(d, 'ada@example.com');
  assert.equal((await addPasskey(d, ada, KEYS.es256, ' Windows\r\nHello ')).label, 'Windows Hello');
  assert.equal(passkeyName('   '), null);
  assert.equal(passkeyName(42), null);
});

test('rp.id ON A SHARED PUBLIC SUFFIX IS REFUSED BY NAME, and a name somebody owns is not', () => {
  const start = (id: string) => () => createDirectory(openSqlite(), fixedClock(NOW), { mac: new Uint8Array(32).fill(9), rp: { id, origin: `https://${id}` }, magic: true });
  for (const [id, shared] of [
    ['pages.dev', 'pages.dev'],
    ['studio.pages.dev', 'pages.dev'],
    ['braindog.workers.dev', 'workers.dev'],
    ['Someone.GitHub.io', 'github.io'],
    ['co.uk', 'co.uk'],
  ]) {
    assert.throws(start(id!), (e: Error) => {
      assert.match(e.message, new RegExp(`^Passkeys cannot use ${shared!.replace('.', '\\.')}: `));
      assert.match(e.message, /Serve BrainDog at a domain you own/);
      return true;
    }, id);
  }
  for (const id of ['studio.example', 'brain.dog', 'alpha.brain.dog', 'studio.co.uk', 'localhost', 'notpages.dev']) {
    assert.equal(sharedSuffix(id), null, id);
    assert.doesNotThrow(start(id), id);
  }
});
