/**
 * Undo on the server, the record's half: `undo`, one write and what it caused or one decision, and `undoRun`, everything
 * one agent's run wrote. Both ADMIN.
 *
 * WHAT IS PUT BACK AND HOW IS THE KERNEL'S (`kernel/src/undo.ts`): the plan in names, the hash of exactly what it would
 * do, and one transaction under one new batch that is itself undoable. This file decides who may ask and says the answer
 * plainly.
 *
 * AN OWNER IN A BROWSER, AND NO TOKEN OF ANY KIND (ADR-060). Undo writes to any row the change touched, a run's on every
 * list it wrote to, and taking back what an agent did is the person's call about that agent, never the agent's own: a
 * run that could undo itself could also undo the owner's correction of it.
 *
 * TWO CALLS, A LOOK AND A PRESS. `dry` answers what would be put back and what would be left, with `hash`; applying needs
 * that hash, so what lands is what was read, and the kernel refuses `PLAN_STALE` when something moved in between.
 *
 * AND THE LADDER IS TOLD (`ladder.ts`). Every batch put back that an agent or Slash made takes that agent back to Ask on
 * the kinds it was, so a kind the owner had to undo is asked about again before it is done again. Which agent it was is
 * the ladder's, and the answer never carries it: no grant's id leaves the record.
 */

import type { Result } from '@braindog/ports';
import type { UndoApplied, UndoPlan, UndoScope } from '@braindog/kernel';

import { ladder } from '../ladder.ts';
import { isHandle, spokenOf } from '../question-handles.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What an undo answers once it is done: how many changes it put back and every line a person reads, and its own batch. */
export type Undone = Omit<UndoApplied, 'undone'>;

const said = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function methods(deps: RecordDeps) {
  const { kernel, sql, admin, readable, tail, no, clock } = deps;
  const trust = ladder({ sql, kernel, now: () => clock.now() });

  /** Who signs an undo: the person in the browser. */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  /**
   * The plan, or the undo applied, for one scope. Shared by both methods, which differ only in what they name.
   * `reads` leaves out a list the caller cannot read, which for an owner is none.
   */
  const run = async (scope: UndoScope, args: { dry?: unknown; hash?: unknown }, ctx: CallContext): Promise<Result<UndoPlan | Undone>> => {
    if (args.dry !== undefined && typeof args.dry !== 'boolean') return no('VALUE_MALFORMED', 'dry is true to see what would be put back, and false or left out to put it back.', { at: 'dry' });
    const opts = { reads: (register: string) => readable(ctx, register) === null };
    if (args.dry === true) return kernel.undoPlan(scope, opts);
    if (!said(args.hash))
      return no('REQUIRED_MISSING', 'Undo shows what it will put back before it does. Ask with dry first, then send the hash it answers.', { at: 'hash' });
    const broken = kernel.refused();
    if (broken) return { ok: false, refusal: broken };
    const out = kernel.undoApply(scope, args.hash, actorOf(ctx), opts);
    if (!out.ok) return out;
    const { undone, ...answer } = out.value;
    for (const mark of undone) if (mark.agent !== null) trust.drop(mark.agent, mark.kinds);
    return tail({ ok: true, value: answer });
  };

  return {
    /**
     * Put back one write and everything it caused (`{ batch }`), or what one decision wrote (`{ decision }`, `D12` or its
     * handle). `{ dry: true }` answers the plan and its hash; `{ hash }` applies it. ADMIN, an owner in a browser.
     */
    async undo(args: { batch?: unknown; decision?: unknown; dry?: unknown; hash?: unknown } | undefined, ctx: CallContext): Promise<Result<UndoPlan | Undone>> {
      const stop = admin(ctx, 'undo a change');
      if (stop) return { ok: false, refusal: stop };
      const a = args ?? {};
      if (said(a.batch) === said(a.decision))
        return no('REQUIRED_MISSING', 'Say what to undo: one change by its batch, or one decision.', { at: said(a.batch) ? 'decision' : 'batch' });
      const given = said(a.decision) ? a.decision.trim() : null;
      const decision = given !== null && isHandle(given) ? (spokenOf(sql, given) ?? given) : given;
      return run(decision === null ? { batch: String(a.batch).trim() } : { decision }, a, ctx);
    },

    /**
     * Put back everything one agent's run wrote, and the rule cascades its writes started: `{ run: 'S42' }`. `{ dry: true }`
     * answers the plan and its hash; `{ hash }` applies it. ADMIN, an owner in a browser.
     */
    async undoRun(args: { run?: unknown; dry?: unknown; hash?: unknown } | undefined, ctx: CallContext): Promise<Result<UndoPlan | Undone>> {
      const stop = admin(ctx, "undo an agent's run");
      if (stop) return { ok: false, refusal: stop };
      const a = args ?? {};
      if (!said(a.run)) return no('REQUIRED_MISSING', 'Say which run to undo, as its name such as S42.', { at: 'run' });
      return run({ run: a.run.trim() }, a, ctx);
    },
  };
}
