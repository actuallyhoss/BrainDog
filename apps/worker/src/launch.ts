/**
 * Who may make an account on this host, and what the launch looks like from outside: one switch and one answer.
 *
 * ONE SWITCH, `SIGNUP` (DIRECTION §42, "open to strangers now"). `open` lets anybody sign up, `invite` lets a new
 * address in only with a code the operator minted (`/account/ops/invite`), and anything else, empty and unknown
 * included, is `closed`. Before this, sign-up was open wherever `PUBLIC_HOST` was set, so the one setting that said where
 * the app lives also said who could make an account there, and nobody had decided the second.
 *
 * OPEN STAYS OPEN WITHOUT THE BOT CHECK, and is narrower until it has one. The scope first had `open` fall back to
 * `invite` while `TURNSTILE_SECRET` was unset; his word was to open now, so instead the Directory is told on every
 * `start` whether the check ran, and the two sign-up strikes take `SIGNUP_UNCHECKED` until it does
 * (`packages/record/src/identity.ts`). `launchState` says so in a sentence, and `/healthz` carries it.
 *
 * ITS OWN FILE, FREE OF `cloudflare:`, for the reason `health.ts` is: `index.ts` cannot be loaded by `node --test`, and
 * this is read by `/healthz`, by sign-up, by the billing list and by a test.
 */

import { SIGNUP_UNCHECKED } from '@braindog/record/directory';

export type SignupMode = 'closed' | 'invite' | 'open';

export type BillingMode = 'off' | 'test' | 'live';

/** The settings this file reads. Each is optional (Rule 2); only whether a secret is set is read, never its value. */
export type LaunchEnv = {
  SIGNUP?: string | undefined;
  TURNSTILE_SECRET?: string | undefined;
  TURNSTILE_SITE_KEY?: string | undefined;
  BILLING?: string | undefined;
};

/** What `/healthz` and the signs read about the launch: who may sign up, whether the bot check runs, billing's mode, and why. */
export type LaunchState = { signup: SignupMode; botCheck: boolean; billing: BillingMode; why: string[] };

/**
 * The sign-up mode this host runs in. NEVER `invite` BY FALLING BACK: `open` is open with or without the bot check, and
 * only a host that says `invite` asks for a code.
 */
export function signupMode(env: LaunchEnv): SignupMode {
  const said = (env.SIGNUP ?? '').trim();
  return said === 'open' || said === 'invite' ? said : 'closed';
}

/** Whether a bot check runs on `start`: the secret is what `turnstilePassed` checks every answer with. */
export const botCheckKeyed = (env: LaunchEnv): boolean => (env.TURNSTILE_SECRET ?? '').trim() !== '';

/** Billing's mode as `billingKey` reads it (`billing.ts`): `test` or `live`, and anything else is off. */
export function billingMode(env: LaunchEnv): BillingMode {
  const said = (env.BILLING ?? '').trim();
  return said === 'test' || said === 'live' ? said : 'off';
}

/** The tightened limit in words, read off the Directory's own rule so the sentence and the strike cannot disagree. */
function limitWords(): string {
  const hours = SIGNUP_UNCHECKED.window / 3_600_000;
  const per = Number.isInteger(hours) ? (hours === 1 ? 'an hour' : `every ${hours} hours`) : `every ${Math.round(SIGNUP_UNCHECKED.window / 60_000)} minutes`;
  return `${SIGNUP_UNCHECKED.most} ${per}`;
}

/** The refusal a new address without a usable code is given while sign-up is by invitation. */
export const CODE_NEEDED =
  'Sign-up here is by invitation, so open the link you were sent to sign up. If this address already has a BrainDog, a sign-in link is on its way to it.';

/** The refusal every `start` is given while sign-up is closed. */
export const SIGNUP_CLOSED = 'Sign-up is not open on this BrainDog yet.';

/**
 * The launch as one answer, with a plain sentence for each thing that is not yet as it will be. An empty `why` is a host
 * that is fully open: sign-up open, the bot check keyed, billing live.
 */
export function launchState(env: LaunchEnv): LaunchState {
  const signup = signupMode(env);
  const botCheck = botCheckKeyed(env);
  const billing = billingMode(env);
  const why: string[] = [];
  if (signup === 'closed') why.push('Sign-up is closed, so nobody new can make an account.');
  if (signup === 'invite') why.push('Sign-up is by invitation, so a new address needs a code.');
  if (signup !== 'closed' && !botCheck)
    why.push(`The bot check is not keyed, so sign-ups from one address are limited to ${limitWords()} until it is.`);
  if (botCheck && (env.TURNSTILE_SITE_KEY ?? '').trim() === '')
    why.push('The bot check has its secret and no site key, so the sign-up page cannot pass it and every sign-up is refused.');
  if (billing === 'off') why.push('Billing is off, so every new record is on Free.');
  if (billing === 'test') why.push('Billing is in test mode, so no card is charged.');
  return { signup, botCheck, billing, why };
}
