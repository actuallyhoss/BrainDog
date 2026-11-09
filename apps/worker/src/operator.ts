/**
 * Who the operator is when they sign in like anyone else: the Admin page in the app (`/admin`), and no second sign-in.
 *
 * THE OPERATOR IS AN ADDRESS, NAMED IN `OPERATOR_EMAILS` (a var, comma separated, since an address is not a secret). A
 * request with no `Authorization` header whose session cookie belongs to one of those addresses opens the operator's
 * doors (`/account/ops/*` and the Kennel's review) as the operator key does. A request that carries a bearer is read
 * as a bearer and nothing else, so scripts holding `PROVISION_KEY` work as they always did.
 *
 * A WRITE MUST COME FROM THE APP ITSELF (`sameOrigin`), as every cookie write on this host must, so another site cannot
 * ride the cookie into an invitation. A rotation the Directory made while reading the session rides back on the
 * answer (`cookie`), as it does on every other door, or the browser would keep a session the Directory has moved on.
 *
 * AND A SIGN-IN IN THE LAST FIFTEEN MINUTES (security pass, 8 Nov, L3), the one an app's Allow asks (`provedRecently`).
 * The operator's address is somebody's everyday sign-in, live for months on every device it was used on, and these doors
 * read every account's address and decide who gets in. An older session is `stale`: no door opens to it, `/me` still
 * answers it so Admin stays drawn, and the rest answer `OPERATOR_STALE`, which the app asks a fresh sign-in for in place.
 *
 * Unset or empty, and nobody is the operator by session: a self-host has no such var, and so no Admin page.
 * Pure, with no `cloudflare:` import.
 */
import { clearCookie, cookieMode, readSid, sameOrigin, sessionCookie } from '@braindog/host/auth';
import { provedRecently } from '@braindog/host/oauth';
import type { AuthResult, Refusal, Who } from '@braindog/ports';

/** The addresses `OPERATOR_EMAILS` names, lowercased, blanks dropped. */
export function operatorEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

export type OperatorDeps = {
  /** `operatorEmails(env.OPERATOR_EMAILS)`. */
  emails: readonly string[];
  /** `https://<PUBLIC_HOST>`: the cookie's origin and the one a write may come from. */
  origin: string;
  /** Whether sign-in is keyed on this host (`SESSION_SECRET` long enough); without it no session is read. */
  signIn: boolean;
  /** The Directory's `session` flow. */
  session: (sid: string) => Promise<AuthResult<Who>>;
  /** The clock the fifteen minutes are read against. Absent, it is the platform's own. */
  now?: (() => number) | undefined;
};

/**
 * Whether this request is the operator's own session, signed in within the last fifteen minutes, and the cookie a
 * rotation set, to send back on the answer. `stale` is their session signed in longer ago than that.
 */
export type OperatorSeen = { operator: boolean; stale?: true; cookie?: string };

/**
 * What every door past `/me` answers the operator's `stale` session: the refusal the app asks a fresh sign-in for in
 * place and then sends again (`NEEDS_BROWSER_SESSION` at `proof`), as closing an account does.
 */
export const OPERATOR_STALE: Refusal = {
  code: 'NEEDS_BROWSER_SESSION',
  fix: 'Sign in again to use the Admin page. It has been more than fifteen minutes since you last did.',
  at: 'proof',
};

const SAFE = new Set(['GET', 'HEAD']);

export async function operatorOf(request: Request, deps: OperatorDeps): Promise<OperatorSeen> {
  if (deps.emails.length === 0 || !deps.signIn) return { operator: false };
  if ((request.headers.get('authorization') ?? '').trim() !== '') return { operator: false };
  if (!SAFE.has(request.method) && !sameOrigin(request, deps.origin)) return { operator: false };
  const mode = cookieMode(deps.origin);
  const sid = mode === null ? undefined : readSid(request, mode);
  if (mode === null || sid === undefined || sid === '') return { operator: false };
  let out: AuthResult<Who>;
  try {
    out = await deps.session(sid);
  } catch {
    return { operator: false };
  }
  const cookie = out.session === undefined ? undefined : out.session === 'clear' ? clearCookie(mode) : sessionCookie(out.session.sid, mode);
  const email = out.status === 200 ? String(out.body.email ?? '').trim().toLowerCase() : '';
  const named = email !== '' && deps.emails.includes(email);
  /* WITHOUT THE NEW ACCOUNT'S HOUR the consent page also allows: the operator's address is never a new account. */
  const operator = named && out.status === 200 && provedRecently((deps.now ?? Date.now)(), Number(out.body.provedAt) || 0);
  const seen: OperatorSeen = named && !operator ? { operator, stale: true } : { operator };
  return cookie === undefined ? seen : { ...seen, cookie };
}

/** Whether an `Authorization` header was sent at all: a bearer is read as a bearer, and only then can it be wrong. */
export const bearerSent = (request: Request): boolean => /^Bearer\s+\S/i.test(request.headers.get('authorization') ?? '');
