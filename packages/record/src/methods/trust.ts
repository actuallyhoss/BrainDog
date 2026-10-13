/**
 * Where every agent stands on the ladder of trust, the record's half: `trust`, READ+ (ENG-A12, DIRECTION §37 "a ladder
 * per agent and kind").
 *
 * WHAT A RUNG IS AND WHAT MOVES IT IS THE LADDER'S (`ladder.ts`), which ran on every agent's write with nothing to read
 * it back. This method is the door to `standing()` and nothing else: it takes no arguments and writes nothing, so the
 * Agents board, the CLI and an agent asking what it may do on its own all read one answer.
 *
 * NAMES AND WORDS, NEVER A GRANT'S ID OR A KIND'S KEY. An agent is the name its owner gave the grant, and a kind is the
 * rest of a sentence ("add tasks", "mark tasks done"), as the offer of a rung already says it.
 *
 * THE WHOLE RECORD'S, SO ONLY A CALLER WHO READS THE WHOLE RECORD. The answer names every agent connected to the record
 * and every list one of them changes, so a member invited to one list would learn about the others from it. They are
 * refused in one sentence, as `signs` refuses them.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { ladder, type Standing } from '../ladder.ts';
import type { RecordDeps } from './index.ts';

export type { Standing };

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, no, clock } = deps;
  const read = ladder({ sql, kernel, now: () => clock.now() });

  /** Whether the caller reads the record as a whole, as `whole` in `signs.ts` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  return {
    /** Every connected agent by name, with each kind of change it has a rung for: the rung, since when, and when and why it was taken back. READ+. */
    async trust(_args: unknown, ctx: CallContext): Promise<Result<Standing>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (!whole(ctx)) return no('FORBIDDEN', 'Where agents stand is about the whole record, and this caller is held to part of it.', { at: 'principal' });
      return { ok: true, value: read.standing(deps.validFrom?.()) };
    },
  };
}
