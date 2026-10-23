/**
 * Several figures in one read: `metrics` (READ+), what `metric` answers for each figure asked, in one round trip.
 *
 * WHY IT IS HERE. The sidebar asked `metric` once for every project in play and a project page four more for its own,
 * all at once: thirteen to seventeen requests queued on one record's object beside a page load, which on 23 Oct filled
 * its queue ("Durable Object is overloaded"). One read answers them all.
 *
 * EACH FIGURE IS HELD EXACTLY AS `metric` HOLDS IT, because it is `metric` that answers it (`metricAs`, the record's own
 * method with every check it makes): a figure the caller may not read is the refusal `metric` gives, and nothing more.
 * At most `METRICS_MOST` figures a call, each named once.
 */

import type { Refusal, Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The most figures one call may name. */
export const METRICS_MOST = 50;

/** What `metrics` answers: each figure asked, by the id it was asked by, as `metric` reads it, or `metric`'s refusal. */
export type MetricsAnswer = { readings: Record<string, unknown>; refused: Record<string, Refusal> };

export function methods(deps: RecordDeps) {
  const { scoped, no, metricAs } = deps;
  return {
    async metrics(args: { metrics?: unknown }, ctx: CallContext): Promise<Result<MetricsAnswer>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (metricAs === undefined) return no('NOT_IN_THIS_BUILD', 'This host reads one figure a call: ask metric.', { at: 'metrics' });
      const asked = args?.metrics;
      if (!Array.isArray(asked) || asked.length === 0) return no('REQUIRED_MISSING', 'Name the figures to read, as a list.', { at: 'metrics' });
      if (asked.some((m) => typeof m !== 'string' || m === '')) return no('VALUE_MALFORMED', 'Name each figure as text, its id and a parameter after a colon.', { at: 'metrics' });
      const ids = [...new Set(asked as string[])];
      if (ids.length > METRICS_MOST) return no('OUT_OF_BOUNDS', `Name at most ${METRICS_MOST} figures at once.`, { at: 'metrics' });
      const readings: Record<string, unknown> = {};
      const refused: Record<string, Refusal> = {};
      /* ONE AFTER ANOTHER, as the separate asks were answered: the object runs one at a time either way. */
      for (const id of ids) {
        const out = await metricAs({ metric: id }, ctx);
        if (out.ok) readings[id] = out.value;
        else refused[id] = 'refusal' in out ? (out.refusal as Refusal) : { code: 'INTERNAL', fix: `${id} could not be read.` };
      }
      return { ok: true, value: { readings, refused } };
    },
  };
}
