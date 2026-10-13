/**
 * Who may be on the record twice: `heldTwice` (READ+), the people behind the built-in figure `held-twice`.
 *
 * BEFORE THIS THE NOTE SAID A NUMBER AND THE LIST COULD NOT SHOW WHO. The page says "People who may be on this record
 * twice: 4" and sends the reader to everybody by name to look for them. The kernel already knows which people the count
 * is about (`peopleTwiceIdsIn`, read from the database alone, as the figure is), and nothing handed them to a caller.
 *
 * IT ANSWERS NUMBERS, NEVER WHAT THE RECORD CALLS A PERSON INSIDE: each one's number in the list, lowest first, so a
 * list is narrowed to them as it is narrowed to any other pick. It reads, asks nothing and merges nothing; asking
 * whether two of them are one is `sameOne`, and the merge is made on Decide.
 *
 * NOTHING, NEVER AN EMPTY ANSWER, WHERE NOBODY WAS LOOKED FOR, as the kernel's reader has it: a record that keeps no
 * people, and a list that is not where this record keeps them. Nobody held twice is an empty answer.
 *
 * WHICH LIST HOLDS THE PEOPLE IS THE KERNEL'S TO SAY (`meetsList`), so no list is named here. A caller whose grant is
 * narrowed to some of the people is answered only those, each read again under the grant's own rule.
 */

import type { Result } from '@braindog/ports';
import { peopleTwiceIdsIn, whereFor } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What `heldTwice` answers: the numbers of the people who may be held twice, or `null` where nobody was looked for. */
export type HeldTwice = { seqs: number[] } | null;

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, named, no } = deps;

  return {
    /**
     * `{ register }`: the people of that list who may be on the record twice, as `{ seqs }`, their numbers in the
     * list, lowest first. `null` when the list is not where this record keeps people. READ+, and it changes nothing.
     */
    async heldTwice(args: { register?: unknown } | undefined, ctx: CallContext): Promise<Result<HeldTwice>> {
      const stop = guard(ctx, 'read', typeof args?.register === 'string' ? args.register : undefined);
      if (stop) return { ok: false, refusal: stop };
      const unnamed = named(args);
      if (unnamed) return { ok: false, refusal: unnamed };
      const register = String(args?.register);
      if (!kernel.register(register)) return no('REGISTER_UNKNOWN', `There is no list called ${register}.`, { at: 'register' });
      if (kernel.meetsList()?.register !== register) return { ok: true, value: null };

      const ids = peopleTwiceIdsIn(sql);
      if (ids === null) return { ok: true, value: null };
      const seqs = new Set<number>();
      for (const id of ids) {
        const seq = sql.one<{ seq: number | null }>('SELECT seq FROM entry WHERE id = ? AND register = ? AND deleted_at IS NULL', id, register)?.seq;
        if (typeof seq === 'number') seqs.add(seq);
      }
      /* SOMEBODY A NARROWED GRANT LEAVES OUT IS NOT THERE FOR THIS CALLER, read as `sameOne` reads it: the person again
         by their own number under the grant's rule. A grant that is whole admits everybody. */
      const rule = whereFor(ctx.wheres, register);
      const admitted = (seq: number): boolean => {
        if (rule === undefined) return true;
        const found = kernel.list({ register, where: { field: 'seq', is: seq }, limit: 1 }, rule);
        return found.ok && found.value.rows.length > 0;
      };
      return { ok: true, value: { seqs: [...seqs].filter(admitted).sort((a, b) => a - b) } };
    },
  };
}
