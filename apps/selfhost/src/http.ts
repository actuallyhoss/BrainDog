/**
 * The `Http` port, on a Node host. `37 §2.2`, `33 §1` port 7, `47 §8`.
 *
 * FOUR CONSTRAINTS AND NONE OF THEM IS THE CALLER'S TO RELAX. A connector is a URL a stranger's
 * declaration named, so the adapter (not `@braindog/connect`) holds the address check, the
 * redirect refusal, the byte ceiling and the timeout. `HttpInit` carries no flag that could turn
 * any of them off, which is what makes the port a port rather than a thin alias for `fetch`.
 *
 * THE ADDRESS CHECK CANNOT LIVE IN THE CALLER, and on this host that is not a nicety: on a
 * self-host `localhost:3000` is the record itself. Only the process that resolved the name knows
 * what it resolved to, so the refusal is here.
 *
 * AND THE ADDRESS IS PINNED, which is the part a plain `fetch` cannot do. A name can answer a
 * public address to the check and `127.0.0.1` to the connection a moment later, so the check and
 * the socket share one lookup: `pinnedSend` hands the socket a `lookup` that answers only the
 * address that was checked. This is `actions.ts`'s machinery, reused rather than rewritten: two
 * address checks on one host is one check and a memory of it.
 *
 * FOUR NAMES ON AN `Error` AND NOTHING ELSE (`47 §13` D14). A class would be an import pointing the
 * wrong way up `31 §2`'s order; a string survives the seam. Anything this file did not name is a
 * defect in this repository, and `runPull` re-throws it rather than retrying it for a week.
 */

import type { Http, HttpInit } from '@braindog/ports';

import { pinFor, pinnedSend, systemResolve, type Resolve, type Send } from './actions.ts';

/** `47 §4.1`: the row and BLOB ceiling, and the cap the caller may not raise. */
const RESPONSE_BYTES = 2_000_000;

/** One of the port's four, as the caller reads it. */
const fault = (name: 'PrivateRange' | 'TooLarge' | 'Timeout' | 'Network', say: string): Error => {
  const e = new Error(say);
  e.name = name;
  return e;
};

/**
 * The body, buffered, and refused the moment it passes the ceiling.
 *
 * COUNTED AS IT ARRIVES AND NOT READ OFF `Content-Length`, because a header is a claim: a provider
 * that says 900 bytes and sends nine hundred million has cost this host nine hundred million bytes
 * of memory by the time anybody compares the two.
 */
const withinCap = async (res: Response): Promise<Response> => {
  const body = res.body;
  if (body === null) return res;

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > RESPONSE_BYTES) {
      await reader.cancel();
      throw fault('TooLarge', `The answer passed ${RESPONSE_BYTES} bytes and was not read.`);
    }
    chunks.push(value);
  }

  const whole = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  return new Response(whole, { status: res.status, headers: res.headers });
};

/**
 * The port, wired to this host's name service and pinned socket.
 *
 * `send` AND `resolve` ARE FOR TESTS and for nothing else. A caller that could pass its own
 * transport could pass one that skips the lookup, which is the whole check gone in one argument.
 */
export function httpFor(options: { send?: Send | undefined; resolve?: Resolve | undefined } = {}): Http {
  const send = options.send ?? pinnedSend;
  const pin = pinFor(options.resolve ?? systemResolve);

  return {
    fetch: async (url: URL, init: HttpInit): Promise<Response> => {
      /* NOT ONE OF THE FOUR. Lint refuses a `base:` that is not `https://`, and `resolveRequest`
         re-parses every URL against it, so a request arriving here on another scheme is this
         repository's bug and is reported as one rather than as a provider having a bad minute. */
      if (url.protocol !== 'https:')
        throw new Error(`A connector may only call https, and this asked for ${url.protocol}//.`);

      const abort = new AbortController();
      const rang = setTimeout(() => { abort.abort(); }, init.timeoutMs);

      try {
        const pinned = await pin(url, abort.signal);
        /* A SENTENCE RATHER THAN AN ADDRESS IS THE REFUSAL. */
        if (typeof pinned === 'string') throw fault('PrivateRange', pinned);

        /* `redirect: 'manual'` IS NOT A SETTING HERE, IT IS THE TRANSPORT. `node:https` follows
           nothing, so a 3xx arrives intact and `47 §8` gets the response it needs to refuse. */
        const res = await send(
          url,
          {
            method: init.method,
            headers: init.headers,
            signal: abort.signal,
            ...(init.body === undefined ? {} : { body: init.body }),
          },
          pinned,
        );
        return await withinCap(res);
      } catch (e) {
        if (abort.signal.aborted) throw fault('Timeout', `Nothing answered within ${init.timeoutMs} ms.`);
        if (e instanceof Error && (e.name === 'PrivateRange' || e.name === 'TooLarge')) throw e;
        throw fault('Network', e instanceof Error ? e.message : String(e));
      } finally {
        clearTimeout(rang);
      }
    },
  };
}
