/**
 * Cloudflare Turnstile, the one bot check on every door a stranger can knock on: sign-up's `start`, asking for an
 * invitation (`/auth/apply`), a sign-in link (`/auth/magic/start`) and the first reading of a sentence
 * (`/auth/signup/read`). One verify call and one rule for when it is on, so the four doors cannot disagree.
 *
 * ON ONLY WITH BOTH HALVES. The site key is what a page draws the widget with, the secret what this Worker checks its
 * answer with. With only one of them the check is OFF, not half on: a secret with no site key refused every sign-up,
 * because no page could earn an answer, and a site key with no secret drew a widget nothing read. A half-set host is
 * one `op: 'turnstile'` line at `error` a request, naming which half is missing (never its value), so the operator sees
 * it in the logs while people can still sign up and sign in under the Directory's tighter unchecked limits.
 *
 * FAILS CLOSED WHEN IT IS ON: no answer, a malformed one, Cloudflare unreachable or a reply that is not
 * `success: true` are all a failed check, because a check that passed whenever siteverify could not be reached is one a
 * flood switches off.
 */

import { op } from './oplog.ts';

/** Where Turnstile's answer is checked (developers.cloudflare.com/turnstile/get-started/server-side-validation). */
export const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The one sentence every door refuses a failed or missing check with. */
export const NOT_A_PERSON = 'The check that you are a person did not pass. Try it again, then send the form.';

export type TurnstileEnv = { TURNSTILE_SECRET?: string | undefined; TURNSTILE_SITE_KEY?: string | undefined };

export type Send = (input: string, init: RequestInit) => Promise<Response>;

const secretOf = (env: TurnstileEnv): string => (env.TURNSTILE_SECRET ?? '').trim();
const siteKeyOf = (env: TurnstileEnv): string => (env.TURNSTILE_SITE_KEY ?? '').trim();

/** Whether the check is on: the secret and the site key are both set. */
export const turnstileOn = (env: TurnstileEnv): boolean => secretOf(env) !== '' && siteKeyOf(env) !== '';

/** Whether exactly one half is set, which is the check off and a line for the operator. */
export const turnstileHalf = (env: TurnstileEnv): boolean => (secretOf(env) !== '') !== (siteKeyOf(env) !== '');

/** The site key a page draws the widget with, or `null` while the check is off. Never served half-set. */
export const turnstileSiteKey = (env: TurnstileEnv): string | null => (turnstileOn(env) ? siteKeyOf(env) : null);

/** The secret the check is made with, or `undefined` while the check is off. For a door that takes the secret alone. */
export const turnstileSecret = (env: TurnstileEnv): string | undefined => (turnstileOn(env) ? secretOf(env) : undefined);

/** One answer checked with Cloudflare under one secret, failing closed. */
export async function turnstileVerify(secret: string, answer: unknown, ip: string, send: Send = fetch): Promise<boolean> {
  if (typeof answer !== 'string' || answer === '' || answer.length > 2048) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', answer);
  if (ip !== '') form.append('remoteip', ip);
  try {
    const res = await send(SITEVERIFY, { method: 'POST', body: form });
    const verdict = (await res.json().catch(() => null)) as { success?: unknown } | null;
    return verdict?.success === true;
  } catch {
    return false;
  }
}

/**
 * Whether the answer a request carried passes: `true` while the check is off (nothing is asked of the page then, so
 * nothing is refused), the verdict while it is on. `door` names the door in the half-set line.
 */
export async function turnstilePassed(env: TurnstileEnv, answer: unknown, ip: string, door: string, send: Send = fetch): Promise<boolean> {
  if (!turnstileOn(env)) {
    if (turnstileHalf(env)) op({ op: 'turnstile', door, on: false, missing: secretOf(env) === '' ? 'TURNSTILE_SECRET' : 'TURNSTILE_SITE_KEY' }, 'error');
    return true;
  }
  return turnstileVerify(secretOf(env), answer, ip, send);
}
