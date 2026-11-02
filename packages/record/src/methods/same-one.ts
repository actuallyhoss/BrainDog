/**
 * A person says two or more people may be one: `sameOne` (DATA), AGT-D05's record half ("likely duplicates are offered as
 * a merge").
 *
 * BEFORE THIS A PERSON IN THE APP COULD NOT START ONE. A write that folds one person into another is refused with
 * "Merging happens on Decide" (`mergeShaped` in `index.ts`), and the only things that put the question on Decide were a
 * meeting, the nightly pass and a model's answer. So somebody looking at the same person twice could only wait.
 *
 * IT ASKS AND MERGES NOTHING, BUT FOR HIS OWN AGENT while he lets it act as him or tells it to (`agentFor`): then the
 * question is answered at once as his decision, with the same Undo (the owner's word of 2 Nov, "fully inclusive").
 *
 * OTHERWISE IT ASKS AND MERGES NOTHING. The question filed is the one the nightly pass and a model's answer file for the same
 * people (`people.ts`'s `askOrExtend`): the same sentence, the same card, the same rows written on a yes, with what
 * the others hold carried onto the one kept. Decide stays the only place a merge is made, so Undo stays the way back.
 * Picked twice, the second pick answers the question already waiting and opens nothing.
 *
 * WHAT IS CARRIED AND WHO IS KEPT IS THE KERNEL'S TO SAY, because the kernel is what knows a person's keys and which
 * row the record marked as its own. This door checks who may ask and that every pick is a live person of the list
 * named, and hands the kernel the caller as `writerOf` in `index.ts` does.
 *
 * READ THROUGH A LOCAL SHAPE until the kernel's `askSame` lands, and `NOT_IN_THIS_BUILD` from a kernel without it.
 */

import type { Result } from '@braindog/ports';
import { agentOf as kindOf, type WriteContext } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Who = Pick<WriteContext, 'actor' | 'principal' | 'session'>;

/** The kernel verb this door calls, absent on a kernel built before it: the question by its id, and whether it is new. */
type SameVerb = { askSame?: (w: Who, args: { rows: readonly string[] }) => Result<{ id: string; asked: boolean } | null> };

/** What `sameOne` answers: the question on Decide, and whether this call put it there or added somebody to it. */
export type SameOne = { question: string; opened: boolean; merged?: { decision: string } };

/** The most people one question asks about, as the kernel's `CLUSTER_MOST` has it. */
export const SAME_MOST = 12;

/** The longest a pick is: a row's id, or its spoken one. */
const REF_MOST = 64;

export function methods(deps: RecordDeps) {
  const { kernel, guard, readable, named, no, tail } = deps;
  const verbs = kernel as unknown as SameVerb;

  /** Who the call is by, as `writerOf` in `index.ts` has it: a token by its key and its run's hints, anybody else as themselves. */
  const whoOf = (ctx: CallContext): Who =>
    ctx.principal.kind === 'token'
      ? {
          actor: `agent:${kindOf(ctx.session ?? {}).agent ?? 'other'}`,
          principal: { kind: 'token', token: ctx.principal.id },
          ...(ctx.session === undefined ? {} : { session: ctx.session }),
        }
      : { actor: ctx.principal.id };

  /**
   * Whether a person of the list is one this caller's narrowed grant still admits, read as `rowAdmitted` in `index.ts`
   * reads it: the row again by its own number under the same rule. A grant that is whole admits everybody.
   */
  const admitted = (ctx: CallContext, register: string, seq: number | null): boolean => {
    const rule = kernel.scope(ctx, register);
    if (seq === null || rule === undefined) return true;
    const found = kernel.list({ register, where: { field: 'seq', is: seq }, includeDeleted: true, limit: 1 }, rule);
    return found.ok && found.value.rows.length > 0;
  };

  /** A list by the name a person reads. */
  const listName = (register: string): string => kernel.register(register)?.name ?? register;

  return {
    /**
     * Ask whether these people are one: `{ register, rows }`, two to twelve people of the list. Answers
     * `{ question, opened }`. DATA, and nothing is merged.
     */
    async sameOne(args: { register?: unknown; rows?: unknown } | undefined, ctx: CallContext): Promise<Result<SameOne>> {
      const stop = guard(ctx, 'write', typeof args?.register === 'string' ? args.register : undefined);
      if (stop) return { ok: false, refusal: stop };
      const unnamed = named(args);
      if (unnamed) return { ok: false, refusal: unnamed };
      const register = String(args?.register);
      /* WHO IS ASKED ABOUT IS CHECKED BEFORE ANYTHING IS READ, so a call with no list of people is told so whatever list it names. */
      const picked = args?.rows;
      if (!Array.isArray(picked) || picked.some((r) => typeof r !== 'string' || r === '' || r.length > REF_MOST || /\s/u.test(r)))
        return no('VALUE_MALFORMED', 'Say who may be the same person: rows is a list of two or more people.', { at: 'rows' });
      if (kernel.meetsList()?.register !== register)
        return no('VALUE_MALFORMED', `Only people are asked about as one, and ${listName(register)} is not where they are kept.`, { at: 'register' });

      const ids: string[] = [];
      for (const ref of picked as string[]) {
        const row = kernel.get(ref);
        /* ONE GONE OR FOLDED ALREADY is not there to ask about, and is said as one sentence without its id. */
        const gone = (): Result<never> => no('ROW_UNKNOWN', 'One of the people picked is no longer there. Pick again from the list as it is now.', { at: 'rows' });
        if (row === null) return gone();
        /* WHAT THIS CALLER MAY NOT READ IS NOT THERE FOR THEM: something of a list closed to them is never named, nor
           its list, and somebody their narrowed grant leaves out is never asked about. */
        if (row.register !== register && readable(ctx, row.register) !== null) return gone();
        if (!admitted(ctx, row.register, row.seq)) return gone();
        if (row.register !== register)
          return no('REF_REGISTER_MISMATCH', `${kernel.titleOfRow(row.id) ?? 'One of those'} is in ${listName(row.register)}, not ${listName(register)}. Pick people only.`, { at: 'rows' });
        if (!ids.includes(row.id)) ids.push(row.id);
      }
      if (ids.length < 2) return no('REQUIRED_MISSING', 'Pick at least two people to ask whether they are the same one.', { at: 'rows' });
      if (ids.length > SAME_MOST) return no('OUT_OF_BOUNDS', `Pick no more than ${SAME_MOST} people at once.`, { at: 'rows' });

      if (verbs.askSame === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog cannot ask whether two people are the same one yet. It arrives with the next update.');
      const out = verbs.askSame(whoOf(ctx), { rows: ids });
      if (!out.ok) return out as Result<never>;
      /* NOTHING ASKED AND NOTHING WAITING ON ALL OF THEM: a question is open about some, and the others could not join
         it, because he has said they are somebody else or it already asks about as many as one question does. */
      if (out.value === null)
        return no('TRANSITION_ILLEGAL', 'A question about some of them is already waiting on Decide, and the others could not be added to it. Answer that one first.', { at: 'rows' });
      /* HIS OWN AGENT, WHILE HE LETS IT ACT AS HIM OR ON HIS WORD (`agentFor`), MERGES THEM NOW: the question is answered
         at once as his own decision, through its run, so the merge is the one Decide makes and Undo takes it back. */
      const landed = deps.agentFor?.(ctx) == null ? null : ((await deps.landNow?.(ctx, out.value.id)) ?? null);
      return tail({ ok: true as const, value: { question: out.value.id, opened: out.value.asked, ...(landed === null ? {} : { merged: { decision: landed.decision } }) } });
    },
  };
}
