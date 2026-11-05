/**
 * The sign-up switch and the launch answer (`src/launch.ts`): every mode, open with no bot check staying
 * open, and the sentences `/healthz` carries.
 *
 * MEASURED BEFORE THIS FILE: sign-up was open wherever `PUBLIC_HOST` was set, so production made a person for anybody
 * and nothing said so. The two environments' configs are read here too, so a deploy that drops the switch is red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { SIGNUP_UNCHECKED } from '@braindog/record/directory';

import { BOT_CHECK_HALF, SIGNUP_STOPPED, STOPPING, billingMode, botCheckKeyed, launchDetail, launchState, signupMode, type LaunchEnv } from '../src/launch.ts';

/* WHAT `signUp()` NEEDS BEFORE THE SWITCH IS ASKED, all present: a 32-character session key, an address that gives a
   cookie, a sending address and the mail binding. Every test of a mode starts here, and the last tests take one away. */
const READY: LaunchEnv = { SESSION_SECRET: 'fake-session-secret-for-tests-only-0123456789', PUBLIC_HOST: 'brain.example.test', AUTH_MAIL_FROM: 'hello@brain.example.test', EMAIL: { send: async () => {} } };

test('EVERY MODE: open and invite as said, and anything else, empty and unknown included, is closed', () => {
  assert.equal(signupMode({ SIGNUP: 'open' }), 'open');
  assert.equal(signupMode({ SIGNUP: ' open ' }), 'open');
  assert.equal(signupMode({ SIGNUP: 'invite' }), 'invite');
  for (const said of [undefined, '', ' ', 'OPEN', 'yes', 'true', 'closed', 'invite-only'])
    assert.equal(signupMode(said === undefined ? {} : { SIGNUP: said }), 'closed', String(said));
});

test('OPEN WITH NO BOT CHECK STAYS OPEN, and never falls back to invite', () => {
  assert.equal(signupMode({ SIGNUP: 'open' }), 'open');
  assert.equal(signupMode({ SIGNUP: 'open', TURNSTILE_SECRET: '' }), 'open');
  assert.equal(launchState({ ...READY, SIGNUP: 'open' }).signup, 'open');
  assert.equal(launchState({ ...READY, SIGNUP: 'open', TURNSTILE_SECRET: '   ' }).botCheck, false);
  assert.equal(botCheckKeyed({ TURNSTILE_SECRET: 's', TURNSTILE_SITE_KEY: 'k' }), true);
  /* ONE HALF IS THE CHECK OFF, either half (`turnstile.ts`). */
  assert.equal(botCheckKeyed({ TURNSTILE_SECRET: 's' }), false);
  assert.equal(botCheckKeyed({ TURNSTILE_SITE_KEY: 'k' }), false);
});

test("THE OWNER'S WHY SAYS PLAINLY THAT THE BOT CHECK IS NOT KEYED and sign-ups from one address are limited until it is", () => {
  assert.equal(SIGNUP_UNCHECKED.most, 3, 'the sentence below names three');
  const open = launchDetail({ ...READY, SIGNUP: 'open', BILLING: '' });
  assert.deepEqual(open, {
    signup: 'open',
    botCheck: false,
    billing: 'off',
    why: [
      'The bot check is not keyed, so sign-ups from one address are limited to 3 an hour until it is.',
      'Billing is off, so every new record is on Free.',
    ],
  });
  /* KEYED, THE SENTENCE GOES, and the strikes are today's. */
  const keyed = launchDetail({ ...READY, SIGNUP: 'open', TURNSTILE_SECRET: 's', TURNSTILE_SITE_KEY: 'k', BILLING: 'live' });
  assert.deepEqual(keyed, { signup: 'open', botCheck: true, billing: 'live', why: [] });
  /* BILLING OFF IS NEVER AN EMPTY WHY FOR THE OWNER, which is every host today: a live charge is a separate word of his. */
  assert.ok(launchDetail({ ...READY, SIGNUP: 'open', TURNSTILE_SECRET: 's', TURNSTILE_SITE_KEY: 'k' }).why.length > 0);
  /* A SECRET WITH NO SITE KEY (OR THE OTHER WAY) IS THE CHECK OFF, said to the owner, and sign-up stays open. */
  for (const half of [{ TURNSTILE_SECRET: 's' }, { TURNSTILE_SITE_KEY: 'k' }]) {
    const halfSet = launchDetail({ ...READY, SIGNUP: 'open', ...half });
    assert.equal(halfSet.signup, 'open');
    assert.equal(halfSet.botCheck, false);
    assert.ok(halfSet.why.includes(BOT_CHECK_HALF), halfSet.why.join(' | '));
  }
});

test('CLOSED AND BY INVITATION SAY SO; the limit sentence is for a door that is not closed', () => {
  const closed = launchDetail({});
  assert.equal(closed.signup, 'closed');
  assert.ok(closed.why.includes('Sign-up is closed, so nobody new can make an account.'));
  assert.ok(!closed.why.some((w) => w.includes('bot check')), 'a closed door needs no limit sentence');
  const invite = launchDetail({ ...READY, SIGNUP: 'invite', BILLING: 'test' });
  assert.equal(invite.signup, 'invite');
  assert.ok(invite.why.includes('Sign-up is by invitation, so a new address needs a code.'));
  assert.ok(invite.why.some((w) => w.startsWith('The bot check is not keyed')));
  assert.ok(invite.why.includes('Billing is in test mode, so no card is charged.'));
});

test('BILLING IS test OR live, and anything else is off', () => {
  assert.equal(billingMode({ BILLING: 'test' }), 'test');
  assert.equal(billingMode({ BILLING: 'live' }), 'live');
  for (const said of [undefined, '', 'on', 'LIVE']) assert.equal(billingMode(said === undefined ? {} : { BILLING: said }), 'off');
});

test('PRODUCTION SAYS open, as the owner chose on 5 November, and alpha open so the walk kit signs up with no code', async () => {
  const checker = new URL('../scripts/provision-check.mjs', import.meta.url).href;
  const { wranglerConfig } = (await import(checker)) as {
    wranglerConfig: (root: string) => { env?: { [name: string]: { vars?: { [key: string]: string } } } };
  };
  const config = wranglerConfig(fileURLToPath(new URL('../../../', import.meta.url)));
  for (const name of ['alpha', 'production']) {
    const vars = config.env?.[name]?.vars ?? {};
    assert.equal(vars['SIGNUP'], 'open', `${name}'s SIGNUP in apps/worker/wrangler.jsonc`);
    assert.notEqual(billingMode(vars), 'live', `${name} takes real cards, which is a separate word of his`);
  }
});

/* `/healthz` said `open` on a host where `signUp()` refused everybody or no letter went. Each of the
   four is taken away alone, on an open switch and on an invite one, and each is `closed`, with its sentence for the owner
   and the one stopped sentence for a stranger. */
const STOPS: [keyof LaunchEnv, string][] = [
  ['SESSION_SECRET', 'The session key is missing or shorter than 32 characters, so every sign-up is refused.'],
  ['PUBLIC_HOST', 'This host has no public address set, so it cannot give a new person a session and every sign-up is refused.'],
  ['AUTH_MAIL_FROM', 'No address to send mail from is set, so nobody gets the letter that finishes a sign-up.'],
  ['EMAIL', 'Mail is not connected, so nobody gets the letter that finishes a sign-up.'],
];

for (const [key, sentence] of STOPS)
  test(`WITHOUT ${key}, SIGN-UP IS closed AND SAYS WHY, however the switch is set`, () => {
    for (const switched of ['open', 'invite']) {
      const env: LaunchEnv = { ...READY, SIGNUP: switched };
      delete env[key];
      const state = launchDetail(env);
      assert.equal(state.signup, 'closed', `${switched} without ${key}`);
      assert.deepEqual(state.why.filter((w) => !w.startsWith('Billing')), [sentence], `${switched} without ${key}`);
      assert.deepEqual(launchState(env), { ...state, why: [SIGNUP_STOPPED] }, `${switched} without ${key}, as a stranger reads it`);
    }
  });

test('A SESSION KEY OF 31 CHARACTERS IS NO KEY, as `signUp()` counts it, and an empty address and empty sending address are none', () => {
  assert.equal(launchState({ ...READY, SIGNUP: 'open', SESSION_SECRET: 's'.repeat(31) }).signup, 'closed');
  assert.equal(launchState({ ...READY, SIGNUP: 'open', SESSION_SECRET: 's'.repeat(32) }).signup, 'open');
  assert.equal(launchState({ ...READY, SIGNUP: 'open', PUBLIC_HOST: '' }).signup, 'closed');
  assert.equal(launchState({ ...READY, SIGNUP: 'open', AUTH_MAIL_FROM: '' }).signup, 'closed');
});

test('ALL FOUR MISSING IS FOUR SENTENCES, and a closed switch needs none of them', () => {
  const bare = launchDetail({ SIGNUP: 'open' });
  assert.equal(bare.signup, 'closed');
  assert.deepEqual(
    bare.why.filter((w) => !w.startsWith('Billing')),
    STOPS.map(([, sentence]) => sentence),
  );
  assert.deepEqual(launchDetail({}).why, ['Sign-up is closed, so nobody new can make an account.', 'Billing is off, so every new record is on Free.']);
});

test('THE EXPORTED STOPPING IS WHAT stops SAYS: the four above, and nothing about the bot check', () => {
  assert.deepEqual(Object.values(STOPPING), STOPS.map(([, sentence]) => sentence));
});

/* `/healthz` answers anybody, and it carried which setting was missing and the exact strike
   limit. A stranger reads whether he can sign up, and when he cannot, or only with a code, one sentence why. */
test('WHAT /healthz TELLS A STRANGER: open says nothing more, and anything else is one sentence', () => {
  const unkeyed = launchState({ ...READY, SIGNUP: 'open' });
  assert.deepEqual(unkeyed, { signup: 'open', botCheck: false, billing: 'off', why: [] });
  assert.deepEqual(launchState({}).why, ['Sign-up is closed, so nobody new can make an account.']);
  assert.deepEqual(launchState({ ...READY, SIGNUP: 'invite', BILLING: 'test' }).why, ['Sign-up is by invitation, so a new address needs a code.']);
  assert.deepEqual(launchState({ SIGNUP: 'open' }).why, [SIGNUP_STOPPED]);
  assert.deepEqual(launchState({ ...READY, SIGNUP: 'open', TURNSTILE_SECRET: 's' }).why, []);
  const envs: LaunchEnv[] = [{}, { SIGNUP: 'open' }, { ...READY, SIGNUP: 'open' }, { ...READY, SIGNUP: 'invite' }, { ...READY, SIGNUP: 'open', TURNSTILE_SECRET: 's' }];
  for (const env of envs) {
    const said = launchState(env).why.join(' ');
    assert.doesNotMatch(said, /\d|session key|public address|send mail|site key|bot check|Billing/u, said);
    for (const w of Object.values(STOPPING)) assert.ok(!said.includes(w), said);
    assert.doesNotMatch(said, /\u2014/u);
  }
});
