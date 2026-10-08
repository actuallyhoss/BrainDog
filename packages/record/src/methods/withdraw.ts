/**
 * An agent takes back a question it asked: `withdraw` (DATA), AGT-C07's record half ("a question has a cause", D40.50).
 *
 * BEFORE THIS ONLY THE LADDER COULD. An agent that asked something it then learnt the answer to, or asked by mistake,
 * left the question in Decide until the owner pressed something, and the next thing it proposed was held behind it.
 * Now the run that opened a question, or a later run on the same key, closes it as `withdrawn` while it is still open.
 *
 * WHO MAY IS THE KERNEL'S TO SAY (`withdraw(w, { id })`, over `govern.ts`), because the kernel is what knows which run
 * opened a question and which key that run was on. This door hands it the caller as `writerOf` in `index.ts` does and
 * opens no run: a run that has written nothing opened nothing, so it has nothing to take back. A refusal for being the
 * wrong caller is given back with its fix in words: "Only the run that asked can take it back."
 *
 * READ THROUGH A LOCAL SHAPE until kernel-wire's verb lands, and `NOT_IN_THIS_BUILD` from a kernel without it.
 */

import type { Result } from '@braindog/ports';
import { agentOf as kindOf, type WriteContext } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Who = Pick<WriteContext, 'actor' | 'principal' | 'session'>;

/** The kernel verb this door calls, absent on a kernel built before it. */
type WithdrawVerb = { withdraw?: (w: Who, args: { id: string }) => Result<{ id: string; state: 'withdrawn' }> };

/** What the wrong caller is told: the fix, not the rule. */
export const ONLY_THE_ASKER = 'Only the run that asked can take it back. Anybody else answers it in Decide.';

/** The longest id a question has: `SG` and a number, or the kernel's own id. */
const ID_MOST = 64;

export function methods(deps: RecordDeps) {
  const { kernel, guard, no, tail } = deps;
  const verbs = kernel as unknown as WithdrawVerb;

  /** Who the call is by, as `writerOf` in `index.ts` has it: a token by its key and its run's hints, anybody else as themselves. */
  const whoOf = (ctx: CallContext): Who =>
    ctx.principal.kind === 'token'
      ? {
          actor: `agent:${kindOf(ctx.session ?? {}).agent ?? 'other'}`,
          principal: { kind: 'token', token: ctx.principal.id },
          ...(ctx.session === undefined ? {} : { session: ctx.session }),
        }
      : { actor: ctx.principal.id };

  return {
    /** Take back a question this run asked, while it is still open. DATA. */
    async withdraw(args: { id?: unknown } | undefined, ctx: CallContext): Promise<Result<{ id: string; state: 'withdrawn' }>> {
      const stop = guard(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const id = args?.id;
      if (id === undefined || id === null || id === '') return no('REQUIRED_MISSING', 'Say which question to take back, as SG90.', { at: 'id' });
      if (typeof id !== 'string' || id.length > ID_MOST || /\s/u.test(id)) return no('VALUE_MALFORMED', 'A question is named as SG90, with no spaces.', { at: 'id' });
      if (verbs.withdraw === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog cannot take a question back yet. It arrives with the next update.');
      const out = verbs.withdraw(whoOf(ctx), { id });
      /* Only the refusal about the question itself. One at `session` (hints naming another key's run) keeps its own fix. */
      if (!out.ok && 'refusal' in out && out.refusal.code === 'FORBIDDEN' && out.refusal.at === 'id') return { ok: false, refusal: { ...out.refusal, fix: ONLY_THE_ASKER } };
      return tail(out);
    },
  };
}
