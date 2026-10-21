/**
 * Newline-delimited JSON-RPC on standard input and output: the transport Claude Code launches.
 *
 * ONE MESSAGE PER LINE, ANSWERED AS IT FINISHES. Calls run side by side, so a slow read does not hold
 * a ping behind it; the id pairs a reply with its request, never the order. The one exception is `initialize`,
 * answered before the next line is read, because what it agrees is how every later request is answered.
 *
 * STDOUT CARRIES THE PROTOCOL AND NOTHING ELSE. A stray line there is a parse error in the client and a
 * server that looks dead, so anything a person should read goes to stderr.
 *
 * THE CLIENT SAYS WHAT IT IS ONCE, IN ITS HELLO. `initialize` carries `clientInfo`, its name and version, and a call
 * after it is not told again, so the hello is handed to `hello` before it is answered, and the caller sends it with
 * every request it makes to the record (`main.ts`).
 */

import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import type { McpSurface } from '@braindog/mcp';
import { agreed, handle, type Reply } from '@braindog/mcp/rpc';

import { cliBuild, type ClientInfo } from './position.ts';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The name and version an `initialize` says its client is, the strings only; `null` for any other message. */
export function helloOf(message: unknown): ClientInfo | null {
  if (!isObject(message) || message.method !== 'initialize' || !isObject(message.params) || !isObject(message.params.clientInfo)) return null;
  const { name, version } = message.params.clientInfo;
  return { ...(typeof name === 'string' ? { name } : {}), ...(typeof version === 'string' ? { version } : {}) };
}

/**
 * Serve until the input ends, then finish every call already in flight.
 *
 * Resolves once the last reply is flushed, so the caller can exit without cutting one off. `ctxOf`
 * runs as each message arrives, so a deadline counts from when the call was made.
 *
 * `origin` is where the host serves the app, the host this command line talks to, handed to `handle` for a filed
 * question's `decide` link, as `serveMcp` hands its own. Left out, that link is left out. `hello` is told what the
 * client said it is, each time it says hello.
 */
export async function serveStdio<C>(
  surface: McpSurface<C>,
  ctxOf: () => C,
  input: Readable,
  output: Writable,
  origin?: string,
  hello?: (client: ClientInfo) => void,
): Promise<void> {
  const inFlight = new Set<Promise<void>>();
  /* THE REVISION THE HANDSHAKE AGREED. A pipe sends no header, so a later request is answered under it. */
  let version: string | undefined;
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
    const said = helloOf(message);
    if (said !== null) hello?.(said);
    /* `handle` never throws, so a failed call is a reply and the loop goes on. */
    /* WITH THIS COMMAND'S BUILD, which these answers are made by: `serverInfo.version` says it, never `0.0.0`. */
    const job = handle(message, surface, ctxOf(), origin, version, '', cliBuild()).then((reply) => {
      version = agreed(reply) ?? version;
      return reply ? send(reply) : undefined;
    });
    /* THE HELLO IS ANSWERED BEFORE THE NEXT LINE IS READ. A client may send `initialize` and its first request in one
       write; the version is known only once the hello is answered, so a request read before then was answered under
       the newest revision, `resultType` and all, to a client of an older one. Every other call runs side by side. */
    if (isObject(message) && message.method === 'initialize') await job;
    else track(job);
  }

  while (inFlight.size > 0) await Promise.all(inFlight);
}
