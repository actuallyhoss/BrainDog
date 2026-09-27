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
 * sent, and no key was opened. THE ONE EXCEPTION IS A KEY SENT WHERE ITS VAULT ENTRY DOES NOT OPEN (`keyRefused`), which
 * is a rule broken rather than a provider failing, and refuses the run however the script handles it.
 *
 * NO `node:` IMPORT, and only types from `@braindog/script`, so the Worker can build its runner here too.
 */

import { ACTION_MAX_BYTES, ACTION_TIMEOUT_MS, grantChosen, hostOpened, type ActionRequest, type Entry, type ScriptRunner, type Scripted } from '@braindog/kernel';
import { fixOf } from '@braindog/ports';
import type { CallContext, RecordApi } from '@braindog/record';
import type { CtxHost, HostRequest, HostResponse, Json, ScriptAnswer, ScriptDecl, ScriptRefusal } from '@braindog/script';

import { pass, sendAction, type Admissions, type Ledger, type OpenKey, type Pin, type Send } from './actions.ts';
import { SLASH_KEY_LABEL } from './slash.ts';

/** One run of one script in a sandbox: `runInQuickJs` on the self-host, a Dynamic Worker on Cloud. */
export type RunSandbox = (decl: ScriptDecl, host: CtxHost) => Promise<ScriptAnswer>;

/**
 * The grant a vault label names, or `null`. By reference: an id, a label and what its vault entry says it opens, never
 * the bytes. `opens` is carried because it decides where the key may go (`keyRefused`).
 */
export type GrantOf = (label: string) => ScriptGrant | null;
export type ScriptGrant = { id: string; label: string; opens: string };

/**
 * `ctx.record.list` and `ctx.record.get` for one run, already held to its `reads`. `options` is `list`'s third argument
 * as the script wrote it, or `null`, and `listOptions` reads it.
 */
export type ScriptReads = {
  list(register: string, where: Json, options?: Json): Promise<Json[]>;
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
 * `ctx.record.list`'s third argument, read: `{ includeDeleted: true }` asks for the rows a person deleted as well as the
 * live ones, each deleted one with `deleted_at` set, which is how a script tells the two apart.
 *
 * WHY A SCRIPT ASKS AT ALL. A pack that copies rows in from a provider has to know which ones a person already threw
 * away, or it writes each of them again on its next run: mercury's ledger read live rows only and put back every
 * transaction he deleted (`loop/finish/defects.md` M6).
 *
 * ANYTHING ELSE IS REFUSED, NOT READ AS NO OPTIONS. A script that meant to ask for its deleted rows and misspelled the
 * question would be answered the live rows alone, and would write the deleted ones back without a word. The record's
 * `list` refuses an `includeDeleted` that is not true or false for the same reason; this refuses first, in the
 * script's own terms, and refuses a key the record would have passed over.
 */
function listOptions(script: string, register: string, options: Json): { includeDeleted?: boolean } {
  if (options === null) return {};
  const refused = new Error(
    `${script} listed ${register} with the options ${JSON.stringify(options)}, and a script's list takes {"includeDeleted":true} or nothing, so nothing was read.`,
  );
  if (typeof options !== 'object' || Array.isArray(options)) throw refused;
  for (const [key, value] of Object.entries(options)) if (key !== 'includeDeleted' || typeof value !== 'boolean') throw refused;
  const asked = options['includeDeleted'];
  return typeof asked === 'boolean' ? { includeDeleted: asked } : {};
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
      list: async (register, where, options = null) => {
        /* A SENTENCE IS REFUSED BEFORE THE TREE IS WALKED, because `namesSealed` cannot see into one and the record's
           `list` reads a string as a sentence. Measured before this line (`script-reads.test.ts`, the audit of wave
           thirty-six, finding 7): `token is set`, `token is empty` and `token is <grant id>` each answered which client
           holds a key, while the same question as a tree was refused. Refused rather than parsed, because a tree is what
           the grammar tells a script to write, and parsing here would be a second reader of sentences that has to agree
           with the kernel's on every word it adds. */
        if (where !== null && (typeof where !== 'object' || Array.isArray(where)))
          throw new Error(
            `${s.scripted.script} filtered ${register} with ${JSON.stringify(where)}, and a script filters with a predicate tree, such as {"field":"name","is":"Acme"}, so nothing was read.`,
          );
        const sealed = namesSealed(where, sealedOf(api, register));
        if (sealed !== null)
          throw new Error(`${s.scripted.script} filtered ${register} on ${sealed}, which is a secret, and a script may not ask what a secret field holds.`);
        const asked = listOptions(s.scripted.script, register, options);
        const page = await api.list({ register, ...(where === null ? {} : { where: where as never }), ...asked }, as);
        if (!page.ok) throw new Error(fixOf(page));
        /* A DELETED ROW IS HANDED OVER AS A LIVE ONE IS, WITH ITS SECRETS OFF. Deleting a row keeps its fields, so a
           deleted client still holds its grant id, and `unsealed` is asked of every row whichever it is. */
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
 * The label a script names, resolved by the kernel's own `grantChosen`, the chooser `keyNamed` uses for an action's
 * `grant:`: by label or id, never a revoked one, the newest first. One function, so a script and a `call` naming one
 * label cannot open different keys.
 */
export function grantNamed(grants: () => ReturnType<RecordApi['kernel']['grants']>): GrantOf {
  return (label) => {
    const found = grantChosen(grants(), label);
    return found === undefined ? null : { id: found.id, label: found.label, opens: found.opens };
  };
}

/**
 * Why a script may not send `grant` to `at`, or `null` when it may. The refusal is `FORBIDDEN` and is a rule broken, so
 * it refuses the whole run on both hosts, as a key the script does not declare does.
 *
 * A KEY GOES ONLY TO THE HOST ITS VAULT ENTRY SAYS IT OPENS. A script names its keys and its origins as two lists, and
 * nothing joined them: the audit of wave thirty-five sent `goldapi`, whose entry opens `api.gold.test`, to
 * `collector.test` as a bearer, because that origin was also in the script's `egress:`, and the one line the owner
 * approves names both lists without saying which host gets the key. A `call` has one host and one grant, so the pairing
 * was implicit there; a script is the first declaration that can hold two origins and one key. The host is compared
 * exactly, with no subdomain let in: `opens: stripe.com` does not open `api.stripe.com`, because a vault entry that names
 * a parent would otherwise open every name under it, whoever holds them.
 *
 * AND NEVER THE VAULT'S `slash` KEY, WHATEVER IT OPENS. On a host with no `SLASH_KEY` it is the key the included model
 * answers everybody with, which `slashGuardedEngine` already refuses as a tier `b` key for the same reason. It is
 * matched on the label the lookup found, so naming it by its grant id is refused too.
 */
export function keyRefused(script: string, grant: ScriptGrant, at: URL): ScriptRefusal | null {
  if (grant.label === SLASH_KEY_LABEL)
    return { code: 'FORBIDDEN', why: `${script} named the vault's "${SLASH_KEY_LABEL}" key, which is the key this host's included model answers with, and a script may not send it anywhere.` };
  const host = at.hostname.replace(/\.$/, '');
  if (hostOpened(grant.opens) === host) return null;
  return {
    code: 'FORBIDDEN',
    why: `The key "${grant.label}" opens ${hostOpened(grant.opens) ?? JSON.stringify(grant.opens ?? '')}, and ${script} fetched ${host} with it, so nothing was sent. A script sends a key only to the host its vault entry says it opens.`,
  };
}

/**
 * The refusal for a script that declares the vault's `slash` key, asked before its sandbox starts, or `null`.
 *
 * BEFORE THE SANDBOX AND NOT ONLY AT THE FETCH, so a script that names the key and never uses it is refused all the
 * same: a declaration that names the included model's key is one the owner should not have been asked to approve.
 * Refusing it at install is the kernel's (`declare.ts`), which this file does not reach.
 */
export function slashDeclared(script: string, keys: readonly string[]): ScriptRefusal | null {
  if (!keys.includes(SLASH_KEY_LABEL)) return null;
  return { code: 'FORBIDDEN', why: `${script} declares the vault's "${SLASH_KEY_LABEL}" key, which is the key this host's included model answers with, and a script may not name it.` };
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
    const slashed = slashDeclared(scripted.script, scripted.decl.keys);
    if (slashed !== null) return { refused: slashed, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 0, cpu_ms: 0 } };
    const execute = sendAction<P>({ origins: () => scripted.decl.egress, openKey: options.openKey, send: options.send, pin: options.pin });

    /* A KEY SENT WHERE IT DOES NOT OPEN IS A RULE BROKEN, AND IT STAYS BROKEN. `CtxHost` can only reject the one fetch,
       which the script may catch and carry on from, so the refusal is kept here: every fetch after it is refused
       unsent, and the run's answer is the refusal whatever the script returned. That is what the Worker's `ScriptRuns`
       does with the same refusal, so one script meets one rule on either host. */
    const kept: { stop: ScriptRefusal | null } = { stop: null };

    const fetch = async (asked: HostRequest): Promise<HostResponse> => {
      if (kept.stop !== null) throw new Error(kept.stop.why);
      const grant = asked.key === null ? null : options.grantOf(asked.key);
      if (asked.key !== null && grant === null) throw new Error(`The key "${asked.key}" is not in the vault, so nothing was sent.`);
      const broken = grant === null ? null : keyRefused(scripted.script, grant, new URL(asked.url));
      if (broken !== null) {
        kept.stop = broken;
        throw new Error(broken.why);
      }
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
    const answer = await options.run(
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
    return kept.stop === null ? answer : { refused: kept.stop, log: answer.log, usage: answer.usage };
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
