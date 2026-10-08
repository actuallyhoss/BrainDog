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
 *
 * AND THE INBOX'S WORDS ONLY TO A CALLER WHO MAY READ THE INBOX. A sign's sentence and facts carry what was sent in and
 * what was asked ("Most say: <the message's own words>", a question as it was put), and those are the inbox's, which
 * `inbox` and `inboxPatterns` hold to an owner or a token its owner gave the `inbox` reach. Any other whole-record
 * caller is told each sign's state, number and last fourteen days, the sentence of the two signs that quote messages
 * or questions replaced by one in this file's words, and no facts, so a token for reading the lists cannot read the
 * inbox through its signs.
 */

import type { Kernel } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Signs = ReturnType<Kernel['signs']>;
type Sign = Extract<Signs, { ok: true }>['value']['signs'][number];

const count = (n: number | null, one: string, many: string): string => (n === 1 ? `1 ${one}` : `${String(n ?? 0)} ${many}`);

/**
 * The sentence a caller without the inbox reach reads for a sign whose own sentence may quote a message or a question,
 * by its state and number alone. A sign not here keeps the kernel's sentence, which names lists, feeds, runs and
 * scripts, never what was sent in. A sign read `none` keeps its own too: that sentence says only what is missing ("This
 * sign could not be read.", "Nothing has been asked on this record yet."), and one written here could not tell those apart.
 */
const QUIET: Record<string, (s: Sign) => string> = {
  'arrivals-filed': (s) =>
    s.state === 'red' ? 'Messages wait to be filed.' : s.value ? `${count(s.value, 'message waits', 'messages wait')} to be filed, not yet too long.` : 'No message waits to be filed.',
  'questions-by-cause': (s) =>
    s.state === 'red' ? 'Open questions pile up on one cause, or carry none.' : s.value ? `${count(s.value, 'open question', 'open questions')}, no two with the same cause.` : 'No question is waiting.',
};

/**
 * A sign as a caller without the inbox reach reads it: no facts, and no message or question in its sentence. Exported so
 * the briefing's red signs (`redSigns` in `index.ts`) hold the inbox's words back by the same rule.
 */
export const quietSign = (s: Sign): Sign => ({ ...s, said: s.state === 'none' ? s.said : (QUIET[s.sign]?.(s) ?? s.said), facts: [] });

export function methods(deps: RecordDeps) {
  const { kernel, scoped, guard, no } = deps;

  /** Whether the caller reads the record as a whole, as `whole` in `agents.ts` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
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
      if (!whole(ctx)) return no('FORBIDDEN', 'The signs are about the whole record, and this caller is held to part of it.', { at: 'principal' }) as Signs;
      const out = kernel.signs();
      if (!out.ok || inboxRead(ctx)) return out;
      return { ...out, value: { ...out.value, signs: out.value.signs.map(quietSign) } };
    },
  };
}
