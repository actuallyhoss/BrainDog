/**
 * Several reads in one request: `reads` (READ+), the reads a screen asks at once, sent once (scope 2026-10-24 A12).
 *
 * THIS HALF CHECKS WHO ASKS AND WHAT WAS ASKED, AND THE HOST ANSWERS EACH READ (`serveApi` in `@braindog/host`): a read is
 * answered by its own route's handler, with that route's own checks, its arguments typed as its row says and its answer
 * put through the firewall, exactly as it would be asked alone. Here are the guard every READ+ method opens with and the
 * shape of the list: at most `READS_MOST` reads, each a method by name with an object of arguments. Which methods are
 * reads is the route table's to say, so it is said there.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The most reads one request may carry. A screen's first wave is about twenty. */
export const READS_MOST = 32;

/** One read of a `reads` request: the method by name and its arguments. */
export type ReadAsked = { method: string; args: Record<string, unknown> };

export function methods(deps: RecordDeps) {
  const { scoped, no } = deps;
  return {
    async reads(args: { calls?: unknown }, ctx: CallContext): Promise<Result<{ calls: ReadAsked[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const asked = args?.calls;
      if (!Array.isArray(asked) || asked.length === 0) return no('REQUIRED_MISSING', 'Name the reads to answer, as a list.', { at: 'calls' });
      if (asked.length > READS_MOST) return no('OUT_OF_BOUNDS', `Send at most ${READS_MOST} reads at once.`, { at: 'calls' });
      const calls: ReadAsked[] = [];
      for (const [i, one] of asked.entries()) {
        const method = (one as { method?: unknown } | null)?.method;
        const given = (one as { args?: unknown } | null)?.args;
        if (typeof method !== 'string' || method === '') return no('VALUE_MALFORMED', `Read ${i + 1} names no method.`, { at: 'calls' });
        if (given !== undefined && (given === null || typeof given !== 'object' || Array.isArray(given)))
          return no('VALUE_MALFORMED', `Read ${i + 1} takes its arguments as an object.`, { at: 'calls' });
        /* AN ARGUMENT BAG WITH NO INHERITED NAMES, for `serveApi`'s reason: every key is a word the caller chose. */
        const bag = Object.assign(Object.create(null) as Record<string, unknown>, given ?? {});
        calls.push({ method, args: bag });
      }
      return { ok: true, value: { calls } };
    },
  };
}
