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
 *
 * AND A REQUEST MAY NOW NAME ITS RECORD IN THE PATH, `/app/<slug>/api/…` (`loop/research-one-domain.md` §2.4).
 * The slug is a claim like a bearer's record id: the Directory says whether it is this person's before anything
 * is addressed, one 403 answers every name that is not, and the demo never answers under one.
 */

import { clearCookie, readSid, sameOrigin, sessionContext, sessionCookie } from '@braindog/host/auth';
import { OPERATION_METHOD } from '@braindog/kernel';
import type { AuthResult, Refusal, Who } from '@braindog/ports';
import type { CallContext } from '@braindog/record';

import { DEMO_CONTEXT, demoRecord, recordOf } from './route.ts';

/** What the record says a person holds in it. The same shape `Record$.access` answers. */
export type Held = { level: string | null; registers: string[] | null; levels: Record<string, string> };

export type Deps = {
  /** `https://<PUBLIC_HOST>`, the one origin a cookie write may come from. */
  origin: string;
  /** `DEMO_RECORD`, or nothing. */
  demo: string | undefined;
  /** The Directory's `session` flow, with the path's slug when the request named one. */
  session: (sid: string, slug?: string) => Promise<AuthResult<Who>>;
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

/** Which door, and with `slug`, for the record the path names. `null` is the bare `/api/<method>` it always was. */
export async function doorOf(request: Request, deps: Deps, slug: string | null = null): Promise<Door> {
  /* ANY `Authorization` HEADER IS THE BEARER'S DOOR, an empty one included: the self-host learnt what reading
     `''` as "nothing" costs, and the bearer path answers 401 for what it does not know. */
  if (request.headers.get('authorization') !== null) return { door: 'bearer' };

  /* THE WORKER IS HTTPS, SO THE COOKIE IS ALWAYS `__Host-bd_s`. */
  const sid = readSid(request, 'secure');
  if (sid !== undefined) {
    const clear = clearCookie('secure');
    const out = await deps.session(sid, slug ?? undefined);
    if (out.status === 429) return { door: 'refused', status: 429, retryAfter: out.retryAfter };
    if (out.status === 503) return { door: 'refused', status: 503 };
    /* A rotation reaches the cookie whatever the answer is. */
    const carried = out.session === undefined ? {} : { cookie: out.session === 'clear' ? clear : sessionCookie(out.session.sid, 'secure') };
    /* A SLUG THAT IS NOT THEIRS, IN THE DIRECTORY'S OWN WORDS, AND NO RECORD IS ASKED ANYTHING. The Directory answers
       one 403 for somebody else's name, a released one and one nobody holds, so the three cannot be told apart; and
       `idFromName` on a name nobody has creates the object, so `access` below must never run for a refused slug. */
    if (out.status === 403) return { door: 'refused', status: 403, refusal: out.refusal, ...carried };
    /* Expired, signed out, or sign-in switched off: the same 401, and the cookie goes. */
    if (out.status !== 200) return { door: 'refused', status: 401, refusal: NOT_YOU, cookie: clear };

    const record = out.body.record;
    if (record === null) return { door: 'refused', status: 403, refusal: { code: 'FORBIDDEN', fix: 'You are signed in and on no record yet.' }, ...carried };
    /* THE RECORD SAYS WHAT SOMEBODY MAY DO INSIDE IT, as on the bearer path: the Directory said which record. */
    const held = await deps.access(record, out.body.person);
    if (!held) return { door: 'refused', status: 403, refusal: { code: 'FORBIDDEN', fix: 'You are not on this record.' }, ...carried };
    /* `12 §8` CSRF: a cookie write comes from a page on this origin or not at all. */
    if (!SAFE.has(request.method) && !sameOrigin(request, deps.origin)) return { door: 'refused', status: 403, refusal: CROSS, ...carried };
    return { door: 'session', record, ctx: sessionContext(out.body, held) as CallContext, ...carried };
  }

  /* NEVER UNDER A SLUG. The sample at `/app/acme/…` would be the demo's numbers drawn as acme's, which is the thing
     this whole order exists to prevent; a stranger there is a 401, and the app sends a 401 under a slug to sign-in. */
  const pinned = slug === null ? demoRecord(request, deps.demo) : null;
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

/** The three calls the bearer path makes: the Directory's `knows`, and the record's `verify` and `access`. */
export type BearerDeps = {
  knows: (record: string) => Promise<boolean>;
  verify: (record: string, bearer: string, surface: 'api' | 'mcp') => Promise<{ id: string; person_id: string; scope: string } | null>;
  access: (record: string, person: string) => Promise<Held | null>;
  /** The record a live name means, the Directory's `resolve`. Asked only for a bearer that came under `/app/<slug>`. */
  named?: (slug: string) => Promise<string | null>;
  /**
   * The record's `operationGrant`: the method an operation bearer opens and who approved it, SPENT BY THE ASKING, or
   * `null` when the bearer is not one. Absent, and no operation bearer is taken, which is the Worker before W55-7.
   */
  operation?: (record: string, bearer: string) => Promise<{ method: string; person: string } | null>;
};

export type Bearer = { record: string; ctx: CallContext } | { status: 401 } | { status: 403; refusal: Refusal };

type TokenPrincipal = Extract<CallContext['principal'], { kind: 'token' }>;

/** The four methods an operation grant opens, by the name a path gives them: `export`, `import`, `installPack`, `createToken`. */
const OPERATIONS: ReadonlySet<string> = new Set(Object.values(OPERATION_METHOD));

/** The method `/api/<method>` names when it is one an operation grant can open, and `null` for every other path. */
export const operationAsked = (pathname: string): string | null => {
  const name = /^\/+api\/+([^/]+)\/*$/.exec(pathname)?.[1] ?? '';
  return OPERATIONS.has(name) ? name : null;
};

/**
 * An agent's bearer, for `/api` and `/mcp` alike, so a token reaches the same person at the same level
 * through either. `surface` is all that differs, and it is only the token's `last_surface`: where a listing
 * says it was last used, which is how somebody decides what to revoke.
 *
 * THE DIRECTORY IS ASKED WHETHER THE RECORD IS OURS BEFORE IT IS USED AS AN ADDRESS. `idFromName` on a name
 * nobody has creates the object, and opening one writes storage, so an unchecked id would let a forged bearer
 * mint an empty record. The id is 26 random characters, so a `true` cannot be guessed.
 *
 * THEN THE RECORD CHECKS THE SECRET AGAINST ITS OWN TABLE, and says what the person may do inside it. A level
 * read from the Directory is one `invite` and `remove` never write, so removing somebody would not stop them.
 *
 * AND A BEARER THE TOKEN TABLE DOES NOT KNOW MAY BE AN OPERATION, AT THE FOUR PATHS ONE CAN OPEN AND NOWHERE ELSE.
 * `braindog export` and `braindog import` hold a device grant of reach `export` or `import`, `<rec>.<secret>` like a
 * token, and at 07ba6dbd this answered it 401 because only `verify` was asked (`test/record-doors.test.ts`). Asking
 * `operation` spends the grant, so it is asked only where the path is one of `OPERATIONS`: a CLI that sent its bearer to
 * `/api/boot` by mistake keeps it. A grant for another method is spent and refused, in the record's own sentence, so the
 * record never sees a context it would refuse anyway. The context is `packages/record`'s `CallContext.operation`: the
 * approver, at the level they hold now, and the one method.
 */
export async function bearerOf(request: Request, surface: 'api' | 'mcp', deps: BearerDeps, slug: string | null = null): Promise<Bearer> {
  const authorization = request.headers.get('authorization');
  const record = recordOf(authorization);
  if (!record || !(await deps.knows(record))) return { status: 401 };
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
  const seen = bearer ? await deps.verify(record, bearer, surface) : null;
  if (!seen) {
    const asked = surface === 'api' && bearer && deps.operation ? operationAsked(new URL(request.url).pathname) : null;
    const grant = asked !== null && bearer && deps.operation ? await deps.operation(record, bearer) : null;
    if (!grant) return { status: 401 };
    if (grant.method !== asked)
      return { status: 403, refusal: { code: 'FORBIDDEN', fix: `This bearer was approved for one ${grant.method} and reaches nothing else. Start the device again for this.`, at: 'operation' } };
    const admitted = await heldBy(deps, record, grant.person, slug);
    if ('status' in admitted) return admitted;
    return {
      record,
      ctx: {
        principal: { kind: 'person', id: grant.person, level: admitted.held.level as PersonPrincipal['level'] },
        operation: grant.method,
        credentialed: true,
        ...scoped(admitted.held),
      },
    };
  }
  const admitted = await heldBy(deps, record, seen.person_id, slug);
  if ('status' in admitted) return admitted;
  const held = admitted.held;
  /* BOTH HALVES GO OVER, the token's scope and the person's level, and the record computes where they meet: a
     token says what its holder may do with their access and never what access they have. */
  return {
    record,
    ctx: {
      principal: { kind: 'token', id: seen.id, scope: seen.scope as TokenPrincipal['scope'], person: seen.person_id, level: held.level as TokenPrincipal['level'] },
      ...scoped(held),
    },
  };
}

type PersonPrincipal = Extract<CallContext['principal'], { kind: 'person' }>;

/** The lists a person is held to on the record, when they are held to any. */
const scoped = (held: Held): Pick<CallContext, 'registers' | 'levels'> => ({
  ...(held.registers === null ? {} : { registers: held.registers }),
  ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels as CallContext['levels'] }),
});

/**
 * The half every bearer shares once its secret is checked: the path's slug agrees with the bearer's record, and the
 * record says the person is on it.
 *
 * UNDER `/app/<slug>` THE PATH HAS TO AGREE WITH THE BEARER, OR NOTHING IS ANSWERED. The bearer names the record, and a
 * URL that says it reads another one is the failure this boundary exists to prevent, so neither is picked. AFTER THE
 * SECRET IS CHECKED, so a bearer nobody issued is the same 401 under any slug and a stranger cannot ask which record a
 * name belongs to. A name nobody holds is the same 403 as another record's.
 */
async function heldBy(deps: BearerDeps, record: string, person: string, slug: string | null): Promise<{ held: Held } | { status: 403; refusal: Refusal }> {
  if (slug !== null && (deps.named === undefined || (await deps.named(slug)) !== record))
    return { status: 403, refusal: { code: 'FORBIDDEN', fix: 'This token is for a different record than the one this address names.', at: 'slug' } };
  const held = await deps.access(record, person);
  if (!held) return { status: 403, refusal: { code: 'FORBIDDEN', fix: 'You are not on this record.' } };
  return { held };
}

/** What `GET /app` needs: the Directory's `session` and `slugOf`, and the shell the static assets hold. */
export type EntryDeps = {
  session: (sid: string) => Promise<AuthResult<Who>>;
  slugOf: (record: string) => Promise<string | null>;
  shell: () => Promise<Response>;
};

/**
 * `GET /app`: the record this browser was last on, or the shell.
 *
 * ONE DIRECTORY READ AND NO PICKER (`loop/research-one-domain.md` §2.4). A session holding a record is a 302 to
 * `/app/<slug>/`, a session on no record yet is sent to `/app/start`, and no cookie is the shell, which draws the
 * sample for a stranger exactly as `app.brain.dog` did. The last record is the session row's, which only
 * `/auth/switch` moves, and the switcher is the picker.
 *
 * A DEAD COOKIE IS THE SHELL WITH THE COOKIE CLEARED, NEVER A REDIRECT INTO A RECORD, so the next load is a stranger's
 * and the shell does not spend a round trip finding out. A lockout or a failed store is the shell with the cookie
 * kept: neither says the session is over. The redirect carries `no-store` because it is this cookie's answer.
 */
export async function appEntry(request: Request, deps: EntryDeps): Promise<Response> {
  const sid = readSid(request, 'secure');
  if (sid === undefined) return deps.shell();
  const out = await deps.session(sid);
  if (out.status === 401 || out.status === 403 || out.status === 404) return withCookie(await deps.shell(), clearCookie('secure'));
  if (out.status !== 200) return deps.shell();
  const cookie = out.session === undefined ? undefined : out.session === 'clear' ? clearCookie('secure') : sessionCookie(out.session.sid, 'secure');
  const record = out.body.record;
  const slug = record === null ? null : await deps.slugOf(record);
  if (record !== null && slug === null) return withCookie(await deps.shell(), cookie);
  const to = slug === null ? '/app/start' : `/app/${slug}/`;
  return withCookie(new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } }), cookie);
}
