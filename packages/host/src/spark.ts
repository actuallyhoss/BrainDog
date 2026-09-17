/**
 * A model for Spark at an endpoint: the adapter a host builds behind `@braindog/record`'s `SparkModel` port.
 *
 * THE RECORD NEVER SEES THE ADDRESS OR THE KEY. It is handed an object with a name and `draft()`. The key is asked for on each
 * call (`key()`), from the host's environment or from the person's own key in the record's vault, and dropped when the call
 * returns: it is never kept in a variable here, logged, thrown or put in what the model is sent.
 *
 * ONE SHAPE ON THE WIRE, the chat-completions request most endpoints speak (a self-hosted server, a gateway, a provider),
 * asked for a JSON object. What comes back is only text to the record: `fromModel` checks it, and `propose` checks it again.
 *
 * NO RUNTIME HERE, like `actions.ts`: no bare `fetch`, so both hosts import it and pass their own `send`.
 */

import type { SparkModel, SparkModelInput } from '@braindog/record';

/** How long a draft may take before Spark's own rules speak instead. */
export const SPARK_TIMEOUT_MS = 30_000;

/** At most this much of an answer is read. Three proposals are a few kilobytes. */
const ANSWER_BYTES = 64_000;

/** What the model is told. Data, so it can be read and reviewed in one place. */
export const SPARK_INSTRUCTIONS = [
  'You are Spark, the manager of one BrainDog: a record a person keeps, arranged as lists, pages, packs and a voice.',
  'You are given how the record is used: which lists grow, which pages are opened, what nothing has touched, what agents write, and what the host offers to install.',
  'Propose at most `most` changes that would make this BrainDog fit how it is really used. Each is one question the owner answers on Decide, with the reason in the question.',
  'Answer only JSON: {"drafts":[{"question":"...","body_kind":"pack"|"settings"|"arrange","body":{...}}]}. The rules\' drafts show the body shapes.',
  'pack bodies: {"install":"<offered id>"}, {"enable":"<id>"}, {"disable":"<id>"}. settings: {"pack":"<id>","values":{...}} or {"voice":{"home":"..."}}. arrange: {"why":["..."],"usecase"?,"packs"?,"pages"?,"settings"?,"voice"?}.',
  'Never name a figure that is not in the reading. Write plainly and warmly, with no dashes used as punctuation. If nothing would help, answer {"drafts":[]}.',
].join('\n');

export type EndpointModelOptions = {
  /** The chat-completions address, such as `http://localhost:11434/v1/chat/completions`. */
  url: string;
  /** The model name the endpoint expects, when it expects one. */
  model?: string | undefined;
  /** The key for this call, or `null` for none. Asked for on every call and never kept. */
  key?: (() => Promise<string | null>) | undefined;
  /** How a request leaves this host: `fetch` on both hosts, a fake in tests. */
  send: (input: URL, init: RequestInit) => Promise<Response>;
  /** What the Spark page says drafted: `endpoint`, or `your key`. */
  name?: string | undefined;
  timeoutMs?: number | undefined;
};

/** A `SparkModel` over a chat-completions endpoint. Every failure is a throw, which the record reads as "the rules speak". */
export function endpointModel(options: EndpointModelOptions): SparkModel {
  const url = new URL(options.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('A Spark endpoint is an http or https address.');
  return {
    name: options.name ?? 'endpoint',
    async draft(input: SparkModelInput): Promise<unknown> {
      const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
      const key = options.key ? await options.key() : null;
      if (key) headers.authorization = `Bearer ${key}`;
      const body = JSON.stringify({
        ...(options.model ? { model: options.model } : {}),
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SPARK_INSTRUCTIONS },
          { role: 'user', content: JSON.stringify(input) },
        ],
      });
      const res = await options.send(url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? SPARK_TIMEOUT_MS) });
      /* THE STATUS AND NOTHING ELSE. An error body can echo the request, and the request can carry the key. */
      if (!res.ok) throw new Error(`The Spark endpoint answered ${res.status}.`);
      const text = await res.text();
      if (text.length > ANSWER_BYTES) throw new Error('The Spark endpoint answered more than Spark reads.');
      return answerOf(text);
    },
  };
}

/** The drafts in an answer: a chat completion's message content as JSON, or a JSON body that is the drafts itself. */
export function answerOf(text: string): unknown {
  const parsed = JSON.parse(text) as { choices?: { message?: { content?: unknown } }[] };
  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return parsed;
  /* A MODEL THAT FENCES ITS JSON is read inside the fence. */
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(content);
  return JSON.parse(fenced ? fenced[1]! : content);
}
