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

import type { SparkFormInput, SparkModel, SparkModelInput } from '@braindog/record';

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
  'Tone is settings too: the words the speaking use case declares are in usage.tone.settings (voice_* lines, label_* words), and only those names may be set, as {"pack":"<usage.tone.pack>","values":{"label_tickets":"Issues"}}, with the reason drawn from how the record is used.',
  'Never name a figure that is not in the reading. Write plainly and warmly, with no dashes used as punctuation. If nothing would help, answer {"drafts":[]}.',
].join('\n');

/**
 * What the model is told when it forms a first plan (`SparkModel.form`). It is handed only the sentence the owner typed, what
 * the plan is, today, and each list's limits; the answer is checked row by row (`formedRows`) and filed on Decide, never written.
 */
export const SPARK_PLAN_INSTRUCTIONS = [
  'You are Spark, the manager of one BrainDog. Its owner has just said what they are starting, in `said`. Form a first plan for it, in the lists given in `lists`, which the owner reads on Decide before anything is made.',
  '`what` says what the plan is. Each list gives its register, the least and most rows, and the fields a row may have: {"text":n} is text of at most n characters, {"one":[...]} is one of those values, {"link":"<register>"} is the position from 0 of a row of that list in your plan, and {"days":n} is a whole number of days from today, at most n. A field marked required must be given. Give no other field and no other list.',
  'Answer only JSON: {"plan":{"<register>":[{"<field>":...}]}}, with the lists in the order given, so a link points at a row already listed.',
  'Make it specific to what was said: concrete, small steps a person can take this week, milestones in the order they are reached, the real choices this kind of project faces, and the kinds of help worth finding.',
  'Never write a web address, an email address, a price you were not told, a name of a real person, or anything that looks like a key or a password. Write plainly and warmly, in short sentences, with no dashes used as punctuation.',
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
  /* ONE REQUEST SHAPE FOR BOTH ASKS: what differs is what the model is told and what it is handed. */
  const ask = async (instructions: string, input: unknown): Promise<unknown> => {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    const key = options.key ? await options.key() : null;
    if (key) headers.authorization = `Bearer ${key}`;
    const body = JSON.stringify({
      ...(options.model ? { model: options.model } : {}),
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });
    const res = await options.send(url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? SPARK_TIMEOUT_MS) });
    /* THE STATUS AND NOTHING ELSE. An error body can echo the request, and the request can carry the key. */
    if (!res.ok) throw new Error(`The Spark endpoint answered ${res.status}.`);
    const text = await res.text();
    if (text.length > ANSWER_BYTES) throw new Error('The Spark endpoint answered more than Spark reads.');
    return answerOf(text);
  };
  return {
    name: options.name ?? 'endpoint',
    draft: (input: SparkModelInput): Promise<unknown> => ask(SPARK_INSTRUCTIONS, input),
    form: (input: SparkFormInput): Promise<unknown> => ask(SPARK_PLAN_INSTRUCTIONS, input),
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

/* ── the model a host hands the record, on both hosts ─────────────────────── */

/** The vault label a person's own model key is kept under, on the self-host and on the Worker alike. */
export const SPARK_KEY_LABEL = 'spark';

export type SparkHostConfig = {
  url: string;
  model?: string | undefined;
  /** An operator's key, which only a self-host has. Absent, the person's own key in the vault, labelled `spark`. */
  key?: string | undefined;
};

export type SparkHostDeps = {
  /** The record's vault rows, read on each call so a key put in or revoked after boot counts. */
  grants: () => readonly { id: string; label: string; revoked_at: string | null }[];
  /** How this host opens a sealed key, or `null` when it cannot open any (a Worker with no `KEK` bound). */
  openKey: ((grant: { id: string; label: string }) => Promise<string | null>) | null;
  send: (input: URL, init: RequestInit) => Promise<Response>;
};

/**
 * THE SAME PORT ON BOTH HOSTS. `SPARK_ENDPOINT` names the address and `SPARK_MODEL` the model; the key is the operator's
 * `SPARK_KEY` where a self-host set one, else the person's own key in the vault under `spark`, opened on each call through the
 * host's key store (one `grant.read` event each time) and dropped when the call returns.
 *
 * NO MODEL WHEN NO KEY COULD EVER BE HAD: nothing configured, or no operator key and a host that cannot open the vault. Then
 * `/api/version` says `spark: false` and Spark's own rules draft, which is the product working.
 */
export function sparkFromEnv(env: Readonly<Record<string, unknown>>, options: { operatorKey?: boolean } = {}): SparkHostConfig | undefined {
  const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  const url = text(env.SPARK_ENDPOINT);
  if (!url) return undefined;
  const key = options.operatorKey === false || typeof env.SPARK_KEY !== 'string' || env.SPARK_KEY === '' ? undefined : env.SPARK_KEY;
  return { url, model: text(env.SPARK_MODEL), key };
}

export function sparkModelOf(config: SparkHostConfig | undefined, deps: SparkHostDeps): SparkModel | undefined {
  if (!config) return undefined;
  if (config.key === undefined && deps.openKey === null) return undefined;
  const open = deps.openKey;
  const own = async (): Promise<string | null> => {
    const grant = deps.grants().find((g) => g.label === SPARK_KEY_LABEL && g.revoked_at === null);
    return grant && open ? open(grant) : null;
  };
  return endpointModel({
    url: config.url,
    model: config.model,
    key: config.key !== undefined ? async () => config.key ?? null : own,
    send: deps.send,
    name: 'endpoint',
  });
}
