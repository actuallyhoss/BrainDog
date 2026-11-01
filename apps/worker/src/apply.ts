/**
 * Asking for an invitation, and the operator's three doors that answer it (since 17 October sign-up is invite only:
 * the owner invites through admin.brain.dog, a person only learns it is invite only on pressing sign up, and anyone
 * can apply).
 *
 * `POST /auth/apply` IS A STRANGER'S, and is answered only while sign-up is by invitation: `{ name, email, use?, link?,
 * turnstile? }` keeps one application per address in the Directory (`apply.submit`) and answers `{}` whether it was new,
 * updated or already decided, so it tells nobody who has asked. It mails nobody.
 *
 * `/account/ops/applications` AND `/account/ops/invite` ARE THE OPERATOR'S, behind the provision key as every operator
 * door is: 404 with no `PROVISION_KEY`, 401 on a wrong key or none, a GET counted by address. An invitation mints one
 * code, mails its link (`invite.ready`, awaited, so the answer can say whether it went), and answers the link as well,
 * so the operator can send it by hand when the mail could not go.
 *
 * ITS OWN FILE, FREE OF `cloudflare:`, so every decision here runs in a test over fakes; `index.ts` mounts it.
 */

import { httpStatus } from '@braindog/host';
import { sameKey } from '@braindog/host/auth';
import type { ApplyAnswers, ApplyCall, InviteAnswers, InviteCall } from '@braindog/record/directory';
import type { Refusal, Result } from '@braindog/ports';

import { NOSNIFF } from './admin.ts';
import { SIGNUP_CLOSED, type SignupMode } from './launch.ts';
import { NOT_A_PERSON } from './turnstile.ts';

/** The most of an application body this door reads, as sign-up's: a name, an address, two short texts and an answer. */
export const APPLY_BODY_MAX = 8_192;

/** The sentence an application is refused with where anybody may sign up. */
export const SIGNUP_IS_OPEN = 'Sign-up is open here, so start your record instead.';

/** The days an emailed invitation lives when the operator says none, as an application's does. */
const INVITE_MAIL_DAYS = 30;

const DAY_MS = 86_400_000;

type Extra = readonly (readonly [string, string])[];

/* AN APPLICATION'S ANSWER IS ONE BROWSER'S AND NEVER A CACHE'S, as every `/auth` answer is. */
const reply = (status: number, payload: object, extra: Extra = []): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...NOSNIFF, ...extra.map(([k, v]): [string, string] => [k, v])],
  });

const refused = (status: number, refusal: Refusal, extra: Extra = []): Response => reply(status, { ok: false, refusal }, extra);

/** A Directory answer as the `/auth` envelope: the value, a wait as `Retry-After`, or the refusal at its status. */
function answered<T>(out: Result<T>): Response {
  if (out.ok) return reply(200, { ok: true, value: out.value });
  if ('refusal' in out && out.refusal.code === 'RATE_LIMITED') {
    const wait = out.refusal.retry_after ?? 60;
    return reply(429, { ok: false, retryAfter: wait }, [['retry-after', String(wait)]]);
  }
  return 'refusal' in out ? refused(httpStatus(out), out.refusal) : refused(409, { code: 'VERSION_STALE', fix: 'Send it again.' });
}

/** What `index.ts` hands the public door. Every one is a value or a function, so a test builds it over fakes. */
export type ApplyDoorDeps = {
  /** `SIGNUP` as `launch.ts` reads it. */
  mode: SignupMode;
  /** Whether sign-in is on here at all: a session key and an origin a cookie can be set on. */
  on: boolean;
  /** `https://<PUBLIC_HOST>`, named in the refusal a page elsewhere gets. */
  origin: string;
  /** Whether the request came from a page on this origin (`sameOrigin` in `@braindog/host/auth`). */
  sameOrigin: (request: Request) => boolean;
  /** Whether a bot check stands in front of this door (`botCheckKeyed`), which the Directory's limits are told. */
  checked: boolean;
  /** The Turnstile answer checked, or `true` while the check is off, both keys not set (`turnstilePassed`, `turnstile.ts`). */
  turnstile: (answer: unknown, ip: string) => Promise<boolean>;
  /** The Directory's `apply.submit`. */
  apply: (call: Extract<ApplyCall, { flow: 'apply.submit' }>) => Promise<ApplyAnswers['apply.submit']>;
};

/**
 * `POST /auth/apply`, in the order `signUp` keeps: the method; whether sign-in is on; the origin and the content type
 * before the body is read; the body, capped; the mode; Turnstile when it is keyed; and only then the Directory.
 */
export async function applyDoor(request: Request, deps: ApplyDoorDeps): Promise<Response> {
  if (request.method !== 'POST') return refused(405, { code: 'FORBIDDEN', fix: '/auth/apply is a POST.' }, [['allow', 'POST']]);
  if (!deps.on) return refused(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not offer that way to sign in.' });
  if (!deps.sameOrigin(request)) return refused(403, { code: 'FORBIDDEN', fix: `Applications are answered only for pages on ${deps.origin}.`, at: 'origin' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    return refused(400, { code: 'BODY_MALFORMED', fix: '/auth/apply takes a JSON object, sent as application/json.' });
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > APPLY_BODY_MAX) return refused(413, { code: 'BODY_MALFORMED', fix: `/auth/apply takes at most ${APPLY_BODY_MAX} bytes.` });
  const raw = await request.text().catch(() => '');
  if (raw.length > APPLY_BODY_MAX) return refused(413, { code: 'BODY_MALFORMED', fix: `/auth/apply takes at most ${APPLY_BODY_MAX} bytes.` });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return refused(400, { code: 'BODY_MALFORMED', fix: '/auth/apply takes a JSON object, sent as application/json.' });
  /* ONLY BY INVITATION. Open, the page's own form makes the record; closed, nobody new is asked anything. */
  if (deps.mode === 'open') return refused(403, { code: 'FORBIDDEN', fix: SIGNUP_IS_OPEN });
  if (deps.mode !== 'invite') return refused(403, { code: 'NOT_IN_THIS_BUILD', fix: SIGNUP_CLOSED });
  const body = parsed as Record<string, unknown>;
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  if (!(await deps.turnstile(body['turnstile'], ip)))
    return refused(403, { code: 'FORBIDDEN', fix: NOT_A_PERSON, at: 'turnstile' });
  /* THE FIELDS GO THROUGH AS THEY CAME: the Directory trims, bounds and names a wrong one. */
  const out = await deps.apply({
    flow: 'apply.submit',
    name: body['name'] as string,
    email: body['email'] as string,
    ...(body['use'] === undefined ? {} : { use: body['use'] as string }),
    ...(body['link'] === undefined ? {} : { link: body['link'] as string }),
    ip,
    checked: deps.checked,
  });
  return answered(out);
}

/* ── the operator's doors ─────────────────────────────────────────────────── */

/** What `index.ts` hands the operator's doors. */
export type OpsApplyDeps = {
  /** `PROVISION_KEY`, trimmed; empty, and these doors do not exist. */
  key: string;
  /** `https://<PUBLIC_HOST>`, the origin an invitation's link opens. */
  origin: string;
  /** A GET's count by address (`overLimit` with `read`), or `null` to go on. */
  readLimit: (request: Request) => Promise<Response | null>;
  /** The one 401 (`saidUnauthorized`), which logs why and answers nothing of it. */
  unauthorized: () => Response;
  invites: <C extends InviteCall>(call: C) => Promise<InviteAnswers[C['flow']]>;
  applications: <C extends ApplyCall>(call: C) => Promise<ApplyAnswers[C['flow']]>;
  /** `sendMail(env, 'invite.ready', to, vars)` from `AUTH_MAIL_FROM`, awaited: `true` when the binding took it. */
  mail: (to: string, vars: { name?: string; link: string; days?: string }) => Promise<boolean>;
  now: () => number;
};

const json = (body: unknown, status: number, extra: [string, string][] = []): Response =>
  new Response(JSON.stringify(body), { status, headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...extra] });

const malformed = (door: string): Response =>
  json({ ok: false, refusal: { code: 'BODY_MALFORMED', fix: `${door} takes a JSON object, sent as application/json.` } }, 400);

/**
 * The guard every operator door here keeps, then the body: a `Response` to answer with, `'get'` for a read, or the
 * JSON object a POST sent.
 */
async function guarded(request: Request, deps: OpsApplyDeps, door: string): Promise<Response | 'get' | Record<string, unknown>> {
  if (deps.key === '') return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog has no operator key, so it has no operator doors.' } }, 404);
  if (request.method !== 'GET' && request.method !== 'POST')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `${door} is read with GET and written with POST.` } }, 405, [['allow', 'GET, POST']]);
  if (request.method === 'GET') {
    const over = await deps.readLimit(request);
    if (over !== null) return over;
  }
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (bearer === '' || !(await sameKey(bearer, deps.key))) return deps.unauthorized();
  if (request.method === 'GET') return 'get';
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return malformed(door);
  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, APPLY_BODY_MAX));
  } catch {
    body = null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return malformed(door);
  return body as Record<string, unknown>;
}

/** A code as the link a person opens. The fragment never reaches a server, and the page wipes it as it reads it. */
const linkOf = (origin: string, code: string): string => `${origin}/signup#code=${code}`;

/** The whole days a code has left, as the letter says them, or nothing for a code that never ends. */
const daysOf = (ends_at: number | null, now: number): string | undefined =>
  ends_at === null ? undefined : String(Math.max(1, Math.round((ends_at - now) / DAY_MS)));

/** A code's ref, as the invite list shows it: the first twelve characters of its SHA-256, in hex (`codeHash`). */
async function refOf(code: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  let out = '';
  for (const b of digest) out += b.toString(16).padStart(2, '0');
  return out.slice(0, 12);
}

/**
 * `/account/ops/applications`: `GET` lists them, newest first. `POST { invite: id, days? }` mints the one code
 * (`apply.decide`), mails its link and answers `{ link, mailed }`; `POST { decline: id }` marks it declined.
 */
export async function opsApplications(request: Request, deps: OpsApplyDeps): Promise<Response> {
  const door = '/account/ops/applications';
  const said = await guarded(request, deps, door);
  if (said instanceof Response) return said;
  if (said === 'get') return json({ ok: true, value: { applications: await deps.applications({ flow: 'apply.list' }) } }, 200);
  const invite = said['invite'];
  const decline = said['decline'];
  if ((typeof invite === 'string') === (typeof decline === 'string'))
    return json({ ok: false, refusal: { code: 'BODY_MALFORMED', fix: `${door} takes { invite: id, days? } or { decline: id }.` } }, 400);
  if (typeof decline === 'string') {
    const out = await deps.applications({ flow: 'apply.decide', id: decline, decision: 'decline' });
    return out.ok ? json({ ok: true, value: { declined: true } }, 200) : json(out, httpStatus(out));
  }
  const days = said['days'];
  const out = await deps.applications({
    flow: 'apply.decide',
    id: invite as string,
    decision: 'invite',
    ...(days === undefined || days === null ? {} : { days: days as number }),
  });
  if (!out.ok) return json(out, httpStatus(out));
  if (!('code' in out.value)) return json({ ok: true, value: { declined: true } }, 200);
  const link = linkOf(deps.origin, out.value.code);
  const vars = { link, ...(out.value.name ? { name: out.value.name } : {}) };
  const left = daysOf(out.value.ends_at, deps.now());
  const mailed = await deps.mail(out.value.email, left === undefined ? vars : { ...vars, days: left });
  if (mailed) await deps.applications({ flow: 'apply.mailed', code: out.value.code, email: out.value.email });
  return json({ ok: true, value: { link, mailed } }, 200);
}

/**
 * `/account/ops/invite`: the sign-up codes, behind the provision key, beside `/auth/provision`.
 *
 * `POST { note?, days?, count? }` MINTS, at most fifty a call (`INVITE_MINT_MOST`), and answers each as the link a person
 * opens, `https://<host>/signup#code=<code>`. No `days` is a code that never ends, which is the lane's. `POST { end }`
 * ends one by the `ref` the list shows or by the code, and `GET` lists them, newest first, never with the code. A code
 * is answered once, at minting.
 *
 * WITH AN `email`, ONE CODE, MAILED. `count` is 1 or left out; `days` is thirty when left out, so the letter can say when
 * it ends; the note is the operator's or `invite: <email>`. The link is mailed (`invite.ready`, greeting the name a
 * waiting application of that address gave), a waiting application
 * of that address is marked invited with the code's ref (`apply.invited`), and the answer is `{ links, ends_at, mailed }`.
 *
 * ANSWERED WHATEVER `SIGNUP` SAYS, so the codes can be made before the host is switched to `invite`.
 */
export async function opsInvite(request: Request, deps: OpsApplyDeps): Promise<Response> {
  const door = '/account/ops/invite';
  const said = await guarded(request, deps, door);
  if (said instanceof Response) return said;
  if (said === 'get') return json({ ok: true, value: { codes: await deps.invites({ flow: 'invite.list' }) } }, 200);
  if (said['end'] !== undefined) {
    const ended = await deps.invites({ flow: 'invite.end', ref: typeof said['end'] === 'string' ? said['end'] : '' });
    return ended.ok ? json({ ok: true, value: ended.value }, 200) : json(ended, httpStatus(ended));
  }
  const days = said['days'];
  const count = said['count'];
  const note = said['note'];
  const email = said['email'];
  if (email !== undefined && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())))
    return json({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'email is the address the invitation is mailed to.', at: 'email' } }, 422);
  const to = typeof email === 'string' ? email.trim().toLowerCase() : null;
  if (to !== null && count !== undefined && count !== 1)
    return json({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'An invitation mailed to one address is one code, so count is 1 or left out.', at: 'count' } }, 422);
  const out = await deps.invites({
    flow: 'invite.mint',
    ...(typeof note === 'string' ? { note } : note === undefined ? (to === null ? {} : { note: `invite: ${to}` }) : { note: note as string }),
    ...(days === undefined || days === null ? (to === null ? {} : { days: INVITE_MAIL_DAYS }) : { days: days as number }),
    ...(count === undefined ? {} : { count: count as number }),
  });
  if (!out.ok) return json(out, httpStatus(out));
  const links = out.value.codes.map((code) => linkOf(deps.origin, code));
  const [code] = out.value.codes;
  if (to === null || code === undefined) return json({ ok: true, value: { links, ends_at: out.value.ends_at } }, 200);
  const left = daysOf(out.value.ends_at, deps.now());
  /* THE LETTER GREETS THE NAME THEY APPLIED WITH, and "Hi there" only without one. */
  const name = (await deps.applications({ flow: 'apply.list' })).find((row) => row.email === to && row.state === 'waiting')?.name;
  const mailed = await deps.mail(to, {
    link: linkOf(deps.origin, code),
    ...(left === undefined ? {} : { days: left }),
    ...(name ? { name } : {}),
  });
  await deps.applications({ flow: 'apply.invited', email: to, ref: await refOf(code) });
  if (mailed) await deps.applications({ flow: 'apply.mailed', code, email: to });
  return json({ ok: true, value: { links, ends_at: out.value.ends_at, mailed } }, 200);
}
