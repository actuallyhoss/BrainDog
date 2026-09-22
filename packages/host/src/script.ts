/**
 * A script's run on a host: the sandbox's `ctx.fetch` wired to the one send loop, and the plan's allowance asked first.
 *
 * `loop/research-shell-scripts.md` Brief 4, and DIRECTION section 22. The kernel leases a `script.run` job and hands a
 * `Scripted` to whatever `ScriptRunner` the host passed `runActions`; `finishScript` applies what comes back. This file
 * is the part between the two that does not depend on which sandbox or which socket: both hosts build their runner
 * here, and each passes only what differs (`run`, `send`, `pin`, `openKey`), exactly as `sendAction` is shared.
 *
 * A SCRIPT'S FETCH IS `sendAction`, NOT A SECOND COPY OF IT. So a script obeys every rule a `call` obeys: https only,
 * a literal private address refused, `pin` asked before the socket on the self-host, same-origin redirects three at
 * most, ten seconds, two megabytes, and the key opened for one request only after every check has passed, sent as a
 * bearer and scrubbed from the answer. The sandbox has already checked the origin against the script's `egress:`
 * (`@braindog/script`); `sendAction` checks it again against the same list, because a host that trusted the sandbox's
 * word would be one QuickJS escape from sending anywhere.
 *
 * THE ORIGINS ARE THE SCRIPT'S OWN, NOT THE RECORD'S. `actionOrigins` reads active `ingest` declarations only, so a
 * script's origin is not in it, and passing it would refuse every script fetch. What is passed is the `egress:` of the
 * version that fired, which `prepareScript` read from the record when the job was leased.
 *
 * A REFUSED FETCH IS A REJECTED PROMISE IN THE SCRIPT. `CtxHost` has no way to refuse a run from outside, so a refusal
 * reaches the script as an ordinary error carrying `sendAction`'s sentence. Uncaught, the run is refused with that
 * sentence on its event. Caught, the script goes on without the answer, which is all catching it can buy: nothing was
 * sent, and no key was opened.
 *
 * NO `node:` IMPORT, and only types from `@braindog/script`, so the Worker can build its runner here too.
 */

import { ACTION_MAX_BYTES, ACTION_TIMEOUT_MS, type ActionRequest, type Entry, type ScriptRunner, type Scripted } from '@braindog/kernel';
import { fixOf } from '@braindog/ports';
import type { CallContext, RecordApi } from '@braindog/record';
import type { CtxHost, HostRequest, HostResponse, Json, ScriptAnswer, ScriptDecl } from '@braindog/script';

import { pass, sendAction, type Admissions, type Ledger, type OpenKey, type Pin, type Send } from './actions.ts';

/** One run of one script in a sandbox: `runInQuickJs` on the self-host, a Dynamic Worker on Cloud. */
export type RunSandbox = (decl: ScriptDecl, host: CtxHost) => Promise<ScriptAnswer>;

/** The grant a vault label names, or `null`. By reference: an id and a label, never the bytes. */
export type GrantOf = (label: string) => { id: string; label: string } | null;

/** `ctx.record.list` and `ctx.record.get` for one run, already held to its `reads`. */
export type ScriptReads = {
  list(register: string, where: Json): Promise<Json[]>;
  get(spoken: string): Promise<Json>;
};

export type ScriptRunnerOptions<P> = {
  run: RunSandbox;
  send: Send<P>;
  /** Absent on a host whose network does not route to a private address, as for `sendAction`. */
  pin?: Pin<P> | undefined;
  /** `null` on a host with no key store: a fetch that names a key sends nothing and says why. */
  openKey: OpenKey | null;
  grantOf: GrantOf;
  /**
   * The run's reads, built from what was leased (`scriptReads`). ABSENT IS A HOST THAT READS NOTHING, and QuickJS then
   * refuses `ctx.record` with the sentence it uses for a register outside `reads`, which is why every host passes it.
   */
  reads?: ((s: Scripted) => ScriptReads) | undefined;
  /** The host clock, which `ctx.now()` reads. Absent is `Date.now`. */
  now?: (() => number) | undefined;
};

/** The fields of `register` a script is never told about: `secret`, and `list<secret>`. */
function sealedOf(api: Pick<RecordApi, 'kernel'>, register: string): Set<string> {
  const decl = api.kernel.register(register);
  return new Set((decl?.fields ?? []).filter((f) => f.type === 'secret' || (f.type === 'list' && f.of === 'secret')).map((f) => f.id));
}

/**
 * One row as a script is handed it: every field but a secret.
 *
 * A SECRET FIELD HOLDS A GRANT ID, NOT THE KEY, AND IT IS STILL TAKEN OFF. It says which vault entry opens what, and a
 * script can copy anything it is handed into a row it writes or a line of its log, both of which people read who were
 * never shown the vault. The script names its keys by label in `keys:` and the host opens them; it never needs to know
 * where they are sealed. `list<secret>` is refused at install (`declare.ts`), and is named here anyway, because this is
 * the last place that could catch one and the kernel's own `redacts` reads a list by its element type the same way.
 */
function unsealed(api: Pick<RecordApi, 'kernel'>, row: Entry): Json {
  const sealed = sealedOf(api, row.register);
  if (sealed.size === 0) return row as unknown as Json;
  const fields: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(row.fields)) if (!sealed.has(id)) fields[id] = value;
  return { ...row, fields } as unknown as Json;
}

/**
 * The first sealed field a `where` names, anywhere in its tree, or `null`.
 *
 * TAKING THE FIELD OFF THE ROW IS NOT ENOUGH WHILE THE FILTER CAN STILL ASK ABOUT IT. `@braindog/where` lets `starts`
 * test a `secret` like any text, so a script that asked which rows start with each character in turn read the grant id
 * back out of how many rows came home: measured by the checker on September 22nd, the whole id written into a row in
 * one run (`apps/selfhost/test/script-reads.test.ts`). Every value in the tree is walked, not only `all`, `any` and
 * `none`, so a group shape added later is covered without anyone remembering this function; a leaf names its field by
 * id only (`IDENT` there), so the id is the one spelling to catch.
 */
function namesSealed(where: unknown, sealed: Set<string>): string | null {
  if (where === null || typeof where !== 'object') return null;
  const node = where as Record<string, unknown>;
  if (typeof node.field === 'string' && sealed.has(node.field)) return node.field;
  for (const value of Object.values(node)) {
    const found = namesSealed(value, sealed);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The reads a script's `ctx.record` is built from, on either host: the record's own `list` and `get`, asked as the
 * script's actor with its `reads` as the ceiling.
 *
 * `system`, BECAUSE A SCHEDULED RUN HAS NO PERSON BEHIND IT, and `registers` is what keeps it to its reads. A `get` of a
 * spoken id outside them answers as a row that is not there, the record's answer to any caller who may not read it,
 * so the prefix `runInQuickJs` cannot resolve is resolved here by the only party that can.
 *
 * THE WORKER HAD THIS INLINE SINCE BRIEF 5 AND THE SELF-HOST DID NOT HAVE IT AT ALL: its `CtxHost` carried no `list`
 * and no `get`, so `reads: ["clients"]` ran on the Cloud and was refused at home as "read clients, which is not in its
 * reads" (`apps/selfhost/test/script-reads.test.ts`). One copy here is what keeps the two answering alike.
 */
export function scriptReads(api: Pick<RecordApi, 'kernel' | 'list' | 'get'>): (s: Scripted) => ScriptReads {
  return (s) => {
    const as: CallContext = { principal: { kind: 'system', id: s.scripted.actor }, registers: s.scripted.decl.reads };
    return {
      list: async (register, where) => {
        const sealed = namesSealed(where, sealedOf(api, register));
        if (sealed !== null)
          throw new Error(`${s.scripted.script} filtered ${register} on ${sealed}, which is a secret, and a script may not ask what a secret field holds.`);
        const page = await api.list({ register, ...(where === null ? {} : { where: where as never }) }, as);
        if (!page.ok) throw new Error(fixOf(page));
        return page.value.rows.map((row) => unsealed(api, row));
      },
      get: async (spoken) => {
        const row = await api.get({ spoken }, as);
        if (!row.ok) throw new Error(fixOf(row));
        return row.value === null ? null : unsealed(api, row.value);
      },
    };
  };
}

/**
 * The label a script names, resolved the way `keyNamed` resolves an action's `grant:`: by label or id, never a revoked
 * one, the newest first. The same order, so a script and a `call` naming one label open the same key.
 */
export function grantNamed(grants: () => ReturnType<RecordApi['kernel']['grants']>): GrantOf {
  return (label) => {
    const live = grants()
      .filter((g) => (g.label === label || g.id === label) && g.revoked_at === null)
      .sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
    const found = live[0];
    return found === undefined ? null : { id: found.id, label: found.label };
  };
}

/**
 * The `ScriptRunner` a host hands `runActions`: the sandbox, with `ctx.fetch` going out through `sendAction`.
 *
 * ONE `sendAction` PER RUN, because its origins are the run's. It holds nothing between runs but the host's socket
 * and key opener, which are the caller's.
 */
export function scriptRunner<P extends object | undefined = undefined>(options: ScriptRunnerOptions<P>): ScriptRunner {
  const now = options.now ?? (() => Date.now());
  return async (s) => {
    const { scripted } = s;
    const execute = sendAction<P>({ origins: () => scripted.decl.egress, openKey: options.openKey, send: options.send, pin: options.pin });

    const fetch = async (asked: HostRequest): Promise<HostResponse> => {
      const grant = asked.key === null ? null : options.grantOf(asked.key);
      if (asked.key !== null && grant === null) throw new Error(`The key "${asked.key}" is not in the vault, so nothing was sent.`);
      const request: ActionRequest = {
        job: s.job.id,
        /* `sendAction` NEVER READS THE CHANNEL; only `idempotentCalls` does, and a script's fetch is not wrapped in it. */
        channel: 'call',
        ingest: scripted.script,
        /* ANY METHOD, AS WRITTEN. `ActionRequest` says GET or POST because that is all a declaration can say, and
           `sendAction` sends the method it is given. The install diff approved the script's egress as POST, the wider. */
        method: asked.method as ActionRequest['method'],
        url: asked.url,
        origin: new URL(asked.url).origin,
        headers: asked.headers,
        ...(asked.body === null ? {} : { body: asked.body }),
        grant,
        timeoutMs: ACTION_TIMEOUT_MS,
        maxBytes: ACTION_MAX_BYTES,
      };
      const answer = await execute(request);
      if ('refused' in answer) throw new Error(answer.refused.fix);
      /* NO HEADERS COME BACK, because `sendAction` returns none, and the body is the only part of an answer it scrubs
         of the key. Handing headers through would need a scrub of its own first. */
      return { status: answer.status, headers: {}, body: answer.body };
    };

    const { decl } = scripted;
    const reads = options.reads?.(s);
    return options.run(
      {
        id: scripted.script,
        version: scripted.version,
        egress: decl.egress,
        keys: decl.keys,
        reads: decl.reads,
        writes: decl.writes,
        ...(decl.limits === undefined ? {} : { limits: decl.limits }),
        source: decl.source,
      },
      {
        fetch,
        ...(reads === undefined ? {} : { list: reads.list, get: reads.get }),
        now: () => new Date(now()).toISOString(),
        tz: scripted.record.tz,
        input: (scripted.input ?? null) as Json,
      },
    );
  };
}

/**
 * The same question `holding` asks of a `call`, asked of a script before its sandbox starts.
 *
 * ON THE SHARED `Admissions`, which is the point of it. A pass that let a script through on its own count would let a
 * record with one run left spend it twice, once on a script and once on a `call`, which is the overrun `pass()` exists
 * to prevent. A held run answers `held`, and `finishScript` moves the schedule to the day it may run again.
 */
export function holdingScript(run: ScriptRunner, record: string, mayRun: Ledger['mayRun'], admissions: Admissions = pass()): ScriptRunner {
  return async (s) => {
    const hold = await admissions.ask(record, s.scripted.script, mayRun);
    if (hold) return { held: hold };
    return run(s);
  };
}
