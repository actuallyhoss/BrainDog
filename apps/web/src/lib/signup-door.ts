/**
 * THE ONE SIGN-UP DOOR SIGN-IN ASKS, AND THE ENVELOPE EVERY SIGN-UP CALL IS READ IN.
 *
 * Out of `signup.ts` so sign-in can ask who may sign up here (`signupMode`) without loading what sign-up reads a sentence
 * with: `signup.ts` opens by listening for every word a use case this build ships names, so importing it put the whole
 * starter catalogue in front of a stranger's sign-in (E14). `signup.ts` imports all of this back and says it again, so
 * nothing that imported it changes.
 *
 * PLAIN TYPESCRIPT WITH NO IMPORT, so a test can load it in Node with a fake `fetch`.
 */

/** The world the calls reach, so a test needs no socket. */
export type Io = { fetch: (url: string, init: RequestInit) => Promise<Response> };

/**
 * An answer, or the one thing the screen needs to say instead. `fix` is the host's sentence when it sent one, and `at`
 * the field it was about, so a free record refused for its plan is not offered the name to try again.
 */
export type Asked<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'refused'; fix: string | null; at?: string; code?: string }
  | { ok: false; kind: 'locked'; retryAfter: number }
  | { ok: false; kind: 'unreachable' };

/** Who may sign up on this host: anybody, a new address with a code, or nobody yet. */
export type SignupMode = 'open' | 'invite' | 'closed';

/**
 * What the name check answers, who may sign up (`mode`, and `open` when it is not `closed`), and the Turnstile site key
 * when the host asks for one.
 */
export type NameSeen = { slug: string; free: boolean; why: string | null; mode: SignupMode; open: boolean; turnstile: string | null };

/** Fifteen minutes, the lockout's own length, for a 429 that does not say how long. */
const LOCK_SECONDS = 900;

export const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function live(): Io {
  return { fetch: (url, init) => globalThis.fetch(url, init) };
}

/** One call in the `/auth` envelope. A body makes it a POST, sent as JSON because the host refuses anything else. */
export async function call(io: Io, path: string, body?: Record<string, unknown>): Promise<Asked<unknown>> {
  let res: Response;
  try {
    res = await io.fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { ok: false, kind: 'unreachable' };
  }
  const said: unknown = await res.json().catch(() => undefined);
  const env = isObj(said) ? said : null;
  if (res.status === 429) {
    const n = typeof env?.retryAfter === 'number' ? env.retryAfter : Number(res.headers.get('retry-after') ?? Number.NaN);
    return { ok: false, kind: 'locked', retryAfter: Number.isFinite(n) && n > 0 ? Math.ceil(n) : LOCK_SECONDS };
  }
  if (res.ok && env?.ok === true) return { ok: true, value: env.value };
  if (env?.ok === false || (res.status >= 400 && res.status < 500)) {
    const refusal = isObj(env?.refusal) ? env.refusal : null;
    const at = str(refusal?.at);
    const code = str(refusal?.code);
    return { ok: false, kind: 'refused', fix: str(refusal?.fix), ...(at !== null ? { at } : {}), ...(code !== null ? { code } : {}) };
  }
  return { ok: false, kind: 'unreachable' };
}

/** Whether a name is free, and whether sign-up is open here at all. An empty name asks only the second. */
export async function checkName(slug: string, io: Io = live()): Promise<Asked<NameSeen>> {
  const out = await call(io, `/auth/signup/name?slug=${encodeURIComponent(slug)}`);
  if (!out.ok) return out;
  const v = isObj(out.value) ? out.value : {};
  /* `mode` FIRST; A HOST A RELEASE OLDER SAYS ONLY `open`, which was open to anybody or to nobody. */
  const mode: SignupMode = v.mode === 'open' || v.mode === 'invite' || v.mode === 'closed' ? v.mode : v.open === true ? 'open' : 'closed';
  return {
    ok: true,
    value: {
      slug: typeof v.slug === 'string' ? v.slug : slug,
      free: v.free === true,
      why: str(v.why),
      mode,
      open: mode !== 'closed',
      turnstile: str(v.turnstile),
    },
  };
}

/**
 * WHO MAY SIGN UP HERE, for a screen that needs only that (sign in's foot line, first S8): the same one door sign-up
 * asks, with no name. `null` when the host did not answer, and the screen then offers no way to a BrainDog of one's own.
 */
export async function signupMode(io: Io = live()): Promise<SignupMode | null> {
  const out = await checkName('', io);
  return out.ok ? out.value.mode : null;
}
