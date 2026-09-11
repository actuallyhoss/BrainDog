/**
 * Which door a request came in by: a bearer, the session cookie, the public demo, or none.
 *
 * ITS OWN FILE, AND FREE OF `cloudflare:`, for the reason `route.ts` is: this decides whose record a request
 * reads, and a decision that can only run inside workerd is a decision nobody tests. The Worker supplies the
 * two calls it needs, the Directory's `session` and the record's `access`, and this file is the order.
 *
 * THE ORDER IS BEARER, COOKIE, DEMO, NOTHING. A bearer is an agent and answers for itself. A cookie is a
 * person, and one that names no session is a 401 that clears it, NEVER THE DEMO: somebody who believes they
 * are signed in and is shown the sample instead is being shown somebody else's numbers as their own. Only a
 * request carrying no credential at all may be the demo, and only for a read.
 */

import { clearCookie, readSid, sameOrigin, sessionContext, sessionCookie } from '@braindog/host/auth';
import type { AuthResult, Refusal, Who } from '@braindog/ports';
import type { CallContext } from '@braindog/record';

import { DEMO_CONTEXT, demoRecord } from './route.ts';

/** What the record says a person holds in it. The same shape `Record$.access` answers. */
export type Held = { level: string | null; registers: string[] | null; levels: Record<string, string> };

export type Deps = {
  /** `https://<PUBLIC_HOST>`, the one origin a cookie write may come from. */
  origin: string;
  /** `DEMO_RECORD`, or nothing. */
  demo: string | undefined;
  session: (sid: string) => Promise<AuthResult<Who>>;
  access: (record: string, person: string) => Promise<Held | null>;
};

export type Door =
  | { door: 'bearer' }
  | { door: 'session'; record: string; ctx: CallContext; cookie?: string }
  | { door: 'demo'; record: string; ctx: CallContext }
  /** `refusal` absent on a 401 is the Worker's own sentence for "nothing presented"; a 429 has `retryAfter`. */
  | { door: 'refused'; status: 401 | 403 | 429 | 503; refusal?: Refusal; retryAfter?: number; cookie?: string };

const NOT_YOU: Refusal = { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' };
const CROSS: Refusal = { code: 'FORBIDDEN', fix: 'A change here is accepted only from a page on this BrainDog.', at: 'origin' };
const SAFE = new Set(['GET', 'HEAD']);

export async function doorOf(request: Request, deps: Deps): Promise<Door> {
  /* ANY `Authorization` HEADER IS THE BEARER'S DOOR, an empty one included: the self-host learnt what reading
     `''` as "nothing" costs, and the bearer path answers 401 for what it does not know. */
  if (request.headers.get('authorization') !== null) return { door: 'bearer' };

  /* THE WORKER IS HTTPS, SO THE COOKIE IS ALWAYS `__Host-bd_s`. */
  const sid = readSid(request, 'secure');
  if (sid !== undefined) {
    const clear = clearCookie('secure');
    const out = await deps.session(sid);
    if (out.status === 429) return { door: 'refused', status: 429, retryAfter: out.retryAfter };
    if (out.status === 503) return { door: 'refused', status: 503 };
    /* Expired, signed out, or sign-in switched off: the same 401, and the cookie goes. */
    if (out.status !== 200) return { door: 'refused', status: 401, refusal: NOT_YOU, cookie: clear };

    /* A rotation reaches the cookie whatever the answer is. */
    const carried = out.session === undefined ? {} : { cookie: out.session === 'clear' ? clear : sessionCookie(out.session.sid, 'secure') };
    const record = out.body.record;
    if (record === null) return { door: 'refused', status: 403, refusal: { code: 'FORBIDDEN', fix: 'You are signed in and on no record yet.' }, ...carried };
    /* THE RECORD SAYS WHAT SOMEBODY MAY DO INSIDE IT, as on the bearer path: the Directory said which record. */
    const held = await deps.access(record, out.body.person);
    if (!held) return { door: 'refused', status: 403, refusal: { code: 'FORBIDDEN', fix: 'You are not on this record.' }, ...carried };
    /* `12 §8` CSRF: a cookie write comes from a page on this origin or not at all. */
    if (!SAFE.has(request.method) && !sameOrigin(request, deps.origin)) return { door: 'refused', status: 403, refusal: CROSS, ...carried };
    return { door: 'session', record, ctx: sessionContext(out.body, held) as CallContext, ...carried };
  }

  const pinned = demoRecord(request, deps.demo);
  if (pinned) return { door: 'demo', record: pinned, ctx: DEMO_CONTEXT };
  return { door: 'refused', status: 401 };
}

/**
 * The record's answer with the cookie a rotation minted on it, and nothing else changed.
 *
 * HERE AND NOT IN `index.ts`, where every `new Response` must say `no-store` in its own call and a test reads
 * the text to hold it to that. This one copies the record's headers, `no-store` included.
 */
export function withCookie(response: Response, cookie: string | undefined): Response {
  if (cookie === undefined) return response;
  const next = new Response(response.body, response);
  next.headers.append('set-cookie', cookie);
  return next;
}
