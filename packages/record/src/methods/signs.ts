/**
 * The record's vital signs, the record's half: `signs`, READ+ (PRF-A01, DIRECTION §40 "a daily check watches all of
 * that").
 *
 * WHAT A SIGN IS AND HOW IT IS READ IS THE KERNEL'S (`kernel/src/signs.ts`): a closed list of readers over the kernel's
 * own tables, each answering a state, a number, one sentence and a few facts, and a row a day kept at 00:05. This method
 * is the door to `signs()` and nothing else: it reads every sign now with its last fourteen days and writes nothing, so
 * `braindog signs`, the Health page and an agent asking whether the record is alive all read one answer.
 *
 * THE WHOLE RECORD'S, SO ONLY A CALLER WHO READS THE WHOLE RECORD. A sign counts what waits in the inbox, how many
 * questions share a cause and when the newest number arrived, across every list, so a member invited to one list would
 * learn about the others from it. They are refused in one sentence, as `triage` refuses them the inbox.
 */

import type { Kernel } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Signs = ReturnType<Kernel['signs']>;

export function methods(deps: RecordDeps) {
  const { kernel, scoped, no } = deps;

  /** Whether the caller reads the record as a whole, as `whole` in `agents.ts` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  return {
    /** Every vital sign of the record now, each with its state, its number, its sentence, its facts and its last 14 days. READ+. */
    async signs(_args: unknown, ctx: CallContext): Promise<Signs> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop } as Signs;
      if (!whole(ctx)) return no('FORBIDDEN', 'The signs are about the whole record, and this caller is held to part of it.', { at: 'principal' }) as Signs;
      return kernel.signs();
    },
  };
}
