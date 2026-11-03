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
 * Unset or empty, and nobody is the operator by session: a self-host has no such var, and so no Admin page.
 * Pure, with no `cloudflare:` import.
 */
import { clearCookie, cookieMode, readSid, sameOrigin, sessionCookie } from '@braindog/host/auth';
import type { AuthResult, Who } from '@braindog/ports';

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
};

/** Whether this request is the operator's own session, and the cookie a rotation set, to send back on the answer. */
export type OperatorSeen = { operator: boolean; cookie?: string };

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
  const operator = email !== '' && deps.emails.includes(email);
  return cookie === undefined ? { operator } : { operator, cookie };
}

/** Whether an `Authorization` header was sent at all: a bearer is read as a bearer, and only then can it be wrong. */
export const bearerSent = (request: Request): boolean => /^Bearer\s+\S/i.test(request.headers.get('authorization') ?? '');
