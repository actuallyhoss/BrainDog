/**
 * Both halves in one file, which is the whole point of the fixture: the gate must tell a signature
 * from a call, and it can only be shown to do that where both are present and only one is named.
 */

/** A DECLARATION. `37 §2.2`'s port, spelled the way the spec spells it. */
export interface Http {
  fetch(url: URL, init: { method: 'GET' | 'POST'; timeoutMs: number }): Promise<Response>;
}

/** AND A CALL, which is the thing `31 §1` bans. This is the line the gate must name. */
export const pull = (url: URL): Promise<Response> => fetch(url);
