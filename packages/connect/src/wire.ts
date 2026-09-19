/**
 * The four things every outbound call in this package does the same way.
 *
 * HERE RATHER THAN IN EACH CALLER, because there are three callers now — the probe, the bind
 * screen's one proving call, and the page loop — and `30 §2` is exact about what three copies of
 * the origin check would be: one check and two memories of it. The one that matters is `onBase`. A
 * second, weaker URL check beside the real one is how the weaker one becomes the only one somebody
 * reads, and this package exists because of where a connector can be talked into going.
 */

import type { Clock, Http } from '@braindog/ports';
import type { Json } from '@braindog/where';

import { climbs } from './request.ts';
import { portFault } from './status.ts';
import { parseDuration, PullError, type FetchDecl, type ResolvedRequest } from './index.ts';

export type Wired = { http: Http; clock: Clock };

/** `47 §4.1`: 6 s by default, 1 s to 30 s, and the adapter is what enforces it. */
const DEFAULT_TIMEOUT_MS = 6_000;

export const timeoutOf = (decl: FetchDecl): number => parseDuration(decl.limits?.timeout ?? '6s') ?? DEFAULT_TIMEOUT_MS;

/**
 * The declaration's headers, minus every one that still holds a placeholder.
 *
 * A PROBE HAS NO WINDOW, so `{since}` has nothing to become. Sending the header with the braces
 * still in it would be a provider reading the literal text `{since:date}`; dropping the header
 * entirely would lose `Stripe-Version`, which a probe needs as much as a page does. So the ones
 * that need nothing are sent and the ones that do are left out, which is the only split that is
 * true of both.
 */
export const staticHeaders = (decl: FetchDecl): Record<string, string> => {
  const out: Record<string, string> = { accept: 'application/json' };
  for (const [name, value] of Object.entries(decl.headers ?? {})) if (!value.includes('{')) out[name] = value;
  return out;
};

/**
 * `base + path`, and the same two checks every other URL in this package gets.
 *
 * WRITTEN ONCE AND CALLED THREE TIMES. A probe's path is a literal that lint has already looked at,
 * so the temptation is to trust it here — and that is exactly the reasoning that produces a second
 * check nobody maintains. `resolveRequest` applies exactly these two.
 */
export const onBase = (decl: FetchDecl, path: string, at: string): URL => {
  if (climbs(path)) throw new PullError('PULL_ORIGIN_REFUSED', at, { found: path, base: decl.base, wanted: decl.base });
  let url: URL;
  try {
    url = new URL(decl.base + path);
  } catch {
    throw new PullError('PULL_ORIGIN_REFUSED', at, { found: path, base: decl.base, wanted: decl.base });
  }
  if (url.origin !== decl.base || climbs(url.pathname))
    throw new PullError('PULL_ORIGIN_REFUSED', at, { found: url.href, base: decl.base, wanted: decl.base });
  return url;
};

/**
 * One request, made through the port, with the port's own four refusals turned into codes.
 *
 * AN EXCEPTION THE PORT DID NOT NAME IS RE-THROWN UNCHANGED. `httpFault` answers `null` for a
 * `TypeError` out of an adapter, and folding that into "the provider was unavailable" would retry
 * this repository's own bug on a ladder for a week and never report it.
 */
export const send = async (req: ResolvedRequest, decl: FetchDecl, deps: Wired, at: string): Promise<Response> => {
  try {
    return await deps.http.fetch(req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.body === undefined ? {} : { body: req.body }),
      timeoutMs: timeoutOf(decl),
    });
  } catch (e) {
    const fault = portFault(e, at);
    if (fault !== null) throw fault;
    throw e;
  }
};

export const parse = (text: string, at: string): Json => {
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new PullError('PULL_SHAPE_MISMATCH', at, { wanted: 'a JSON body' });
  }
};
