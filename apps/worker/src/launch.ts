/**
 * Who may make an account on this host, and what the launch looks like from outside: one switch and one answer.
 *
 * ONE SWITCH, `SIGNUP` ("open to strangers now"). `open` lets anybody sign up, `invite` lets a new
 * address in only with a code the operator minted (`/account/ops/invite`), and anything else, empty and unknown
 * included, is `closed`. Before this, sign-up was open wherever `PUBLIC_HOST` was set, so the one setting that said where
 * the app lives also said who could make an account there, and nobody had decided the second.
 *
 * OPEN STAYS OPEN WITHOUT THE BOT CHECK, and is narrower until it has one. The scope first had `open` fall back to
 * `invite` while `TURNSTILE_SECRET` was unset; the owner's choice was to open now, so instead the Directory is told on every
 * `start` whether the check ran, and the two sign-up strikes take `SIGNUP_UNCHECKED` until it does
 * (`packages/record/src/identity.ts`). `launchDetail` says so in a sentence for the owner; `/healthz` carries `launchState`,
 * which tells a stranger only whether he can sign up.
 *
 * ITS OWN FILE, FREE OF `cloudflare:`, for the reason `health.ts` is: `index.ts` cannot be loaded by `node --test`, and
 * this is read by `/healthz`, by sign-up, by the billing list and by a test.
 */

import { cookieMode } from '@braindog/host/auth';
import { SIGNUP_UNCHECKED } from '@braindog/record/directory';

import { turnstileHalf, turnstileOn } from './turnstile.ts';

export type SignupMode = 'closed' | 'invite' | 'open';

export type BillingMode = 'off' | 'test' | 'live';

/**
 * The settings this file reads. Each is optional (Rule 2); only whether a secret is set is read, never its value.
 *
 * THE LAST FOUR ARE WHAT `signUp()` NEEDS BEFORE THE SWITCH IS ASKED. Without a session key of 32
 * characters and a `PUBLIC_HOST` that gives a cookie, `signUp()` answers 404 to everybody; without a sending address and
 * the mail binding, the Directory offers no letter and a stranger gets a 200 and nothing in the inbox. `/healthz` said
 * `open` through all four. `EMAIL` is the binding, read only for whether it is there.
 */
export type LaunchEnv = {
  SIGNUP?: string | undefined;
  TURNSTILE_SECRET?: string | undefined;
  TURNSTILE_SITE_KEY?: string | undefined;
  BILLING?: string | undefined;
  SESSION_SECRET?: string | undefined;
  PUBLIC_HOST?: string | undefined;
  AUTH_MAIL_FROM?: string | undefined;
  EMAIL?: unknown;
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

/**
 * Whether the bot check runs on sign-up, invitations and sign-in links: the secret AND the site key are set
 * (`turnstile.ts`). One half alone is the check off, never every sign-up refused.
 */
export const botCheckKeyed = (env: LaunchEnv): boolean => turnstileOn(env);

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
 * What stops a switched-on sign-up from working, one sentence each, in the order `signUp()` meets them. Each test is the
 * one the door itself makes (`index.ts` `signUp`, the Directory's `magic`), so this and the door cannot disagree.
 *
 * EXPORTED, AND THE ONLY COPY. The outside watch (`tools/watch/launch.mjs`) used to find these with a regex of its own, so
 * a sixth sentence that did not match it passed; `launch.test.mjs` now holds the watch to every sentence here.
 */
export const STOPPING = {
  session: 'The session key is missing or shorter than 32 characters, so every sign-up is refused.',
  host: 'This host has no public address set, so it cannot give a new person a session and every sign-up is refused.',
  from: 'No address to send mail from is set, so nobody gets the letter that finishes a sign-up.',
  mail: 'Mail is not connected, so nobody gets the letter that finishes a sign-up.',
} as const;

/**
 * The owner's sentence for a bot check with one of its two keys: it is off, and sign-up goes on under the unchecked
 * limit. It used to stop every sign-up (a secret with no site key), which no stranger could get past.
 */
export const BOT_CHECK_HALF = 'The bot check has only one of its two keys, TURNSTILE_SITE_KEY and the TURNSTILE_SECRET secret, so it is off until both are set.';

/**
 * The one sentence a stranger reads for any of `STOPPING`. Which setting is missing, and the exact strike limit, are the
 * owner's to read (`launchDetail`), not every passer-by's: `/healthz` answers anybody.
 */
export const SIGNUP_STOPPED = 'Sign-up is switched on but cannot be finished here yet, so nobody new can make an account.';

/** The sentence for a switch that is off. */
const SWITCHED_OFF = 'Sign-up is closed, so nobody new can make an account.';

/** The sentence for a switch that says `invite`. */
const BY_INVITE = 'Sign-up is by invitation, so a new address needs a code.';

function stops(env: LaunchEnv): string[] {
  const out: string[] = [];
  if ((env.SESSION_SECRET ?? '').length < 32) out.push(STOPPING.session);
  if (cookieMode(`https://${env.PUBLIC_HOST ?? ''}`) === null) out.push(STOPPING.host);
  if (!env.AUTH_MAIL_FROM) out.push(STOPPING.from);
  if (!env.EMAIL) out.push(STOPPING.mail);
  return out;
}

/**
 * The launch as the owner reads it, with a plain sentence for each thing that is not yet as it will be: each setting
 * that stops sign-up, the exact strike limit while the bot check is not keyed, and billing's mode. NEVER EMPTY WHILE
 * BILLING IS OFF OR IN TEST, where it stays (a live charge is a separate decision), so an empty `why`
 * here is not something this host reaches today.
 *
 * `signup` IS WHAT A STRANGER MEETS, NOT ONLY WHAT `SIGNUP` SAYS. A switch that is on while anything in `STOPPING` holds
 * is `closed`, so `open` here always means a stranger can finish signing up and the outside watch can hold production
 * to it.
 */
export function launchDetail(env: LaunchEnv): LaunchState {
  const switched = signupMode(env);
  const stopped = switched === 'closed' ? [] : stops(env);
  const signup: SignupMode = stopped.length > 0 ? 'closed' : switched;
  const botCheck = botCheckKeyed(env);
  const billing = billingMode(env);
  const why: string[] = [];
  if (switched === 'closed') why.push(SWITCHED_OFF);
  why.push(...stopped);
  if (signup === 'invite') why.push(BY_INVITE);
  if (turnstileHalf(env)) why.push(BOT_CHECK_HALF);
  if (signup !== 'closed' && !botCheck)
    why.push(`The bot check is not keyed, so sign-ups from one address are limited to ${limitWords()} until it is.`);
  if (billing === 'off') why.push('Billing is off, so every new record is on Free.');
  if (billing === 'test') why.push('Billing is in test mode, so no card is charged.');
  return { signup, botCheck, billing, why };
}

/**
 * The launch as `/healthz` answers it to anybody: whether a stranger can sign up, and when he
 * cannot, or only with a code, why in one sentence. AN EMPTY `why` IS A SIGN-UP THAT IS OPEN AND WORKS; nothing else is.
 * The settings that are missing and the strike limit stay in `launchDetail`, for the owner's signs.
 */
export function launchState(env: LaunchEnv): LaunchState {
  const full = launchDetail(env);
  const one =
    signupMode(env) === 'closed' ? SWITCHED_OFF
    : full.signup === 'closed' ? SIGNUP_STOPPED
    : full.signup === 'invite' ? BY_INVITE
    : null;
  return { ...full, why: one === null ? [] : [one] };
}
