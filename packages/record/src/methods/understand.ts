/**
 * The walk over what the record already holds, asked for by hand (DIRECTION §38, "understanding is the engine's first
 * job"): `understand`, ADMIN.
 *
 * WHAT IS LINKED AND HOW IS THE KERNEL'S (`kernel/src/backfill.ts`): each old payment to who it was with, each old run to
 * its project, each service to the project it is for, a bounded slice at a time, every write signed `rule:backfill` and
 * one batch a kind. What the slice would do, said in names, and what it would not do on its own, filed as Slash's
 * questions, are the record's (`understandNow` in `index.ts`), handed here as `RecordDeps.understood`.
 *
 * THREE CALLS. `{ dry: true }` answers what the next slice would do, and keeps nothing of it. `{}` does that slice, as the
 * next night would have, and answers the same with `undo`. `{ undo }` puts back what one or more of those batches wrote.
 *
 * AN OWNER IN A BROWSER, AND NO TOKEN OF ANY KIND, as undo is (ADR-060): the walk writes to every payment, run and service
 * the record holds, and making organisations nobody named is the owner's call about his own record, never an agent's.
 */

import type { Result } from '@braindog/ports';

import type { CallContext, Understanding } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What `understand({ undo })` answers: how many changes were put back, and the line a person reads. */
export type Unlinked = { undone: number; said: string };

const said = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function methods(deps: RecordDeps) {
  const { kernel, admin, no, tail } = deps;

  /** Who signs the undo: the person in the browser. */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  return {
    /**
     * The next slice of the walk over what the record already holds: `{ dry: true }` to see it in names, `{}` to do it,
     * `{ undo: <batch> }` (or several) to put back what a slice did. ADMIN, an owner in a browser.
     */
    async understand(args: { dry?: unknown; undo?: unknown } | undefined, ctx: CallContext): Promise<Result<Understanding | Unlinked>> {
      const stop = admin(ctx, 'read what this BrainDog holds again');
      if (stop) return { ok: false, refusal: stop };
      const a = args ?? {};
      if (a.dry !== undefined && typeof a.dry !== 'boolean') return no('VALUE_MALFORMED', 'dry is true to see what it would do, and false or left out to do it.', { at: 'dry' });
      if (a.undo !== undefined) {
        const batches = typeof a.undo === 'string' ? [a.undo] : Array.isArray(a.undo) ? a.undo : null;
        if (batches === null || batches.length === 0 || !batches.every(said))
          return no('VALUE_MALFORMED', 'undo is what an earlier understand answered as undo, as it was given.', { at: 'undo' });
        if (a.dry === true) return no('VALUE_MALFORMED', 'Undo puts the changes back; it has no dry run. Leave dry out.', { at: 'dry' });
        const broken = kernel.refused();
        if (broken) return { ok: false, refusal: broken };
        let undone = 0;
        for (const batch of batches) {
          const out = kernel.undoBackfill(batch.trim(), actorOf(ctx));
          if (!out.ok) return out;
          undone += out.value.undone;
        }
        return tail({
          ok: true as const,
          value: {
            undone,
            said: undone === 0 ? 'Nothing was put back: it was undone already, or changed since.' : undone === 1 ? 'Put back 1 change.' : `Put back ${undone} changes.`,
          },
        });
      }
      if (!deps.understood) return no('NOT_IN_THIS_BUILD', 'This BrainDog cannot read what it holds again from here.');
      const out = await deps.understood(a.dry === true, ctx);
      return a.dry === true ? out : tail(out);
    },
  };
}
