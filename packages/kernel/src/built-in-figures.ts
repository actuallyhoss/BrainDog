/**
 * The figures every record has without a pack declaring them: facts about the record itself rather than about a list.
 *
 * ONE TODAY, `questions-open`: how many questions are waiting on the person. A page gates a block on it with
 * `when: { metric: questions-open, gt: 0 }`, so Money's 'Waiting on you' is drawn only while something is waiting,
 * and a heading or a lead note can say it as `{{questions-open}}`. Before it, no figure could count the queue, because
 * a figure reads a list and the questions are not rows of one, and the tile drew its cleared line on an empty record.
 *
 * A DECLARED FIGURE OF THE SAME ID WINS. The record asks its declarations first and these second, so a pack that
 * declares its own `questions-open` is read as it declared it, and nothing here can take a name from a pack.
 *
 * NOTHING HERE IMPORTS THE REST OF THE KERNEL BUT TYPES, because `metrics.ts` reads these and `govern.ts`, which holds
 * the queue, imports `metrics.ts`. The count is `govern.ts`'s `countOpenQuestions` predicate written once more, and
 * `test/built-in-figures.test.ts` holds the two to one answer.
 */

import type { Result, Sql } from '@braindog/ports';
import { ok } from '@braindog/ports';

import type { EvalContext, MetricDecl, Reading } from './metrics.ts';

/** The source a built-in figure over the open questions reads, the same word a `queue` block's source is. */
export const GOVERNANCE_OPEN = 'governance.open';

/** The figures the record answers by id when no declaration holds that id. */
export const BUILT_IN_FIGURES: Readonly<Record<string, MetricDecl>> = {
  'questions-open': {
    metric: 'questions-open',
    name: 'Questions waiting on you',
    source: GOVERNANCE_OPEN,
    value: { count: 'id' },
    target: { lte: 0 },
    window: '7d',
    compare: 'none',
    format: 'int',
  },
};

/** The built-in figure called `id`, or `null`; never one `Object.prototype` lends. */
export const builtInFigure = (id: string): MetricDecl | null => (Object.hasOwn(BUILT_IN_FIGURES, id) ? BUILT_IN_FIGURES[id]! : null);

/**
 * How many questions are open now: not answered, and not put off past this moment. A deferred question is not waiting
 * on anybody until its day, which is how the queue counts it.
 */
export function readOpenQuestions(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs'>): Result<Reading> {
  const at = new Date(ctx.asOfMs ?? ctx.nowMs).toISOString();
  const n = Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?)", at)?.n ?? 0);
  return ok({ value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: n <= 0, refusals: [] });
}
