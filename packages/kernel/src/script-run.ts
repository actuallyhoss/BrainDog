/**
 * A script's run, applied: what the record does with a `script.run` job before and after a host's sandbox runs it.
 *
 * `script.ts` fires one `script.run` outbox row. The pass (`actions.ts` `runActions`) leases it with every other job,
 * `prepareScript` turns it into a `Scripted` job carrying the declaration at the version it fired under, the host runs
 * the source, and `finishScript` applies what came back. This file never runs anything, for the reason `script.ts`
 * gives.
 *
 * THE SANDBOX'S ANSWER IS A REQUEST, NOT A WRITE. Each write it asks for is checked against the declaration's own
 * `writes:` here, on the record's side, and then goes through the ordinary write path as `script:<id>@v<n>`, so the
 * register's schema, coercion and rules apply exactly as they do to a person's write. The sandbox checks `writes:` too
 * (`@braindog/script`), and this is the second check on purpose: a host is code the record does not control, and a
 * register the owner never approved is the one thing a script must not reach whatever ran it.
 *
 * ALL OR NOTHING. The writes go in one savepoint (`tx.ts` `attempt`), so the third of three refused by its register
 * takes the first two back with it. A half-run that left half a ledger is what the design's point 4 exists to prevent,
 * and a refusal is a value here rather than a throw, which is exactly the case `attempt` was written for.
 *
 * WHY THE ANSWER TYPE IS COPIED AND NOT IMPORTED. `@braindog/script` is rank 12 and the kernel is rank 7 (`31-STACK`
 * section 2), so the shape is written out here structurally, as `PullHandoff` is for the connector. The self-host's
 * test hands a real `ScriptAnswer` to this file, and that is where a drift between the two goes red.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { meter, pause, type ActionDeps, type Metered } from './actions.ts';
import type { Json } from './coerce.ts';
import { readPackConfig } from './declare.ts';
import { SCRIPT_CHAIN_CEILING, chainOfJob, underChain } from './flow.ts';
import { instant } from './migrate.ts';
import type { OutboxRow } from './outbox.ts';
import { activeScript, type ScriptBody } from './script.ts';
import { attempt } from './tx.ts';

/**
 * A write the sandbox asked for. Structurally `@braindog/script`'s `ScriptWrite`.
 *
 * AN UPDATE'S `version` MAY BE NO NUMBER AT ALL, whatever the type says. `ctx.update(spoken, patch)` with no version
 * crosses from the prelude as `NaN`, and as `null` from any host that puts the answer through JSON, and `finishScript`
 * reads anything that is not a whole number as "none was given" (see the note at the write).
 */
export type ScriptWrite =
  | { op: 'create'; register: string; fields: unknown }
  | { op: 'update'; spoken: string; patch: unknown; version: number };

/**
 * The one question a run may end by asking: what the script returned as `{ ask }`, beside its writes.
 *
 * `unknown` ON THE ANSWER AND THIS SHAPE ONLY AS THE PROMISE, because it is the script's own return value carried out of
 * the sandbox untouched, so `finishScript` reads every part of it as it would a stranger's. Each option's patches are the
 * writes picking it makes, in the words a script already uses for `ctx.update`: a spoken id, the version it read, the
 * fields. `about` is what the question is about, one name or a list of them.
 */
export type ScriptAsk = {
  cause?: string;
  question: string;
  about?: string | string[];
  options: { label: string; id?: string; because?: string; patches?: { id: string; version: number; fields: Record<string, unknown> }[] }[];
};

/** What the sandbox spent. Structurally `@braindog/script`'s `ScriptUsage`. */
export type ScriptUsage = { fetches: number; bytes: number; wall_ms: number; cpu_ms: number };

/**
 * What a host hands back for one run: `@braindog/script`'s answer, or `held` when the plan's allowance stopped it before
 * the sandbox started. `held` is the host's to say because the allowance is the Directory's, exactly as for a `call`.
 */
export type ScriptAnswer =
  | { writes: ScriptWrite[]; log: string; usage: ScriptUsage; ask?: unknown; proposals?: unknown }
  | { refused: { code: string | null; why: string }; log: string; usage: ScriptUsage }
  | { held: { until: number; say: string } };

/** Why no sandbox answered: this host has none (`dropped`), or the host's own adapter threw (`failed`). The pass says it. */
export type ScriptUnrun = { unrun: 'dropped' | 'failed'; say: string; ms: number };

/** A leased `script.run`, ready for a host: everything its sandbox is allowed to know, and nothing else. */
export type Scripted = {
  job: OutboxRow;
  /** The first origin's host, which the meter names as a `call`'s host. `null` for a script that fetches nothing. */
  host: string | null;
  scripted: {
    script: string;
    /** The declaration's `title`, which the run line names it by when it has one (last-day-48). */
    title?: string;
    /** The version it fired under, and the one whose source runs, even if a newer one was accepted since. */
    version: number;
    /** `script:<id>@v<n>`: what every row it writes says wrote it. */
    actor: string;
    input: unknown;
    /**
     * `ctx.config`: the owning pack's settings as they stand when the run is leased, each a chosen value or else its
     * default (or `null` when it has neither), and `{}` for a script no pack owns.
     *
     * READ AT THE RUN, NOT AT INSTALL, unlike a `{{config:}}` in a declaration. A script's source is the owner's approved
     * code and a setting only changes what it is handed, the way `input` does, so a change on the settings screen holds
     * from the next run with no reinstall. OPTIONAL IN THE TYPE ONLY: `prepareScript` always sets it, and a host that
     * builds a `Scripted` of its own (a trial, a test's double) and leaves it out hands the sandbox `{}`.
     */
    config?: Record<string, Json>;
    decl: Pick<ScriptBody, 'egress' | 'keys' | 'reads' | 'writes' | 'limits' | 'source'>;
    record: { id: string; tz: string };
  };
};

/** The host's sandbox, handed to `runActions` as the connector runner is. */
export type ScriptRunner = (scripted: Scripted) => Promise<ScriptAnswer>;

export type ScriptRunDeps = Pick<ActionDeps, 'sql' | 'recordId' | 'nowMs' | 'mint' | 'ack' | 'notify' | 'tz'> & {
  /** The kernel's re-entrant transaction, which `attempt` opens its savepoint inside. */
  transaction: <R>(fn: () => R) => R;
  /** The ordinary write path: `ref` null creates, a spoken id or row id updates. */
  write: (register: string, ref: string | null, patch: Record<string, unknown>, w: { actor: string; batch: string; note: string; version?: number }) => Result<unknown>;
  /** The register a spoken id names, or `null` when it names no row. */
  registerOf: (spoken: string) => string | null;
  /**
   * The gate's `propose`, for the one question a run may ask: `govern.ts` checks the body, holds one open question per
   * cause, and answers `joined` when one is already open, or `answered` when the person already answered its cause and
   * nothing was filed (`remembered`), which the run line must not call a new question.
   *
   * OPTIONAL IN THE TYPE ONLY, so a host's own `ScriptRunDeps` (a trial, a test's double) still builds: a run that asks
   * with none here writes what it wrote and says on its line that nobody was asked.
   */
  propose?: (p: { question: string; body_kind: ScriptProposalKind; body: Record<string, unknown>; cause?: string }, actor: string) => Result<{ id: string; joined?: true; widened?: number; answered?: unknown }>;
};

/** How many refused runs in a row pause a script. Design section 2, point 8. */
export const REFUSED_IN_A_ROW = 3;

/**
 * How much of a run's `ctx.log` its event keeps: 8 KB, the design's `ctx` table. `@braindog/script`'s `LOG_BYTES` is the
 * same number, and it is written out again rather than imported for the rank reason in this file's header.
 */
export const LOG_BYTES = 8 * 1024;

/**
 * The most writes one run may hand back: `@braindog/script`'s `CEILINGS.writes`, written out again for the rank reason in
 * this file's header.
 *
 * THE CEILING AND NOT THE DEFAULT OF 200, for the reason `FETCHES_UNSAID` in `actions.ts` gives: both are copies, and
 * if the sandbox's default is ever raised a copied default would refuse every honest run above the old number, where a
 * copied ceiling still holds the line no declaration can move. It also caps a declared `limits.writes` on a script
 * installed before `scriptBody` refused one over `SCRIPT_CEILINGS` (`script.ts`). Measured: 5,000 creates from a script
 * with no limit applied in one transaction of 1.0 to 3.4 seconds, and on a Durable Object that is the record's one
 * thread.
 */
export const WRITES_CEILING = 1_000;

/**
 * The first `LOG_BYTES` of a log, cut on a character boundary.
 *
 * CUT HERE AS WELL AS IN THE SANDBOX, for the reason the writes are checked twice: a host is code the record does not
 * control, and a log is written into the record's own event table, so its size is the record's to hold. The cut backs
 * off any UTF-8 continuation byte, so a three-byte character straddling the line is dropped whole rather than kept as
 * a replacement character.
 */
function cutLog(log: string, most = LOG_BYTES): string {
  const bytes = new TextEncoder().encode(log);
  if (bytes.length <= most) return log;
  let end = most;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/**
 * Keep a run's log on the event `meter` just wrote for it, as `to_v.log`, and hand the metered run back unchanged.
 *
 * ON THE EVENT AND NOT IN `Metered`. `Metered` is the row `meterPass` hands the Directory, which holds counts for every
 * record it serves and never a customer's text, so the log goes beside the counts in the record's own log and nowhere
 * else. The owner reads it where every run is read, `recentHistory`, whose `to` is this `to_v`: a refused run's note says
 * that it was refused, and its log says why, first, since the why quotes what the script chose (`finishScript`).
 *
 * AND THE LISTS THE VERSION READ AND WROTE GO BESIDE IT, as `to_v.lists`, because the log quotes them and nobody else
 * should read it. A run line is about a declaration, and the record hands a line about a declaration to every
 * whole-record reader, so a member at `write` held to `append` on Money, refused `list money`, read "Salary: Omar
 * 91000" off the run line in `recentHistory` and `whatsNew`. `lineOf` in `@braindog/record` now hands the log only to
 * an owner who reads every one of these lists, and `--redacted--` to everybody else, as the ledger hands a money field.
 * They are kept here rather than looked up there because the run outlives its version: the list a retired version read
 * is the one its log quotes. The writes count too, because a log can quote what a fetch brought back before it was
 * written into a list the reader is refused.
 *
 * AN EMPTY LOG ADDS NOTHING, so a script that says nothing leaves the event exactly as a `call`'s.
 */
function keepLog(deps: Pick<ScriptRunDeps, 'sql'>, metered: Metered, log: string, decl: Pick<ScriptBody, 'reads' | 'writes'>): Metered {
  if (typeof log === 'string' && log !== '') {
    const lists = [...new Set([...decl.reads, ...decl.writes])].sort();
    deps.sql.exec("UPDATE event SET to_v = json_set(to_v, '$.log', ?, '$.lists', json(?)) WHERE id = ?", cutLog(log), JSON.stringify(lists), metered.event);
  }
  return metered;
}

const hostOf = (origin: string | undefined): string | null => {
  if (origin === undefined) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * How much one question's `about` may hold: `govern.ts`'s `ABOUT_BYTES`, written out again because govern keeps it to
 * itself. A drift goes red in `script-ask.test.ts`, whose longest list must still file.
 */
export const ABOUT_BYTES = 80;

const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

/**
 * One `about` from a script's: a name as it is, or a list of names joined into one, as many as fit and the rest counted
 * ("Rent, 30 September; Salary, 30 September and 3 more"). `undefined` when it names nothing, so the question carries
 * none rather than a blank the gate refuses.
 *
 * CUT HERE AND NOT REFUSED. A script asking about forty lines is right to, and a question nobody was asked because its
 * list was long would be the run failing for being thorough; the question itself still says how many.
 */
export function aboutOf(about: unknown): string | undefined {
  const names = (Array.isArray(about) ? about : [about]).filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter((a) => a !== '');
  if (names.length === 0) return undefined;
  const more = (k: number) => (k < names.length ? ` and ${names.length - k} more` : '');
  for (let k = names.length; k >= 1; k -= 1) {
    const said = names.slice(0, k).join('; ') + more(k);
    if (bytesOf(said) <= ABOUT_BYTES) return said;
  }
  return cutLog(names[0]!, ABOUT_BYTES - bytesOf(more(1))).trimEnd() + more(1);
}

/** A question as the gate takes it, worked out from a script's `ask`. */
type Asked = { question: string; body: Record<string, unknown>; cause: string };

/**
 * A script's `ask`, checked as its writes are and turned into an `options` question: `{ asked }`, or `{ why }` for the
 * log when the record will not file it.
 *
 * EVERY PATCH IS A WRITE THE SCRIPT ASKS FOR, made later and by somebody else. Picking an option applies its patches
 * signed by the person deciding (`govern.ts` `decide`), so a patch outside the declaration's `writes:` would be the
 * script reaching a list the owner never approved, with the owner's own hand. Checked here like a write, before anything
 * is written, and a bad one refuses the whole run.
 *
 * THE SCRIPT'S WORDS BECOME THE GATE'S SHAPE. `{ id, version, fields }`, the words of `ctx.update`, become the gate's
 * `{ at, version, patch }`; each option gets the `id` and `because` the gate needs, its own when it gave them, else an
 * id from its label and the label as its reason; `about` is joined into one name (`aboutOf`). The cause is the script's,
 * or `script:<id>` for one that gave none, so a daily run asks once whatever it gave.
 */
function askOf(deps: Pick<ScriptRunDeps, 'registerOf'>, script: string, writes: readonly string[], most: number, ask: unknown): { asked: Asked } | { why: string } {
  const only = writes.length ? writes.join(', ') : 'nothing';
  if (!isObject(ask) || typeof ask.question !== 'string' || ask.question.trim() === '' || !Array.isArray(ask.options))
    return { why: `${script} returned an ask that is not a question: it is { question, options: [{ label, patches }] }, with a cause and about if it likes.` };
  const ids = new Set<string>();
  const options: Record<string, unknown>[] = [];
  for (const [i, o] of (ask.options as unknown[]).entries()) {
    if (!isObject(o) || typeof o.label !== 'string' || o.label.trim() === '') return { why: `${script} asked a question whose answer ${i + 1} has no label.` };
    const label = o.label.trim();
    const patches = o.patches ?? [];
    if (!Array.isArray(patches)) return { why: `${script} asked a question whose answer "${label}" carries patches that are not a list.` };
    if (patches.length > most) return { why: `${script} asked a question whose answer "${label}" makes ${patches.length} changes, and one run may make ${most}.` };
    const mapped = [];
    for (const p of patches as unknown[]) {
      if (!isObject(p) || typeof p.id !== 'string' || !isObject(p.fields) || Object.keys(p.fields).length === 0)
        return { why: `${script} asked a question whose answer "${label}" carries a change that is not { id, version, fields }.` };
      const register = deps.registerOf(p.id);
      if (register === null || !writes.includes(register))
        return { why: `${script} asked a question whose answer "${label}" would change ${p.id}${register === null ? ', which names nothing in this BrainDog' : ` in ${register}`}, and it may write only to ${only}.` };
      /* A WHOLE VERSION OR NO QUESTION. A write a run makes may leave it out, but a change made days later by whoever
         answers must say what it read, so a line edited since is not overwritten by an old reading of it. */
      if (typeof p.version !== 'number' || !Number.isSafeInteger(p.version) || p.version < 1)
        return { why: `${script} asked a question whose answer "${label}" changes ${p.id} without the version it read.` };
      mapped.push({ at: p.id, version: p.version, patch: p.fields });
    }
    const own = typeof o.id === 'string' && o.id.trim() !== '' ? o.id.trim() : label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40);
    const id = own === '' || ids.has(own) ? `${own || 'answer'}-${i + 1}` : own;
    ids.add(id);
    const because = typeof o.because === 'string' && o.because.trim() !== '' ? o.because.trim() : label;
    options.push({ id, label, because, ...(mapped.length > 0 ? { patches: mapped } : {}) });
  }
  const about = aboutOf(ask.about);
  const cause = typeof ask.cause === 'string' ? ask.cause : `script:${script}`;
  return { asked: { question: ask.question.trim(), body: { options, ...(about === undefined ? {} : { about }) }, cause } };
}

/* ── `ctx.propose`: questions with rows, filed as the run ─────────────────────────────────────────────── */

/**
 * The kinds of question a script may file through `ctx.propose`: rows to make or change (`rowset`), and answers to pick
 * whose patches are the rows they change (`options`). The two bodies that are about the rows a script already writes.
 *
 * NOT A CHANGE, A PATTERN, A PACK, SETTINGS OR AN ARRANGEMENT. Those change what the record is (its lists, its
 * automations, its add-ons and what they send out), and a script was approved to keep rows. A scheduled run that could
 * file one every night would put "install this" in front of the owner with nobody behind it but code; a person or an
 * agent proposes those.
 */
export const SCRIPT_PROPOSAL_KINDS = ['rowset', 'options'] as const;
export type ScriptProposalKind = (typeof SCRIPT_PROPOSAL_KINDS)[number];

/**
 * The most questions one run may file through `ctx.propose`: twenty. A question that joins one already waiting, or
 * that was answered before, files nothing and is not counted. Past it the call is refused, and the next run files the
 * rest once the first twenty are waiting.
 *
 * TWENTY, BECAUSE A QUEUE IS READ BY A PERSON. One a project for his twenty-seven projects is about the most one night
 * should add; a script that wants more is an import, and wants a different verb.
 */
export const PROPOSALS_PER_RUN = 20;

/** The most times one run may call `ctx.propose`, filed or not: each call is tried against the record, on its thread. */
export const PROPOSE_CALLS = 200;

/** A question a script files, as `ctx.propose` takes it: the MCP `propose` shape, held to the two kinds above. */
export type ScriptProposal = { question: string; body_kind: ScriptProposalKind; body: Record<string, unknown>; cause?: string };

/**
 * What `ctx.propose` answers a script, as the gate would answer it: `queued` for a question that will be filed when the
 * run is applied, the open question's `id` and `joined` when one already asks it (`widened` when this one's further rows
 * were added to it), or its `id` and `answered` when the person already answered this cause.
 */
export type ScriptProposed = { queued?: true; id?: string; joined?: true; widened?: number; answered?: unknown };

/**
 * A script's proposal, checked as its writes are: `{ ok, value }` with the proposal as the gate takes it, or the
 * record's usual refusal. Asked when `ctx.propose` is called and again when the run is applied (`finishScript`).
 *
 * EVERY ROW IT NAMES IS A WRITE THE SCRIPT ASKS FOR, made later and by somebody else, for `askOf`'s reason: accepting a
 * rowset writes its rows signed by the person deciding, so a rowset over a list outside the declaration's `writes:` would
 * be the script reaching a list the owner never approved, with the owner's own hand. The list a rowset names, the list
 * any of its rows names (a fold's moved links), the list each row it updates is in, and the list each patch of
 * an option changes are all held to `writes:`. What is left is the gate's to check, and it checks it when it is tried.
 */
export function proposalOf(deps: Pick<ScriptRunDeps, 'registerOf'>, script: string, writes: readonly string[], p: unknown): Result<ScriptProposal> {
  const only = writes.length ? writes.join(', ') : 'nothing';
  if (!isObject(p)) return no('VALUE_MALFORMED', `${script} proposed something that is not a question: it is { question, body_kind, body, cause }.`, { at: 'proposal' });
  if (typeof p.question !== 'string' || p.question.trim() === '') return no('REQUIRED_MISSING', 'A proposal is a question somebody can answer.', { at: 'proposal' });
  const kind = p.body_kind;
  if (typeof kind !== 'string' || !(SCRIPT_PROPOSAL_KINDS as readonly string[]).includes(kind))
    return no(
      'ENUM_VALUE_UNKNOWN',
      `A script asks about rows, with a rowset or options, and ${JSON.stringify(kind ?? null)} is neither. A change to this BrainDog's lists, automations or add-ons is a person's or an agent's to propose.`,
      { at: 'body_kind', allowed: [...SCRIPT_PROPOSAL_KINDS] },
    );
  if (!isObject(p.body)) return no('REQUIRED_MISSING', `A ${kind} carries its body: ${kind === 'rowset' ? '{ register, rows }' : '{ options }'}.`, { at: 'body' });
  if (p.cause !== undefined && typeof p.cause !== 'string') return no('VALUE_MALFORMED', 'cause is a short key, so the question is asked once, or leave it out.', { at: 'cause' });
  const body = p.body;
  const outside = (register: string | null, at: string, what: string): Result<ScriptProposal> | null =>
    register !== null && !writes.includes(register) ? no('FORBIDDEN', `${script} proposed ${what} in ${register}, and it may write only to ${only}.`, { at }) : null;

  if (kind === 'rowset') {
    if (typeof body.register !== 'string') return no('REQUIRED_MISSING', 'A rowset names the list its rows are in.', { at: 'body.register' });
    const bad = outside(body.register, 'body.register', 'rows');
    if (bad) return bad;
    for (const [i, r] of (Array.isArray(body.rows) ? body.rows : []).entries()) {
      if (!isObject(r)) continue;
      const theirs = typeof r.register === 'string' ? outside(r.register, `body.rows[${i}].register`, 'a row') : null;
      if (theirs) return theirs;
      const at = typeof r.at === 'string' ? outside(deps.registerOf(r.at), `body.rows[${i}].at`, `a change to ${r.at}`) : null;
      if (at) return at;
    }
  } else {
    for (const [i, o] of (Array.isArray(body.options) ? body.options : []).entries()) {
      if (!isObject(o) || !Array.isArray(o.patches)) continue;
      for (const [j, patch] of o.patches.entries()) {
        if (!isObject(patch) || typeof patch.at !== 'string') continue;
        const bad = outside(deps.registerOf(patch.at), `body.options[${i}].patches[${j}].at`, `a change to ${patch.at}`);
        if (bad) return bad;
      }
    }
  }
  return ok({ question: p.question.trim(), body_kind: kind as ScriptProposalKind, body, ...(typeof p.cause === 'string' ? { cause: p.cause } : {}) });
}

/**
 * One `ctx.propose`, tried: checked by `proposalOf`, then put to the gate's own `propose` in a savepoint that is always
 * rolled back, so the script hears what the gate would say and nothing is filed yet. `queued` is the proposal to file
 * when the run is applied, or `null` when the gate would file nothing (it joins an open question, or was answered).
 *
 * TRIED NOW AND FILED LATER, for the reason a run's writes are applied together: a run that filed three questions and
 * then threw would leave three questions behind a run its history calls refused. So the answer is the gate's, word for
 * word, refusal and all, and the filing goes in with the run's writes (`finishScript`), where a gate that has changed
 * its mind since takes the whole run back.
 */
export function tryProposal(
  deps: Pick<ScriptRunDeps, 'sql' | 'transaction' | 'registerOf' | 'propose'>,
  run: { script: string; actor: string; writes: readonly string[] },
  p: unknown,
): Result<{ said: ScriptProposed; queued: ScriptProposal | null }> {
  type Tried = { said: ScriptProposed; queued: ScriptProposal | null };
  const checked = proposalOf(deps, run.script, run.writes, p);
  if (!checked.ok) return checked as unknown as Result<Tried>;
  if (!deps.propose) return no('NOT_IN_THIS_BUILD', 'This BrainDog files no questions from a script.', { at: 'proposal' });
  const propose = deps.propose;
  let tried: ReturnType<NonNullable<ScriptRunDeps['propose']>> | null = null;
  /* THE SAVEPOINT IS TAKEN BACK WHATEVER THE GATE SAID, by answering it a refusal of our own. */
  attempt<null>(deps.sql, deps.transaction, () => {
    tried = propose(checked.value, run.actor);
    return no('TRANSITION_ILLEGAL', 'Only tried.');
  });
  /* SET INSIDE THE SAVEPOINT, which runs at once and throws on, rather than returning, if the gate itself threw. */
  const out = tried! as ReturnType<NonNullable<ScriptRunDeps['propose']>>;
  if (!out.ok) return out as unknown as Result<Tried>;
  const v = out.value;
  if (v.answered !== undefined) return ok({ said: { id: v.id, answered: v.answered }, queued: null });
  if (v.joined && !v.widened) return ok({ said: { id: v.id, joined: true }, queued: null });
  /* A NEW QUESTION'S NUMBER IS NOT SAID: the one it was tried under was taken back with the savepoint. */
  return ok({ said: v.widened ? { id: v.id, joined: true, widened: v.widened, queued: true } : { queued: true }, queued: checked.value });
}

/**
 * The settings a run's `ctx.config` holds: its pack's values now, defaults filled, or `{}`.
 *
 * `{}` AND NOT A REFUSAL when the pack is gone or declares nothing. A script with no active version never gets here,
 * so a pack that cannot be read is one whose manifest holds no settings, and a run of it reads none.
 */
function settingsFor(deps: Pick<ScriptRunDeps, 'sql'>, pack: string | null): Record<string, Json> {
  if (pack === null) return {};
  const read = readPackConfig(deps.sql, pack);
  return read.ok ? { ...read.value.values } : {};
}

/**
 * A leased `script.run` becomes a job a host can run, or is finished here because it cannot.
 *
 * THE VERSION IS THE ONE IN THE PAYLOAD. `script.ts` pins it at fire time, and this reads that exact declaration row,
 * superseded or not, so a run queued before an edit runs the source the owner approved when it was queued. A script
 * with no active version at all (retired, uninstalled, its pack off) runs nothing: the owner took it away.
 */
export function prepareScript(deps: ScriptRunDeps, job: OutboxRow): Scripted | Metered {
  let payload: { script?: unknown; version?: unknown; input?: unknown };
  try {
    payload = JSON.parse(job.payload) as typeof payload;
  } catch {
    payload = {};
  }
  const script = typeof payload.script === 'string' ? payload.script : '';
  const version = typeof payload.version === 'number' && Number.isInteger(payload.version) ? payload.version : null;
  /* THE OWNER AS `declare.ts` READS ONE: the pack path writes `pack_id`, and the seed's first-party packs name
     themselves only in the body's `pack:`. */
  const found =
    script !== '' && version !== null && activeScript(deps.sql, script) !== null
      ? deps.sql.one<{ body: string; pack: string | null }>(
          "SELECT body, coalesce(pack_id, json_extract(body, '$.pack')) AS pack FROM declaration WHERE id = ? AND kind = 'script' AND version = ?",
          `script.${script}`,
          version,
        )
      : null;

  if (!found) {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    return meter(
      deps,
      { ingest: script, channel: 'script', host: null, project: undefined, status: null, outcome: 'dropped', requests: 0, bytes: 0, ms: 0, failures: 0 },
      `${script || 'A script'} is no longer installed, or its pack is off, so it did not run.`,
    );
  }

  const body = JSON.parse(found.body) as ScriptBody;
  return {
    job,
    host: hostOf(body.egress[0]),
    scripted: {
      script,
      ...(typeof body.title === 'string' && body.title.trim() !== '' ? { title: body.title.trim() } : {}),
      version: version!,
      actor: `script:${script}@v${version}`,
      input: payload.input ?? null,
      config: settingsFor(deps, typeof found.pack === 'string' ? found.pack : null),
      decl: {
        egress: body.egress,
        keys: body.keys,
        reads: body.reads,
        writes: body.writes,
        ...(body.limits === undefined ? {} : { limits: body.limits }),
        source: body.source,
      },
      record: { id: deps.recordId, tz: deps.tz },
    },
  };
}

/**
 * A run comes back, and is finished in one transaction: applied, refused, held or handed on.
 *
 * A REFUSED RUN IS A RUN. A throw, a timeout, a limit broken or a write the record refuses all spent the sandbox's time,
 * so `meter` counts them (it frees only `dropped`, `held` and `failed`), and none is retried by the ladder, because the
 * same source on the same input fails the same way. Three in a row pause the script's row and tell the owner once.
 *
 * HELD MOVES `due_at` AND PAUSES NOTHING, as a held `call` does in `finishAction`: the month turning is what starts it
 * again, so nobody has to.
 */
export function finishScript(deps: ScriptRunDeps, s: Scripted, answer: ScriptAnswer | ScriptUnrun): Metered {
  const { job, host } = s;
  const { script, actor, decl } = s.scripted;
  const done = () => deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
  const base = { ingest: script, channel: 'script', host, project: undefined, status: null, actor };

  if ('held' in answer) {
    done();
    deps.sql.exec(
      "UPDATE schedule SET due_at = MAX(due_at, ?) WHERE kind = 'script' AND key = ? AND state = 'pending'",
      instant(answer.held.until),
      script,
    );
    return meter(deps, { ...base, outcome: 'held', requests: 0, bytes: 0, ms: 0, failures: 0 }, answer.held.say);
  }

  if ('unrun' in answer) {
    if (answer.unrun === 'failed') {
      deps.ack({ id: job.id, state: 'failed', error: answer.say, leasedUntil: job.leasedUntil });
      return meter(deps, { ...base, outcome: 'failed', requests: 0, bytes: 0, ms: answer.ms, failures: 1 }, answer.say);
    }
    done();
    return meter(deps, { ...base, outcome: 'dropped', requests: 0, bytes: 0, ms: 0, failures: 0 }, answer.say);
  }

  const spent = { requests: answer.usage.fetches, bytes: answer.usage.bytes, ms: answer.usage.wall_ms, cpu_ms: answer.usage.cpu_ms };
  /* THE NOTE IS THE RECORD'S WORDS AND THE WHY GOES IN THE LOG. A refusal's reason quotes what the script chose: its
     thrown message, a register name it made up, a value the write path quoted back. The note is on a line every
     whole-record reader sees, and `logOf` holds the log to the owner who reads every list the script touched; measured
     before this, a member held to `append` on Money read "tally threw: Salary: Omar 91000" in `recentHistory`. The
     why goes first, so a log at its cap never loses it. */
  const refuse = (say: string, why?: string): Metered => {
    const log = why === undefined ? answer.log : answer.log === '' ? why : `${why}\n${answer.log}`;
    const metered = keepLog(deps, meter(deps, { ...base, ...spent, outcome: 'refused', failures: 1 }, say), log, decl);
    pauseAfterRefusals(deps, script);
    return metered;
  };

  if ('refused' in answer) {
    done();
    return refuse(`${script} did not finish, so it wrote nothing; its log says why.`, answer.refused.why);
  }

  /* THE COUNT IS CHECKED HERE TOO, AND FIRST. The sandbox stops at `limits.writes`, but the count is what a host could
     get wrong in the way that costs the most: a host measured handing back 500 creates from a script declaring 2 and
     all 500 landed. Refused before a single register is resolved, so an oversized answer costs one comparison. */
  const declared = decl.limits?.writes;
  if (answer.writes.length > Math.min(declared ?? WRITES_CEILING, WRITES_CEILING)) {
    done();
    const said =
      declared === undefined
        ? `no script may write more than ${WRITES_CEILING} rows in one run`
        : declared > WRITES_CEILING
          ? `its limits.writes of ${declared} is held to the ${WRITES_CEILING} any script may ask for`
          : `its limits.writes is ${declared}`;
    return refuse(`${script} wrote nothing: it handed back ${answer.writes.length} writes, and ${said}.`);
  }

  /* EVERY WRITE IS CHECKED BEFORE THE FIRST ONE IS MADE. An update names a row, not a register, so the register is the
     row's own: a spoken id cannot carry a write into a register the script does not declare. */
  const targets = answer.writes.map((w) => (w.op === 'create' ? w.register : deps.registerOf(w.spoken)));
  const outside = targets.findIndex((register) => register === null || !decl.writes.includes(register));
  if (outside >= 0) {
    done();
    const w = answer.writes[outside]!;
    const named = w.op === 'create' ? w.register : `${w.spoken}${targets[outside] === null ? ', which names no row' : ` in ${targets[outside]}`}`;
    const only = decl.writes.length ? decl.writes.join(', ') : 'nothing';
    return refuse(
      `${script} wrote nothing: it asked to write outside what it may write, which is ${only}; its log says why.`,
      `${script} asked to write to ${named}, and it may write only to ${only}.`,
    );
  }
  const shapeless = answer.writes.findIndex((w) => !isObject(w.op === 'create' ? w.fields : w.patch));
  if (shapeless >= 0) {
    done();
    return refuse(`${script} wrote nothing: its write ${shapeless + 1} carries no fields.`);
  }
  /* AND ITS QUESTION, BEFORE ANYTHING IS WRITTEN, for the reason `askOf` gives. `null` and `undefined` ask nothing. */
  const checked = answer.ask === undefined || answer.ask === null ? null : askOf(deps, script, decl.writes, Math.min(declared ?? WRITES_CEILING, WRITES_CEILING), answer.ask);
  if (checked !== null && 'why' in checked) {
    done();
    return refuse(`${script} wrote nothing and asked nothing: its question was not one BrainDog can put to anybody; its log says why.`, checked.why);
  }
  const asked = checked?.asked ?? null;
  let filed: { id: string; joined?: true; answered?: unknown } | null = null;
  let askRefused = false;

  /* AND ITS PROPOSALS (`ctx.propose`), checked again here for the reason the writes are: the host tried each against
     the gate as the script asked, and a host is code the record does not control, so the count and every list each
     one names are held to the declaration before anything is written. */
  const handed = answer.proposals === undefined || answer.proposals === null ? [] : answer.proposals;
  if (!Array.isArray(handed)) {
    done();
    return refuse(`${script} wrote nothing and asked nothing: what it proposed is not a list of questions.`);
  }
  if (handed.length > PROPOSALS_PER_RUN) {
    done();
    return refuse(`${script} wrote nothing and asked nothing: it handed back ${handed.length} questions, and one run may file ${PROPOSALS_PER_RUN}.`);
  }
  const proposals: ScriptProposal[] = [];
  for (const [i, p] of (handed as unknown[]).entries()) {
    const one = proposalOf(deps, script, decl.writes, p);
    if (!one.ok) {
      done();
      return refuse(`${script} wrote nothing and asked nothing: question ${i + 1} it proposed is not one it may file; its log says why.`, 'refusal' in one ? one.refusal.fix : undefined);
    }
    proposals.push(one.value);
  }
  const proposed = { asked: 0, waiting: 0, answered: 0 };
  /* THE NEW QUESTIONS' IDS, stamped on the run below, so the scripts read can say whether they still wait. */
  const proposedIds: string[] = [];
  let proposeRefused = -1;

  /* ONE BATCH FOR THE RUN, so the history shows its rows as one change, and one note on each that says which run. */
  const batch = deps.mint();
  const note = `Written by ${actor}.`;
  let lost = false;
  let failedAt = -1;
  /* UNDER THE CHAIN THAT QUEUED THE JOB, when a rule's step queued it (`Chain` in `flow.ts`). Without it the writes
     below reached the rules as a stranger's, at depth 0, and a rule whose script wrote the row that fired it started
     itself again on every run: measured, it ran the script twelve times from one update and was still going. */
  const chain = chainOfJob(deps.sql, job.id);
  const applied = underChain(deps.sql, chain, () => attempt<unknown>(deps.sql, deps.transaction, () => {
    /* THE ACK GOES FIRST AND INSIDE. A lease that lapsed while the sandbox ran belongs to whoever reclaimed it, and
       writing this run's rows as well would be the same run landing twice. */
    const acked = done();
    if (!acked.ok) {
      lost = true;
      return acked;
    }
    /* AN UPDATE WITH NO WHOLE-NUMBER VERSION IS WRITTEN WITHOUT COMPARING, which is what the write path offers any
       caller that leaves `version` out. Handed on as it came, `ctx.update(spoken, patch)` reached the write as `NaN`
       (or `null` over JSON) and was refused with "Leave it out to write without comparing", a fix no script can follow,
       so every such run was refused and the third paused the script. Reading NaN as "none" gives a script nothing it
       could not already have by passing the row's current version, and the prelude refuses a version that was given but
       is not a whole number, so a typo is not silently read as "none". */
    for (const [i, w] of answer.writes.entries()) {
      const version = w.op === 'update' && Number.isSafeInteger(w.version) ? { version: w.version } : {};
      const out =
        w.op === 'create'
          ? deps.write(w.register, null, w.fields as Record<string, unknown>, { actor, batch, note })
          : deps.write(targets[i]!, w.spoken, w.patch as Record<string, unknown>, { actor, batch, note, ...version });
      if (!out.ok) {
        failedAt = i;
        return out;
      }
    }
    /* THE QUESTION GOES IN WITH THE WRITES, so a question the gate refuses takes the run's writes back with it and a
       run is applied whole or not at all. Signed as the run, like its writes; a second run asking with the same cause
       finds the first's question open and joins it (`govern.ts` `askedAlready`), so a daily script asks once. */
    if (asked !== null && deps.propose) {
      const out = deps.propose({ question: asked.question, body_kind: 'options', body: asked.body, cause: asked.cause }, actor);
      if (!out.ok) {
        askRefused = true;
        return out;
      }
      filed = out.value;
    }
    /* AND EACH PROPOSAL, after the one question and in the same savepoint, signed as the run: a proposal the gate now
       refuses takes the run's writes and its other questions back with it. A cause already waiting joins it. */
    if (proposals.length > 0 && !deps.propose) {
      proposeRefused = 0;
      return no('NOT_IN_THIS_BUILD', 'This BrainDog files no questions from a script.', { at: 'proposals' });
    }
    for (const [i, p] of proposals.entries()) {
      const out = deps.propose!(p, actor);
      if (!out.ok) {
        proposeRefused = i;
        return out;
      }
      if (out.value.answered !== undefined) proposed.answered += 1;
      else if (out.value.joined && !out.value.widened) proposed.waiting += 1;
      else {
        proposed.asked += 1;
        proposedIds.push(out.value.id);
      }
    }
    return ok(null);
  }));

  if (lost)
    return keepLog(
      deps,
      meter(deps, { ...base, ...spent, outcome: 'dropped', failures: 0 }, `${script} ran, and another host holds its job now, so what it wrote was not applied here.`),
      answer.log,
      decl,
    );
  if (!applied.ok) {
    /* THE ACK WAS ROLLED BACK WITH THE WRITES, so it is made again on its own. */
    done();
    const why = 'refusal' in applied ? applied.refusal.fix : 'a row it updates was changed by somebody else first.';
    if (askRefused) return refuse(`${script} wrote nothing and asked nothing: BrainDog refused its question; its log says why.`, why);
    if (proposeRefused >= 0) return refuse(`${script} wrote nothing and asked nothing: BrainDog refused question ${proposeRefused + 1} of ${proposals.length} it proposed; its log says why.`, why);
    return refuse(`${script} wrote nothing: write ${failedAt + 1} of ${answer.writes.length} was refused; its log says why.`, why);
  }
  const n = answer.writes.length;
  /* THE RUN LINE NAMES THE SCRIPT AS A PERSON READS IT: its declaration's title, else its id. */
  const named = s.scripted.title !== undefined ? `“${s.scripted.title}”` : script;
  /* AND WHERE THE CHAIN STOPPED, IN THE SAME LINE, since this line is the run as the script's history shows it. The
     first stop is named and the rest counted: the line is cut at 280 characters (`meter`), and a name for every row a
     wide close stopped on would push the sentence that says why past the cut. */
  const stopped = chain?.stopped ?? [];
  const stop =
    stopped.length === 0
      ? ''
      : ` Its writes started no ${stopped[0]}${stopped.length > 1 ? ` or ${stopped.length - 1} more` : ''}: ${stopped.length > 1 ? 'those runs' : 'that run'} would be at depth ${SCRIPT_CHAIN_CEILING + 1} of one chain, and a chain stops at depth ${SCRIPT_CHAIN_CEILING} so that it cannot run for ever. A person's own write starts it again.`;
  /* WHAT IT ASKED, BEFORE THE STOP, so the line's cut at 280 characters takes the long sentence and not this one. */
  /* READ BACK THROUGH A CAST because `filed` is set inside the savepoint's closure, which narrowing does not see. */
  const put = filed as { id: string; joined?: true; answered?: unknown } | null;
  const said =
    asked === null
      ? ''
      : put === null
        ? " It asked a question that nobody was shown: BrainDog does not put a script's questions to anybody yet."
        : put.answered !== undefined
          ? ' Its question was answered on Decide before, so it asked nothing new.'
          : put.joined
            ? ' Its question was already waiting on Decide, so it asked nothing new.'
            : ' It asked one question, which waits on Decide.';
  /* WHAT IT PROPOSED, IN COUNTS: new questions first, since they are what the person has to answer. On Decide, since one
     a press puts back waits on the agents' shelf there and the rest in Needs you. */
  const plural = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('#', String(k)));
  const offered = [
    proposed.asked > 0 ? ` ${plural(proposed.asked, 'One question it proposed waits', '# questions it proposed wait')} on Decide.` : '',
    proposed.waiting > 0 ? ` ${plural(proposed.waiting, 'One was', '# were')} already waiting.` : '',
    proposed.answered > 0 ? ` ${plural(proposed.answered, 'One was', '# were')} answered before, so not asked again.` : '',
  ].join('');
  /* A QUIET RUN IS STAMPED (last-day-48): one that wrote nothing, asked nothing and stopped nothing, so a feed leaves it
     out (`bookkeeping` in index.ts) and a script that runs every night adds no line to Activity on a night with nothing
     to say. The script's own history keeps it. Stamped as the line is written, never by rewriting it. */
  const quiet = n === 0 && asked === null && stopped.length === 0 && proposed.asked === 0;
  const metered = keepLog(
    deps,
    meter(
      deps,
      { ...base, ...spent, outcome: 'ok', failures: 0, ...(quiet ? { quiet: true as const } : {}) },
      `${named} ran and wrote ${n === 0 ? 'nothing' : n === 1 ? 'one line' : `${n} lines`}.${said}${offered}${stop}`,
    ),
    answer.log,
    decl,
  );
  /* AND THE STOP AS A NUMBER ON THE RUN, so the stopped-chains sign (`signs-flow.ts`) does not hang on the line's words. */
  if (stopped.length > 0) deps.sql.exec("UPDATE event SET to_v = json_set(to_v, '$.stopped', ?) WHERE id = ?", stopped.length, metered.event);
  /* AND THE QUESTIONS IT OPENED, BY ID (2 Nov fix pass). The line says "which waits on Decide" as it was when the run
     ended, and the scripts read showed that for days after the question was answered. With the ids on the run, the
     read (`script-rows.ts`) words the line by each question's state as it is when somebody reads it. */
  const askedId = put !== null && put.answered === undefined && !put.joined ? put.id : null;
  if (askedId !== null || proposedIds.length > 0)
    deps.sql.exec(
      "UPDATE event SET to_v = json_set(to_v, '$.questions', json(?)) WHERE id = ?",
      JSON.stringify({ ...(askedId !== null ? { asked: askedId } : {}), ...(proposedIds.length > 0 ? { proposed: proposedIds } : {}) }),
      metered.event,
    );
  return metered;
}

/**
 * Pause a script whose last three runs were refused, and tell the owner once.
 *
 * "IN A ROW" IS READ FROM THE SCRIPT'S OWN EVENTS, newest first, so a run that worked in between breaks the streak and
 * three refusals scattered over a week of good runs pause nothing. A resume is one of those events and carries no run,
 * so it breaks the streak too: without that, the first refusal after a resume found the three from before it and paused
 * the script again at once. ONCE: a row already paused is not paused again,
 * because a door or a rule can still queue runs the schedule row does not gate, and each of those would otherwise be
 * another notification about the same stop.
 *
 * ONLY RUNS OF THE SOURCE NOW INSTALLED ARE COUNTED. The streak read the last three events whatever wrote them, and two
 * things were measured wrong. Two refusals under v1 and one under the owner's fixed v2 paused v2 on its first failure,
 * "its last 3 runs were refused", so only events signed `script:<id>@v<active>` count, and installing a version starts
 * the count again. And a `failed`, `held` or `dropped` between refusals broke the streak, so six refusals interleaved
 * with six host failures paused nothing, though none of those three ran the source; they are skipped, so they neither
 * break the streak nor count in it. A resume is written with no `to_v` and is kept in the read, so it still breaks the
 * streak.
 */
function pauseAfterRefusals(deps: ScriptRunDeps, script: string): void {
  const active = activeScript(deps.sql, script);
  if (!active) return;
  const last = deps.sql.all<{ outcome: string | null }>(
    `SELECT json_extract(to_v, '$.outcome') AS outcome FROM event
      WHERE kind = 'pull' AND target = ?
        AND (to_v IS NULL OR (actor = ? AND CASE WHEN json_valid(to_v) THEN json_extract(to_v, '$.outcome') END IN ('ok', 'refused')))
      ORDER BY rowid DESC LIMIT ?`,
    `declaration:script.${script}`,
    `script:${script}@v${active.version}`,
    REFUSED_IN_A_ROW,
  );
  if (last.filter((e) => e.outcome === 'refused').length < REFUSED_IN_A_ROW) return;
  const row = deps.sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = ?", script);
  if (!row || row.state === 'paused') return;
  pause(deps, 'script', script, `${script} is paused: its last ${REFUSED_IN_A_ROW} runs were refused, so it will not run again until somebody resumes it.`, {
    actor: `script:${script}`,
    because: `A script refused ${REFUSED_IN_A_ROW} times in a row would fail the same way on every run, so it stops and the latest run's event says why.`,
  });
}

/**
 * Start a paused script again, now. The only way one starts again, as `resumeAction` is for an action.
 *
 * NOT A FIX. If the source still fails, three more refused runs pause it again and the owner is told again.
 */
export function resumeScript(deps: Pick<ScriptRunDeps, 'sql' | 'mint' | 'nowMs'>, script: string, actor: string): Result<{ script: string }> {
  const row = deps.sql.one<{ id: string }>("SELECT id FROM schedule WHERE kind = 'script' AND key = ? AND state = 'paused'", script);
  if (!row) return no('OUT_OF_BOUNDS', `${script} is not paused, so there is nothing to resume.`, { at: 'script' });
  deps.sql.exec("UPDATE schedule SET state = 'pending', due_at = ?, attempts = 0 WHERE id = ?", instant(deps.nowMs), row.id);
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?)",
    deps.mint(),
    instant(deps.nowMs),
    actor,
    `declaration:script.${script}`,
    `${script} was resumed, and runs now.`,
  );
  return ok({ script });
}
