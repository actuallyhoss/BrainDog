/**
 * What is not working in BrainDog itself, the record's half: `faults` (READ+) and `retryFault` (ADMIN), AGT-C06 job e
 * ("Nothing an operator must fix is asked of him").
 *
 * A FAULT IS NOT A QUESTION. A job that died eight times used to be filed as a question opened by "system", with its job
 * name, its attempt count and the model's error in the words, and it sat in Decide with Accept and Decline under it.
 * The kernel now keeps one row a cause instead (`kernel/src/fault.ts`, raised by the outbox and the schedule): a plain
 * sentence for its family, how many times, since when and the raw error. These two methods are the door to that row and
 * nothing else: `faults` reads it and writes nothing, `retryFault` queues the dead job again.
 *
 * THE OWNER'S, BECAUSE NOTHING ON IT IS ANYBODY ELSE'S TO FIX. A member reads what is on the lists she was invited to,
 * and a fault is about the record's machinery, so she is refused in one sentence that says who reads it. The raw error
 * is held back from everybody but the owner of a self-hosted record in person: on a self-host the owner is the
 * operator and the error is what he fixes it from, while on the Cloud it is ours to read and can carry a provider's
 * words about a key. An agent of that owner reads the sentence, never the error.
 *
 * OVER THE KERNEL VERBS `faults()` AND `retryFault(w, { cause })` (kernel-wire), READ THROUGH A LOCAL SHAPE. A record
 * whose kernel has not got them yet answers `NOT_IN_THIS_BUILD`, as a route to a method a record lacks does, so this
 * file can land beside the kernel's half in either order.
 */

import type { Result } from '@braindog/ports';
import { NIGHT_FAULT, nightWhy, type WriteContext } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** One fault as the kernel keeps it (`Fault` in `kernel/src/fault.ts`). */
type KernelFault = { cause: string; kind: string; family: string; said: string; count: number; first_at: string; last_at: string; error: string };

/** The two kernel verbs this door reads, absent on a kernel built before them. */
type FaultVerbs = {
  faults?: () => Result<{ faults: KernelFault[] }>;
  retryFault?: (w: Pick<WriteContext, 'actor'>, args: { cause: string }) => Result<{ cause: string; queued: number }>;
};

/**
 * One fault as a person reads it: the sentence, how many times it failed, since when and when last. `cause` is the
 * handle `retryFault` takes, never shown. `error` only to a self-host's owner in person. `why` on a failed night's copy:
 * its reason as one plain sentence (`nightWhy` in the kernel), to every reader of the fault.
 */
export type FaultSeen = { cause: string; said: string; count: number; since: string; last: string; error?: string; why?: string };

/** The longest cause `retryFault` takes: `outbox#` or `schedule#` and a job kind, never a sentence. */
const CAUSE_MOST = 200;

export function methods(deps: RecordDeps) {
  const { kernel, scoped, admin, no, tail } = deps;
  const verbs = kernel as unknown as FaultVerbs;

  /** The owner, or an agent on the owner's key, reading every list: who a fault is told to. */
  const owns = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level === 'owner' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /** Whether this caller is shown the raw error: the owner in person, on a record a self-host keeps. */
  const operates = (ctx: CallContext): boolean => deps.host === 'self-host' && ctx.principal.kind === 'person' && ctx.principal.level === 'owner';

  const notYet = <T>(): Result<T> => no('NOT_IN_THIS_BUILD', 'This BrainDog cannot list what is not working yet. It arrives with the next update.');

  return {
    /** What is not working in BrainDog now: each fault's sentence, how many times and since when. READ+, the owner's. */
    async faults(_args: unknown, ctx: CallContext): Promise<Result<{ faults: FaultSeen[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (!owns(ctx)) return no('FORBIDDEN', 'Only the owner of this record reads what is not working in BrainDog. Ask them to look in Settings.', { at: 'principal' });
      if (verbs.faults === undefined) return notYet();
      const out = verbs.faults();
      if (!out.ok) return out as Result<never>;
      const raw = operates(ctx);
      const faults = out.value.faults.map(
        (f): FaultSeen => ({
          cause: f.cause,
          said: f.said,
          count: f.count,
          since: f.first_at,
          last: f.last_at,
          ...(raw && f.error !== '' ? { error: f.error } : {}),
          /* A FAILED NIGHT'S REASON IN PLAIN WORDS (A22), to everybody who reads the fault: never the raw error. */
          ...(f.cause === NIGHT_FAULT && f.error !== '' ? { why: nightWhy(f.error) } : {}),
        }),
      );
      return { ok: true, value: { faults } };
    },

    /** Queue the job behind one fault again, now, rather than at tonight's retry. ADMIN. */
    async retryFault(args: { cause?: unknown } | undefined, ctx: CallContext): Promise<Result<{ cause: string; queued: number }>> {
      const stop = admin(ctx, 'try a broken part of BrainDog again');
      if (stop) return { ok: false, refusal: stop };
      const cause = args?.cause;
      if (cause === undefined || cause === null || cause === '') return no('REQUIRED_MISSING', 'Say which broken part to try again, by the cause the list of what is not working gives it.', { at: 'cause' });
      if (typeof cause !== 'string' || cause.length > CAUSE_MOST || !cause.includes('#'))
        return no('VALUE_MALFORMED', 'That is not a cause BrainDog gives a broken part. Read what is not working again and pick one from it.', { at: 'cause' });
      if (verbs.retryFault === undefined) return notYet();
      const actor = ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id;
      return tail(verbs.retryFault({ actor }, { cause }));
    },
  };
}
