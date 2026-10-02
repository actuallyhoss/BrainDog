/**
 * The figures every record has without a pack declaring them: facts about the record itself rather than about a list.
 *
 * ONE TODAY, `questions-open`: how many questions are waiting on the person. A page gates a block on it with
 * `when: { metric: questions-open, gt: 0 }`, so Money's 'Waiting on you' is drawn only while something is waiting,
 * and a heading or a lead note can say it as `{{questions-open}}`. Before it, no figure could count the queue, because
 * a figure reads a list and the questions are not rows of one, and the tile drew its cleared line on an empty record.
 *
 * AND ONE THING'S QUESTIONS, `questions-open:<what>`: the open questions whose `body.about` is that word, which is what a
 * queue's `where: about is <what>` keeps. So a project page gates its 'Waiting on you' with
 * `when: { metric: 'questions-open:{{spoken}}', gt: 0 }` (or `{{name}}`, whichever its queue's `about is` names), and the
 * queue is not drawn as 'Nothing matched' while other projects have questions waiting. The parameter reaches the count
 * the way it reaches every figure (`fill` in `pages.ts`): the figure holds `about: '{{it}}'`, and the reader fills the
 * hole. Read with no parameter the hole is still there, and the count is the whole record's.
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

/** The hole a parameter fills, as `fill` in `pages.ts` reads it. Still there, the figure was read with no parameter. */
const PARAM = '{{it}}';

/**
 * The open questions' figure: a figure, and what its questions are about. `about` is not a key a pack writes (a
 * declared figure over a list narrows with `where`); it is this figure's own, and it holds `{{it}}` until a parameter
 * fills it.
 */
export type OpenQuestionsDecl = MetricDecl & { about?: string | undefined };

const QUESTIONS_OPEN: OpenQuestionsDecl = {
  metric: 'questions-open',
  name: 'Questions waiting on you',
  source: GOVERNANCE_OPEN,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '7d',
  compare: 'none',
  format: 'int',
  about: PARAM,
};

/** The figures the record answers by id when no declaration holds that id. */
export const BUILT_IN_FIGURES: Readonly<Record<string, MetricDecl>> = {
  'questions-open': QUESTIONS_OPEN,
};

/** The built-in figure called `id`, or `null`; never one `Object.prototype` lends. */
export const builtInFigure = (id: string): MetricDecl | null => (Object.hasOwn(BUILT_IN_FIGURES, id) ? BUILT_IN_FIGURES[id]! : null);

/**
 * How many questions are open now: not answered, and not put off past this moment. A deferred question is not waiting
 * on anybody until its day, which is how the queue counts it.
 *
 * WITH `about` FILLED, ONLY THE QUESTIONS ABOUT THAT ONE THING, by the test a queue's `about is <what>` makes: the body's
 * `about` is that word exactly. A body this record cannot parse is about nothing (`hydrate` in `govern.ts` hands it
 * back as a string), so it is never one thing's question and it never stops the count.
 */
export function readOpenQuestions(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs'>, decl?: MetricDecl): Result<Reading> {
  const at = new Date(ctx.asOfMs ?? ctx.nowMs).toISOString();
  const said = (decl as OpenQuestionsDecl | undefined)?.about;
  const about = typeof said === 'string' && said !== PARAM ? said : null;
  const open = "SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?)";
  const row =
    about === null
      ? sql.one<{ n: number }>(open, at)
      : sql.one<{ n: number }>(`${open} AND (CASE WHEN json_valid(body) THEN json_extract(body, '$.about') END) = ?`, at, about);
  const n = Number(row?.n ?? 0);
  return ok({ value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: n <= 0, refusals: [] });
}
