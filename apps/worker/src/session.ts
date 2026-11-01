/**
 * Which door a request came in by: a link to one page, a bearer, the session cookie, or none.
 *
 * ITS OWN FILE, AND FREE OF `cloudflare:`, for the reason `route.ts` is: this decides whose record a request
 * reads, and a decision that can only run inside workerd is a decision nobody tests. The Worker supplies the
 * two calls it needs, the Directory's `session` and the record's `access`, and this file is the order.
 *
 * THE ORDER IS LINK, BEARER, COOKIE, NOTHING. A link to one page (`Authorization: Share <token>`) is a stranger holding
 * a capability, and is handed on unchecked to the one door that reads it. A bearer is an agent and answers for itself.
 * A cookie is a person, and one that names no session is a 401 that clears it. A request carrying no credential at all
 * is the same 401 with no cookie to clear, whatever it asks for and whichever path names it.
 *
 * THERE WAS A FOURTH DOOR, THE PUBLIC DEMO, AND IT IS GONE.
 * A request with nothing on it read one record the deployment pinned in its `vars`, as `p_demo` at `read`. The app
 * now shows only a real record, so no variable names one any more, and a deploy that still sets it opens nothing
 * (`test/slash-demo.test.ts`, which answered 200 from the pinned record before this).
 *
 * AND A REQUEST MAY NOW NAME ITS RECORD IN THE PATH, `/<slug>/api/…`.
 * The slug is a claim like a bearer's record id: the Directory says whether it is this person's before anything
 * is addressed, and one 403 answers every name that is not.
 */

import { boundRequest, clearCookie, heldContext, OTHER_REQUEST, readSid, sameOrigin, seeAs, SEE_AS_HEADER, sessionContext, sessionCookie, type HeldAccess } from '@braindog/host/auth';
import { shareOf } from '@braindog/host';
import { OPERATION_METHOD } from '@braindog/kernel';
import type { TokenReach } from '@braindog/kernel';
import { ACCESS_ENDED_AT, accessEndedSaid, MEMBER_STOPPED } from '@braindog/kernel';
import type { AuthResult, Refusal, Who } from '@braindog/ports';
import { TOKEN_REACHES, type CallContext } from '@braindog/record';

import { recordOf } from './route.ts';
import { op } from './oplog.ts';
import { capped, LAPSED_FIX, mayWrite, mcpWrites } from './lapse.ts';

/**
 * What the record says a person holds in it. The same shape `Record$.access` answers. `wheres` is optional because a
 * record whose kernel is older than migration 19 answers without it, and that is a record with no narrowed grant; the
 * lens's `writes`, `hides`, `nots` and `grant` are there only when shares made the answer (`heldContext`).
 */
export type Held = HeldAccess;

export type Deps = {
  /** `https://<PUBLIC_HOST>`, the one origin a cookie write may come from. */
  origin: string;
  /** The Directory's `session` flow, with the path's slug when the request named one. `lapsed` is there only when the record has lapsed. */
  session: (sid: string, slug?: string) => Promise<AuthResult<Who & { lapsed?: true }>>;
  access: (record: string, person: string) => Promise<Held | null>;
  /** Whether a person the record holds nothing for is on it and stopped, so the refusal says so. Absent, the door says its own words. */
  stopped?: (record: string, person: string) => Promise<boolean>;
  /**
   * Whether a person the record holds nothing for once held a share there, and whose record it is,
   * so the refusal says their access ended and the app wipes its copy. Absent, or `null`, the door says its own words.
   */
  ended?: (record: string, person: string) => Promise<{ owner: string | null } | null>;
  /**
   * Whether this door honours `x-braindog-as` (See as, the sharing plan's §3.3): the API door only, so no other door a
   * cookie opens (a file, an OAuth consent) is ever answered as somebody else. Absent, the header is not read.
   */
  seeAs?: true;
};

export type Door =
  /** A link to one page: the token an `Authorization: Share <token>` header carried, checked by `serveShared` and not here. */
  | { door: 'share'; token: string }
  | { door: 'bearer' }
  | { door: 'session'; record: string; ctx: CallContext; cookie?: string }
  /** `refusal` absent on a 401 is the Worker's own sentence for "nothing presented"; a 429 has `retryAfter`. */
  | { door: 'refused'; status: 401 | 403 | 429 | 503; refusal?: Refusal; retryAfter?: number; cookie?: string };

/** The one 401 body: "A `401` says only `unauthorized`." The sentence goes to the log (`notYou`). */
const NOT_YOU: Refusal = { code: 'UNAUTHORIZED', fix: 'unauthorized' };
const notYou = (): Refusal => {
  op({ op: 'unauthorized', door: 'session', why: 'That did not sign you in.' });
  return NOT_YOU;
};
const CROSS: Refusal = { code: 'FORBIDDEN', fix: 'A change here is accepted only from a page on this BrainDog.', at: 'origin' };
const SAFE = new Set(['GET', 'HEAD']);

/** Which door, and with `slug`, for the record the path names. `null` is the bare `/api/<method>` it always was. */
export async function doorOf(request: Request, deps: Deps, slug: string | null = null): Promise<Door> {
  /* A LINK TO ONE PAGE IS ITS OWN DOOR, AND IT IS ASKED BEFORE THE BEARER'S, because the line below reads any
     `Authorization` header as a bearer and a link is not one: `Share <token>` there was a 401 for a token nobody minted.
     Nothing is checked here and no cookie is read, so a link reaches nobody's session; `serveShared` checks the token
     and answers every way it does not open with one 404 (`@braindog/host`'s `share.ts`). */
  const token = shareOf(request.headers.get('authorization'));
  if (token !== null) return { door: 'share', token };

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
    if (out.status !== 200) return { door: 'refused', status: 401, refusal: notYou(), cookie: clear };

    const record = out.body.record;
    if (record === null) return { door: 'refused', status: 403, refusal: { code: 'FORBIDDEN', fix: 'You are signed in and on no record yet.' }, ...carried };
    /* THE RECORD SAYS WHAT SOMEBODY MAY DO INSIDE IT, as on the bearer path: the Directory said which record. */
    const held = await deps.access(record, out.body.person);
    if (!held) {
      const stopped = (await deps.stopped?.(record, out.body.person)) === true;
      /* A GUEST WHOSE LAST SHARE ENDED is told so, `at: 'access'`, and the answer carries `x-braindog-access: ended`. */
      const ended = stopped ? null : ((await deps.ended?.(record, out.body.person)) ?? null);
      const refusal: Refusal = stopped
        ? { code: 'FORBIDDEN', fix: MEMBER_STOPPED, at: 'principal' }
        : ended !== null
          ? { code: 'FORBIDDEN', fix: accessEndedSaid(ended.owner), at: ACCESS_ENDED_AT }
          : { code: 'FORBIDDEN', fix: 'You are not on this BrainDog.' };
      return { door: 'refused', status: 403, refusal, ...carried };
    }
    /* `12 §8` CSRF: a cookie write comes from a page on this origin or not at all. */
    if (!SAFE.has(request.method) && !sameOrigin(request, deps.origin)) return { door: 'refused', status: 403, refusal: CROSS, ...carried };
    let ctx = sessionContext(out.body, held) as CallContext;
    /* SEE AS SOMEBODY: an owner's or an Admin's cookie, never as an owner, read-only (`seeAs`). */
    if (deps.seeAs === true) {
      const as = await seeAs(request.headers.get(SEE_AS_HEADER), out.body, held, (person) => deps.access(record, person));
      if (as !== null && 'refusal' in as) return { door: 'refused', status: 403, refusal: as.refusal, ...carried };
      if (as !== null) ctx = as.ctx as CallContext;
    }
    /* A LAPSED RECORD ANSWERS A PERSON AT `read`, and a write in the lapse's own sentence (`lapse.ts`). The Directory said
       so in the same answer that named the record, so nothing more is asked; a record nobody pays for has no row there
       and never carries the flag. */
    if (out.body.lapsed !== true) return { door: 'session', record, ctx, ...carried };
    const lapse = underLapse(methodAsked(request), ctx);
    return 'refusal' in lapse ? { door: 'refused', status: 403, refusal: lapse.refusal, ...carried } : { door: 'session', record, ctx: lapse.ctx, ...carried };
  }

  /* NOTHING PRESENTED IS A 401, AT THE ROOT AND UNDER A SLUG ALIKE. The Directory is not asked: a stranger has no name to
     check, and the app sends a 401 to sign-in. */
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
  /**
   * `reach` is what the token's own row says it opens beyond its scope (`verifyToken`), absent from an older record.
   * `build` is the command's own build as its `x-braindog-cli` header says it, for the record to keep on the key
   * as its `last_build`, and absent when the caller sent none. The record drops a value that is not a build.
   */
  verify: (
    record: string,
    bearer: string,
    surface: 'api' | 'mcp',
    build?: string,
  ) => Promise<{ id: string; person_id: string; scope: string; reach?: readonly TokenReach[]; child?: { id: string; parent: string } } | null>;
  /** `token` is the id of the key the bearer is, so the record ANDs its narrowing into what the person holds. */
  access: (record: string, person: string, token?: string) => Promise<Held | null>;
  /**
   * `verify` and then `access` for the key it found, in ONE call to the record: what `verify` answers, with what the
   * person holds through that key (`held`, `null` when they are not on the record), or `null` for a bearer the record
   * does not know. Absent, the two are asked one after the other, as before.
   *
   * ONE TRIP AND NOT TWO, because each is a turn in the record's queue: on a busy record every turn waited seconds, and
   * a bearer's `/api/boot` spent two of them before the record was asked for the answer (`Server-Timing: door`).
   */
  admit?: (
    record: string,
    bearer: string,
    surface: 'api' | 'mcp',
    build?: string,
  ) => Promise<{ verified: NonNullable<Awaited<ReturnType<BearerDeps['verify']>>>; held: Held | null } | null>;
  /** The record a live name means, the Directory's `resolve`. Asked only for a bearer that came under `/<slug>`. */
  named?: (slug: string) => Promise<string | null>;
  /**
   * The record's `operationGrant`: the method an operation bearer opens and who approved it, SPENT BY THE ASKING, or
   * `null` when the bearer is not one. Absent, and no operation bearer is taken, which is the Worker before operation grants.
   */
  operation?: (record: string, bearer: string) => Promise<{ method: string; person: string; binds?: string | null } | { refused: Refusal } | null>;
  /**
   * Whether the record's billing has lapsed, the Directory's `billing({ op: 'lapsed' })`. Asked only once the secret is
   * checked, so a stranger learns nothing from it. Absent, and no bearer is capped, which is the Worker before the lapse ladder.
   */
  lapsed?: (record: string) => Promise<boolean>;
};

export type Bearer = { record: string; ctx: CallContext } | { status: 401 } | { status: 403; refusal: Refusal };

type TokenPrincipal = Extract<CallContext['principal'], { kind: 'token' }>;

/** The four methods an operation grant opens, by the name a path gives them: `export`, `import`, `installPack`, `createToken`. */
const OPERATIONS: ReadonlySet<string> = new Set(Object.values(OPERATION_METHOD));

/**
 * The method a `POST /api/<method>` names when it is one an operation grant can open, and `null` for every other request.
 *
 * THE VERB IS PART OF THE QUESTION. All four are `writes: true` in `ROUTES`, so the router answers anything but a POST
 * with 405, and before this read the method a `GET /api/export` spent the grant first and was answered 405 after it
 * was gone: the POST that followed was 401 (`test/operation-grant-doors.test.ts`).
 */
export const operationAsked = (request: Request): string | null => {
  if (request.method !== 'POST') return null;
  const name = /^\/+api\/+([^/]+)\/*$/.exec(new URL(request.url).pathname)?.[1] ?? '';
  return OPERATIONS.has(name) ? name : null;
};

/** The record method a `/api/<method>` path names, or `''` for any other path, which no route row names. */
const methodAsked = (request: Request): string => /^\/+api\/+([^/]+)\/*$/.exec(new URL(request.url).pathname)?.[1] ?? '';

const LAPSED: Refusal = { code: 'FORBIDDEN', fix: LAPSED_FIX, at: 'billing' };

/**
 * A call on a lapsed record: refused in the lapse's sentence when it writes, and otherwise the context to answer it
 * under.
 *
 * AN EXPORT THAT PASSES KEEPS ITS CONTEXT WHOLE, because `export` is an owner's method and a context held to `read` would
 * be refused it by the record: `mayWrite` has already said this caller may take it. Every other call goes on `capped`.
 */
function underLapse(method: string, ctx: CallContext): { ctx: CallContext } | { refusal: Refusal } {
  if (!mayWrite(method, ctx)) return { refusal: LAPSED };
  return { ctx: method === OPERATION_METHOD.export ? ctx : capped(ctx) };
}

/** The header the `braindog` command says its build in (`apps/cli/src/position.ts`, `sessionHeaders`). */
export const CLI_HEADER = 'x-braindog-cli';
/** The longest build passed on: a day, a plus and a forty-character hash, with room to spare. */
const CLI_BUILD_MOST = 64;

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
 * `operation` spends the grant, so it is asked only for a POST whose path is one of `OPERATIONS` under no name or the
 * record's own: a CLI that sent its bearer to `/api/boot`, sent a GET, or sent it under another name keeps it. A grant
 * for another method is spent and refused, in the record's own sentence, so the record never sees a context it would
 * refuse anyway. The context is `packages/record`'s `CallContext.operation`: the approver, at the level they hold now,
 * and the one method.
 */
export async function bearerOf(request: Request, surface: 'api' | 'mcp', deps: BearerDeps, slug: string | null = null): Promise<Bearer> {
  const authorization = request.headers.get('authorization');
  const record = recordOf(authorization);
  if (!record || !(await deps.knows(record))) return { status: 401 };
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
  /* THE COMMAND SAYS ITS BUILD ON EVERY CALL, and it goes down with the bearer so the record can say which
     machine is behind. Only a short one goes: a build is `YYYY.MM.DD+<hash>`, and the record drops anything else anyway. */
  const said = request.headers.get(CLI_HEADER)?.trim();
  const build = said !== undefined && said !== '' && said.length <= CLI_BUILD_MOST ? said : undefined;
  /* THE DIRECTORY'S TWO READS GO OUT BESIDE THE RECORD'S CHECK AND ARE READ ONLY AFTER IT, so a bearer nobody issued is
     answered as before and learns nothing from either; what changes is that their trips overlap the record's instead
     of following it. The slug is read only under one, and the lapse only for a bearer that carries a secret. */
  const named = slug !== null && deps.named !== undefined ? settled(deps.named(slug)) : null;
  const lapsing = bearer && deps.lapsed !== undefined ? settled(deps.lapsed(record)) : null;
  const admitted = !bearer ? null : deps.admit !== undefined ? await deps.admit(record, bearer, surface, build) : null;
  const seen = !bearer ? null : deps.admit !== undefined ? (admitted?.verified ?? null) : await deps.verify(record, bearer, surface, build);
  const lapsedOf = async (): Promise<boolean> => (lapsing === null ? false : unsettled(await lapsing));
  const nameOf = async (): Promise<string | null> => (named === null ? null : unsettled(await named));
  if (!seen) {
    const asked = surface === 'api' && bearer && deps.operation ? operationAsked(request) : null;
    /* THE PATH'S NAME IS ASKED BEFORE THE GRANT IS READ, BECAUSE READING IT SPENDS IT. `heldBy` below asks it too, but
       only after `operation` has marked the row used, so a POST under another record's name, or a name nobody holds,
       was refused 403 with the grant already gone. THE ANSWER IS THE UNKNOWN BEARER'S 401 AND NOT
       `heldBy`'s 403: nothing has checked the secret yet, and a 403 here would tell anybody holding a record id which
       names are that record's, which is what `heldBy` waits for the secret to prevent. The grant is kept either way. */
    if (asked !== null && slug !== null && (named === null || (await nameOf()) !== record)) return { status: 401 };
    const grant = asked !== null && bearer && deps.operation ? await deps.operation(record, bearer) : null;
    if (!grant) return { status: 401 };
    /* AN APPROVAL TIED TO NO REQUEST past the owner's date (`UNBOUND_REFUSED_FROM`): the record's own sentence, which
       names the fix, since the bearer matched and its holder has an old command to update. */
    if ('refused' in grant) return { status: 403, refusal: grant.refused };
    if (grant.method !== asked)
      return { status: 403, refusal: { code: 'FORBIDDEN', fix: `This bearer was approved for one ${grant.method} and reaches nothing else. Start the device again for this.`, at: 'operation' } };
    /* AND FOR ONE BODY, when the command named it at the start (`boundRequest`). */
    if (!(await boundRequest(request, grant.binds))) return { status: 403, refusal: OTHER_REQUEST };
    const admitted = await heldBy(deps, record, grant.person, slug, nameOf);
    if ('status' in admitted) return admitted;
    return lapseOf(lapsedOf, record, grant.method, {
      principal: { kind: 'person', id: grant.person, level: admitted.held.level as PersonPrincipal['level'] },
      operation: grant.method,
      credentialed: true,
      ...scoped(admitted.held),
    });
  }
  /* THE KEY'S OWN ID GOES WITH THE PERSON, so the record ANDs its narrowing chain into what they hold (`token_lens`): a
     child key is narrowed by its own row and its parent's, so it is the child's id, not the agent's the principal names. */
  const kept = await heldBy(deps, record, seen.person_id, slug, nameOf, seen.child?.id ?? seen.id, admitted === null ? undefined : admitted.held);
  if ('status' in kept) return kept;
  const held = kept.held;
  /* THE REACH IS THE TOKEN ROW'S, AS `verifyToken` READ IT INSIDE THE RECORD, and nothing in the request can add to it.
     The record's inbox gate admits a whole-record owner token that carries `inbox`, and
     before this no token principal carried a reach, so a token minted with it was refused like any other.
     `Record$.verify` now declares it as the kernel's `Verified` has it, and it is still matched against the record's
     own closed list rather than trusted as typed: a string would pass `includes` as a substring, which is how the gate
     once admitted "no-inbox" (d41ec831). */
  const reach = Array.isArray(seen.reach) ? TOKEN_REACHES.filter((r) => seen.reach?.includes(r)) : [];
  /* BOTH HALVES GO OVER, the token's scope and the person's level, and the record computes where they meet: a
     token says what its holder may do with their access and never what access they have. */
  const ctx: CallContext = {
    principal: {
      kind: 'token',
      id: seen.id,
      scope: seen.scope as TokenPrincipal['scope'],
      person: seen.person_id,
      level: held.level as TokenPrincipal['level'],
      ...(reach.length === 0 ? {} : { reach }),
    },
    ...scoped(held),
  };
  /* OVER `/mcp` THE METHOD IS INSIDE THE BODY, so a copy of it is read for the tool's name; the record reads the body
     itself after this, from the request as it came. A write refuses in the lapse's sentence, as on `/api`, and a call
     this cannot read goes on at `read`, where the record's own ladder refuses anything that writes. */
  if (surface === 'mcp') {
    if (!(await lapsedOf())) return { record, ctx };
    const message: unknown = await request.clone().json().catch(() => null);
    return mcpWrites(message) ? { status: 403, refusal: LAPSED } : { record, ctx: capped(ctx) };
  }
  return lapseOf(lapsedOf, record, methodAsked(request), ctx);
}

/**
 * A bearer's context as its record's billing leaves it: whole, capped at `read`, or refused in the lapse's sentence.
 *
 * AFTER THE SECRET AND THE PERSON ARE CHECKED, so a lapsed record answers a forged bearer the same 401 as a paid one.
 */
async function lapseOf(lapsed: () => Promise<boolean>, record: string, method: string, ctx: CallContext): Promise<Bearer> {
  if (!(await lapsed())) return { record, ctx };
  const lapse = underLapse(method, ctx);
  return 'refusal' in lapse ? { status: 403, refusal: lapse.refusal } : { record, ctx: lapse.ctx };
}

type PersonPrincipal = Extract<CallContext['principal'], { kind: 'person' }>;

/**
 * A call sent early and read later, held so a failure waits for the reader. A bare promise nobody awaits on the path that
 * returns early (an unknown bearer) would reject unheard; this one throws where it is read, as an awaited call did.
 */
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settled = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
const unsettled = <T>(s: Settled<T>): T => {
  if (s.ok) return s.value;
  throw s.error;
};

/**
 * The lists a person is held to on the record, when they are held to any, the rows of each they reach, and what the lens
 * adds (`writes`, `hides`, `nots`, `grant`).
 *
 * `heldContext` IS THE ONE PLACE THIS IS DONE, the session path's too, so a narrowed grant reaches every reader the same
 * way through a bearer as through a session. Left off, every reader would show a narrowed colleague the whole list.
 */
const scoped = (held: Held): Pick<CallContext, 'registers' | 'levels' | 'wheres' | 'writes' | 'hides' | 'nots' | 'grant'> =>
  heldContext(held) as Pick<CallContext, 'registers' | 'levels' | 'wheres' | 'writes' | 'hides' | 'nots' | 'grant'>;

/**
 * The half every bearer shares once its secret is checked: the path's slug agrees with the bearer's record, and the
 * record says the person is on it.
 *
 * UNDER `/<slug>` THE PATH HAS TO AGREE WITH THE BEARER, OR NOTHING IS ANSWERED. The bearer names the record, and a
 * URL that says it reads another one is the failure this boundary exists to prevent, so neither is picked. AFTER THE
 * SECRET IS CHECKED, so a bearer nobody issued is the same 401 under any slug and a stranger cannot ask which record a
 * name belongs to. A name nobody holds is the same 403 as another record's.
 */
async function heldBy(
  deps: BearerDeps,
  record: string,
  person: string,
  slug: string | null,
  nameOf: () => Promise<string | null>,
  token?: string,
  known?: Held | null,
): Promise<{ held: Held } | { status: 403; refusal: Refusal }> {
  if (slug !== null && (deps.named === undefined || (await nameOf()) !== record))
    return { status: 403, refusal: { code: 'FORBIDDEN', fix: 'This token is for a different record than the one this address names.', at: 'slug' } };
  /* `known` IS WHAT `admit` ALREADY ANSWERED IN THE SAME TRIP AS THE SECRET, so the record is not asked twice. */
  const held = known !== undefined ? known : token === undefined ? await deps.access(record, person) : await deps.access(record, person, token);
  if (!held) return { status: 403, refusal: { code: 'FORBIDDEN', fix: 'You are not on this BrainDog.' } };
  return { held };
}

/** What `GET /` needs: the Directory's `session` and `slugOf`, and the shell the static assets hold. */
export type EntryDeps = {
  session: (sid: string) => Promise<AuthResult<Who>>;
  slugOf: (record: string) => Promise<string | null>;
  shell: () => Promise<Response>;
};

/**
 * `GET /`: the record this browser was last on, or the shell.
 *
 * ONE DIRECTORY READ AND NO PICKER. A session holding a record is a 302 to
 * `/<slug>/`, a session on no record yet is sent to `/start`, and no cookie is the shell. The shell asks
 * `/api/boot`, which answers a stranger 401 now there is no demo record behind it, and the app sends a 401 to sign-in.
 * The last record is the session row's, which only `/auth/switch` moves, and the switcher is the picker.
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
  const to = slug === null ? '/start' : `/${slug}/`;
  return withCookie(new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } }), cookie);
}
