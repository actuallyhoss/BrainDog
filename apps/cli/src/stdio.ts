/**
 * Newline-delimited JSON-RPC on standard input and output: the transport Claude Code launches.
 *
 * ONE MESSAGE PER LINE, ANSWERED AS IT FINISHES. Calls run side by side, so a slow read does not hold
 * a ping behind it; the id pairs a reply with its request, never the order.
 *
 * STDOUT CARRIES THE PROTOCOL AND NOTHING ELSE. A stray line there is a parse error in the client and a
 * server that looks dead, so anything a person should read goes to stderr.
 */

import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import type { McpSurface } from '@braindog/mcp';
import { handle, type Reply } from '@braindog/mcp/rpc';

/**
 * Serve until the input ends, then finish every call already in flight.
 *
 * Resolves once the last reply is flushed, so the caller can exit without cutting one off. `ctxOf`
 * runs as each message arrives, so a deadline counts from when the call was made.
 *
 * `origin` is where the host serves the app, the host this command line talks to, handed to `handle` for a filed
 * question's `decide` link (`loop/finish/contracts.md` §6.3), as `serveMcp` hands its own. Left out, that link is left out.
 */
export async function serveStdio<C>(
  surface: McpSurface<C>,
  ctxOf: () => C,
  input: Readable,
  output: Writable,
  origin?: string,
): Promise<void> {
  const inFlight = new Set<Promise<void>>();
  /* Settled by the write's own callback, which is what makes "flushed" true on a Windows pipe, where
     a write is asynchronous. */
  const send = (reply: Reply) => new Promise<void>((done) => output.write(`${JSON.stringify(reply)}\n`, () => done()));
  const track = (job: Promise<void>) => {
    inFlight.add(job);
    void job.finally(() => inFlight.delete(job));
  };

  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      /* JSON-RPC's parse error. The number is a variable so that every `code` key written in this
         repository is a refusal code, which is what the refusals gate reads. */
      const code = -32700;
      track(send({ jsonrpc: '2.0', id: null, error: { code, message: 'This line is not JSON. Send one JSON-RPC message per line.' } }));
      continue;
    }
    /* `handle` never throws, so a failed call is a reply and the loop goes on. */
    track(handle(message, surface, ctxOf(), origin).then((reply) => (reply ? send(reply) : undefined)));
  }

  while (inFlight.size > 0) await Promise.all(inFlight);
}
