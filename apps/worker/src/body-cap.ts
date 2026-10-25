/**
 * The net under every POST: a body over its door's ceiling is a 413 with a plain line, before anything below reads it.
 *
 * Most doors cap their own body already (sign-up, apply, OAuth, the first read, files, ingest, the kennel). This is for
 * the ones that did not say, and it leaves the rest alone: a door with its own cap is not listed here, so the tighter or
 * larger number stays that door's. The numbers are `BODY_MOST` in `@braindog/host/abuse`.
 */

import { BODY_MOST, tooLargeLine } from '@braindog/host/abuse';
import type { Refusal } from '@braindog/ports';

import { appPath } from './route.ts';

/** The ceiling for a path, or `null` where the door keeps its own (`/api/files`, `/in/*`, the kennel, a page). */
export function capFor(pathname: string): number | null {
  const app = appPath(pathname);
  const rest = app !== null && /^\/+api(?:\/|$)/.test(app.rest) ? app.rest : pathname;
  if (/^\/+api\/+files(?:\/|$)/.test(rest)) return null;
  if (/^\/+api\/+import\/*$/.test(rest)) return BODY_MOST.import.bytes;
  if (/^\/+api\/+sealedPut\/*$/.test(rest)) return BODY_MOST.sealed.bytes;
  if (/^\/+api\/+seen\/*$/.test(rest)) return BODY_MOST.seen.bytes;
  if (/^\/+api\/+(?:vault|keychain)(?:\/|$)/.test(rest)) return BODY_MOST.keychain.bytes;
  if (/^\/+api\/+[^/]/.test(rest)) return BODY_MOST.api.bytes;
  if (/^\/+mcp\/*$/.test(rest)) return BODY_MOST.mcp.bytes;
  if (/^\/+auth(?:\/|$)/.test(rest)) return BODY_MOST.auth.bytes;
  if (/^\/+oauth(?:\/|$)/.test(rest)) return BODY_MOST.oauth.bytes;
  if (/^\/+account(?:\/|$)/.test(rest)) return BODY_MOST.account.bytes;
  return null;
}

/** The methods that carry a body worth capping; a read or a preflight is handed on as it is. */
const BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const tooLarge = (cap: number): Response => {
  const refusal: Refusal = { code: 'BODY_MALFORMED', fix: tooLargeLine(cap) };
  return new Response(JSON.stringify({ ok: false, refusal }), {
    status: 413,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};

/**
 * The request to go on with, or the 413.
 *
 * A DECLARED LENGTH OVER THE CEILING IS REFUSED UNREAD; one at or under it is trusted, because the runtime stops a body
 * at the length it announced. A BODY WITH NO LENGTH (chunked) IS READ UP TO THE CEILING AND ONE BYTE MORE, then handed on
 * whole, so a sender cannot get past the cap by not saying how big it is.
 */
export async function guardBody(request: Request): Promise<Request | Response> {
  if (request.body === null || !BODY_METHODS.has(request.method)) return request;
  const cap = capFor(new URL(request.url).pathname);
  if (cap === null) return request;
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    return Number.isFinite(n) && n > cap ? tooLarge(cap) : request;
  }
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const read = await reader.read();
    if (read.done) break;
    total += read.value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return tooLarge(cap);
    }
    parts.push(read.value);
  }
  const whole = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.byteLength;
  }
  return new Request(request, { body: whole });
}
