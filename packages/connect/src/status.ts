/**
 * What a provider's answer means, in one place: the status, the `Retry-After`, and the port's own
 * four refusals.
 *
 * THE WHOLE POINT IS THAT THE FOUR OUTCOMES ARE DIFFERENT REPAIRS. `47 §5.1` step 7 turns each code
 * into an outcome, a cursor rule and an ack, and the four are not interchangeable:
 *
 *   - `PULL_AUTH_REJECTED` pauses the connector until a person reconnects it.
 *   - `PULL_PROVIDER_UNAVAILABLE` retries on the ladder and tells nobody.
 *   - `PULL_REQUEST_REFUSED` and `PULL_ORIGIN_REFUSED` go to review, because retrying a declaration
 *     that is wrong is the same request forty more times.
 *   - `PULL_SHAPE_MISMATCH` goes to review with the path a person can check against a response.
 *
 * Fold any two together and one of them is wrong in the expensive direction: a connector paused
 * through a provider's bad afternoon, or a dead credential retried on a ladder for a week.
 *
 * A REDIRECT IS NOT FOLLOWED AND IS NOT AN ERROR THE PROVIDER MADE. `47 §8`: the adapter is set to
 * `redirect: 'manual'`, so a `3xx` arrives here intact, and it is `PULL_ORIGIN_REFUSED` — a
 * connector that followed one would be a connector whose destination the declaration does not fix.
 * That is the SSRF the origin check exists for, arriving by the one door the check does not cover.
 */

import { httpFault } from '@braindog/ports';
import type { Json } from '@braindog/where';

import { matchesCond, PullError, type Cond, type FetchDecl, type Window } from './index.ts';

/** Six hours. A provider asking to be left alone for longer is asking for more than a run can give. */
const RETRY_CAP_MS = 6 * 60 * 60 * 1000;

/**
 * `Retry-After`, in milliseconds from now, or `null`.
 *
 * BOTH FORMS, BECAUSE PROVIDERS SEND BOTH. RFC 9110 allows delay-seconds or an HTTP-date, and a
 * parser that read only the integer would treat `Wed, 21 Oct 2026 07:28:00 GMT` as absent and retry
 * in two minutes into a rate limit that has an hour left on it.
 *
 * CAPPED, AND A PAST DATE IS ZERO. An uncapped header is a provider deciding how long this record's
 * connector sleeps, and a clock skew that puts the date behind us is not a negative wait.
 */
export function retryAfterMs(header: string | null | undefined, nowMs: number): number | null {
  if (header === null || header === undefined) return null;
  const text = header.trim();
  if (text === '') return null;

  if (/^\d+$/u.test(text)) return Math.min(Number(text) * 1000, RETRY_CAP_MS);

  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(at - nowMs, 0), RETRY_CAP_MS);
}

/** The port's four `Error.name`s, onto the two codes they mean (`47 §5.1` step 6.3). */
export function portFault(e: unknown, at: string): PullError | null {
  const fault = httpFault(e);
  if (fault === null) return null;
  if (fault === 'PrivateRange')
    return new PullError('PULL_ORIGIN_REFUSED', at, { wanted: 'a public address', found: 'a private or link-local one' });
  if (fault === 'TooLarge')
    return new PullError('PULL_REQUEST_REFUSED', at, { wanted: 'a response under the declared byte cap' });
  return new PullError('PULL_PROVIDER_UNAVAILABLE', at, { found: fault });
}

/** What `classify` needs of a response, so a test can hand it two fields rather than build one. */
export type Answered = { status: number; headers: Headers };

/**
 * One answer, classified. Returns when the run may read the body, throws otherwise.
 *
 * THE DECLARATION'S OWN `error_when` COMES FIRST AMONG THE STATUS RULES, because a provider that
 * answers 200 with an `errors` array in the body — Cloudflare's GraphQL does — is unavailable, and
 * a provider that answers 404 for an empty range is not an error at all. `25 §6` is what lets a
 * declaration say so, and a hard-coded table could not.
 *
 * THE BODY-PATH CONDITIONS ARE NOT HERE, and neither is the window. They need the parsed page,
 * which needs the bytes, which is step 6.5; this runs at step 6.4 on the status line and the
 * headers alone, and taking arguments it could not use would be a signature that lied about when
 * it runs. `classifyBody` is the other half.
 */
export function classify(decl: FetchDecl, res: Answered, nowMs: number, at: string): void {
  const { status } = res;

  if (status >= 300 && status < 400)
    throw new PullError('PULL_ORIGIN_REFUSED', at, {
      found: status,
      base: decl.base,
      wanted: 'an answer, not a redirect: a connector goes where the declaration says and nowhere else',
    });

  if (status === 401 || status === 403) throw new PullError('PULL_AUTH_REJECTED', at, { found: status });

  const on = decl.on_error ?? {};
  const hit = (conds: readonly Cond[] | undefined): boolean =>
    (conds ?? []).some((cond) => 'status_in' in cond && cond.status_in.includes(status));

  if (hit(on.fatal_when)) throw new PullError('PULL_REQUEST_REFUSED', at, { found: status, wanted: 'a status the declaration accepts' });

  if (hit(on.error_when)) {
    const wait = on.honour === 'retry_after' ? retryAfterMs(res.headers.get('retry-after'), nowMs) : null;
    throw new PullError('PULL_PROVIDER_UNAVAILABLE', at, {
      found: status,
      ...(wait === null ? {} : { notBefore: nowMs + wait }),
    });
  }

  /* 429 IS THE PROVIDER EVEN WHEN THE DECLARATION DID NOT SAY SO. It is the one 4xx that means
     "come back later" rather than "you asked wrongly", and sending it to review would park a
     working connector on a human's desk over a rate limit that clears itself. */
  if (status === 429) {
    const wait = retryAfterMs(res.headers.get('retry-after'), nowMs);
    throw new PullError('PULL_PROVIDER_UNAVAILABLE', at, {
      found: status,
      ...(wait === null ? {} : { notBefore: nowMs + wait }),
    });
  }

  if (status >= 500)
    throw new PullError('PULL_PROVIDER_UNAVAILABLE', at, { found: status });

  if (status < 200 || status >= 300)
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: status, wanted: 'a status the declaration accepts' });
}

/**
 * The body-path half of `error_when` and `fatal_when`, once the page is parsed (`47 §5.1` step 6.6).
 *
 * SEPARATE FROM `classify` BECAUSE IT HAPPENS LATER, and running it early would mean reading the
 * body before deciding whether the status allows reading it at all.
 */
export function classifyBody(decl: FetchDecl, json: Json | undefined, status: number, window: Window, tz: string, at: string): void {
  const on = decl.on_error ?? {};
  for (const cond of on.fatal_when ?? [])
    if (!('status_in' in cond) && matchesCond(cond, status, json, window, tz))
      throw new PullError('PULL_REQUEST_REFUSED', at, { found: cond.path, wanted: 'a body the declaration accepts' });
  for (const cond of on.error_when ?? [])
    if (!('status_in' in cond) && matchesCond(cond, status, json, window, tz))
      throw new PullError('PULL_PROVIDER_UNAVAILABLE', at, { found: cond.path });
}
