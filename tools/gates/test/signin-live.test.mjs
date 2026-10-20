/**
 * `signin-live`, driven with a stub page and a stub DevTools session: no browser, no host, no credential of anybody's.
 *
 *   node --test tools/gates/test/signin-live.test.mjs
 *
 * THE STUB IS THE SIGN-IN AS THE GATE READS IT AND NO MORE: a passkey button while nobody is in, the name of the
 * person once somebody is, Today's `data-screen` once its first read completed, and Sign out. Each test breaks one of
 * those and holds that the gate says so, so a gate that stopped looking would go red here before it went quiet on
 * brain.dog. The credentials are made up: a key that signs nothing.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { copy } from '../../../apps/web/src/lib/copy.ts';
import { packCredential } from '../../canary/lib.mjs';
import signinLive, { keepSession, liveCount, loadCredential, readCredential, signInLive } from '../signin-live.mjs';

const MADE_UP = { credentialId: 'Y3JlZA', isResidentCredential: true, rpId: 'brain.dog', privateKey: 'cHJpdmF0ZS1rZXktbWFkZS11cA', userHandle: 'dXNlcg', signCount: 4 };

/** The sign-in, Today and Sign out, as a page the gate can drive. `breaks` names the one thing this page gets wrong. */
function stubPage({ passkey = true, who = 'owner@ops.example', screen = 'ready', landAt = null, signsOut = true } = {}) {
  const state = { url: 'about:blank', signedIn: false, visited: [] };
  const onSignin = () => state.url.endsWith('/app/signin');
  const onToday = () => /\/app\/(?:[\w-]+\/)?$/.test(new URL(state.url).pathname);
  const absent = (what) => new Error(`waited ${what}, and it never came`);
  const counts = {
    [copy.withPasskey]: () => (onSignin() && !state.signedIn && passkey ? 1 : 0),
    [copy.signOut]: () => (onSignin() && state.signedIn ? 1 : 0),
  };
  const selectors = {
    '.calm-who': () => (onSignin() && state.signedIn ? 1 : 0),
    'main#main[data-screen]': () => (onToday() && screen !== null ? 1 : 0),
  };
  return {
    visited: state.visited,
    async goto(url) {
      state.visited.push(url);
      state.url = landAt && !url.endsWith('/signin') ? new URL(landAt, url).href : url;
    },
    url: () => state.url,
    getByRole(role, { name }) {
      assert.equal(role, 'button');
      const count = async () => (counts[name] ?? (() => 0))();
      return {
        count,
        async click() {
          if ((await count()) === 0) throw absent(`for ${name}`);
          if (name === copy.withPasskey) state.signedIn = true;
          if (name === copy.signOut && signsOut) state.signedIn = false;
        },
        async waitFor() {
          if ((await count()) === 0) throw absent(`for ${name}`);
        },
      };
    },
    locator(selector) {
      const count = async () => (selectors[selector] ?? (() => 0))();
      const one = {
        first: () => one,
        count,
        async waitFor() {
          if ((await count()) === 0) throw absent(`for ${selector}`);
        },
        textContent: async () => who,
        getAttribute: async () => screen,
      };
      return one;
    },
  };
}

test('the stored credential is read from the browser\'s own answer, whole, alone or in base64', () => {
  for (const text of [JSON.stringify({ credentials: [MADE_UP] }), JSON.stringify(MADE_UP), Buffer.from(JSON.stringify(MADE_UP)).toString('base64')]) {
    const read = readCredential(text);
    assert.equal(read.ok, true, read.why);
    assert.equal(read.value.credentialId, MADE_UP.credentialId);
    assert.equal(read.value.rpId, 'brain.dog');
  }
});

test('a credential that cannot be put back is refused, and the refusal never quotes it', () => {
  const cases = [
    ['', /empty/],
    ['not a credential', /neither JSON nor base64/],
    [JSON.stringify({ credentials: [MADE_UP, MADE_UP] }), /2 credentials/],
    [JSON.stringify({ ...MADE_UP, privateKey: '' }), /no privateKey/],
    [JSON.stringify({ ...MADE_UP, isResidentCredential: false }), /not a discoverable passkey/],
  ];
  for (const [text, why] of cases) {
    const read = readCredential(text);
    assert.equal(read.ok, false, `${text.slice(0, 20)} was read`);
    assert.match(read.why, why);
    assert.doesNotMatch(read.why, new RegExp(MADE_UP.privateKey));
  }
});

test('the credential as enrol.mjs packs it (base64url) is the credential this puts back', () => {
  const read = readCredential(packCredential(MADE_UP));
  assert.equal(read.ok, true, read.why);
  assert.equal(read.value.privateKey, MADE_UP.privateKey);
  assert.equal(read.value.userHandle, MADE_UP.userHandle);
});

test('the sign count is the clock\'s, rises between runs and fits the four bytes until 2106', () => {
  assert.ok(liveCount(Date.parse('2026-10-09T10:00:01Z')) > liveCount(Date.parse('2026-10-09T10:00:00Z')));
  assert.ok(liveCount(Date.parse('2106-01-01T00:00:00Z')) < 2 ** 32);
});

test('the credential goes into a fresh authenticator at the clock\'s count, and nothing else is sent', async () => {
  const sent = [];
  const cdp = {
    async send(method, params) {
      sent.push([method, params]);
      return method === 'WebAuthn.addVirtualAuthenticator' ? { authenticatorId: 'auth-1' } : {};
    },
  };
  const now = Date.parse('2026-10-09T10:00:00Z');
  const id = await loadCredential(cdp, readCredential(JSON.stringify(MADE_UP)).value, now);
  assert.equal(id, 'auth-1');
  assert.deepEqual(sent.map(([method]) => method), ['WebAuthn.enable', 'WebAuthn.addVirtualAuthenticator', 'WebAuthn.addCredential']);
  const [, added] = sent[2];
  assert.equal(added.authenticatorId, 'auth-1');
  assert.equal(added.credential.signCount, liveCount(now));
  assert.equal(added.credential.privateKey, MADE_UP.privateKey);
  assert.equal(sent[1][1].options.hasResidentKey, true);
});

test('the four steps hold on a sign-in that works: offered, in, Today settled, out', async () => {
  const page = stubPage();
  assert.deepEqual(await signInLive(page, { origin: 'https://brain.dog', slug: 'ops' }), []);
  assert.deepEqual(page.visited, ['https://brain.dog/app/signin', 'https://brain.dog/app/ops/', 'https://brain.dog/app/signin']);
});

test('each of the four, broken alone, is a finding', async () => {
  const cases = [
    [{ passkey: false }, /does not offer/],
    [{ who: '  ' }, /names nobody/],
    [{ screen: 'refused' }, /settled as refused/],
    [{ screen: null }, /sign-in stopped: waited for main#main/],
    [{ landAt: '/app/somebody-else/' }, /not on the canary ops/],
    [{ signsOut: false }, /sign-in stopped: waited for Use a passkey/],
  ];
  for (const [breaks, finding] of cases) {
    const found = await signInLive(stubPage(breaks), { origin: 'https://brain.dog', slug: 'ops' });
    assert.ok(found.length > 0, `${JSON.stringify(breaks)} passed`);
    assert.match(found.join('\n'), finding);
  }
});

test('once SMOKE_SLUG is set, a missing credential is red and not a self-host run', async () => {
  assert.equal(await signinLive('/nowhere', { SMOKE_SLUG: 'ops', CANARY_PASSKEY: '' }), 1);
});

test('a credential with no host to open is red', async () => {
  assert.equal(await signinLive('/nowhere', { CANARY_PASSKEY: JSON.stringify(MADE_UP), DEPLOY_HOST: '' }), 1);
});

test('with no credential and no build, it is self-host only and a skip, never a pass', async () => {
  const root = mkdtempSync(join(tmpdir(), 'signin-live-'));
  try {
    assert.equal(await signinLive(root, {}), 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('after a green run, a second sign-in is kept for the look, private to this user, and a failed one is a finding', async () => {
  const page = stubPage();
  await signInLive(page, { origin: 'https://brain.dog', slug: 'ops' });
  const context = { storageState: async () => ({ cookies: [{ name: 'session', domain: 'brain.dog' }], origins: [] }) };
  const wrote = [];
  const write = async (file, text, options) => wrote.push({ file, text, options });
  assert.equal(await keepSession(page, context, { origin: 'https://brain.dog', file: '/run/canary-session.json', write }), null);
  assert.equal(wrote.length, 1);
  assert.equal(wrote[0].file, '/run/canary-session.json');
  assert.equal(wrote[0].options.mode, 0o600);
  assert.equal(JSON.parse(wrote[0].text).cookies[0].name, 'session');

  const refused = await keepSession(stubPage({ passkey: false }), context, { origin: 'https://brain.dog', file: '/run/x', write });
  assert.match(refused, /second sign-in, kept for the look, did not hold/);
  assert.equal(wrote.length, 1);
});
