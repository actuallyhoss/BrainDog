/**
 * An application to join, from the invite-only sign-up page (`Apply.svelte`, LAUNCH 103 item 10).
 *
 * ONE CALL, `POST /auth/apply`, at the root like every sign-up call: there is no record yet to name. The host keeps the
 * application beside the invite codes, and the owner invites from admin, which mails the link. Its answers:
 * `200 { ok: true, value: {} }`, a `403` at `turnstile` when the check that this is a person did not pass, and a `429`
 * with `retryAfter` in seconds when this address has tried too often.
 *
 * WHAT THE PAGE NEEDS TO SAY, NOT THE HOST'S SENTENCE: `limit` with how long to wait, `check` to do the check again, and
 * `other` for anything else, a host nobody reached among them. The page words each one (`words.ts`).
 *
 * PLAIN TYPESCRIPT with the same `io` seam as `lib/signup.ts`, so a test hands it a fake `fetch` and needs no browser.
 */

import type { Io } from '../../lib/signup.ts';

/** What the person typed. `use` and `link` may be left out; `turnstile` is the check's answer when the host asks one. */
export type Application = { name: string; email: string; use?: string; link?: string; turnstile?: string };

export type Applied = { ok: true } | { ok: false; why: 'limit' | 'check' | 'other'; retryAfter?: number };

/** Fifteen minutes, the lockout's own length, for a 429 that does not say how long. */
const WAIT_SECONDS = 900;

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The browser's own `fetch`, for the page. */
export const liveIo: Io = { fetch: (url, init) => globalThis.fetch(url, init) };

/** Send one application. Blank optional answers are not sent, and every answer goes trimmed. */
export async function sendApplication(io: Io, body: Application): Promise<Applied> {
  const sent: Record<string, string> = { name: body.name.trim(), email: body.email.trim() };
  for (const key of ['use', 'link', 'turnstile'] as const) {
    const v = body[key]?.trim();
    if (v) sent[key] = v;
  }
  let res: Response;
  try {
    res = await io.fetch('/auth/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(sent),
    });
  } catch {
    return { ok: false, why: 'other' };
  }
  const said: unknown = await res.json().catch(() => undefined);
  const env = isObj(said) ? said : null;
  if (res.status === 429) {
    const n = typeof env?.['retryAfter'] === 'number' ? env['retryAfter'] : Number(res.headers.get('retry-after') ?? Number.NaN);
    return { ok: false, why: 'limit', retryAfter: Number.isFinite(n) && n > 0 ? Math.ceil(n) : WAIT_SECONDS };
  }
  if (res.ok && env?.['ok'] === true) return { ok: true };
  const refusal = isObj(env?.['refusal']) ? env['refusal'] : null;
  if (refusal?.['at'] === 'turnstile') return { ok: false, why: 'check' };
  return { ok: false, why: 'other' };
}
