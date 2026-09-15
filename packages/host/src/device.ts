/**
 * Signing a machine in over HTTP: `POST /auth/device` and `POST /auth/device/token`, RFC 8628 in the `Result`
 * envelope. `12 §6.1`, `33 §4`, `48 §5.2`.
 *
 * NEITHER ROUTE READS A COOKIE OR ASKS FOR AN ORIGIN, because the caller is a CLI with no credential yet. What
 * stands in for them: a start is counted against its address in the record's `auth_fail`, the poll id is 256
 * random bits, and the approval happens elsewhere, at `/api/deviceApprove`, behind a fresh sign-in.
 *
 * THE ADDRESS A PERSON IS TOLD TO OPEN IS THIS HOST'S OWN ORIGIN. A request that reached the host by some other
 * name is refused rather than answered with a link to a place it did not ask, and the CLI checks the same thing
 * from its side, so a phished approval page needs both halves to be wrong.
 *
 * NOTHING HERE LOGS. The six digits, the poll id and the bearer are each in one answer and nowhere else.
 *
 * NO VALUE IS IMPORTED FROM `auth.ts`, which imports this file: the table below is spread into `AUTH_ROUTES`
 * while `auth.ts` is still loading, so a value import back would read it before it exists.
 */

import type { Refusal, Result } from '@braindog/ports';

import type { AuthRoute } from './auth.ts';
import { httpStatus } from './index.ts';

/** The device grant's two flows. They are not `AuthCall`s: the Directory never hears about a device. */
export type DeviceFlow = 'device' | 'device.token';

/** The two routes, as data, appended to `AUTH_ROUTES`. */
export const DEVICE_ROUTES: readonly AuthRoute[] = [
  { path: '/auth/device', method: 'POST', flow: 'device', on: 'both', needs: 'nothing', what: 'A device asks to sign in: six digits for a person to type, and a long id for the device to poll with.' },
  { path: '/auth/device/token', method: 'POST', flow: 'device.token', on: 'both', needs: 'nothing', what: 'The device asks again, and once a person has approved it takes its bearer, once.' },
];

/** The kernel's ten minutes (`12 §6.1`), in the seconds RFC 8628 counts in. */
const CODE_SECONDS = 600;

/** What a device asks for. `slug` names the record on a host with more than one; `ua` and `ip` are the host's. */
export type DeviceAsk = { slug?: string; reach: string; label: string; scope?: string; ua?: string; ip: string };

/** The record's half, as a host reaches it: in process on the self-host, over RPC on the Worker. */
export type DeviceDoor = {
  start(ask: DeviceAsk): Promise<Result<{ device_code: string; user_code: string; expires: string; interval: number }> | { ok: false; retryAfter: number }>;
  poll(ask: { slug?: string; device_code: string }): Promise<Result<unknown>>;
};

/** What a device is told when it starts: `48 §4.2`'s `DeviceCode`. */
export type DeviceStarted = { device_code: string; user_code: string; verification_uri: string; expires_in: number; expires: string; interval: number };

/** The part of a host's `AuthDoor` these routes read. */
type Door = { origin: string; ip: string; reached?: string | undefined; device?: DeviceDoor | undefined };

type Header = readonly [string, string];

/* The same headers sign-in answers with: JSON, one caller's and never a cache's, and no CORS header ever. */
const HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal): Response => reply(status, { ok: false, refusal: refused });

/** A device body is a few hundred bytes. Four kilobytes is room for a long label and nothing else. */
const BODY_LIMIT = 4_096;

async function objectOf(request: Request): Promise<Record<string, unknown> | null> {
  if ((request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() !== 'application/json') return null;
  const raw = await request.text();
  if (raw.length > BODY_LIMIT) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (x: unknown): string => (typeof x === 'string' ? x : '');
const slugOf = (body: Record<string, unknown>): { slug?: string } => (typeof body.slug === 'string' && body.slug ? { slug: body.slug } : {});

/**
 * Answer one of the two device routes. `serveAuth` has already matched the route and its method.
 *
 * THE ORDER: whether this host signs devices in at all, then a page elsewhere, then the body, then the name the
 * request arrived by, and only then the record.
 */
export async function serveDevice(request: Request, route: AuthRoute, door: Door): Promise<Response> {
  if (!door.device) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not sign devices in.' });

  /* A CLI SENDS NO `Origin`. A browser always does on a POST, so one naming another site is a page somewhere
     else trying to start a flow in this host's name. */
  const said = request.headers.get('origin');
  if (said !== null && said !== door.origin)
    return refusal(403, { code: 'FORBIDDEN', fix: `Devices are signed in from a terminal, or from pages on ${door.origin}.`, at: 'origin' });

  const body = await objectOf(request);
  if (!body) return refusal(400, { code: 'BODY_MALFORMED', fix: `${route.path} takes a JSON object, sent as application/json.` });

  if (route.flow === 'device.token') {
    const out = await door.device.poll({ ...slugOf(body), device_code: text(body.device_code) });
    return reply(httpStatus(out), out);
  }

  /* THE ADDRESS WE WOULD PRINT MUST BE THE ONE THE DEVICE CALLED. Reached by another name, the code would send a
     person to a host the device never spoke to, so nothing is started. */
  let own = '';
  try {
    own = new URL(door.origin).host;
  } catch {
    own = '';
  }
  if (!own || door.reached !== own)
    return refusal(403, { code: 'FORBIDDEN', fix: `This BrainDog signs devices in at ${door.origin}, so start there.`, at: 'verification_uri' });

  const ua = request.headers.get('user-agent');
  const out = await door.device.start({
    ...slugOf(body),
    reach: text(body.reach),
    label: text(body.label),
    ...(typeof body.scope === 'string' ? { scope: body.scope } : {}),
    ...(ua ? { ua: ua.slice(0, 200) } : {}),
    ip: door.ip,
  });
  if ('retryAfter' in out) return reply(429, { ok: false, retryAfter: out.retryAfter }, [['retry-after', String(out.retryAfter)]]);
  if (!out.ok) return reply(httpStatus(out), out);
  const started: DeviceStarted = {
    device_code: out.value.device_code,
    user_code: out.value.user_code,
    verification_uri: `${door.origin}/settings/agents`,
    expires_in: CODE_SECONDS,
    expires: out.value.expires,
    interval: out.value.interval,
  };
  return reply(200, { ok: true, value: started });
}
