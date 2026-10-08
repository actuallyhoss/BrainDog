/**
 * What each pattern did with what came in, and the one press that files a repeat after all: `inboxPatterns`, READ+, and
 * `fileAsSecond`, ADMIN (REC-A03 steps 3 and 5, DIRECTION §40 "bank messages file by themselves").
 *
 * WHAT A PATTERN DID IS THE KERNEL'S (`patternReport` in `kernel/src/ingest.ts`): door by door, each pattern by its own
 * description with what it filed, what it skipped and why, and what waits, and one count for the texts no pattern read.
 * This file is the door to it and to `fileAsSecond`, and nothing else, so the Inbox's "What comes in", an agent reading
 * `braindog:inbox/patterns` and a check counting what no pattern read all read one answer.
 *
 * THE SAME REACH AS `inbox`, BECAUSE IT IS THE INBOX COUNTED. A report of what each pattern did is a report of what was
 * sent in, about any list or none, so it goes to an owner, or to a token its owner gave the `inbox` reach, and in both
 * cases only to a caller reading the whole record. The press asks what `fileArrival` asks: an owner in a browser, since
 * it writes a movement the pattern had kept out.
 */

import type { Arrived, PatternReport } from '@braindog/kernel';
import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The longest window the report is asked for: a year, as the kernel holds it. */
const MOST_DAYS = 366;

/** The sentence a caller held to some of the lists is given, as `inbox` gives it. */
const PART = 'The inbox belongs to the whole record, and this caller is held to part of it.';

export function methods(deps: RecordDeps) {
  const { kernel, scoped, guard, admin, no, tail } = deps;

  /** Whether the caller reads the record as a whole, as `whole` in `agents.ts` asks it: a level that reads, every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level !== null && p.level !== 'append' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /** A token its owner gave the `inbox` reach, as `inboxReached` in `index.ts` asks it. `Array.isArray`, so a string is no reach. */
  const reached = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    return p.kind === 'token' && p.level === 'owner' && Array.isArray(p.reach) && p.reach.includes('inbox');
  };

  /** The keys a caller sent beyond `takes`, refused by name, as `inbox` refuses them. */
  const stray = (args: unknown, takes: readonly string[]) => {
    const extra = Object.keys((args ?? {}) as Record<string, unknown>).find((k) => !takes.includes(k));
    return extra === undefined
      ? null
      : no<never>('FIELD_UNKNOWN', `${extra} is not something this takes. It takes ${takes.join(' and ')}.`, { at: extra, allowed: [...takes] });
  };

  return {
    /**
     * What each pattern did with the last `days` days (14 when left out), door by door. READ+.
     *
     * THE ARGUMENT IS READ AFTER THE DOOR, as `inbox` reads its own, so a caller who is refused is not told what it
     * takes. A window that is not a whole number of days from 1 to a year is refused rather than quietly read as 14,
     * which the kernel would do, because an agent asking for 30 and told about 14 would report the wrong month.
     */
    async inboxPatterns(args: { days?: number } | undefined, ctx: CallContext): Promise<Result<PatternReport>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (!reached(ctx)) {
        const owner = guard(ctx, 'owner');
        if (owner) return { ok: false, refusal: { ...owner, code: 'FORBIDDEN' } };
      }
      if (!whole(ctx)) return no('FORBIDDEN', PART, { at: 'principal' });
      const extra = stray(args, ['days']);
      if (extra) return extra;
      const days: unknown = args?.days;
      if (days !== undefined && !(Number.isSafeInteger(days) && (days as number) >= 1 && (days as number) <= MOST_DAYS))
        return no('VALUE_MALFORMED', `days is a whole number from 1 to ${MOST_DAYS}. Left out, it is the last 14 days.`, { at: 'days' });
      return ok(kernel.patternReport((days as number | undefined) ?? 14));
    },

    /**
     * "It is a second one": a text skipped as a repeat of a movement already filed, filed after all, by the pattern that
     * skipped it with its repeat check set aside for this once. ADMIN.
     *
     * BY THE ARRIVAL, as `fileArrival` names it: the kernel reads the text that arrived again, so what is filed is what
     * the bank sent and never what a caller says it sent. Only a skipped text is taken, and a second press is refused in
     * the kernel's sentence, so a press repeated by a slow screen files one movement.
     */
    async fileAsSecond(args: { id: string }, ctx: CallContext): Promise<Result<Arrived>> {
      const stop = admin(ctx);
      if (stop) return { ok: false, refusal: stop };
      if (!whole(ctx)) return no('FORBIDDEN', PART, { at: 'principal' });
      const extra = stray(args, ['id']);
      if (extra) return extra;
      const id = typeof args?.id === 'string' ? args.id.trim() : '';
      if (!id) return no('REQUIRED_MISSING', 'Which message? Name it by the id the inbox gives it.', { at: 'id' });
      /* THE KERNEL NAMES ITS ARGUMENT `raw`, and the caller sent `id`, so a refusal points at the field that was sent. */
      const out = kernel.fileAsSecond(id);
      return tail(out.ok || !('refusal' in out) ? out : { ok: false as const, refusal: { ...out.refusal, at: 'id' } });
    },
  };
}
