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
 * THE OWNER'S, AND THE WHOLE RECORD'S. The answer names every agent connected to the record and every list one of them
 * changes, so a member invited to one list would learn about the others from it, and a colleague invited to read or to
 * write would learn which agents the owner connected and how far each is trusted, which is the owner's own business
 * and nobody else's to change. So the caller is the owner in person, or a grant the owner made for themselves, held to
 * no part of the record. Everyone else is refused in one sentence, as `signs` refuses a caller held to part of it.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { ladder, type Standing } from '../ladder.ts';
import type { RecordDeps } from './index.ts';

export type { Standing };

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, no, clock } = deps;
  const read = ladder({ sql, kernel, now: () => clock.now() });

  /**
   * Whether the caller is the owner over the whole record: a person at owner level, or a grant of such a person, and
   * every list. Stricter than `whole` in `signs.ts`, which any level that reads passes.
   */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level === 'owner' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /** Which of the two a refused caller is, so the sentence says the fix that is theirs. */
  const part = (ctx: CallContext): boolean => !(ctx.registers === undefined || ctx.registers === '*');

  return {
    /** Every connected agent by name, with each kind of change it has a rung for: the rung, since when, and when and why it was taken back. READ+, the owner's. */
    async trust(_args: unknown, ctx: CallContext): Promise<Result<Standing>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (!whole(ctx)) {
        return part(ctx)
          ? no('FORBIDDEN', 'Where agents stand is about the whole record, and this caller is held to part of it.', { at: 'principal' })
          : no('FORBIDDEN', 'Where agents stand is for the owner of this record to read, so nothing was read.', { at: 'principal' });
      }
      return { ok: true, value: read.standing(deps.validFrom?.()) };
    },
  };
}
