/**
 * The `Http` port, on the Worker. `37 §2.2`, `33 §1` port 7, `47 §8`.
 *
 * THE SAME FOUR CONSTRAINTS AND ONE OF THEM IS HALF THE PLATFORM'S. Cloudflare does not route a
 * Worker's `fetch` to a private or link-local address, so this adapter raises `PrivateRange` only for a host written
 * as one, as `sendAction` does, and leaves what a name resolves to to the platform. Which is
 * why the check belongs to the adapter and not to `@braindog/connect`: the self-host has to do the lookup itself, and
 * the caller cannot know which machine it is on. Two adapters, one port, one meaning.
 *
 * REDIRECTS ARE NOT FOLLOWED, A BODY IS COUNTED AS IT STREAMS, AND THE TIMEOUT IS THE CALLER'S.
 * None of the three is a flag `HttpInit` could turn off. A connector that followed a redirect would
 * be a connector whose destination the declaration does not fix, which is the one door the origin
 * check does not cover (`47 §8`).
 */

import { refusedHost } from '@braindog/host/actions';
import type { Http, HttpInit } from '@braindog/ports';

import type { Send } from './actions.ts';

/** What `textWithin` answers for a body past its cap. */
export const OVER = Symbol('over the cap');

/**
 * A request's body as text, counted as it streams and left unread past `most`.
 *
 * THE BYTES ARE READ HERE, BEFORE THE RUN'S COUNT OR ITS EGRESS IS ASKED, in the record's Worker and not the sandbox. A script
 * can hold a body as large as its own isolate allows and send it again and again, and `request.text()` took each whole.
 */
export async function textWithin(request: Request, most: number): Promise<string | typeof OVER> {
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out + decoder.decode();
    size += value.byteLength;
    if (size > most) {
      await reader.cancel().catch(() => undefined);
      return OVER;
    }
    out += decoder.decode(value, { stream: true });
  }
}

/** `47 §4.1`: the row and BLOB ceiling, and the cap the caller may not raise. */
const RESPONSE_BYTES = 2_000_000;

const fault = (name: 'PrivateRange' | 'TooLarge' | 'Timeout' | 'Network', say: string): Error => {
  const e = new Error(say);
  e.name = name;
  return e;
};

/**
 * The body, buffered, and refused the moment it passes the ceiling.
 *
 * COUNTED AS IT ARRIVES AND NOT READ OFF `Content-Length`, because a header is a claim: a provider
 * that says 900 bytes and sends nine hundred million has already spent the memory by the time
 * anybody compares the two. On a Worker that is the isolate, and the isolate is every tenant on it.
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

/** `send` is for tests, and for nothing else. */
export function httpFor(send: Send = (url, init) => fetch(url, init)): Http {
  return {
    fetch: async (url: URL, init: HttpInit): Promise<Response> => {
      /* Lint refuses a `base:` that is not `https://` and `resolveRequest` re-parses against it, so
         another scheme here is this repository's bug and is reported as one. */
      if (url.protocol !== 'https:')
        throw new Error(`A connector may only call https, and this asked for ${url.protocol}//.`);
      /* A HOST WRITTEN AS A PRIVATE OR LOCAL ADDRESS, the one thing a Worker can see for itself, as `sendAction` refuses it.
         This port went straight to `fetch`, so a connector named `https://169.254.169.254` was sent wherever the platform
         sends it. What a name resolves to is the platform's. */
      if (refusedHost(url) !== null) throw fault('PrivateRange', `${url.host} is a private or local address, so nothing was sent.`);

      const abort = new AbortController();
      const rang = setTimeout(() => { abort.abort(); }, init.timeoutMs);

      try {
        const res = await send(url, {
          method: init.method,
          headers: init.headers,
          redirect: 'manual',
          signal: abort.signal,
          ...(init.body === undefined ? {} : { body: init.body }),
        });
        return await withinCap(res);
      } catch (e) {
        if (abort.signal.aborted) throw fault('Timeout', `Nothing answered within ${init.timeoutMs} ms.`);
        if (e instanceof Error && e.name === 'TooLarge') throw e;
        throw fault('Network', e instanceof Error ? e.message : String(e));
      } finally {
        clearTimeout(rang);
      }
    },
  };
}
