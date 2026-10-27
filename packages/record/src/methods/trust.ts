/**
 * Where every agent stands on the ladder of trust, the record's half: `trust`, READ+ ("a ladder
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
 *
 * AND ONE WRITE, THE OWNER'S PRESS: `trustTakeBack` puts an agent back to asking on a kind it was lifted on, or on all
 * of them ("undo"). ADMIN, as `slashReads` is: a person in a browser, never a token, since an agent that could
 * set its own rung, or another's, would be trusted by nobody. It names the agent and the kind as `trust` said them.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { ladder, type Standing } from '../ladder.ts';
import type { RecordDeps } from './index.ts';

export type { Standing };

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, admin, no, clock } = deps;
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

    /**
     * Put an agent back to asking: `{ agent, kind }` on that kind, `{ agent }` on every kind it was lifted on. Answers
     * where that agent stands after, as `trust` says it. ADMIN, the owner in a browser over the whole record.
     */
    async trustTakeBack(args: { agent?: unknown; kind?: unknown } | undefined, ctx: CallContext): Promise<Result<Standing>> {
      const stop = admin(ctx, 'put an agent back to asking');
      if (stop) return { ok: false, refusal: stop };
      if (part(ctx)) return no('FORBIDDEN', 'Where agents stand is about the whole record, and this caller is held to part of it.', { at: 'principal' });
      const said = (args ?? {}) as Record<string, unknown>;
      const extra = Object.keys(said).find((k) => k !== 'agent' && k !== 'kind');
      if (extra !== undefined) return { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: `${extra} is not something this call takes. It takes agent and kind.`, at: extra, allowed: ['agent', 'kind'] } };
      if (typeof said.agent !== 'string' || said.agent.trim() === '') return no('REQUIRED_MISSING', 'Say which agent, by the name Settings shows for it.', { at: 'agent' });
      if (said.kind !== undefined && said.kind !== null && (typeof said.kind !== 'string' || said.kind.trim() === '')) {
        return no('VALUE_MALFORMED', 'kind is a kind of change as Settings says it, such as "add tasks", or left out for every kind.', { at: 'kind' });
      }
      const kind = typeof said.kind === 'string' ? said.kind : null;
      const out = read.takeBack(said.agent, kind, deps.validFrom?.());
      if ('unknown' in out) {
        return out.unknown === 'agent'
          ? no('VALUE_MALFORMED', `No agent connected to this record is called ${said.agent.trim()}. Nothing was changed.`, { at: 'agent' })
          : no('VALUE_MALFORMED', `${said.agent.trim()} has no kind of change called ${kind?.trim()}. Nothing was changed.`, { at: 'kind' });
      }
      return { ok: true, value: { agents: [out.agent] } };
    },
  };
}
