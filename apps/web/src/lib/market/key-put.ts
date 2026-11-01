/**
 * A KEY AN INSTALL SENDS, PUT IN FROM THE PLAN SHEET (audit 31 Oct f, AF3), with a stale sign-in proved again in place
 * (RF3).
 *
 * The record's keychain gate sends back `NEEDS_BROWSER_SESSION` at `proof`, "Sign in again to open the keychain.",
 * once the session's proof is older than the owner's `lock_after`: fifteen minutes until he sets one, which is the usual
 * case for somebody browsing the Store. The Keychain page proves it again with `reprove` (a passkey in place, or the
 * sign-in page and back), and the sheet only printed the sentence, so signing in left the page, the typed key and the
 * plan. Here the same re-proof runs: where a passkey proves it, the same key is sent once more and the person sees it go
 * in; anywhere else the answer carries the sign-in page that comes back here, for the sheet to offer as a button.
 */

import { signinFor } from '../at.ts';
import { reprove, wantsPassphrase, type Auth } from '../record/keychain.ts';
import { canAsk } from '../reauth/ask.ts';

/** What one put answers, as the client hands it back, or `null` when the request itself failed. */
type Put = { ok: true } | { ok: false; refusal: { code: string; fix: string; at?: string } } | { ok: false } | null;

/** What the sheet is told: in, or the sentence to show, with `pass` when a password is wanted and `signin` when a sign-in is. */
export type KeyPut = { ok: true } | { ok: false; fix: string; pass?: boolean; signin?: string };

/**
 * Whether a put was turned away because the sign-in is too old for the keychain (`at: 'proof'`), and not for any other
 * reason. INSIDE THE APP'S FRAME THE CLIENT HAS ALREADY ASKED ("Confirm it's you", `lib/reauth`) and sent the key again
 * had it passed, so what comes back is the plain line for a Cancel and nothing is asked twice.
 */
const stale = (out: Put): out is { ok: false; refusal: { code: string; fix: string; at?: string } } =>
  !canAsk() && out !== null && !out.ok && 'refusal' in out && out.refusal.code === 'NEEDS_BROWSER_SESSION' && out.refusal.at === 'proof';

/**
 * Sends the key, and on a stale sign-in proves it again and sends it once more. `raced` is the sentence for a request
 * that answered nothing. The value goes only into `send`, which the caller closes over, so nothing here keeps it.
 */
export async function keyPut(send: () => Promise<Put>, auth: Auth, raced: string): Promise<KeyPut> {
  let out = await send();
  if (stale(out)) {
    let signin: string | undefined;
    const proved = await reprove(auth, (href) => (signin = href)).catch(() => false);
    /* A PASSKEY THAT WAS NOT GIVEN (the prompt shut) still leaves the sign-in page to offer. */
    signin ??= proved || globalThis.location === undefined ? undefined : signinFor(globalThis.location);
    if (!proved) return { ok: false, fix: out.refusal.fix, ...(signin === undefined ? {} : { signin }) };
    out = await send();
  }
  if (out?.ok) return { ok: true };
  if (out && 'refusal' in out) return { ok: false, fix: out.refusal.fix, ...(wantsPassphrase(out as never) ? { pass: true } : {}) };
  return { ok: false, fix: raced };
}
