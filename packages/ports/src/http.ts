/**
 * The one outbound request a connector makes, as a port. `37 §2.2`, `33 §1` port 7, `47 §8`.
 *
 * WHY A PORT AND NOT `fetch`. Not purity: `31 §1` bans a bare `fetch(` under `packages/**` because
 * the same code has to run in workerd, in Node and in a bare test process, and a package that calls
 * the global has chosen one. But the reason THIS port exists rather than a thin alias is the second
 * sentence of `47 §8`'s SSRF row — the address check cannot live in the caller:
 *
 *   > On the self-host `localhost:3000` is right there, which is why the port, not connect, holds
 *   > the address check.
 *
 * A connector is a URL a stranger's declaration named. On the Worker a private address is somebody
 * else's tenant; on a self-host it is the record itself. Only the adapter knows which machine it is
 * on and what resolved to what, so the refusal belongs to the adapter and the caller only has to
 * know that it happened.
 *
 * FOUR CONSTRAINTS, ALL THE ADAPTER'S. `redirect: 'manual'` so a 3xx comes back as a response the
 * caller can refuse rather than a hop it never saw; private and link-local ranges refused AFTER
 * resolution, because a name is not an address until it is; a 2 MB ceiling refused before the body
 * is buffered, so an enormous page costs nothing; and the timeout the caller asked for. None of
 * these is a flag the caller may turn off — an `init` that could relax them would be a port that
 * moved the decision back to the place that cannot make it.
 *
 * `GET` AND `POST` AND NOTHING ELSE. A pull reads. A declaration that wants `DELETE` is asking to
 * change somebody else's system from a file, which is `25 §7`'s line and not a method table.
 */

/** What the caller may ask for. Everything not here is the adapter's and is not negotiable. */
export type HttpInit = {
  method: 'GET' | 'POST';
  /** Verbatim. The adapter adds none and drops none; `47 §8`'s reserved names are refused upstream. */
  headers: Record<string, string>;
  body?: string;
  /** `47 §4.1`: 1 s to 30 s, 6 s by default. The adapter aborts and throws `Timeout`. */
  timeoutMs: number;
};

/**
 * `33 §1` port 7: the connector's fetch and nothing else's.
 *
 * ONE METHOD, AND IT IS SPELLED `fetch` ON PURPOSE. A reader who knows what `fetch` does knows what
 * this does, minus the four things the adapter has taken away. `stack.mjs` reads a signature inside
 * an `interface` as a declaration rather than a call, which is what lets the name be the honest one.
 */
export interface Http {
  fetch(url: URL, init: HttpInit): Promise<Response>;
}

/**
 * The four ways an adapter refuses, by `Error.name`. `47 §13` D14.
 *
 * A NAME RATHER THAN A CLASS, because the adapter lives in an app and the caller lives in a package,
 * and a class crossing that seam is an import pointing the wrong way up `31 §2`'s order. A string
 * on an `Error` is the smallest thing that survives the boundary, and closing the set is what makes
 * the caller's mapping exhaustive: `47 §5.1` turns three of these into `PULL_PROVIDER_UNAVAILABLE`
 * and `PrivateRange` into `PULL_ORIGIN_REFUSED`, and an adapter that invented a fifth name would
 * have its refusal quietly read as a programming error instead.
 */
export const HTTP_FAULTS = ['PrivateRange', 'TooLarge', 'Timeout', 'Network'] as const;

export type HttpFault = (typeof HTTP_FAULTS)[number];

/**
 * Which of the four an exception is, or `null` when it is not one of them at all.
 *
 * `null` IS A DEFECT AND MUST NOT BE SWALLOWED. A `TypeError` out of an adapter is this repository's
 * bug, not a provider's behaviour, and a caller that folded it into "the provider was unavailable"
 * would retry it on a ladder forever and never report it.
 */
export const httpFault = (e: unknown): HttpFault | null => {
  const name = e instanceof Error ? e.name : '';
  return (HTTP_FAULTS as readonly string[]).includes(name) ? (name as HttpFault) : null;
};
