/**
 * A person's script, run on the Cloud: in a Dynamic Worker the record's own object loads from `env.LOADER`.
 *
 * The record fires a `script.run` row, the kernel's pass hands this file a `Scripted`
 * (`packages/kernel/src/script-run.ts`), and what comes back is applied by `finishScript` in one transaction. This file runs the source and answers; it writes nothing to any register.
 *
 * THE BOUNDARY IS THE ISOLATE, AND EVERY RULE IS ENFORCED ON THIS SIDE OF IT. The loaded Worker holds the prelude
 * (`@braindog/script`, the same text QuickJS evaluates on the self-host), the source, and two bindings. Its
 * `globalOutbound` is `ScriptOutbound`, so every `fetch` and `connect` it makes arrives here rather than at the
 * network, and `env.RECORD` is `ScriptRecord`. Both hold one prop, the record's object id, and call back into that
 * object, where `ScriptRuns` holds the run: its egress, its fetch count, its key labels and whether it has already
 * broken a rule. Nothing the script can rewrite (its `ctx`, the prelude, the module that calls it) decides anything.
 *
 * WHY THE RUN IS NOT IN THE GATEWAY'S PROPS. The loaded Worker was cached by `env.LOADER.get` under
 * `<record>:<script>:v<version>` and reused by every later run, so props baked into its stubs would have been the first
 * run's for ever. Every run now gets a Worker of its own from `env.LOADER.load` (`runScript` says why), and the run id
 * still reaches the sandbox as the entrypoint's own props, which the module stamps on each request it makes: the stubs
 * carry only what is the same for every run (the object), so going back to a cache would not reopen that hole.
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
 * MEASURED LOCALLY, workerd 1.20260903.1 through wrangler 4.129.0's miniflare (`test/script.test.ts`):
 * the loader works under `node --test`, `this.ctx.exports` works from a Durable Object's `alarm()`, and the flag the
 * design first named, `enable_ctx_exports`, is not needed. workerd said so when it was passed: "The compatibility flag
 * enable_ctx_exports became the default as of 2025-11-17 so does not need to be specified anymore", and this record's
 * date is 2026-09-01. Local workerd also enforced no subrequest ceiling (ten fetches under `subRequests: 5` all went),
 * which is one reason the fetch count below is ours and not the platform's.
 */

import { WorkerEntrypoint } from 'cloudflare:workers';

import type { ActionRequest, Execute, OpenKey } from '@braindog/host/actions';
import { addressed, addressSecrets, CYCLE_CHARS, keyRefused, scriptCycle, scriptFold, slashDeclared, type ScriptCycle, type ScriptFold, type ScriptGrant, type ScriptProposals, type ScriptReads } from '@braindog/host/script';
import type { ScriptAnswer, Scripted } from '@braindog/kernel';
import {
  checkDecl,
  isRefusal,
  LOG_BYTES,
  NAMES,
  PRELUDE,
  scriptMeta,
  WITH_CONFIG,
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
/**
 * The header `ctx.fetch(null, { address })` names the key holding the address in (round 1030). The module sends such a
 * request to `ADDRESS_STAND_IN`, which never leaves this gateway: the address is opened here, held to the egress by
 * `addressed`, and sent with no key. Stripped like the others.
 */
export const ADDRESS_HEADER = 'x-braindog-address';
export const ADDRESS_STAND_IN = 'https://address.braindog.invalid/';

/** A run that made this many calls into the record's object, or was answered this many rows, writes a `script-work` line. */
const SCRIPT_WORK_CALLS = 100;
const SCRIPT_WORK_ROWS = 2_000;

/** A provider gets ten seconds and two megabytes, as a `call` does. */
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * How long a finished run waits for its tail to report CPU time. A quarter of a second, because it is spent by every
 * run the tail never reports on, and a pass of many scripts pays it once each; a report later than this is dropped.
 */
const TAIL_MS = 250;

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
      /** The key whose secret is the address to fetch, or absent: `HostRequest.address`. */
      address?: string | null;
    }
  /** `options` is `ctx.record.list`'s third argument as the script wrote it, or `null`: `scriptReads` reads it. */
  | { op: 'list'; register: string; where: Json; options: Json }
  | { op: 'get'; spoken: string }
  /** `ctx.fold`: a payee as a bank wrote it, answered with the kernel's key for it by the run's own `scriptFold`. */
  | { op: 'fold'; text: string }
  /** `ctx.cycle`: the next day a repeating line moves on after `day`, answered by the run's own `scriptCycle`. */
  | { op: 'cycle'; day: string; line: Json }
  /** `ctx.propose`: a question with rows, tried against the gate and queued by the run's own `scriptProposals`. */
  | { op: 'propose'; proposal: Json }
  /**
   * The CPU time the platform says a run spent, from `ScriptTail` and never from the sandbox: the two doors the script
   * can reach build their calls with an `op` of their own, so nothing the script writes can send this one.
   */
  | { op: 'cpu'; ms: number };

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
    for (const [name, value] of request.headers) if (name !== RUN_HEADER && name !== KEY_HEADER && name !== URL_HEADER && name !== ADDRESS_HEADER) headers[name] = value;
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
      address: request.headers.get(ADDRESS_HEADER),
    });
    if ('error' in reply) throw new Error(reply.error);
    return Response.json(reply.ok);
  }
}

/** The loaded Worker's `env.RECORD`: `ctx.record.list` and `ctx.record.get`, answered by the record's object. */
export class ScriptRecord extends WorkerEntrypoint<Wired, Linked> {
  /* `options` IS ABSENT FROM A MODULE THAT SENDS TWO ARGUMENTS, and that is no options, as `runInQuickJs` reads it. */
  async list(run: string, register: string, where: string, options?: string): Promise<string> {
    const reply = await home(this.env, this.ctx.props).script(run, {
      op: 'list',
      register,
      where: JSON.parse(where) as Json,
      options: options === undefined ? null : (JSON.parse(options) as Json),
    });
    if ('error' in reply) throw new Error(reply.error);
    return JSON.stringify(reply.ok);
  }

  async get(run: string, spoken: string): Promise<string> {
    const reply = await home(this.env, this.ctx.props).script(run, { op: 'get', spoken });
    if ('error' in reply) throw new Error(reply.error);
    return JSON.stringify(reply.ok);
  }

  /** `ctx.fold`, answered in the record's object, where the run's count of them is kept. */
  async fold(run: string, text: string): Promise<string> {
    const reply = await home(this.env, this.ctx.props).script(run, { op: 'fold', text });
    if ('error' in reply) throw new Error(reply.error);
    return JSON.stringify(reply.ok);
  }

  /**
   * `ctx.cycle`, answered in the record's object as `fold` is. A line that does not parse is no line, and answers `null`;
   * so does one longer than `CYCLE_CHARS`, which `scriptCycle` would refuse anyway, read as no line here so it is never
   * carried into the object. The prelude wrote it with `JSON.stringify`, so its length is the length the host measures.
   */
  async cycle(run: string, day: string, line: string): Promise<string> {
    let read: Json = null;
    try {
      read = typeof line === 'string' && line.length <= CYCLE_CHARS ? (JSON.parse(line) as Json) : null;
    } catch {
      read = null;
    }
    const reply = await home(this.env, this.ctx.props).script(run, { op: 'cycle', day: String(day), line: read });
    if ('error' in reply) throw new Error(reply.error);
    return JSON.stringify(reply.ok);
  }

  /**
   * `ctx.propose`, answered in the record's object, where the run's queue and count are kept. A proposal that does not
   * parse crosses as `null`, which the record refuses in its own words, as on the self-host.
   */
  async propose(run: string, proposal: string): Promise<string> {
    let read: Json = null;
    try {
      read = typeof proposal === 'string' ? (JSON.parse(proposal) as Json) : null;
    } catch {
      read = null;
    }
    const reply = await home(this.env, this.ctx.props).script(run, { op: 'propose', proposal: read });
    if ('error' in reply) throw new Error(reply.error);
    return JSON.stringify(reply.ok);
  }
}

/** What the tail is handed: the object, as the two doors are, and the one run its Worker was loaded for. */
type Tailed = Linked & { run: string };

/**
 * The loaded Worker's tail: the platform's own account of what one run spent, carried back to the record's object.
 *
 * THE RUN IS IN THE PROPS HERE, AND THAT IS SAFE WHERE IT WAS NOT FOR THE DOORS. A tail is built for one `load`, and
 * every run gets a `load` of its own (`runScript` says why), so the props are that run's and nobody else's. Nothing the
 * script can reach calls it either: it is neither in the loaded Worker's `env` nor its `globalOutbound`, and it is the
 * platform that hands it the trace once the run is over.
 *
 * CPU TIME IS THE ONE THING READ OFF THE TRACE, because it is the one number this host cannot measure for itself. Wall
 * time, fetches and bytes are counted on this side of the isolate already, and a second count of them would be a
 * second answer to a question that has one.
 */
export class ScriptTail extends WorkerEntrypoint<Wired, Tailed> {
  override async tail(events: TraceItem[]): Promise<void> {
    const ms = events.reduce((sum, e) => sum + (Number.isFinite(e.cpuTime) && e.cpuTime > 0 ? e.cpuTime : 0), 0);
    await home(this.env, this.ctx.props).script(this.ctx.props.run, { op: 'cpu', ms });
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
  grant: (label: string) => ScriptGrant | null;
  /** Opens a key's secret for an address held in the keys (`addressed`); absent or `null`, such a fetch is told no. */
  openKey?: OpenKey | null | undefined;
  read: ScriptReads | undefined;
  /** `ctx.fold` for this run and no other: `scriptFold` counts what one run asks, as the self-host's runner does. */
  fold: ScriptFold;
  /** `ctx.cycle` for this run and no other, counted as `fold` is. */
  cycle: ScriptCycle;
  /** `ctx.propose` for this run and no other, its queue and count kept here; absent on a host that files nothing. */
  propose?: ScriptProposals | undefined;
  fetches: number;
  bytes: number;
  stop: ScriptRefusal | null;
  /**
   * WHAT THE RUN ASKED OF THE RECORD'S OBJECT (F35, perf2): its calls into it and the rows its lists were answered. The
   * sandbox's `cpuMs` holds the loaded Worker and not the object, so each `ctx.record.list` is the object's own CPU, out
   * of every limit the run is held to; counted, so a run that asks a lot says so (`script-work`).
   */
  calls: number;
  rows: number;
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
  /**
   * The CPU time each run's tail has reported so far, and who is waiting to hear it.
   *
   * APART FROM `#turns` BECAUSE THE TAIL SPEAKS AFTER THE RUN IS CLOSED, when every call the script makes is refused.
   * A slot lives from `open` until `runScript` has read it or given up on it, and a report for a run with no slot (one
   * that came too late) is dropped.
   */
  readonly #cpu = new Map<string, { ms: number | null; wake: (() => void) | null }>();

  /** How many runs are open. A test's witness that a run is closed behind it. */
  get size(): number {
    return this.#turns.size;
  }

  open(turn: Omit<Turn, 'fold' | 'cycle' | 'fetches' | 'bytes' | 'stop' | 'calls' | 'rows'>): string {
    const id = crypto.randomUUID();
    this.#turns.set(id, { ...turn, fold: scriptFold(turn.decl.id), cycle: scriptCycle(turn.decl.id), fetches: 0, bytes: 0, stop: null, calls: 0, rows: 0 });
    this.#cpu.set(id, { ms: null, wake: null });
    return id;
  }

  close(id: string): Turn | undefined {
    const turn = this.#turns.get(id);
    this.#turns.delete(id);
    return turn;
  }

  /**
   * The CPU time the platform reported for a closed run, waiting at most `ms` for it, or `null` when nothing said.
   *
   * THE WAIT IS BOUNDED BECAUSE THE REPORT IS NOT PROMISED. The platform hands a tail its trace after the invocation
   * ends, on its own schedule, and a run that waited for it without limit would hold the record's pass on something
   * that may never come. The slot is gone afterwards either way.
   */
  async cpu(run: string, ms: number): Promise<number | null> {
    const slot = this.#cpu.get(run);
    if (slot === undefined) return null;
    if (slot.ms === null && ms > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await new Promise<void>((resolve) => {
        slot.wake = resolve;
        timer = setTimeout(resolve, ms);
      });
      if (timer !== undefined) clearTimeout(timer);
    }
    this.#cpu.delete(run);
    return slot.ms;
  }

  /** Give up on a run's CPU report. `runScript` calls it on every way out, so no slot outlives its run. */
  forget(run: string): void {
    this.#cpu.delete(run);
  }

  async answer(run: string, call: ScriptCall): Promise<ScriptReply> {
    /* THE TAIL'S REPORT BEFORE THE OPEN-RUN CHECK, because it arrives once the run is closed. Summed, since a trace may
       come in more than one delivery, and the first one wakes whoever is waiting. */
    if (call.op === 'cpu') {
      const slot = this.#cpu.get(run);
      if (slot !== undefined && Number.isFinite(call.ms) && call.ms >= 0) {
        slot.ms = (slot.ms ?? 0) + call.ms;
        slot.wake?.();
      }
      return { ok: null };
    }
    const turn = this.#turns.get(run);
    if (turn === undefined) return { error: 'This run is over, so nothing was sent.' };
    /* A RULE BROKEN ONCE STAYS BROKEN. The script may have caught the first refusal; nothing after it is sent. */
    if (turn.stop !== null) return { error: turn.stop.why };
    const refuse = (refusal: ScriptRefusal): ScriptReply => {
      turn.stop ??= refusal;
      return { error: refusal.why };
    };
    const { decl } = turn;
    turn.calls += 1;

    if (call.op === 'list') {
      if (!decl.reads.includes(call.register) || turn.read === undefined)
        return refuse({ code: 'FORBIDDEN', why: `${decl.id} read ${call.register}, which is not in its reads.` });
      const rows = await turn.read.list(call.register, call.where, call.options);
      turn.rows += Array.isArray(rows) ? rows.length : 0;
      return { ok: rows };
    }
    if (call.op === 'get') {
      /* THE REGISTER OF A SPOKEN ID IS THE RECORD'S TO RESOLVE, as in `runInQuickJs`: the reads that `turn.read` was
         built with are what keeps a `get` inside them. What this can hold is that a script reading nothing reads nothing. */
      if (decl.reads.length === 0 || turn.read === undefined)
        return refuse({ code: 'FORBIDDEN', why: `${decl.id} read ${call.spoken} and declares no reads.` });
      return { ok: await turn.read.get(call.spoken) };
    }
    if (call.op === 'fold') {
      /* NO `reads` CHECK, as in `runInQuickJs`: it reads nothing of the record. A run that asks past the host's count
         is answered with a failed call the script may catch, and no rule is broken, as on the self-host. */
      try {
        return { ok: await turn.fold(call.text) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (call.op === 'cycle') {
      /* AS `fold`: no `reads` check, and a run past the count is a failed call the script may catch. A bad day or line
         is answered `null` by `scriptCycle` itself. */
      try {
        return { ok: await turn.cycle(call.day, call.line) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (call.op === 'propose') {
      /* HELD TO `writes:` BY THE RECORD'S OWN CHECK (`proposalOf`), and a refusal is the gate's answer the script reads,
         not a rule broken: a question the record would not take is the script's to say, as on the self-host. */
      if (turn.propose === undefined) return { error: 'This host files no questions from a script.' };
      return { ok: await turn.propose.propose(call.proposal) };
    }

    /* AN ADDRESS HELD IN THE KEYS: the label held to `keys`, the key opened here and read by `addressed`, as on the
       self-host, and the request it names sent in place of the stand-in with no key. Every check below then runs on it. */
    let scrub: string[] = [];
    if (typeof call.address === 'string' && call.address !== '') {
      if (!decl.keys.includes(call.address))
        return refuse({ code: 'FORBIDDEN', why: `${decl.id} asked for the address in the key ${JSON.stringify(call.address)}, which it does not declare.` });
      const held = turn.grant(call.address);
      if (held === null) return { error: `The key "${call.address}" is not in the keychain, so nothing was sent. Put the link in your keys under that name.` };
      const secret = turn.openKey ? await turn.openKey(held) : null;
      if (secret === null) return { error: `The key "${call.address}" could not be opened, so nothing was sent.` };
      const read = addressed(decl.id, decl.egress, held, secret);
      if (!('url' in read)) return refuse(read);
      call = { ...call, url: read.url.href, asked: null, method: 'GET', headers: {}, body: null, key: null, address: null };
      /* AND WHAT OF IT THE EXECUTOR STRIKES FROM THE ANSWER, since it goes out with no grant (`addressSecrets`). */
      scrub = addressSecrets(secret, read.url);
    }
    let url: URL;
    try {
      url = new URL(call.url);
    } catch {
      return refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched ${JSON.stringify(call.url)}, which is not a URL.` });
    }
    /* THE SAME FOUR CHECKS AS `runInQuickJs`, IN ITS ORDER, so one script meets one set of rules on either host.

       THE USER NAME IS READ OFF THE URL THE SCRIPT WROTE, AND EVERYTHING ELSE OFF THE URL BEING SENT. workerd's `fetch`
       inside the loaded Worker drops `me:pw@` before the request reaches this gateway (measured:
       `https://me:pw@<declared origin>/rate` arrived bare, with no authorization header, and was sent),
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

    /* A DECLARED KEY THAT IS NOT IN THE KEYCHAIN IS THE HOST FAILING, NOT A RULE BROKEN. Accept checked it was there; if
       it was revoked since, the script gets an error it may catch, and nothing is sent without it. */
    const grant = call.key === null ? null : turn.grant(call.key);
    if (call.key !== null && grant === null) return { error: `The key "${call.key}" is not in the keychain any more, so nothing was sent.` };
    /* AND A KEY GOES ONLY TO THE HOST ITS KEYCHAIN ENTRY OPENS, never the keychain's `slash` key: `keyRefused`, which the
       self-host's runner asks too, and a rule broken like the four above. Judged on `url`, the request being sent. */
    const broken = grant === null ? null : keyRefused(decl.id, grant, url);
    if (broken !== null) return refuse(broken);

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
      ...(scrub.length === 0 ? {} : { scrub }),
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
 * writes, the log and the `ask` the script returned (as JSON) and hands them back, and `runScript` checks them again.
 * `import *` and not a default import, because a source with no default export would otherwise fail to link and look
 * like the platform failing.
 */
const MAIN = `import { WorkerEntrypoint } from 'cloudflare:workers';
import './names.js';
import * as source from './script.js';

const prelude = ${PRELUDE};
const withConfig = ${WITH_CONFIG};

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
        if (typeof given.address === 'string') {
          headers.set('${ADDRESS_HEADER}', given.address);
          const r = await fetch('${ADDRESS_STAND_IN}', { method: 'GET', headers });
          return r.text();
        }
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
      list: (register, where, options) => record.list(run, register, where, options),
      get: (spoken) => record.get(run, spoken),
      fold: (text) => record.fold(run, text),
      cycle: (day, line) => record.cycle(run, day, line),
      ...(meta.proposes === true ? { propose: (proposal) => record.propose(run, proposal) } : {}),
    };
    if (typeof source.default !== 'function') return { invalid: true, log: '' };
    const ctx = withConfig(prelude(host)(meta), meta.config);
    let ask;
    let answer;
    try {
      const value = await source.default(ctx);
      if (value !== null && typeof value === 'object' && value.ask !== undefined && value.ask !== null) ask = JSON.stringify(value.ask);
      if (value !== null && typeof value === 'object' && value.answer !== undefined && value.answer !== null) answer = JSON.stringify(value.answer);
    } catch (e) {
      return { threw: e instanceof Error ? e.message : String(e), log: lines.join('\\n') };
    }
    return { writes, log: lines.join('\\n'), ask, answer };
  }
}
`;

/** What the loaded module's `run` answers, before anything here has believed it. */
type Handed = { writes?: unknown; log?: unknown; threw?: unknown; invalid?: unknown; ask?: unknown; answer?: unknown };

/* ── one run ────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The loopback bindings `ctx.exports` makes of the entrypoints above.
 *
 * `ScriptTail` IS OPTIONAL BECAUSE A MAIN MODULE THAT DOES NOT EXPORT IT HAS NONE. The Worker's `index.ts` exports all
 * three; a test's own main module may export the two doors alone, and then a run is loaded with no tail and reports no
 * CPU, exactly as it did before there was one.
 */
export type ScriptExports = {
  ScriptOutbound(options: { props: Linked }): Fetcher;
  ScriptRecord(options: { props: Linked }): Fetcher;
  ScriptTail?(options: { props: Tailed }): Fetcher;
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
  /**
   * A keychain label to the grant a send opens, or `null` when the keychain holds no such key. The row, never its bytes, and
   * with what it opens, which decides where the key may go.
   */
  grant: (label: string) => ScriptGrant | null;
  /** Opens a key's secret, for a fetch whose address is held in the keys. Absent: such a fetch is told no. */
  openKey?: OpenKey | null | undefined;
  /** Live reads, scoped to a run's `reads` and signed as its actor. Absent: `ctx.record` refuses. */
  read?: ((scripted: Scripted) => ScriptReads) | ScriptReads | undefined;
  /** `ctx.propose` for a run, its queue and count (`scriptProposals`). Absent: the script is handed no `ctx.propose`. */
  propose?: ((scripted: Scripted) => ScriptProposals) | undefined;
  now: () => number;
};

const cut = (text: string): string => {
  const bytes = utf8.encode(text);
  return bytes.length <= LOG_BYTES ? text : new TextDecoder().decode(bytes.slice(0, LOG_BYTES)).replace(/�$/u, '');
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The `ask` a run returned, back from the JSON the loaded module made of it, or `undefined` for none.
 *
 * TEXT ACROSS THE BOUNDARY, because the script's own return value is whatever it built: a function or a class instance in
 * it would fail the call back to this object, and the run with it, where JSON keeps the data and drops the rest. Text
 * that does not parse was not written by the module (which stringifies every one), and is no question.
 */
function askOf(handed: unknown): Json | undefined {
  if (typeof handed !== 'string') return undefined;
  try {
    return JSON.parse(handed) as Json;
  } catch {
    return undefined;
  }
}

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
 * `cpu_ms` IS THE PLATFORM'S OWN NUMBER WHEN ITS TAIL SAYS IT IN TIME, AND 0 WHEN IT DOES NOT, WHICH IS NOT FREE. The
 * platform holds the loaded Worker to `limits.cpu_ms` (`cpuMs` on the code) and ends it past that, and the only place
 * it says how much a run spent is the trace it hands a tail after the run (`ScriptTail`). So each run is loaded with a
 * tail of its own, and its report is waited for, for `TAIL_MS` at most, after the wall time is taken, so the wait is
 * never billed as the script's. Not measured on the platform yet: local workerd may call no tail or report 0, and a run
 * that hears nothing reports 0 as it always did. The ledger meters wall time.
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
  const { script, version, decl, record, input, config } = s.scripted;
  const full: ScriptDecl = { id: script, version, ...decl };
  const usage = (turn?: Turn) => ({ fetches: turn?.fetches ?? 0, bytes: turn?.bytes ?? 0, wall_ms: Math.max(0, wiring.now() - started), cpu_ms: 0 });

  /* THE `slash` KEY BEFORE THE DECLARATION'S SHAPE, in `scriptRunner`'s order, because on the self-host the shape is
     checked inside the sandbox and `slashDeclared` runs before it: a declaration that is both malformed and names the
     key is `FORBIDDEN` on either host, not `DECLARATION_INVALID` on one of them. */
  const slashed = slashDeclared(script, decl.keys);
  if (slashed !== null) return { refused: slashed, log: '', usage: usage() };
  const limits = checkDecl(full);
  if (isRefusal(limits)) return { refused: limits, log: '', usage: usage() };

  const read = typeof wiring.read === 'function' ? wiring.read(s) : wiring.read;
  const propose = wiring.propose?.(s);
  const run = wiring.runs.open({ decl: full, limits, job: s.job.id, send: wiring.send(decl.egress), grant: wiring.grant, openKey: wiring.openKey ?? null, read, propose });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    /* `load`, NOT `get`: A FRESH WORKER FOR EVERY RUN. `get` caches by id, and the id was `<record>:<script>:v<n>`, so
       every run of one version shared one module and one `globalThis`: measured, a
       second run read "one,two" off what the first had left there, where the self-host starts each run in a new
       QuickJS instance and would have said "one" (`test/script-isolation.test.ts`). A script that works on one host
       by carrying state between runs, or trips on another run's leftovers, would behave differently on the other.
       THE PRICE IS A UNIQUE DYNAMIC WORKER PER RUN rather than per version per day, which is what billing counts. */
    const worker = wiring.loader.load({
      compatibilityDate: COMPATIBILITY_DATE,
      mainModule: 'main.js',
      /* `names.js` BEFORE `script.js`, imported first by `MAIN`, for the reason `NAMES` gives. */
      modules: { 'main.js': MAIN, 'names.js': NAMES, 'script.js': decl.source },
      env: { RECORD: wiring.exports.ScriptRecord({ props: { object: wiring.object } }) },
      globalOutbound: wiring.exports.ScriptOutbound({ props: { object: wiring.object } }),
      limits: { cpuMs: limits.cpu_ms },
      /* A TAIL FOR THIS RUN ALONE, where the main module exports one, so the platform's CPU time comes back to it. */
      ...(wiring.exports.ScriptTail === undefined ? {} : { tails: [wiring.exports.ScriptTail({ props: { object: wiring.object, run } })] }),
    });
    const entry = worker.getEntrypoint(undefined, { props: { run } }) as unknown as { run(meta: Json): Promise<Handed> };
    /* `config` IS THE OWNING PACK'S SETTINGS, read by `prepareScript` at the lease, and the loaded module's
       `withConfig` freezes it onto `ctx` with the self-host's own text. */
    /* THE DAY IS HANDED IN BESIDE THE INSTANT (`scriptMeta`), as the self-host hands it: `ctx.today()` is the record's
       own day on both hosts, worked out here because the sandbox has no zone table. */
    /* `proposes` SAYS WHETHER THE LOADED MODULE BUILDS A `ctx.propose`, as a self-host's `CtxHost` does by having one. */
    const meta: Json = { ...scriptMeta({ input: (input ?? null) as Json, now: new Date(started).toISOString(), tz: record.tz }), config: config ?? {}, proposes: propose !== undefined };

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
    /* A RUN THAT ASKED THE RECORD'S OBJECT A LOT SAYS SO: that is CPU of the object's, which no limit of the run's holds. */
    if (turn !== undefined && (turn.calls >= SCRIPT_WORK_CALLS || turn.rows >= SCRIPT_WORK_ROWS))
      console.log(JSON.stringify({ op: 'script-work', script, calls: turn.calls, rows: turn.rows, wall_ms: spent.wall_ms }));
    /* AND THEN THE TAIL'S CPU TIME, AFTER THE WALL TIME WAS TAKEN, so the wait is never counted against the script's
       `wall_ms`. No tail, no wait: a run loaded without one has nothing to hear. */
    const cpu = wiring.exports.ScriptTail === undefined ? null : await wiring.runs.cpu(run, TAIL_MS);
    if (cpu !== null) spent.cpu_ms = Math.round(cpu);

    /* AN ANSWER THAT ARRIVED PAST THE DEADLINE IS LATE, WHOEVER WON THE RACE. The race cannot end code that never
       awaits: locally the loaded Worker runs on this object's thread, so the timer cannot fire until the script lets
       go, and a four-second busy loop under `wall_ms: 500` then answered clean with its log and writes.
       The self-host refuses the same run by its last check of the deadline (`runInQuickJs`), so this is that check.
       In production `cpuMs` ends such a loop sooner, which local workerd does not enforce. */
    const handed = outcome !== 'late' && 'handed' in outcome && isObject(outcome.handed) ? (outcome.handed as Handed) : {};
    const log = cut(typeof handed.log === 'string' ? handed.log : '');
    /* A BROKEN RULE OUTRANKS EVERYTHING THE SCRIPT SAID AFTER IT, including a clean return, AND A LATE ONE. The
       self-host answers its kept refusal over the sandbox's own (`scriptRunner`), and `runInQuickJs` answers its
       sticky `stop` before its deadline, so a run that sent a key away and then overran is `FORBIDDEN` on both hosts. */
    if (turn?.stop) return { refused: turn.stop, log, usage: spent };
    if (outcome === 'late' || spent.wall_ms > limits.wall_ms) return { refused: { code: 'OUT_OF_BOUNDS', why: `${script} ran past its wall_ms of ${limits.wall_ms}.` }, log: '', usage: spent };
    if ('failed' in outcome) return { refused: { code: null, why: `${script} stopped: ${outcome.failed}` }, log: '', usage: spent };
    if (handed.invalid === true) return { refused: { code: 'DECLARATION_INVALID', why: `${script}'s source has no default export that is a function.` }, log, usage: spent };
    if (typeof handed.threw === 'string') return { refused: { code: null, why: `${script} threw: ${handed.threw}` }, log, usage: spent };
    const writes = checkWrites(full, limits, handed.writes);
    if (!Array.isArray(writes)) return { refused: writes, log, usage: spent };
    /* AND THE ONE QUESTION IT MAY END BY ASKING, carried as it came and checked by `finishScript`, which files it. */
    const ask = askOf(handed.ask);
    /* AND WHAT IT ANSWERS ITS CALLER, for a run an add-on's tool started, read back from JSON as `ask` is. */
    const answer = askOf(handed.answer);
    /* AND WHAT IT PROPOSED, queued in this object as it asked (`scriptProposals`), for `finishScript` to file. */
    const queued = turn?.propose?.queued() ?? [];
    return { writes, log, usage: spent, ...(ask === undefined ? {} : { ask }), ...(answer === undefined ? {} : { answer }), ...(queued.length === 0 ? {} : { proposals: queued }) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    wiring.runs.close(run);
    wiring.runs.forget(run);
  }
}
