/**
 * The record's vital signs, the record's half: `signs`, READ+ ("a daily check watches all of
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
 *
 * AND THE INBOX'S WORDS ONLY TO A CALLER WHO MAY READ THE INBOX. A sign's sentence and facts carry what was sent in and
 * what was asked ("Most say: <the message's own words>", a question as it was put), and those are the inbox's, which
 * `inbox` and `inboxPatterns` hold to an owner or a token its owner gave the `inbox` reach. Any other whole-record
 * caller is told each sign's state, number and last fourteen days, the sentence of the two signs that quote messages
 * or questions replaced by one in the kernel's words (`quietSign`), and no facts, so a token for reading the lists
 * cannot read the inbox through its signs.
 */

import { quietSign } from '@braindog/kernel';
import type { Kernel } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Signs = ReturnType<Kernel['signs']>;

/**
 * A sign as a caller without the inbox reach reads it. The rule is the kernel's (`quietSign` in `kernel/src/signs.ts`),
 * so a page's `signs` block holds the inbox's words back by the same one. Re-exported so the briefing's red signs
 * (`redSigns` in `index.ts`) import it here.
 */
export { quietSign };

export function methods(deps: RecordDeps) {
  const { kernel, scoped, guard, no } = deps;

  /** Whether the caller reads the record as a whole, as `whole` in `agents.ts` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    /* AND EVERY LIST, ALL OF EACH (`readsAcross`): a member held to some rows or kept off a field was counted the runs
       and the questions of lists they cannot read. */
    const across = deps.readsAcross ?? deps.readsEveryList;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*') && (across === undefined || across(ctx));
  };

  /**
   * Whether the caller may read the inbox's own words: an owner, or a token its owner gave the `inbox` reach, as
   * `inboxReached` in `index.ts` and `reached` in `inbox-patterns.ts` ask it. `Array.isArray`, so a string is no reach.
   */
  const inboxRead = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'token' && p.level === 'owner' && Array.isArray(p.reach) && p.reach.includes('inbox')) return true;
    return guard(ctx, 'owner') === null;
  };

  return {
    /** Every vital sign of the record now, each with its state, its number, its sentence, its facts and its last 14 days. READ+. */
    async signs(_args: unknown, ctx: CallContext): Promise<Signs> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop } as Signs;
      if (!whole(ctx)) return no('FORBIDDEN', 'The signs are about all of this BrainDog, and this caller is held to part of it.', { at: 'principal' }) as Signs;
      const out = kernel.signs();
      if (!out.ok || inboxRead(ctx)) return out;
      return { ...out, value: { ...out.value, signs: out.value.signs.map(quietSign) } };
    },
  };
}
