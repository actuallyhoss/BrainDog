/**
 * `script_try`: a draft script run now, in the sandbox, answering the writes it would make and writing none of them.
 *
 * AN AGENT WRITING A SCRIPT HAD NO WAY TO RUN IT BEFORE A PERSON ACCEPTED IT. The only run was the scheduled one, after
 * Decide, so a script that misread its provider's answer was found by its owner, as three refused runs and a pause.
 * This is the run without the record: the same sandbox, the same `ctx.fetch` through the same send loop, and an answer
 * that stops where `finishScript` would start. Nothing here can write, because nothing here is handed a write path:
 * the record is reached only through the reads the caller brought.
 *
 * THE SELF-HOST'S RUN IS `scriptRunner`, NOT A SECOND COPY OF IT. `trialSandbox` builds one per trial, so a trial's
 * fetch obeys every rule a scheduled run's does (the draft's own origins, `pin` before the socket, the key opened for
 * one request and scrubbed from the answer) and any rule added to that path later holds here without anybody
 * remembering this file. What a trial changes is who it is for, and that is two arguments the record decides:
 *
 * A KEY IS OPENED ONLY FOR A CALLER THE RECORD CALLS `owner`. A scheduled run sends a key to an origin the owner
 * approved in Decide; a draft has been approved by nobody, so a token that could try one could send the owner's key to
 * the provider it opens with any request the token cared to write, which is acting on that provider as the owner. The
 * record says `owner` only for a person its keychain gate would let in (`scriptTry` in `packages/record`), each host builds
 * `grantOf` from that word and passes `null` for everybody else, and then a fetch naming a key is a rejected promise
 * inside the run: the script may catch it and go on, and the caller sees how far it got.
 *
 * THE KEYCHAIN GATE, NOT `level === 'owner'`. A probe planted a session proved two hours ago: the
 * keychain refused it `listGrants` with `NEEDS_BROWSER_SESSION`, and the same cookie's trial sent a request carrying the
 * owner's key and left a `grant.read` in her name. So `owner` is the record's `keychain()` answer, held to a person. A trial
 * refused the key for that reason alone still runs, keyless: the record says `stale` when the proof's age is the only
 * reason, the self-host hands it on as `ScriptDraft.stale`, and the fetch is told to sign in again, because the draft is
 * not what is wrong. The Worker's `Record$` does not pass `stale` yet, so its owner is refused the key all the same and
 * is told the `NO_KEYS` sentence instead.
 *
 * AND A TRIAL BY ANYBODY BUT THE OWNER ONLY READS (`readsOnly`). No key is not enough: a POST needs none to reach a
 * public form, so a propose token's draft made the host write to whatever outside service it named, unapproved. Every
 * fetch but a GET or a HEAD without a body is a rejected promise in the run, and the run goes on as a refused key's does.
 *
 * THE READS ARE THE CALLER'S OWN. `scriptReads` reads as `system`, held to the script's `reads:`, because a scheduled run
 * has no person behind it and its reads were approved at accept. A trial's `reads:` were approved by nobody either, and
 * a trial answers its writes and its log to the caller, so reading as `system` would hand a member restricted to two
 * lists every row of a third through a draft that copies it into a write. So the record passes the reads it would answer
 * the caller itself, and a caller who brings none reads nothing.
 *
 * METERED LIKE A RUN, because it is one: the sandbox started and the provider was called. The plan's allowance is asked
 * first, a held trial starts nothing, and what it spent is counted on the script's own line of the ledger, `channel:
 * 'script'`, under an event id minted for it, since a trial writes no event of its own for the Directory to key on.
 *
 * AND COUNTED AS IN FLIGHT FROM BEFORE IT ASKS UNTIL IT IS METERED. The allowance was asked with no count of the
 * trials still in their sandboxes, so five started together with one run left all ran and the month closed at 15,004
 * of 15,000 (`test/script-try-spend.test.ts`). A trial now takes a place in `inFlight`
 * before the question, asks with the places taken before it as `pending`, and gives its place back once the ledger has
 * been told, whichever way it ended.
 *
 * NO `node:` IMPORT, and only types from `@braindog/script`, for `script.ts`'s reason: the Worker builds its trial here
 * too, and QuickJS is the self-host's sandbox, handed in as `run`, never imported by this file.
 */

import type { OutboxRow, ScriptAnswer, Scripted } from '@braindog/kernel';
import type { Json, ScriptDecl } from '@braindog/script';

import { IN_FLIGHT, type InFlight, type Ledger, type Metered } from './actions.ts';
import { scriptRunner, type GrantOf, type ScriptReads, type ScriptRunnerOptions } from './script.ts';

/**
 * A draft as the record hands it over, after its own `scriptBody` has passed it.
 *
 * `runs`, `title` AND `pack` ARE NOT HERE, because a trial reads none of them: it runs now, once, whatever the header
 * says about when.
 */
export type ScriptDraft = {
  record: { id: string; tz: string };
  body: Pick<ScriptDecl, 'egress' | 'keys' | 'reads' | 'writes' | 'limits' | 'source'> & { script: string; notifies?: true; model?: { most_per_run: number }; store?: true };
  /** What a door would have handed it. `null`, as on a schedule, when the caller says nothing. */
  input?: Json | undefined;
  /** `ctx.config`: the draft's own pack settings, each a chosen value or its default. `{}` for a script no pack owns. */
  config?: Record<string, Json> | undefined;
  /** The caller's own reads, built by the record under the caller's context. Absent is a caller who reads nothing. */
  reads?: ScriptReads | undefined;
  /** The keychain by label, for a caller the record lets open a key; `null` for every other caller. */
  grantOf: GrantOf | null;
  /**
   * `true` when `grantOf` is `null` for one reason only: the owner's last proof is older than the keychain allows. It
   * changes what a fetch naming a key is told, never whether a key opens, which `grantOf` alone decides.
   */
  stale?: boolean | undefined;
  /**
   * The record's `owner` word for the caller. Absent, as both hosts hand a draft today, it is read from `grantOf`, which
   * each builds from that word and nothing else (`grantOf: d.owner ? ... : null`).
   */
  owner?: boolean | undefined;
};

/**
 * Whether a trial only reads (`readOnlyRefused` in `script.ts`): for every caller the record does not call `owner`.
 *
 * THE OWNER WHOSE PROOF IS STALE KEEPS ANY METHOD AND NO KEY. Her draft is hers to send, and the proof's age is a
 * reason to keep the keychain shut, which `grantOf` already does, not a reason to treat her as an agent.
 */
export const readsOnly = (draft: Pick<ScriptDraft, 'grantOf' | 'stale' | 'owner'>): boolean =>
  !(draft.owner ?? draft.grantOf !== null) && draft.stale !== true;

/**
 * How a trial by an agent's event id begins on the ledger. The Directory keeps every metered run's event by record and
 * time (`dir_usage_run`), so the trials by agents a record ran today are the ones there with this prefix since midnight
 * UTC, which is what `trialsLeft` in `packages/record` is read against.
 */
export const AGENT_TRIAL = 'try_agent_';

/** What a trial answers: the kernel's `ScriptAnswer`, which is the sandbox's, or `held`. */
export type TriedScript = ScriptAnswer;

/**
 * One trial in a host's sandbox. `grantOf` and `reads` are this caller's, never the host's.
 *
 * NO LOADER ID, because nothing is loaded under one. The Cloud starts a fresh Worker for every run with
 * `env.LOADER.load` (`apps/worker/src/script.ts`), a trial's included, so no draft can be handed another's module or
 * `globalThis`, and the self-host starts a fresh QuickJS instance per run as it always has.
 */
export type TrialSandbox = (s: Scripted, trial: { grantOf: GrantOf; reads: ScriptReads | undefined; readOnly: boolean }) => Promise<ScriptAnswer>;

/**
 * The id a trial's key is opened in the name of: the `asker` the record hands `tryScript`, or `undefined`, which each
 * app's `keyOpener` reads as `system`.
 *
 * A TRIAL HAS AN ASKER AND BOTH HOSTS OPENED ITS KEY AS NOBODY. Each handed the trial the opener it builds for the
 * scheduled pass, whose actor is `system` because a scheduled run has no person behind it, so the owner trying her own
 * draft left a `grant.read` the keychain's log could not tell from the nightly run's: measured in
 * `apps/selfhost/test/script-try-asker.test.ts`, one key sent and `grant.read ["system"]`. Slash's included key had the
 * same fault and the same repair (`slashOwnKeyFor` in `slash.ts`), the asker's id handed to `keyOpener` per ask.
 *
 * THE RECORD HANDS `asker` AND BOTH HOSTS PASS IT ON. `RecordDeps['tryScript']` in `packages/record` sends the person
 * behind a token, or the person, and the self-host's `tryScript` and the Worker's `Record$` each build `keyOpener` with
 * `askerOf(d)`, so the owner's trial is signed with her id. A token's trial opens no key whatever `asker` says, because
 * the record gives it no `grantOf`: the id names who asked, and never decides whether a key opens. It is read with `in`
 * because it was written before the record's type carried the field, and answers `undefined` for a draft without one.
 */
export const askerOf = (draft: object): string | undefined =>
  'asker' in draft && typeof draft.asker === 'string' && draft.asker !== '' ? draft.asker : undefined;

/** The sentence a fetch naming a key gets in a trial by a caller the record gave no keys. */
const NO_KEYS = (label: string): string =>
  `A trial opens no key for an agent, so the fetch naming "${label}" was not sent. Once the owner accepts the script, its runs send the key.`;

/**
 * The sentence for the owner whose last proof is too old for the keychain, in Slash's words for the same gate
 * (`SLASH_KEY_CLOSED` in `slash.ts`), because "for an agent" would tell her she is one and leave her nothing to do.
 */
const STALE = (label: string): string =>
  `A trial opens the owner's key only for the owner signed in within the last fifteen minutes, so the fetch naming "${label}" was not sent. Sign in again to try it with the key.`;

/**
 * The trial sandbox a host with `scriptRunner`'s sandbox builds, the self-host's: `runInQuickJs` as `run`, its pinned
 * socket as `send`, its name service behind `pin`.
 *
 * ONE `scriptRunner` PER TRIAL, because `grantOf` and `reads` belong to whoever asked and `scriptRunner` fixes both when
 * it is built. It is a handful of closures; the sandbox itself is started per run either way.
 */
export function trialSandbox<P extends object | undefined = undefined>(options: Omit<ScriptRunnerOptions<P>, 'grantOf' | 'reads' | 'readOnly'>): TrialSandbox {
  return (s, trial) => {
    const reads = trial.reads;
    /* `trial: true`, SO `ctx.notify` AND `ctx.ask` ARE DRY: a try tells nobody and spends none of the model's allowance. */
    return scriptRunner<P>({ ...options, trial: true, grantOf: trial.grantOf, readOnly: trial.readOnly, ...(reads === undefined ? {} : { reads: () => reads }) })(s);
  };
}

export type ScriptTrialOptions = {
  sandbox: TrialSandbox;
  /** The Directory's allowance and meter. `null` on a host that counts nothing, which it says by passing it. */
  ledger: Pick<Ledger, 'mayRun' | 'meter'> | null;
  now?: (() => number) | undefined;
  /**
   * The id a trial is sent and counted under: the job its fetches are sent for, and its event on the ledger. Absent is
   * a random one, which is all the Directory's dedupe needs, begun `try_agent_` for a trial that only reads
   * (`AGENT_TRIAL`), so the day's trials by agents can be counted off the ledger's runs without a table of their own.
   */
  mint?: ((agent: boolean) => string) | undefined;
  /**
   * The runs let through and not yet metered, shared with the host's scheduled pass when it hands the same one to
   * `pass(flight)`. Absent is `IN_FLIGHT`, the runtime's own, so a host that builds a trial per request still shares one.
   */
  inFlight?: InFlight | undefined;
};

/**
 * The trial a host hands its record: ask the allowance, run the draft, count what it spent, and answer.
 *
 * A SANDBOX THAT THROWS IS THE HOST, AND IS THROWN ON. `runActions` records that as `unrun: failed` and does not charge
 * the script for it; here it is counted as a failure that costs no run, and the caller gets the host's 500 rather than a
 * refusal that would blame the source for a loader that never started.
 */
export function scriptTrial(options: ScriptTrialOptions): (draft: ScriptDraft) => Promise<TriedScript> {
  const now = options.now ?? (() => Date.now());
  const mint = options.mint ?? ((agent: boolean) => `${agent ? AGENT_TRIAL : 'try_'}${crypto.randomUUID()}`);

  const count = async (event: string, record: string, script: string, outcome: Metered['outcome'], usage: Metered['usage']): Promise<void> => {
    if (options.ledger === null) return;
    await options.ledger.meter(record, { event, at: new Date(now()).toISOString(), ingest: script, channel: 'script', scope: 'global', outcome, usage });
  };

  const flight = options.inFlight ?? IN_FLIGHT;

  return async (draft) => {
    /* THE PLACE IS TAKEN BEFORE THE FIRST AWAIT, so a trial asked while this one waits on the ledger counts it, and it
       is given back in the `finally`, after `count` has told the ledger, so there is no moment neither holds the run. */
    const place = options.ledger === null ? null : flight.take(draft.record.id);
    try {
      return await attempt(draft, place?.pending ?? 0);
    } finally {
      place?.release();
    }
  };

  async function attempt(draft: ScriptDraft, pending: number): Promise<TriedScript> {
    const { record, body } = draft;
    /* ONE ID FOR THE TRIAL: the job its fetches are sent for, and the event the ledger counts it under. */
    const readOnly = readsOnly(draft);
    const id = mint(readOnly);
    const hold = options.ledger === null ? null : await options.ledger.mayRun(record.id, body.script, pending);
    if (hold) {
      await count(id, record.id, body.script, 'held', { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 1, cpu_ms: 0 });
      return { held: hold };
    }

    const origin = body.egress[0];
    const scripted: Scripted = {
      /* A LEASED ROW IN SHAPE ONLY. `scriptRunner` reads its id, as the job a fetch is sent for; nothing acks it. */
      job: { id, kind: 'script.run', payload: '', attempts: 0, leasedUntil: '' } satisfies OutboxRow,
      host: origin === undefined ? null : new URL(origin).host,
      scripted: {
        script: body.script,
        /* VERSION 0, WHICH NO DECLARATION ROW HAS, so nothing that reads a version can mistake a draft for one. */
        version: 0,
        actor: `script:${body.script}@try`,
        input: draft.input ?? null,
        config: draft.config ?? {},
        decl: {
          egress: [...body.egress],
          keys: [...body.keys],
          reads: [...body.reads],
          writes: [...body.writes],
          ...(body.limits === undefined ? {} : { limits: body.limits }),
          source: body.source,
          ...(body.notifies === true ? { notifies: true as const } : {}),
          ...(body.model === undefined ? {} : { model: body.model }),
          ...(body.store === true ? { store: true as const } : {}),
        },
        record,
      },
    };
    const grantOf: GrantOf =
      draft.grantOf ??
      ((label) => {
        throw new Error((draft.stale ? STALE : NO_KEYS)(label));
      });

    let answer: ScriptAnswer;
    try {
      answer = await options.sandbox(scripted, { grantOf, reads: draft.reads, readOnly });
    } catch (e) {
      await count(id, record.id, body.script, 'failed', { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 1, held: 0, cpu_ms: 0 });
      throw e;
    }
    if ('held' in answer) {
      await count(id, record.id, body.script, 'held', { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 1, cpu_ms: 0 });
      return answer;
    }
    const refused = 'refused' in answer;
    await count(id, record.id, body.script, refused ? 'refused' : 'ok', {
      runs: 1,
      requests: answer.usage.fetches,
      bytes: answer.usage.bytes,
      ms: answer.usage.wall_ms,
      failures: refused ? 1 : 0,
      held: 0,
      cpu_ms: answer.usage.cpu_ms,
    });
    return answer;
  }
}
