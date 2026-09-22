/**
 * A person's script, run on the Cloud: in a Dynamic Worker the record's own object loads from `env.LOADER`.
 *
 * `loop/research-shell-scripts.md` section 3 and Brief 5. The record fires a `script.run` row, the kernel's pass hands
 * this file a `Scripted` (`packages/kernel/src/script-run.ts`), and what comes back is applied by `finishScript` in one
 * transaction. This file runs the source and answers; it writes nothing to any register.
 *
 * THE BOUNDARY IS THE ISOLATE, AND EVERY RULE IS ENFORCED ON THIS SIDE OF IT. The loaded Worker holds the prelude
 * (`@braindog/script`, the same text QuickJS evaluates on the self-host), the source, and two bindings. Its
 * `globalOutbound` is `ScriptOutbound`, so every `fetch` and `connect` it makes arrives here rather than at the
 * network, and `env.RECORD` is `ScriptRecord`. Both hold one prop, the record's object id, and call back into that
 * object, where `ScriptRuns` holds the run: its egress, its fetch count, its key labels and whether it has already
 * broken a rule. Nothing the script can rewrite (its `ctx`, the prelude, the module that calls it) decides anything.
 *
 * WHY THE RUN IS NOT IN THE GATEWAY'S PROPS. `env.LOADER.get` caches the loaded Worker by id, and the id is
 * `<record>:<script>:v<version>` because billing counts one unique Dynamic Worker per id per day, so the code, its
 * `env` and its `globalOutbound` are built once per version and reused by every later run. Props baked into those
 * stubs would be the first run's for ever. So the stubs carry only what is the same for every run (the object), and
 * the run id reaches the sandbox as the entrypoint's own props, which the module stamps on each request it makes.
 *
 * A BARE `fetch` IS REFUSED WHEREVER IT POINTS. It carries no run, so the gateway has nothing to check it against and
 * throws before anything is sent. That matches QuickJS, where `fetch` is not defined at all: a script that catches it
 * carries on, and one that does not is refused as its own throw. A request stamped with a run is checked exactly as
 * `runInQuickJs` checks `ctx.fetch` (origin, https only, no credentials in the URL, the count, the key label), and a
 * rule broken there is sticky: the run answers `refused` with no writes whatever the script did afterwards.
 *
 * THE SEND IS THE WORKER'S OWN `actionExecutor`, run inside the record's object: `sendAction` with the declared
 * origins, private addresses refused, same-origin redirects, ten seconds, two megabytes, and the key opened by
 * `keyOpener` under `KEK` for that one request and scrubbed from the answer. The sandbox names a key by its label and
 * never holds its bytes.
 *
 * MEASURED LOCALLY, September 22nd, workerd 1.20260903.1 through wrangler 4.129.0's miniflare (`test/script.test.ts`):
 * the loader works under `node --test`, `this.ctx.exports` works from a Durable Object's `alarm()`, and the flag the
 * research named, `enable_ctx_exports`, is not needed. workerd said so when it was passed: "The compatibility flag
 * enable_ctx_exports became the default as of 2025-11-17 so does not need to be specified anymore", and this record's
 * date is 2026-09-01. Local workerd also enforced no subrequest ceiling (ten fetches under `subRequests: 5` all went),
 * which is one reason the fetch count below is ours and not the platform's.
 */

import { WorkerEntrypoint } from 'cloudflare:workers';

import type { ActionRequest, Execute } from '@braindog/host/actions';
import type { ScriptReads } from '@braindog/host/script';
import type { ScriptAnswer, Scripted } from '@braindog/kernel';
import {
  checkDecl,
  isRefusal,
  LOG_BYTES,
  PRELUDE,
  type HostResponse,
  type Json,
  type ScriptDecl,
  type ScriptLimits,
  type ScriptRefusal,
  type ScriptWrite,
} from '@braindog/script';

/**
 * THE LOADED WORKER'S DATE IS THE RECORD'S OWN, `wrangler.jsonc`'s `compatibility_date`. A script tried in `script_try`
 * and run on a schedule must meet one runtime, and a Dynamic Worker on a different date is a different one.
 */
export const COMPATIBILITY_DATE = '2026-09-01';

/** The header the loaded module stamps its run on. A request without it is a bare `fetch`. */
export const RUN_HEADER = 'x-braindog-run';
/** The header `ctx.fetch` names its key label in. Stripped here; it never reaches the provider. */
export const KEY_HEADER = 'x-braindog-key';
/**
 * The header `ctx.fetch` carries the URL in as the script wrote it, URI-encoded because a header is Latin-1 and a URL
 * need not be. Read for the user name only (`ScriptRuns.answer` says why), and stripped like the other two.
 */
export const URL_HEADER = 'x-braindog-url';

/** A provider gets ten seconds and two megabytes, as a `call` does (`research-scheduled-actions` section 2.3). */
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

const BARE =
  'A script fetches through ctx.fetch only. A bare fetch goes nowhere on this host, whatever address it names.';

/* ── what crosses from the gateway to the record ────────────────────────────────────────────────── */

/** One call the sandbox made, as the record's object receives it. */
export type ScriptCall =
  | {
      op: 'fetch';
      /** The URL workerd is sending, which every check but the user name's reads. */
      url: string;
      /** The URL as the script wrote it, before workerd dropped its user info, or `null` when nothing said. */
      asked: string | null;
      method: string;
      headers: Record<string, string>;
      body: string | null;
      key: string | null;
    }
  | { op: 'list'; register: string; where: Json }
  | { op: 'get'; spoken: string };

/** The record's answer to one call: the value, or the sentence the script's promise is rejected with. */
export type ScriptReply = { ok: Json } | { error: string };

/** The record's object, as the gateway reaches it. `Record$.script` is this method. */
type Home = { script(run: string, call: ScriptCall): Promise<ScriptReply> };

/** The part of the Worker's env the two entrypoints read. */
type Wired = { RECORD: { idFromString(id: string): DurableObjectId; get(id: DurableObjectId): Home } };

/** What both entrypoints are handed: the object a run lives in, and nothing else, for the reason at the top. */
type Linked = { object: string };

const home = (env: Wired, props: Linked): Home => env.RECORD.get(env.RECORD.idFromString(props.object));

/**
 * The loaded Worker's `globalOutbound`: every `fetch` the sandbox makes arrives here.
 *
 * THE ANSWER IS AN ENVELOPE, NOT THE PROVIDER'S RESPONSE. The prelude reads `{ status, headers, body }` as JSON on both
 * hosts, and a `Response` cannot carry every status a provider sends (the constructor refuses anything under 200), so
 * the provider's answer rides inside a 200.
 */
export class ScriptOutbound extends WorkerEntrypoint<Wired, Linked> {
  override async fetch(request: Request): Promise<Response> {
    const run = request.headers.get(RUN_HEADER);
    if (run === null) throw new Error(BARE);
    const headers: Record<string, string> = {};
    for (const [name, value] of request.headers) if (name !== RUN_HEADER && name !== KEY_HEADER && name !== URL_HEADER) headers[name] = value;
    const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.text();
    const stamped = request.headers.get(URL_HEADER);
    let asked: string | null = null;
    try {
      asked = stamped === null ? null : decodeURIComponent(stamped);
    } catch {
      /* A STAMP THAT DOES NOT DECODE WAS NOT WRITTEN BY THE MODULE BELOW, which encodes every one; the request is judged
         on the URL being sent, as if nothing had been said. */
    }
    const reply = await home(this.env, this.ctx.props).script(run, {
      op: 'fetch',
      url: request.url,
      asked,
      method: request.method,
      headers,
      body,
      key: request.headers.get(KEY_HEADER),
    });
    if ('error' in reply) throw new Error(reply.error);
    return Response.json(reply.ok);
  }
}

/** The loaded Worker's `env.RECORD`: `ctx.record.list` and `ctx.record.get`, answered by the record's object. */
export class ScriptRecord extends WorkerEntrypoint<Wired, Linked> {
  async list(run: string, register: string, where: string): Promise<string> {
    const reply = await home(this.env, this.ctx.props).script(run, { op: 'list', register, where: JSON.parse(where) as Json });
    if ('error' in reply) throw new Error(reply.error);
    return JSON.stringify(reply.ok);
  }

  async get(run: string, spoken: string): Promise<string> {
    const reply = await home(this.env, this.ctx.props).script(run, { op: 'get', spoken });
    if ('error' in reply) throw new Error(reply.error);
    return JSON.stringify(reply.ok);
  }
}

/* ── the run, held by the record's object ───────────────────────────────────────────────────────── */

/**
 * Live reads for one run, already scoped to its `reads` and signed as its actor: `scriptReads` in `@braindog/host/script`,
 * which the self-host builds its reads from too, so the two hosts hand a script the same rows with the same fields off.
 */
export type { ScriptReads };

type Turn = {
  decl: ScriptDecl;
  limits: ScriptLimits;
  job: string;
  send: Execute;
  grant: (label: string) => { id: string; label: string } | null;
  read: ScriptReads | undefined;
  fetches: number;
  bytes: number;
  stop: ScriptRefusal | null;
};

const utf8 = new TextEncoder();

/**
 * The runs in flight in one record's object, and the rules each is held to.
 *
 * ONE PER OBJECT, IN MEMORY, AND THAT IS ENOUGH. A run starts and finishes inside one `runScript` call, which awaits
 * it, so the object is alive for as long as any of its runs is. An id that is not open (finished, timed out, or never
 * issued) answers with a refusal and sends nothing.
 */
export class ScriptRuns {
  readonly #turns = new Map<string, Turn>();

  /** How many runs are open. A test's witness that a run is closed behind it. */
  get size(): number {
    return this.#turns.size;
  }

  open(turn: Omit<Turn, 'fetches' | 'bytes' | 'stop'>): string {
    const id = crypto.randomUUID();
    this.#turns.set(id, { ...turn, fetches: 0, bytes: 0, stop: null });
    return id;
  }

  close(id: string): Turn | undefined {
    const turn = this.#turns.get(id);
    this.#turns.delete(id);
    return turn;
  }

  async answer(run: string, call: ScriptCall): Promise<ScriptReply> {
    const turn = this.#turns.get(run);
    if (turn === undefined) return { error: 'This run is over, so nothing was sent.' };
    /* A RULE BROKEN ONCE STAYS BROKEN. The script may have caught the first refusal; nothing after it is sent. */
    if (turn.stop !== null) return { error: turn.stop.why };
    const refuse = (refusal: ScriptRefusal): ScriptReply => {
      turn.stop ??= refusal;
      return { error: refusal.why };
    };
    const { decl } = turn;

    if (call.op === 'list') {
      if (!decl.reads.includes(call.register) || turn.read === undefined)
        return refuse({ code: 'FORBIDDEN', why: `${decl.id} read ${call.register}, which is not in its reads.` });
      return { ok: await turn.read.list(call.register, call.where) };
    }
    if (call.op === 'get') {
      /* THE REGISTER OF A SPOKEN ID IS THE RECORD'S TO RESOLVE, as in `runInQuickJs`: the reads that `turn.read` was
         built with are what keeps a `get` inside them. What this can hold is that a script reading nothing reads nothing. */
      if (decl.reads.length === 0 || turn.read === undefined)
        return refuse({ code: 'FORBIDDEN', why: `${decl.id} read ${call.spoken} and declares no reads.` });
      return { ok: await turn.read.get(call.spoken) };
    }

    let url: URL;
    try {
      url = new URL(call.url);
    } catch {
      return refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched ${JSON.stringify(call.url)}, which is not a URL.` });
    }
    /* THE SAME FOUR CHECKS AS `runInQuickJs`, IN ITS ORDER, so one script meets one set of rules on either host.

       THE USER NAME IS READ OFF THE URL THE SCRIPT WROTE, AND EVERYTHING ELSE OFF THE URL BEING SENT. workerd's `fetch`
       inside the loaded Worker drops `me:pw@` before the request reaches this gateway (measured by the checker on
       September 22nd: `https://me:pw@<declared origin>/rate` arrived bare, with no authorization header, and was sent),
       so a check on `call.url` alone never fired, and a run the self-host refuses ran clean here. `call.asked` is the
       URL the loaded module stamped before calling `fetch`. That module runs where the script can reach it, which is
       why the stamp decides nothing else: a script that swaps `globalThis.fetch` keeps the stamp and sends elsewhere,
       and the origin below is still the one the request is going to (`test/script.test.ts` holds both). A stamp
       stripped or forged to hide user info hides credentials workerd drops anyway. */
    let written: URL = url;
    try {
      if (call.asked !== null) written = new URL(call.asked);
    } catch {
      /* NOT A URL AS WRITTEN IS NOT THIS CHECK'S QUESTION: workerd parsed something and is sending it, and that is
         judged below as it arrived. */
    }
    if (!decl.egress.includes(url.origin))
      return refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched ${url.origin}, which is not in its egress.` });
    if (url.protocol !== 'https:')
      return refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched a ${url.protocol} URL; a script fetches plain https:// URLs only.` });
    if (url.username !== '' || url.password !== '' || written.username !== '' || written.password !== '')
      return refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched ${url.origin} with a user name or password in the URL, which a script may not send.` });
    if (turn.fetches >= turn.limits.fetches)
      return refuse({ code: 'OUT_OF_BOUNDS', why: `${decl.id} made more than its ${turn.limits.fetches} fetches.` });
    if (call.key !== null && !decl.keys.includes(call.key))
      return refuse({ code: 'FORBIDDEN', why: `${decl.id} asked for the key ${JSON.stringify(call.key)}, which it does not declare.` });

    /* A DECLARED KEY THAT IS NOT IN THE VAULT IS THE HOST FAILING, NOT A RULE BROKEN. Accept checked it was there; if
       it was revoked since, the script gets an error it may catch, and nothing is sent without it. */
    const grant = call.key === null ? null : turn.grant(call.key);
    if (call.key !== null && grant === null) return { error: `The key "${call.key}" is not in the vault any more, so nothing was sent.` };

    turn.fetches += 1;
    const method = call.method.toUpperCase();
    const sent = await turn.send({
      job: `${turn.job}:${turn.fetches}`,
      /* `call` FOR ANYTHING BUT A READ, so `idempotentCalls` stamps a POST with a key that is the same on a retry of
         this job and different for the next fetch in it. */
      channel: method === 'GET' ? 'pull' : 'call',
      ingest: decl.id,
      /* ANY METHOD, AS WRITTEN, as `@braindog/host/script` sends it on the self-host. `ActionRequest` says GET or POST
         because that is all a declaration can say, and `sendAction` sends whatever it is given. This was
         `method === 'GET' ? 'GET' : 'POST'`, which sent a script's DELETE to a provider as a POST. */
      method: method as ActionRequest['method'],
      url: url.href,
      origin: url.origin,
      headers: call.headers,
      ...(call.body === null ? {} : { body: call.body }),
      grant,
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
    });
    if ('refused' in sent) return { error: sent.refused.fix };
    if ('held' in sent && sent.held) return { error: sent.held.say };
    turn.bytes += utf8.encode(sent.body).length;
    /* NO RESPONSE HEADERS, BECAUSE `sendAction` KEEPS NONE. A header is where a provider could echo the key back, and
       the executor scrubs only the body, so an empty map is the honest answer rather than an unscrubbed one. */
    const response: HostResponse = { status: sent.status, headers: {}, body: sent.body };
    return { ok: response };
  }
}

/* ── the loaded module ──────────────────────────────────────────────────────────────────────────── */

/**
 * The main module of every loaded Worker: the prelude, the host functions it is built from, and the call.
 *
 * NOTHING HERE IS A CHECK, for the reason the prelude gives: it runs where the script can reach it. It collects the
 * writes and the log and hands them back, and `runScript` checks them again. `import *` and not a default import,
 * because a source with no default export would otherwise fail to link and look like the platform failing.
 */
const MAIN = `import { WorkerEntrypoint } from 'cloudflare:workers';
import * as source from './script.js';

const prelude = ${PRELUDE};

export default class extends WorkerEntrypoint {
  async run(meta) {
    const run = this.ctx.props.run;
    const record = this.env.RECORD;
    const writes = [];
    const lines = [];
    const host = {
      fetch: async (asked) => {
        const { url, init } = JSON.parse(asked);
        const given = init === null || typeof init !== 'object' ? {} : init;
        const headers = new Headers();
        if (given.headers !== null && typeof given.headers === 'object')
          for (const [name, value] of Object.entries(given.headers)) headers.set(name, String(value));
        headers.set('${RUN_HEADER}', run);
        headers.set('${URL_HEADER}', encodeURIComponent(String(url)));
        if (typeof given.key === 'string') headers.set('${KEY_HEADER}', given.key);
        const method = typeof given.method === 'string' ? given.method.toUpperCase() : 'GET';
        const body = typeof given.body === 'string' && method !== 'GET' && method !== 'HEAD' ? given.body : undefined;
        const r = await fetch(url, { method, headers, body });
        return r.text();
      },
      write: (register, fields) => { writes.push({ op: 'create', register, fields: JSON.parse(fields) }); },
      update: (spoken, patch, version) => { writes.push({ op: 'update', spoken, patch: JSON.parse(patch), version }); },
      log: (words) => { lines.push(words); },
      list: (register, where) => record.list(run, register, where),
      get: (spoken) => record.get(run, spoken),
    };
    if (typeof source.default !== 'function') return { invalid: true, log: '' };
    const ctx = prelude(host)(meta);
    try {
      await source.default(ctx);
    } catch (e) {
      return { threw: e instanceof Error ? e.message : String(e), log: lines.join('\\n') };
    }
    return { writes, log: lines.join('\\n') };
  }
}
`;

/** What the loaded module's `run` answers, before anything here has believed it. */
type Handed = { writes?: unknown; log?: unknown; threw?: unknown; invalid?: unknown };

/* ── one run ────────────────────────────────────────────────────────────────────────────────────── */

/** The loopback bindings `ctx.exports` makes of the two entrypoints above. */
export type ScriptExports = {
  ScriptOutbound(options: { props: Linked }): Fetcher;
  ScriptRecord(options: { props: Linked }): Fetcher;
};

/** What `runScript` needs from the record's object. */
export type ScriptWiring = {
  loader: WorkerLoader;
  exports: ScriptExports;
  /** This object's own id, `ctx.id.toString()`, which is how the gateway finds its way back. */
  object: string;
  runs: ScriptRuns;
  /** The executor for one run's declared origins: `actionExecutor` with this record's `keyOpener`. */
  send: (egress: readonly string[]) => Execute;
  /** A vault label to the grant a send opens, or `null` when the vault holds no such key. The row, never its bytes. */
  grant: (label: string) => { id: string; label: string } | null;
  /** Live reads, scoped to a run's `reads` and signed as its actor. Absent: `ctx.record` refuses. */
  read?: ((scripted: Scripted) => ScriptReads) | ScriptReads | undefined;
  now: () => number;
};

const cut = (text: string): string => {
  const bytes = utf8.encode(text);
  return bytes.length <= LOG_BYTES ? text : new TextDecoder().decode(bytes.slice(0, LOG_BYTES)).replace(/�$/u, '');
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** An update's version as the kernel reads it: a whole number, or none at all (absent, `null` or `NaN`), never anything else. */
const lastWriterOrWhole = (v: unknown): boolean => v === undefined || v === null || Number.isNaN(v) || Number.isInteger(v);

/**
 * The writes the loaded Worker handed back, checked as `runInQuickJs` checks them as they are queued: each one a
 * create into a register in `writes` or an update with a whole version or none, and no more than `limits.writes`. The
 * kernel checks the register again when it applies them (`finishScript`), on purpose.
 */
function checkWrites(decl: ScriptDecl, limits: ScriptLimits, handed: unknown): ScriptWrite[] | ScriptRefusal {
  if (!Array.isArray(handed)) return { code: 'DECLARATION_INVALID', why: `${decl.id} handed back something that is not a list of writes.` };
  if (handed.length > limits.writes) return { code: 'OUT_OF_BOUNDS', why: `${decl.id} queued more than its ${limits.writes} writes.` };
  const writes: ScriptWrite[] = [];
  for (const w of handed as unknown[]) {
    if (isObject(w) && w['op'] === 'create' && typeof w['register'] === 'string') {
      if (!decl.writes.includes(w['register'])) return { code: 'FORBIDDEN', why: `${decl.id} wrote to ${w['register']}, which is not in its writes.` };
      writes.push({ op: 'create', register: w['register'], fields: (w['fields'] ?? null) as Json });
    } else if (isObject(w) && w['op'] === 'update' && typeof w['spoken'] === 'string' && lastWriterOrWhole(w['version'])) {
      /* NO VERSION IS HANDED ON AS NONE (`NaN`), which `finishScript` writes as last-writer, as the self-host does. The
         prelude sends `NaN` for `ctx.update(spoken, patch)`, and asking for a whole number here refused it. */
      const version = w['version'];
      writes.push({ op: 'update', spoken: w['spoken'], patch: (w['patch'] ?? null) as Json, version: Number.isInteger(version) ? (version as number) : NaN });
    } else return { code: 'DECLARATION_INVALID', why: `${decl.id} handed back a write this host cannot read.` };
  }
  return writes;
}

/**
 * One run of one script, in a Dynamic Worker, answered in `@braindog/script`'s shape.
 *
 * `cpu_ms` IS REPORTED AS 0 AND IS NOT FREE. The platform holds the loaded Worker to `limits.cpu_ms` (`cpuMs` on the
 * code) and ends it past that, but says nowhere this host can read at run time how much it spent. The ledger meters
 * wall time (`research-shell-scripts` section 6), and this is the number that stays honest until it meters CPU.
 *
 * NO `subRequests` ON THE CODE. The fetch count is `ScriptRuns`', exact and sticky; whether the platform would also
 * count the `env.RECORD` calls as subrequests is not something local workerd can say, and a platform limit that
 * counted them would refuse a script for reading.
 *
 * A LOADER THAT THROWS BEFORE THE RUN STARTS IS THE HOST, and is thrown on to `runActions`, which records `unrun:
 * failed` and does not count it against the script. A run that starts and then rejects (its CPU limit, a source that
 * does not parse) is the script's, and is refused.
 */
export async function runScript(wiring: ScriptWiring, s: Scripted): Promise<ScriptAnswer> {
  const started = wiring.now();
  const { script, version, decl, record, input } = s.scripted;
  const full: ScriptDecl = { id: script, version, ...decl };
  const usage = (turn?: Turn) => ({ fetches: turn?.fetches ?? 0, bytes: turn?.bytes ?? 0, wall_ms: Math.max(0, wiring.now() - started), cpu_ms: 0 });

  const limits = checkDecl(full);
  if (isRefusal(limits)) return { refused: limits, log: '', usage: usage() };

  const read = typeof wiring.read === 'function' ? wiring.read(s) : wiring.read;
  const run = wiring.runs.open({ decl: full, limits, job: s.job.id, send: wiring.send(decl.egress), grant: wiring.grant, read });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const worker = wiring.loader.get(`${record.id}:${script}:v${version}`, () => ({
      compatibilityDate: COMPATIBILITY_DATE,
      mainModule: 'main.js',
      modules: { 'main.js': MAIN, 'script.js': decl.source },
      env: { RECORD: wiring.exports.ScriptRecord({ props: { object: wiring.object } }) },
      globalOutbound: wiring.exports.ScriptOutbound({ props: { object: wiring.object } }),
      limits: { cpuMs: limits.cpu_ms },
    }));
    const entry = worker.getEntrypoint(undefined, { props: { run } }) as unknown as { run(meta: Json): Promise<Handed> };
    const meta: Json = { input: (input ?? null) as Json, now: new Date(started).toISOString(), tz: record.tz };

    /* THE DEADLINE IS RACED, NOT ASKED OF THE SANDBOX. A script awaiting a slow provider is not spending CPU, so
       `cpuMs` never ends it; this does, and the run is closed below so whatever it asks for afterwards is refused. */
    const late = new Promise<'late'>((resolve) => {
      timer = setTimeout(() => resolve('late'), limits.wall_ms);
    });
    const outcome = await Promise.race([
      entry.run(meta).then(
        (handed) => ({ handed }),
        (e: unknown) => ({ failed: e instanceof Error ? e.message : String(e) }),
      ),
      late,
    ]);
    const turn = wiring.runs.close(run);
    const spent = usage(turn);

    if (outcome === 'late') return { refused: { code: 'OUT_OF_BOUNDS', why: `${script} ran past its wall_ms of ${limits.wall_ms}.` }, log: '', usage: spent };
    if ('failed' in outcome) return { refused: turn?.stop ?? { code: null, why: `${script} stopped: ${outcome.failed}` }, log: '', usage: spent };

    const handed = isObject(outcome.handed) ? (outcome.handed as Handed) : {};
    const log = cut(typeof handed.log === 'string' ? handed.log : '');
    /* A BROKEN RULE OUTRANKS EVERYTHING THE SCRIPT SAID AFTER IT, including a clean return. */
    if (turn?.stop) return { refused: turn.stop, log, usage: spent };
    if (handed.invalid === true) return { refused: { code: 'DECLARATION_INVALID', why: `${script}'s source has no default export that is a function.` }, log, usage: spent };
    if (typeof handed.threw === 'string') return { refused: { code: null, why: `${script} threw: ${handed.threw}` }, log, usage: spent };
    const writes = checkWrites(full, limits, handed.writes);
    if (!Array.isArray(writes)) return { refused: writes, log, usage: spent };
    return { writes, log, usage: spent };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    wiring.runs.close(run);
  }
}
