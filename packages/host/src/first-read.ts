/**
 * `/auth/signup/read`: a model reads a stranger's first sentence before there is an account (USE-B05).
 *
 * ONE DOOR BOTH HOSTS MOUNT. The Worker and the self-host each build a `FirstReadDoor` from what they have (a bot
 * check, a meter, the use cases on offer, a reader bound to their model) and hand the request here, so the checks and
 * the sentences are the same on both. The reader is a port: this package does not depend on `@braindog/slash`.
 *
 * THE SAME CHECKS THE SIGN-UP DOORS MAKE, in their order: a POST, from a page on this origin, as JSON, of 8 KB at most.
 * Then the body's keys, exactly `said`, `today`, `zone`, `locale` and `turnstile`; another is refused by name.
 *
 * SWITCHED OFF UNLESS ALL THREE ARE THERE. A model reads a stranger's words only when the owner turned it `on`, a
 * reader is bound, and a bot check is keyed; otherwise a 501 the page reads as "simple rules read it". Then the bot
 * check, then the meter (six readings for one address a day, and one ceiling for all strangers), and only then the
 * reader, whose own refusal comes back with its code kept (`UNREACHABLE`, `PROPOSAL_SCHEMA`, `SLASH_BUDGET_SPENT`).
 *
 * WHAT SHE SAID IS NEVER KEPT. It is handed to the reader and nowhere else: not logged, not put in a header, not
 * written down. Nothing in this file prints at all, so an error from the reader, which may quote her, stays unsaid.
 */

import type { RefusalCode } from '@braindog/ports';

import { sameOrigin } from './auth.ts';

/** What a host hands the door. `read` and `botCheck` are null where that host has no model or no bot check keyed. */
export type FirstReadDoor = {
  /** This BrainDog's own origin, `https://` and the host: the only page whose sentence is read. */
  origin: string;
  /** The owner's yes to a model reading a stranger's words. Off by default on every host. */
  on: boolean;
  botCheck: ((token: string, ip: string) => Promise<boolean>) | null;
  /** One reading spent for this address on this UTC day, or which limit stopped it. */
  meter: { take(ip: string, day: string): Promise<'ok' | 'address' | 'day'> };
  /** What is on offer to be read into: the host's use cases and modules, as the reader takes them. */
  offer(): Promise<unknown>;
  read: ((ask: { said: string; offer: unknown; today: string }) => Promise<{ ok: true; value: unknown } | { ok: false; refusal: { code: string; fix: string } }>) | null;
};

/** The most a body may be, as the sign-up doors hold it (`SIGNUP_BODY_MAX` in the Worker). */
export const FIRST_READ_BODY_MAX = 8_192;

/** The most of what she said that is read, in characters: what the mailed link carries (`SIGNUP_SAID_MOST`). */
export const FIRST_READ_SAID_MOST = 1_000;

const KEYS = ['said', 'today', 'zone', 'locale', 'turnstile'] as const;

export const FIRST_READ_OFF = 'This BrainDog does not read a sign-up with a model, so simple rules read it.';
export const FIRST_READ_NOT_PERSON = 'The check that you are a person did not pass.';
export const FIRST_READ_ADDRESS_SPENT = 'Six readings a day is the most for one address. Simple rules read it now.';
export const FIRST_READ_DAY_SPENT = 'Today’s readings for new people are all used. Simple rules read it now.';
const UNANSWERED = 'The reader did not answer. Simple rules read it now.';
const UNCOUNTED = 'Readings cannot be counted just now. Simple rules read it now.';

/* One browser's answer, never a cache's, as every `/auth` answer is. Not the sniffing header the sign-up doors also
   send: core-names reads its last word as a guide's field, and its held list only shrinks (see the report). */
function reply(status: number, payload: object, extra: readonly [string, string][] = []): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...extra],
  });
}

const refused = (status: number, code: RefusalCode, fix: string, at?: string, extra: readonly [string, string][] = []): Response =>
  reply(status, { ok: false, refusal: { code, fix, ...(at === undefined ? {} : { at }) } }, extra);

/** The address the sign-up doors count by: what Cloudflare wrote, or a proxy's first hop on a self-host. */
export function firstReadIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf !== null && cf.trim() !== '') return cf.trim();
  return (request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim();
}

/* A model's refusal keeps its code; the status only tells a proxy what kind of no it was. */
const statusOf = (code: string): number => (code === 'UNREACHABLE' ? 503 : code === 'SLASH_BUDGET_SPENT' || code === 'RATE_LIMITED' ? 429 : 422);

export async function serveFirstRead(request: Request, door: FirstReadDoor, now = Date.now()): Promise<Response> {
  if (request.method !== 'POST') return refused(405, 'FORBIDDEN', 'This door takes a POST.', undefined, [['allow', 'POST']]);
  if (!sameOrigin(request, door.origin)) return refused(403, 'FORBIDDEN', `A sign-up is read only for pages on ${door.origin}.`, 'origin');
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    return refused(415, 'BODY_MALFORMED', 'This door takes a JSON object, sent as application/json.');
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > FIRST_READ_BODY_MAX) return refused(413, 'BODY_MALFORMED', `This door takes at most ${FIRST_READ_BODY_MAX} bytes.`);
  const raw = await request.text().catch(() => '');
  if (new TextEncoder().encode(raw).length > FIRST_READ_BODY_MAX) return refused(413, 'BODY_MALFORMED', `This door takes at most ${FIRST_READ_BODY_MAX} bytes.`);

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return refused(400, 'BODY_MALFORMED', 'This door takes a JSON object, sent as application/json.');
  const body = parsed as Record<string, unknown>;
  const extra = Object.keys(body).find((k) => !(KEYS as readonly string[]).includes(k));
  if (extra !== undefined) return refused(400, 'FIELD_UNKNOWN', `This door takes ${KEYS.join(', ')}, and not ${extra.slice(0, 40)}.`, extra.slice(0, 40));
  for (const k of KEYS) {
    if (body[k] !== undefined && typeof body[k] !== 'string') return refused(400, 'BODY_MALFORMED', `${k} is sent as text.`, k);
  }
  const said = typeof body['said'] === 'string' ? body['said'] : '';
  const today = typeof body['today'] === 'string' ? body['today'] : '';
  if (said.trim() === '') return refused(400, 'BODY_MALFORMED', 'Say a sentence first, then it can be read.', 'said');
  if (said.length > FIRST_READ_SAID_MOST) return refused(400, 'BODY_MALFORMED', 'At most 1,000 characters are read. Shorten it, or leave the rest for later.', 'said');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return refused(400, 'BODY_MALFORMED', 'today is the date where you are, written as 2026-10-14.', 'today');

  const read = door.read;
  if (!door.on || read === null || door.botCheck === null) return refused(501, 'NOT_IN_THIS_BUILD', FIRST_READ_OFF);

  const ip = firstReadIp(request);
  const token = typeof body['turnstile'] === 'string' ? body['turnstile'] : '';
  const person = token !== '' && (await door.botCheck(token, ip).catch(() => false));
  if (!person) return refused(403, 'FORBIDDEN', FIRST_READ_NOT_PERSON, 'turnstile');

  const day = new Date(now).toISOString().slice(0, 10);
  /* A meter that cannot answer holds the door shut: nothing is read uncounted. */
  const held = await door.meter.take(ip, day).catch(() => null);
  if (held === null) return refused(503, 'UNREACHABLE', UNCOUNTED);
  if (held !== 'ok') {
    const midnight = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
    const wait = String(Math.max(1, Math.ceil((midnight - now) / 1000)));
    return refused(429, 'RATE_LIMITED', held === 'address' ? FIRST_READ_ADDRESS_SPENT : FIRST_READ_DAY_SPENT, undefined, [['retry-after', wait]]);
  }

  try {
    const out = await read({ said, offer: await door.offer(), today });
    if (out.ok) return reply(200, { ok: true, value: out.value });
    return reply(statusOf(out.refusal.code), { ok: false, refusal: { code: out.refusal.code, fix: out.refusal.fix } });
  } catch {
    return refused(503, 'UNREACHABLE', UNANSWERED);
  }
}
