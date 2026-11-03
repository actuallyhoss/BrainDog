/**
 * A script's run on a host: the sandbox's `ctx.fetch` wired to the one send loop, and the plan's allowance asked first.
 *
 * The kernel leases a `script.run` job and hands a
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
 * sent, and no key was opened. THE ONE EXCEPTION IS A KEY SENT WHERE ITS KEYCHAIN ENTRY DOES NOT OPEN (`keyRefused`), which
 * is a rule broken rather than a provider failing, and refuses the run however the script handles it.
 *
 * NO `node:` IMPORT, and only types from `@braindog/script`, so the Worker can build its runner here too.
 */

import {
  ACTION_MAX_BYTES,
  ACTION_TIMEOUT_MS,
  bankKey,
  cycleAfter,
  grantChosen,
  hostOpened,
  noticeOf,
  PROPOSALS_PER_RUN,
  PROPOSE_CALLS,
  SCRIPT_NOTICES_PER_DAY,
  scriptOwner,
  storeAfter,
  storeKeyFault,
  type ActionRequest,
  type CycleLine,
  type Entry,
  type ScriptRunner,
  type Scripted,
} from '@braindog/kernel';
import { fixOf } from '@braindog/ports';
import type { CallContext, RecordApi } from '@braindog/record';
import type { CtxHost, HostRequest, HostResponse, Json, ScriptAnswer, ScriptDecl, ScriptRefusal } from '@braindog/script';

import { pass, sendAction, type Admissions, type Execute, type Ledger, type OpenKey, type Pin, type Send } from './actions.ts';
import { SLASH_KEY_LABEL } from './slash.ts';

/** One run of one script in a sandbox: `runInQuickJs` on the self-host, a Dynamic Worker on Cloud. */
export type RunSandbox = (decl: ScriptDecl, host: CtxHost) => Promise<ScriptAnswer>;

/**
 * The grant a keychain label names, or `null`. By reference: an id, a label and what its keychain entry says it opens, never
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
  /**
   * The run's `ctx.propose`, built from what was leased (`scriptProposals`). ABSENT IS A HOST THAT FILES NOTHING, and the
   * script is handed no `ctx.propose`: a trial by an agent (`script-try.ts`) is one, since it files nothing by design.
   */
  propose?: ((s: Scripted) => ScriptProposals) | undefined;
  /**
   * The run's `ctx.notify` and `ctx.store` (`scriptState`), over the record's count and store. ABSENT IS A HOST THAT KEEPS
   * NEITHER, and the script is handed neither; `finishScript` refuses a run that hands back notices with no `tell`.
   */
  state?: ((s: Scripted) => ScriptState) | undefined;
  /**
   * The run's `ctx.ask`: one question to Slash's model on the record's allowance (`scriptAsks`). ABSENT IS A HOST WITH NO
   * MODEL, and a script that declares `model:` is handed a `ctx.ask` that answers so, as a value it reads.
   */
  ask?: ((s: Scripted) => ScriptAsk) | undefined;
  /**
   * `true` for a trial (`script-try.ts`): `ctx.notify` and `ctx.ask` are dry, checked and answered `{ ok, dry: true }`,
   * sending nothing and spending nothing, and what `ctx.store.set` keeps is never applied, since a trial is never applied.
   */
  trial?: boolean | undefined;
  /** The host clock, which `ctx.now()` reads. Absent is `Date.now`. */
  now?: (() => number) | undefined;
  /**
   * `true` for a trial by an agent (`script-try.ts`): a fetch that is not a GET or a HEAD, or that carries a body, is
   * refused unsent with `readOnlyRefused`'s sentence, as a rejected promise the run goes on from. Absent is `false`, a scheduled run's, whose sends the owner approved in Decide.
   */
  readOnly?: boolean | undefined;
};

/**
 * The sentence a trial by an agent answers a fetch that would write, or `null` for a read it may send.
 *
 * A DRAFT HAS BEEN APPROVED BY NOBODY, AND A TOKEN'S TRIAL OF ONE SENT WHATEVER IT ASKED. It opened no key, but a POST
 * needs none to reach a public form or webhook, so any propose token could make the host write to an outside service
 * the draft named, on the owner's plan. A read is what a trial is for; a send waits for the owner's accept. A body on a
 * GET is refused too, because a server may act on one. The host's name only: the path and the body can hold values.
 */
export function readOnlyRefused(method: string, url: string, body: string | null): string | null {
  const asked = method.toUpperCase();
  if ((asked === 'GET' || asked === 'HEAD') && (body === null || body === '')) return null;
  let host = 'its server';
  try {
    host = new URL(url).hostname;
  } catch {
    /* NOT A URL IS NOT THIS CHECK'S QUESTION; it is refused unsent either way, and the sentence names no part of it. */
  }
  return `A trial by an agent only reads, so the ${asked} to ${host} was not sent. Propose the script, and its runs send it once the owner accepts.`;
}

/**
 * An executor that refuses every write a trial by an agent asks, before `execute` is reached, for a host whose sandbox
 * sends through an `Execute` of its own rather than `scriptRunner`'s fetch: the Worker's `runScript`.
 */
export function readOnlyExecute(execute: Execute): Execute {
  return async (request) => {
    const why = readOnlyRefused(request.method, request.url, request.body ?? null);
    return why === null ? execute(request) : { refused: { code: 'PULL_REQUEST_REFUSED', fix: why }, bytes: 0, ms: 0, requests: 0 };
  };
}

/** The fields of `register` a script is never told about: `secret`, and `list<secret>`. */
function sealedOf(api: Pick<RecordApi, 'kernel'>, register: string): Set<string> {
  const decl = api.kernel.register(register);
  return new Set((decl?.fields ?? []).filter((f) => f.type === 'secret' || (f.type === 'list' && f.of === 'secret')).map((f) => f.id));
}

/**
 * One row as a script is handed it: every field but a secret.
 *
 * A SECRET FIELD HOLDS A GRANT ID, NOT THE KEY, AND IT IS STILL TAKEN OFF. It says which keychain entry opens what, and a
 * script can copy anything it is handed into a row it writes or a line of its log, both of which people read who were
 * never shown the keychain. The script names its keys by label in `keys:` and the host opens them; it never needs to know
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
 * back out of how many rows came home: measured: the whole id written into a row in
 * one run (`apps/selfhost/test/script-reads.test.ts`). Every value in the tree is walked, not only `all`, `any` and
 * `none`, so a group shape added later is covered without anyone remembering this function; a leaf names its field by
 * id only (`IDENT` there), so the id is the one spelling to catch.
 */
function namesSealed(where: unknown, register: string, sealedIn: (register: string) => Set<string>): string | null {
  if (where === null || typeof where !== 'object') return null;
  const node = where as Record<string, unknown>;
  if (typeof node.field === 'string' && sealedIn(register).has(node.field)) return node.field;
  for (const [key, value] of Object.entries(node)) {
    /* A `pointed` HOP ASKS ITS QUESTION OF ANOTHER LIST, so its leaves name that list's fields and are checked against
       that list's secrets: read against this one's, a hop from projects to clients asked what a client's key holds. */
    const hop = key === 'pointed' && value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    const found =
      hop !== null && typeof hop.register === 'string'
        ? namesSealed(hop.where ?? null, hop.register, sealedIn) ?? (typeof hop.by === 'string' && sealedIn(hop.register).has(hop.by) ? hop.by : null)
        : namesSealed(value, register, sealedIn);
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
 * transaction he deleted.
 *
 * `{ order: "seq" }` asks for the page oldest-made first, by row number. A list answers one page of 50 in ITS OWN
 * order (the Ledger by day, the others by last change), so a script that pages with `seq lt <lowest on the page>`
 * skips rows whenever that is not row-number order. In `seq` order, `seq gt <highest on the page>` walks every row.
 *
 * ANYTHING ELSE IS REFUSED, NOT READ AS NO OPTIONS. A script that meant to ask for its deleted rows and misspelled the
 * question would be answered the live rows alone, and would write the deleted ones back without a word. The record's
 * `list` refuses an `includeDeleted` that is not true or false for the same reason; this refuses first, in the
 * script's own terms, and refuses a key the record would have passed over.
 */
function listOptions(script: string, register: string, options: Json): { includeDeleted?: boolean; order?: { field: string; dir: 'asc' }[] } {
  if (options === null) return {};
  const refused = new Error(
    `${script} listed ${register} with the options ${JSON.stringify(options)}, and a script's list takes {"includeDeleted":true}, {"order":"seq"} or nothing, so nothing was read.`,
  );
  if (typeof options !== 'object' || Array.isArray(options)) throw refused;
  for (const [key, value] of Object.entries(options)) {
    if (key === 'includeDeleted' && typeof value === 'boolean') continue;
    if (key === 'order' && value === 'seq') continue;
    throw refused;
  }
  const asked = options['includeDeleted'];
  return { ...(typeof asked === 'boolean' ? { includeDeleted: asked } : {}), ...(options['order'] === 'seq' ? { order: [{ field: 'seq', dir: 'asc' as const }] } : {}) };
}

/**
 * The reads a script's `ctx.record` is built from, on either host: the record's own `list` and `get`, asked as the
 * script's actor with its `reads` as the ceiling.
 *
 * `system`, BECAUSE A SCHEDULED RUN HAS NO PERSON BEHIND IT, and `registers` is what keeps it to its reads. A `get` of a
 * spoken id outside them answers as a row that is not there, the record's answer to any caller who may not read it,
 * so the prefix `runInQuickJs` cannot resolve is resolved here by the only party that can.
 *
 * THE WORKER HAD THIS INLINE AND THE SELF-HOST DID NOT HAVE IT AT ALL: its `CtxHost` carried no `list`
 * and no `get`, so `reads: ["clients"]` ran on the Cloud and was refused at home as "read clients, which is not in its
 * reads" (`apps/selfhost/test/script-reads.test.ts`). One copy here is what keeps the two answering alike.
 */
export function scriptReads(api: Pick<RecordApi, 'kernel' | 'list' | 'get'>): (s: Scripted) => ScriptReads {
  return (s) => {
    const as: CallContext = { principal: { kind: 'system', id: s.scripted.actor }, registers: s.scripted.decl.reads };
    return {
      list: async (register, where, options = null) => {
        /* A SENTENCE IS REFUSED BEFORE THE TREE IS WALKED, because `namesSealed` cannot see into one and the record's
           `list` reads a string as a sentence. Measured before this line (`script-reads.test.ts`): `token is set`, `token is empty` and `token is <grant id>` each answered which client
           holds a key, while the same question as a tree was refused. Refused rather than parsed, because a tree is what
           the grammar tells a script to write, and parsing here would be a second reader of sentences that has to agree
           with the kernel's on every word it adds. */
        if (where !== null && (typeof where !== 'object' || Array.isArray(where)))
          throw new Error(
            `${s.scripted.script} filtered ${register} with ${JSON.stringify(where)}, and a script filters with a predicate tree, such as {"field":"name","is":"Acme"}, so nothing was read.`,
          );
        const sealed = namesSealed(where, register, (r) => sealedOf(api, r));
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
 * `ctx.propose` for one run: `propose` answers the script, `queued` is what the run hands back to be filed with its
 * writes when it is applied (`finishScript`).
 */
export type ScriptProposals = { propose(proposal: Json): Promise<Json>; queued(): Json[] };

/**
 * The proposals a script's `ctx.propose` is built from, on either host: each one tried against the record's own gate
 * (`kernel.scriptProposal`), signed as the run, and queued to be filed with the run's writes.
 *
 * WHAT A SCRIPT MAY ASK IS WHAT IT MAY WRITE. A rowset over a list outside its `writes:`, or an option whose patches
 * change one, is refused before the gate is asked (`proposalOf`), and so is any kind but `rowset` and `options`: a
 * script keeps rows, and a change to the record's lists, automations or add-ons is a person's or an agent's to propose.
 *
 * NOTHING IS FILED HERE. The gate is asked inside a savepoint that is always taken back, so the script hears exactly
 * what the gate says (the refusal in its usual shape, `joined` for a question already waiting, `answered` for one the
 * person already answered) and the question goes in only when the run is applied, all or nothing with its writes.
 *
 * AND IT IS COUNTED. At most `PROPOSALS_PER_RUN` (20) questions a run files; a call that would file one more is
 * refused `OUT_OF_BOUNDS` as a value the script reads, never a throw, so the next run files the rest once these are
 * waiting. At most `PROPOSE_CALLS` (200) calls a run, filed or not, since each one is tried on the record's thread.
 * One counter a run, so `scriptProposals` is called once for each.
 */
export function scriptProposals(api: Pick<RecordApi, 'kernel'>): (s: Scripted) => ScriptProposals {
  return (s) => {
    const { script, actor, decl } = s.scripted;
    const queue: Json[] = [];
    let calls = 0;
    const refused = (fix: string): Json => ({ ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix, at: 'proposal' } });
    return {
      propose: async (proposal) => {
        calls += 1;
        if (calls > PROPOSE_CALLS) return refused(`${script} proposed more than ${PROPOSE_CALLS} times in one run, so this one was not tried.`);
        const tried = api.kernel.scriptProposal({ script, actor, writes: decl.writes }, proposal);
        if (!tried.ok) return JSON.parse(JSON.stringify(tried)) as Json;
        if (tried.value.queued !== null) {
          if (queue.length >= PROPOSALS_PER_RUN)
            return refused(`${script} may file ${PROPOSALS_PER_RUN} questions in one run, and this would be one more. The next run files it once these are waiting.`);
          queue.push(tried.value.queued as unknown as Json);
        }
        return { ok: true, value: tried.value.said as unknown as Json };
      },
      queued: () => [...queue],
    };
  };
}

/** `ctx.ask` for one run: a question to Slash's model, answered `{ ok, text }` or `{ ok: false, refusal }`. */
export type ScriptAsk = (prompt: string) => Promise<Json>;

/** The longest question a script may ask the model, in characters. */
export const ASK_CHARS = 4_000;

/**
 * `ctx.ask` over a host's Slash: the question as an automation's `ask_slash` is asked (`answer` in `@braindog/slash`), in
 * text, metered on the record's own allowance and refused when it is spent, in Slash's words. `answer` is the host's
 * `SlashAnswer`, or `undefined` on a host with no model, where every question is answered with a refusal the script reads.
 */
export function scriptAsks(answer: ((ask: { run: string; rule: string; step: number; question: string; shape: 'text' }) => Promise<unknown>) | undefined): (s: Scripted) => ScriptAsk {
  return (s) => {
    let step = 0;
    return async (prompt) => {
      const no = (code: string, fix: string): Json => ({ ok: false, refusal: { code, fix, at: 'ask' } });
      if (prompt.trim() === '') return no('REQUIRED_MISSING', 'ctx.ask takes the question as text.');
      if (prompt.length > ASK_CHARS) return no('OUT_OF_BOUNDS', `A question to the model is at most ${ASK_CHARS} characters.`);
      if (answer === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog has no model for Slash to ask, so nothing was asked.');
      const out = (await answer({ run: s.job.id, rule: `script.${s.scripted.script}`, step: step++, question: prompt, shape: 'text' })) as
        | { ok: true; value: { text: string } }
        | { ok: false; refusal?: { code: string; fix: string } };
      if (out.ok) return { ok: true, text: String(out.value.text) };
      const r = out.refusal ?? { code: 'INTERNAL', fix: 'Slash did not answer.' };
      return no(r.code, r.fix);
    };
  };
}

/** `ctx.notify` and `ctx.store` for one run, and what they queued for `finishScript`. */
export type ScriptState = {
  notify(said: Json): Promise<Json>;
  storeGet(key: string): Promise<Json>;
  storeSet(key: string, value: Json): Promise<Json>;
  queued(): { notices: Json[]; stored: { key: string; value: Json }[] };
};

/**
 * The run's `ctx.notify` and `ctx.store`, on either host: each notice checked (`noticeOf`) and counted against what its
 * add-on has left today, each store change checked against the 1 MB its add-on keeps (`storeAfter`), and both queued to be
 * applied with the run's writes. A store read sees this run's own changes first. NOTHING IS WRITTEN HERE: `finishScript`
 * checks both again and applies them, all or nothing.
 *
 * A REFUSAL IS A VALUE THE SCRIPT READS, `{ ok: false, refusal }`, never a throw: the twenty-first notice of a day is
 * news for the script, not a broken rule. Whether it may notify or keep state at all is the sandbox's to hold, from the
 * header, before this is asked.
 */
export function scriptState(api: Pick<RecordApi, 'kernel'>): (s: Scripted) => ScriptState {
  return (s) => {
    const owner = scriptOwner({ script: s.scripted.script, pack: s.scripted.pack ?? null });
    const notices: Json[] = [];
    const stored: { key: string; value: Json }[] = [];
    let store: Record<string, unknown> | null = null;
    const now = (): Record<string, unknown> => (store ??= api.kernel.scriptStore(owner));
    const refused = (r: { code: string; fix: string; at?: string | undefined }): Json => ({ ok: false, refusal: { code: r.code, fix: r.fix, ...(r.at === undefined ? {} : { at: r.at }) } });
    return {
      notify: async (said) => {
        const one = noticeOf(said);
        if (!one.ok) return refused('refusal' in one ? one.refusal : { code: 'VALUE_MALFORMED', fix: 'It is not a notice.' });
        if (notices.length >= api.kernel.scriptNoticesLeft(owner))
          return refused({ code: 'OUT_OF_BOUNDS', fix: `An add-on sends at most ${SCRIPT_NOTICES_PER_DAY} notices a day, and this one has sent them. It goes again tomorrow.`, at: 'notice' });
        notices.push(one.value as unknown as Json);
        return { ok: true };
      },
      storeGet: async (key) => {
        const fault = storeKeyFault(key);
        if (fault !== null) throw new Error(fault);
        const v = now()[key];
        return v === undefined ? null : (v as Json);
      },
      storeSet: async (key, value) => {
        const after = storeAfter(now(), [{ key, value }]);
        if (!after.ok) return refused('refusal' in after ? after.refusal : { code: 'OUT_OF_BOUNDS', fix: 'It was not kept.' });
        store = after.value;
        stored.push({ key, value });
        return { ok: true };
      },
      queued: () => ({ notices: [...notices], stored: [...stored] }),
    };
  };
}

/** The longest text `ctx.fold` folds, in characters, and the most it answers in one run. */
export const FOLD_CHARS = 512;
export const FOLD_CALLS = 1000;

/** `ctx.fold` for one run: a payee as a bank wrote it, to the key the kernel files that payee under, or `null`. */
export type ScriptFold = (text: string) => Promise<string | null>;

/**
 * The fold a script's `ctx.fold` is built from, on either host: the kernel's own `bankKey`, and nothing beside it.
 *
 * THE KERNEL'S, BECAUSE A SANDBOX RUNS ITS SCRIPT'S TEXT ALONE. Folding a bank's spelling of a payee (the processor's
 * prefix, the place and the reference numbers cut) is tables the kernel holds, and a script that compared names without
 * them compared letters and digits: a payment the bank wrote with its processor and its city never met the bill that
 * names the payee plainly. A second copy of the tables in a script would be a second idea of who a payee is, so the
 * host answers with the one the record's own identities are keyed by.
 *
 * IT READS NOTHING AND WRITES NOTHING: a text in, a key out, the same on every record. So it needs no `reads`, no
 * actor and no approval, and a script is handed it whatever it declares.
 *
 * THE HOST'S WORK IS NOT ON THE SANDBOX'S METER, so it is held here. A text longer than `FOLD_CHARS` answers `null`,
 * which a script reads as no payee: that can miss a match and cannot make one, where folding the first part of it
 * could cut a different word than the kernel would. A run that asks more than `FOLD_CALLS` times is refused the rest
 * as a rejected promise, as a refused fetch is. One counter a run, so `scriptFold` is called once for each.
 */
export function scriptFold(script: string): ScriptFold {
  let asked = 0;
  return async (text) => {
    asked += 1;
    if (asked > FOLD_CALLS) throw new Error(`${script} asked for more than ${FOLD_CALLS} payee keys in one run, so no more were answered.`);
    return typeof text !== 'string' || text.length > FOLD_CHARS ? null : bankKey(text);
  };
}

/** The longest line `ctx.cycle` reads, in characters of its JSON, and the most it answers in one run. */
export const CYCLE_CHARS = 16_384;
export const CYCLE_CALLS = 1000;

/** `ctx.cycle` for one run: the next day (YYYY-MM-DD) a repeating line's money moves on after `day`, or `null`. */
export type ScriptCycle = (day: string, line: Json) => Promise<string | null>;

/**
 * The step a script's `ctx.cycle` is built from, on either host: the kernel's own `cycleAfter`, and nothing beside it.
 *
 * THE WALK'S, BECAUSE A SANDBOX RUNS ITS SCRIPT'S TEXT ALONE. The day a paid line's "Next" moves to is the forecast's
 * arithmetic (the cycle tables, days of the month, month ends, rest days), and a script that worked it out itself
 * would be a second idea of when a line is due, one the forecast does not walk. So the host answers with the walk's.
 *
 * THE SCRIPT HANDS THE LINE AS `cycleAfter` READS IT: `{ leg, fields, rest?, anchorDay? }`, the leg being the fields
 * a pack's forecast leg names (`on`, `every`, `ends`, `days`, `weekend`). Like `fold` it reads nothing of the record
 * and writes nothing, so it needs no `reads` and is handed to every script.
 *
 * A BAD DAY OR A BAD LINE ANSWERS `null`, which a script reads as no next day, and the host never throws for one: a
 * day that is not a calendar day, a line that is not the shape above or is longer than `CYCLE_CHARS`, or anything the
 * kernel itself gives out on. Only the count throws: a run that asks more than `CYCLE_CALLS` times is refused the
 * rest as a rejected promise, as `fold` is. One counter a run, so `scriptCycle` is called once for each.
 */
export function scriptCycle(script: string): ScriptCycle {
  let asked = 0;
  return async (day, line) => {
    asked += 1;
    if (asked > CYCLE_CALLS) throw new Error(`${script} asked for more than ${CYCLE_CALLS} next days in one run, so no more were answered.`);
    const read = isCalendarDay(day) ? cycleLineOf(line) : null;
    if (read === null) return null;
    try {
      return cycleAfter(day, read);
    } catch {
      return null;
    }
  };
}

/** A day as `YYYY-MM-DD` that the calendar holds: 2026-02-30 is not one. */
function isCalendarDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isName = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isCount = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 1;
const isPair = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 2 && v.every((d) => Number.isInteger(d) && d >= 1 && d <= 31) && v[0] < v[1];
const tableOf = (v: unknown, each: (n: unknown) => boolean): boolean => v === undefined || (isPlain(v) && Object.values(v).every(each));

/**
 * A script's line as `cycleAfter` reads it, or `null` when it is not one. Checked to the field: the line crossed from
 * a sandbox as JSON, and a leg the kernel was handed half-formed could answer a day rather than none.
 */
function cycleLineOf(line: Json): CycleLine | null {
  let size: number;
  try {
    size = JSON.stringify(line)?.length ?? Infinity;
  } catch {
    return null;
  }
  if (size > CYCLE_CHARS || !isPlain(line) || !isPlain(line.leg) || !isPlain(line.fields)) return null;
  const { leg, fields, rest, anchorDay } = line;
  if (!isName(leg.on)) return null;
  for (const name of ['ends', 'days', 'weekend'] as const) if (leg[name] !== undefined && !isName(leg[name])) return null;
  const every = leg.every;
  if (every !== undefined) {
    if (!isPlain(every) || !isName(every.field)) return null;
    if (!tableOf(every.months, isCount) || !tableOf(every.weeks, isCount) || !tableOf(every.twice, isPair)) return null;
  }
  if (rest !== undefined && !(Array.isArray(rest) && rest.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))) return null;
  if (anchorDay !== undefined && anchorDay !== null && typeof anchorDay !== 'number') return null;
  return {
    leg: leg as CycleLine['leg'],
    fields,
    ...(rest === undefined ? {} : { rest: rest as number[] }),
    ...(typeof anchorDay === 'number' ? { anchorDay } : {}),
  };
}

/**
 * Why a script may not send `grant` to `at`, or `null` when it may. The refusal is `FORBIDDEN` and is a rule broken, so
 * it refuses the whole run on both hosts, as a key the script does not declare does.
 *
 * A KEY GOES ONLY TO THE HOST ITS KEYCHAIN ENTRY SAYS IT OPENS. A script names its keys and its origins as two lists, and
 * nothing joined them: a probe sent `goldapi`, whose entry opens `api.gold.test`, to
 * `collector.test` as a bearer, because that origin was also in the script's `egress:`, and the one line the owner
 * approves names both lists without saying which host gets the key. A `call` has one host and one grant, so the pairing
 * was implicit there; a script is the first declaration that can hold two origins and one key. The host is compared
 * exactly, with no subdomain let in: `opens: stripe.com` does not open `api.stripe.com`, because a keychain entry that names
 * a parent would otherwise open every name under it, whoever holds them.
 *
 * AND NEVER THE KEYCHAIN'S `slash` KEY, WHATEVER IT OPENS. On a host with no `SLASH_KEY` it is the key the included model
 * answers everybody with, which `slashGuardedEngine` already refuses as a tier `b` key for the same reason. It is
 * matched on the label the lookup found, so naming it by its grant id is refused too.
 */
export function keyRefused(script: string, grant: ScriptGrant, at: URL): ScriptRefusal | null {
  if (grant.label === SLASH_KEY_LABEL)
    return { code: 'FORBIDDEN', why: `${script} named the keychain's "${SLASH_KEY_LABEL}" key, which is the key this host's included model answers with, and a script may not send it anywhere.` };
  const host = at.hostname.replace(/\.$/, '');
  if (hostOpened(grant.opens) === host) return null;
  return {
    code: 'FORBIDDEN',
    why: `The key "${grant.label}" opens ${hostOpened(grant.opens) ?? JSON.stringify(grant.opens ?? '')}, and ${script} fetched ${host} with it, so nothing was sent. A script sends a key only to the host its keychain entry says it opens.`,
  };
}

/**
 * AN ADDRESS HELD IN THE KEYS, READ AND HELD TO THE SCRIPT'S EGRESS (round 1030): what both hosts do with a fetch that
 * names `address` (`HostRequest.address`), after opening the key and before sending. The secret is read as an https URL,
 * `webcal://` as `https://` since that is how calendars hand theirs out; its origin must be one the script declares, it
 * may carry no user name or password, and a key whose entry says what it opens must open that host. The answer is the
 * URL to send, with no key, or the refusal, which names the host and never the address: the address is the secret.
 */
export function addressed(script: string, egress: readonly string[], grant: ScriptGrant, secret: string): { url: URL } | ScriptRefusal {
  if (grant.label === SLASH_KEY_LABEL) return { code: 'FORBIDDEN', why: `${script} named the keychain's "${SLASH_KEY_LABEL}" key as an address, which it may not.` };
  let url: URL;
  try {
    url = new URL(secret.trim().replace(/^webcal:\/\//iu, 'https://'));
  } catch {
    return { code: 'PULL_ORIGIN_REFUSED', why: `The key "${grant.label}" does not hold an address, so ${script} sent nothing. Put the whole link in it.` };
  }
  if (url.protocol !== 'https:') return { code: 'PULL_ORIGIN_REFUSED', why: `The key "${grant.label}" holds a ${url.protocol} address; ${script} fetches https:// addresses only.` };
  if (!egress.includes(url.origin))
    return { code: 'PULL_ORIGIN_REFUSED', why: `The key "${grant.label}" holds an address at ${url.hostname}, which ${script} does not declare, so nothing was sent.` };
  if (url.username !== '' || url.password !== '')
    return { code: 'PULL_ORIGIN_REFUSED', why: `The key "${grant.label}" holds an address with a user name or password in it, which ${script} may not send.` };
  const opens = hostOpened(grant.opens);
  if (opens !== null && opens !== '' && opens !== url.hostname.replace(/\.$/, ''))
    return { code: 'FORBIDDEN', why: `The key "${grant.label}" opens ${opens}, and holds an address at ${url.hostname}, so nothing was sent.` };
  return { url };
}

/**
 * What of an address held in the keys the executor strikes from the answer (`ActionRequest.scrub`), longest first: the
 * key as it was kept, the URL as sent, its path with its query, and each part of either long enough to be a token. A
 * provider that echoes the address, whole or only its path or its token, hands the script nothing of the secret.
 *
 * A SHORT PART IS LEFT, because `calendar` or `basic.ics` is no secret and striking it would garble every answer; the
 * executor drops anything under eight characters in any case (`spellingsOf`).
 */
export function addressSecrets(secret: string, url: URL): string[] {
  const texts = new Set<string>([secret.trim(), url.href, `${url.pathname}${url.search}`, url.search.slice(1)]);
  for (const segment of url.pathname.split('/')) if (segment.length >= 16) texts.add(segment);
  url.searchParams.forEach((value) => {
    if (value.length >= 8) texts.add(value);
  });
  return [...texts].filter((t) => t.length >= 8 && t !== '/').sort((a, b) => b.length - a.length);
}

/**
 * The refusal for a script that declares the keychain's `slash` key, asked before its sandbox starts, or `null`.
 *
 * BEFORE THE SANDBOX AND NOT ONLY AT THE FETCH, so a script that names the key and never uses it is refused all the
 * same: a declaration that names the included model's key is one the owner should not have been asked to approve.
 * Refusing it at install is the kernel's (`declare.ts`), which this file does not reach.
 */
export function slashDeclared(script: string, keys: readonly string[]): ScriptRefusal | null {
  if (!keys.includes(SLASH_KEY_LABEL)) return null;
  return { code: 'FORBIDDEN', why: `${script} declares the keychain's "${SLASH_KEY_LABEL}" key, which is the key this host's included model answers with, and a script may not name it.` };
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

    const fetch = async (sent: HostRequest): Promise<HostResponse> => {
      let asked = sent;
      /* WHAT OF A KEY USED AS THE ADDRESS THE EXECUTOR STRIKES FROM ITS ANSWER (`addressSecrets`): it goes out with no
         grant, so `sendAction` would not otherwise know it is a secret. */
      let scrub: string[] = [];
      if (kept.stop !== null) throw new Error(kept.stop.why);
      /* BEFORE THE KEY IS LOOKED UP, so a write by an agent's trial reaches neither the keychain nor the socket. A rejected
         promise like a refused key's: the script may catch it and go on reading. */
      const unread = options.readOnly === true ? readOnlyRefused(asked.method, asked.url, asked.body) : null;
      if (unread !== null) throw new Error(unread);
      /* AN ADDRESS HELD IN THE KEYS is opened here and read by `addressed`; what it sends is that URL with no key. A rule
         broken by the address is kept, as a key sent elsewhere is. */
      if (typeof asked.address === 'string') {
        const held = options.grantOf(asked.address);
        if (held === null) throw new Error(`The key "${asked.address}" is not in the keychain, so nothing was sent. Put the link in your keys under that name.`);
        const secret = options.openKey === null ? null : await options.openKey(held);
        if (secret === null) throw new Error(`The key "${asked.address}" could not be opened, so nothing was sent.`);
        const read = addressed(scripted.script, scripted.decl.egress, held, secret);
        if (!('url' in read)) {
          kept.stop = read;
          throw new Error(read.why);
        }
        asked = { ...asked, url: read.url.href, key: null, address: null };
        scrub = addressSecrets(secret, read.url);
      }
      const grant = asked.key === null ? null : options.grantOf(asked.key);
      if (asked.key !== null && grant === null) throw new Error(`The key "${asked.key}" is not in the keychain, so nothing was sent.`);
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
        ...(scrub.length === 0 ? {} : { scrub }),
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
    const proposals = options.propose?.(s);
    /* `ctx.notify`, `ctx.store` AND `ctx.ask`, only for a header that says it may (the sandbox holds that), and dry in a
       trial: a notice is checked and goes nowhere, and the model is not asked, so a try spends none of the allowance. */
    const state = options.state?.(s);
    const asked = options.ask?.(s);
    const dry = options.trial === true;
    /* HANDED WHATEVER THE HEADER SAYS, so a script that never said it may hears the sandbox's sentence (`FORBIDDEN`,
       "its header does not say ...") and not a bare "not a function"; the sandbox holds the header before calling here. */
    const extra: Partial<CtxHost> = {
      ...(state !== undefined
        ? { notify: dry ? async (said: Json) => { const out = (await state.notify(said)) as { ok?: boolean }; return out.ok ? { ok: true, dry: true } : (out as Json); } : state.notify }
        : {}),
      ...(state !== undefined ? { storeGet: state.storeGet, storeSet: state.storeSet } : {}),
      ...(state !== undefined || asked !== undefined
        ? { ask: dry ? async () => ({ ok: true, dry: true, text: '' }) : (asked ?? (async () => ({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog has no model for Slash to ask, so nothing was asked.', at: 'ask' } }))) }
        : {}),
    };
    /* `fold` AND `cycle` ARE HANDED BESIDE THE REST, to every script whatever it declares: one `scriptFold` and one
       `scriptCycle` a run, so the counts they keep are this run's. The Worker hands the same from its own turn
       (`apps/worker/src/script.ts`). */
    const host: CtxHost = {
      fetch,
      ...(reads === undefined ? {} : { list: reads.list, get: reads.get }),
      ...(proposals === undefined ? {} : { propose: proposals.propose }),
      ...extra,
      fold: scriptFold(scripted.script),
      cycle: scriptCycle(scripted.script),
      now: () => new Date(now()).toISOString(),
      tz: scripted.record.tz,
      input: (scripted.input ?? null) as Json,
      /* The owning pack's settings, which `prepareScript` read when the run was leased; `{}` for a script no pack owns. */
      config: (scripted.config ?? {}) as Json,
    };
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
        ...(decl.notifies === true ? { notifies: true } : {}),
        ...(decl.model === undefined ? {} : { model: decl.model }),
        ...(decl.store === true ? { store: true } : {}),
      },
      host,
    );
    if (kept.stop !== null) return { refused: kept.stop, log: answer.log, usage: answer.usage };
    /* WHAT IT PROPOSED GOES BACK BESIDE ITS WRITES, for `finishScript` to file with them; a refused run files none. */
    const queued = proposals?.queued() ?? [];
    if ('refused' in answer) return answer;
    /* AND WHAT IT TOLD AND KEPT, beside them, for `finishScript` to check again and apply with them. */
    const held = state?.queued();
    return {
      ...answer,
      ...(queued.length === 0 ? {} : { proposals: queued }),
      ...(held === undefined || held.notices.length === 0 ? {} : { notices: held.notices }),
      ...(held === undefined || held.stored.length === 0 ? {} : { stored: held.stored }),
    };
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
