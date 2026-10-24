/**
 * ONE MORE TRY WHEN THE RECORD'S OBJECT WAS RESET UNDER A CALL (the audit of 25 October, Z38).
 *
 * WHAT WAS SEEN: twenty errors in one second at 13:19:45Z on 24 October, `/api/pulse` and the Directory's calls, each
 * "Connection closed: this Durable Object instance is no longer active. Reconnect or retry the request." The platform
 * had moved the object; the stub the call went through was dead, and nothing asked again, so every open session's pulse
 * that second was a 500 and an alert line.
 *
 * ONLY WHAT IS SAFE TO SAY TWICE IS ASKED AGAIN: a read (GET or HEAD), and the pulse, which moves `pulse_at` in place
 * and writes no version (`pulseRun` in `kernel/presence.ts`), so a second one is the same as the first. A write that
 * may have landed before the reset is never sent again; it fails as before and the caller decides.
 *
 * A NEW STUB FOR THE SECOND TRY, since the old one is the connection that closed, and only once: a second reset in a
 * row is not a blip, and is answered as an error.
 */

/** Whether an error is the platform saying the object went away and the request may be sent again. */
export function wasReset(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const flags = e as Error & { retryable?: unknown; overloaded?: unknown };
  /* AN OVERLOADED OBJECT IS NOT ASKED AGAIN AT ONCE, which would only add to the load. */
  if (flags.overloaded === true) return false;
  return flags.retryable === true || /no longer active|caused object to be reset/iu.test(e.message);
}

/** Whether a request may be sent twice with the same effect: a read, or an agent's pulse. */
export function sayableTwice(method: string, pathname: string): boolean {
  if (method === 'GET' || method === 'HEAD') return true;
  return method === 'POST' && /\/api\/+pulse\/*$/u.test(pathname);
}

/**
 * `inner` through a stub, and once more through a new one when the object was reset under it and the request is one
 * that may be said twice. `stub` makes a new stub each call.
 */
export async function fetchThroughReset(stub: () => { fetch(r: Request): Promise<Response> }, inner: Request): Promise<Response> {
  const again = sayableTwice(inner.method, new URL(inner.url).pathname) ? inner.clone() : null;
  try {
    return await stub().fetch(inner);
  } catch (e) {
    if (again === null || !wasReset(e)) throw e;
    return stub().fetch(again);
  }
}
