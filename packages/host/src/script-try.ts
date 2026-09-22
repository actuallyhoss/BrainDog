/**
 * `script_try`: a draft script run now, in the sandbox, answering the writes it would make and writing none of them
 * (`loop/research-shell-scripts.md` section 7 and the remainder of Brief 6).
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
 * A KEY IS OPENED ONLY FOR A CALLER THE RECORD HANDS `grantOf`. A scheduled run sends a key to an origin the owner
 * approved in Decide; a draft has been approved by nobody, so a token that could try one could send the owner's key to
 * the provider it opens with any request the token cared to write, which is acting on that provider as the owner. The
 * record passes `grantOf` for an owner and `null` for everybody else, and then a fetch naming a key is a rejected promise
 * inside the run: the script may catch it and go on, and the caller sees how far it got.
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
 * NO `node:` IMPORT, and only types from `@braindog/script`, for `script.ts`'s reason: the Worker builds its trial here
 * too, and QuickJS is the self-host's sandbox, handed in as `run`, never imported by this file.
 */

import type { OutboxRow, ScriptAnswer, Scripted } from '@braindog/kernel';
import type { Json, ScriptDecl } from '@braindog/script';

import type { Ledger, Metered } from './actions.ts';
import { scriptRunner, type GrantOf, type ScriptReads, type ScriptRunnerOptions } from './script.ts';

/**
 * A draft as the record hands it over, after its own `scriptBody` has passed it.
 *
 * `runs`, `title` AND `pack` ARE NOT HERE, because a trial reads none of them: it runs now, once, whatever the header
 * says about when.
 */
export type ScriptDraft = {
  record: { id: string; tz: string };
  body: Pick<ScriptDecl, 'egress' | 'keys' | 'reads' | 'writes' | 'limits' | 'source'> & { script: string };
  /** What a door would have handed it. `null`, as on a schedule, when the caller says nothing. */
  input?: Json | undefined;
  /** The caller's own reads, built by the record under the caller's context. Absent is a caller who reads nothing. */
  reads?: ScriptReads | undefined;
  /** The vault by label, for a caller the record lets open a key; `null` for every other caller. */
  grantOf: GrantOf | null;
};

/** What a trial answers: the kernel's `ScriptAnswer`, which is the sandbox's, or `held`. */
export type TriedScript = ScriptAnswer;

/**
 * One trial in a host's sandbox. `grantOf` and `reads` are this caller's, never the host's.
 *
 * NO LOADER ID, because nothing is loaded under one. The Cloud starts a fresh Worker for every run with
 * `env.LOADER.load` (`apps/worker/src/script.ts`), a trial's included, so no draft can be handed another's module or
 * `globalThis`, and the self-host starts a fresh QuickJS instance per run as it always has.
 */
export type TrialSandbox = (s: Scripted, trial: { grantOf: GrantOf; reads: ScriptReads | undefined }) => Promise<ScriptAnswer>;

/** The sentence a fetch naming a key gets in a trial by a caller the record gave no keys. */
const NO_KEYS = (label: string): string =>
  `A trial opens no key for an agent, so the fetch naming "${label}" was not sent. Once the owner accepts the script, its runs send the key.`;

/**
 * The trial sandbox a host with `scriptRunner`'s sandbox builds, the self-host's: `runInQuickJs` as `run`, its pinned
 * socket as `send`, its name service behind `pin`.
 *
 * ONE `scriptRunner` PER TRIAL, because `grantOf` and `reads` belong to whoever asked and `scriptRunner` fixes both when
 * it is built. It is a handful of closures; the sandbox itself is started per run either way.
 */
export function trialSandbox<P extends object | undefined = undefined>(options: Omit<ScriptRunnerOptions<P>, 'grantOf' | 'reads'>): TrialSandbox {
  return (s, trial) => {
    const reads = trial.reads;
    return scriptRunner<P>({ ...options, grantOf: trial.grantOf, ...(reads === undefined ? {} : { reads: () => reads }) })(s);
  };
}

export type ScriptTrialOptions = {
  sandbox: TrialSandbox;
  /** The Directory's allowance and meter. `null` on a host that counts nothing, which it says by passing it. */
  ledger: Pick<Ledger, 'mayRun' | 'meter'> | null;
  now?: (() => number) | undefined;
  /**
   * The id a trial is sent and counted under: the job its fetches are sent for, and its event on the ledger. Absent is
   * a random one, which is all the Directory's dedupe needs.
   */
  mint?: (() => string) | undefined;
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
  const mint = options.mint ?? (() => `try_${crypto.randomUUID()}`);

  const count = async (event: string, record: string, script: string, outcome: Metered['outcome'], usage: Metered['usage']): Promise<void> => {
    if (options.ledger === null) return;
    await options.ledger.meter(record, { event, at: new Date(now()).toISOString(), ingest: script, channel: 'script', scope: 'global', outcome, usage });
  };

  return async (draft) => {
    const { record, body } = draft;
    /* ONE ID FOR THE TRIAL: the job its fetches are sent for, and the event the ledger counts it under. */
    const id = mint();
    const hold = options.ledger === null ? null : await options.ledger.mayRun(record.id, body.script);
    if (hold) {
      await count(id, record.id, body.script, 'held', { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 1 });
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
        decl: {
          egress: [...body.egress],
          keys: [...body.keys],
          reads: [...body.reads],
          writes: [...body.writes],
          ...(body.limits === undefined ? {} : { limits: body.limits }),
          source: body.source,
        },
        record,
      },
    };
    const grantOf: GrantOf =
      draft.grantOf ??
      ((label) => {
        throw new Error(NO_KEYS(label));
      });

    let answer: ScriptAnswer;
    try {
      answer = await options.sandbox(scripted, { grantOf, reads: draft.reads });
    } catch (e) {
      await count(id, record.id, body.script, 'failed', { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 1, held: 0 });
      throw e;
    }
    if ('held' in answer) {
      await count(id, record.id, body.script, 'held', { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 1 });
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
    });
    return answer;
  };
}
