/**
 * The sign-up switch and the launch answer (`src/launch.ts`, DIRECTION §42): every mode, open with no bot check staying
 * open, and the sentences `/healthz` carries.
 *
 * MEASURED BEFORE THIS FILE: sign-up was open wherever `PUBLIC_HOST` was set, so production made a person for anybody
 * and nothing said so. The two environments' configs are read here too, so a deploy that drops the switch is red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { SIGNUP_UNCHECKED } from '@braindog/record/directory';

import { billingMode, botCheckKeyed, launchState, signupMode } from '../src/launch.ts';

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
  assert.equal(launchState({ SIGNUP: 'open' }).signup, 'open');
  assert.equal(launchState({ SIGNUP: 'open', TURNSTILE_SECRET: '   ' }).botCheck, false);
  assert.equal(botCheckKeyed({ TURNSTILE_SECRET: 's' }), true);
});

test('THE WHY SAYS PLAINLY THAT THE BOT CHECK IS NOT KEYED and sign-ups from one address are limited until it is', () => {
  assert.equal(SIGNUP_UNCHECKED.most, 3, 'the sentence below names three');
  const open = launchState({ SIGNUP: 'open', BILLING: '' });
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
  const keyed = launchState({ SIGNUP: 'open', TURNSTILE_SECRET: 's', TURNSTILE_SITE_KEY: 'k', BILLING: 'live' });
  assert.deepEqual(keyed, { signup: 'open', botCheck: true, billing: 'live', why: [] });
  /* A SECRET WITH NO SITE KEY IS A PAGE THAT CANNOT PASS: said, because every sign-up is then refused. */
  assert.match(launchState({ SIGNUP: 'open', TURNSTILE_SECRET: 's' }).why.join(' '), /no site key/);
});

test('CLOSED AND BY INVITATION SAY SO; the limit sentence is for a door that is not closed', () => {
  const closed = launchState({});
  assert.equal(closed.signup, 'closed');
  assert.ok(closed.why.includes('Sign-up is closed, so nobody new can make an account.'));
  assert.ok(!closed.why.some((w) => w.includes('bot check')), 'a closed door needs no limit sentence');
  const invite = launchState({ SIGNUP: 'invite', BILLING: 'test' });
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

test('BOTH ENVIRONMENTS SAY open: production on his word, and alpha so the walk kit signs up with no code', async () => {
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
