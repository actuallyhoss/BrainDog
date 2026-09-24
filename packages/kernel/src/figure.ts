/**
 * A figure read by a step: `{{metric.<id>}}` in a run's fill is the figure's value, read as a page reads it
 * (`loop/research-m3-dynamic.md` §3, B1).
 *
 * A HEAD IN THE FILL AND NOT A NEW VERB. A `read_metric: { id, as }` step would put every figure into a variable before
 * it could be used, so a `notify` that says the total would cost a step, and the run's sixty-four names would fill with
 * copies of numbers the record already answers. Every text a run fills already goes through one pattern (`flow.ts`'s
 * `fill`, `rules.ts`'s `filling`), so a third head beside `vars` and `trigger` reaches the note, the question, the
 * create's fields, a `set_var` and an `if` at once. Measured before it, on 24 September: the survey's `read_metric`
 * step was refused "names no step", and `{{metric.total}}` in a `set_var` installed, ran `done` and wrote the braces
 * into the row, which is the one failure in that survey nobody was told about.
 *
 * AN `if` CAN ASK WHETHER A VALUE EQUALS A FIGURE, AND NOT WHETHER IT IS PAST ONE. The figure is filled in as text
 * before the condition is read, and the condition is a list's filter sentence, which has `is` and `is not` for a
 * number and no ordering. Measured on 24 September over a figure summing `n`: `n is {{metric.total}}` and
 * `n is not {{metric.total}}` ran `done` and took the right arm; `n lt {{metric.total}}` failed the run with "lt is
 * not something a filter can say", `n is more than {{metric.total}}` with "more than 5 is not a value n can hold", and
 * `n after {{metric.total}}` with "after is about dates". A threshold on a figure is the trigger's
 * `metric: { id, crosses }`, which fires when the figure crosses it; a step cannot say it until the filter can.
 *
 * THIS FILE HOLDS THE SPELLING AND THE LINT, AND IMPORTS NO VALUE. `flow-lint.ts` imports only light modules so that
 * `declare.ts`, which imports it, is not pulled into a cycle; the reading itself is `rules.ts`'s `figureText`, which
 * needs `metrics.ts` and the record's rates.
 */

import type { Refusal } from '@braindog/ports';

import type { Known } from './declare.ts';

/**
 * `{{metric.total}}` and `{{ metric.cash-now }}`, as `flow.ts` and `rules.ts` fill them: the head is its own group so
 * that a pattern joined after `RUN_PATH` hands the same `(head, path)` pair to the run's `value`.
 *
 * A HYPHEN IS PART OF THE ID, which `RUN_PATH`'s path is not: money-core's figures are `cash-now` and `owed-to-you`, and
 * a pattern that stopped at the hyphen would leave the braces as typed for the three figures B10 reads first.
 */
export const FIGURE = /\{\{\s*(metric)\.([A-Za-z0-9_-]+)\s*\}\}/g;

/** Every spelling that looks like a figure, the colon and a bad id included, so that the lint can say which it is. */
const LOOSE = /\{\{\s*metric\s*([.:])\s*([^{}]*?)\s*\}\}/g;

/**
 * One figure spelled exactly as `FIGURE` fills it. `LOOSE` lets space round the mark so that it can name the spelling,
 * and `{{ metric . total }}` then passed the id check and installed, and the run wrote it into the row as typed.
 */
const EXACT = new RegExp(`^${FIGURE.source}$`);

/** `declare.ts`'s `METRIC_ID`: a figure's id as it is installed. */
const METRIC_ID = /^[a-z][a-z0-9_-]{0,31}$/;

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * What a rule may not say about a figure, as the refusal, or `null`: a figure no installed metric is, a figure spelled
 * with a colon, and any figure on the inline path. `path` is `flow-lint.ts`'s `pathOf` of the body, handed in because
 * that function lives there. Without `installed` only the spelling is checked, as every other lint here does.
 *
 * NAMED AT INSTALL AND NOT AT THE RUN, as a trigger's `metric.id` is. At the run a figure that is not there is the dash,
 * which is what a field that is not there writes, and the dash in a row a month later tells nobody which rule wrote it.
 *
 * THE COLON IS REFUSED RATHER THAN READ. `{{metric:total}}` is the row's typed form (`{{money:amount}}`), so the pass
 * read it as a field called `total` and wrote the dash: the survey's checker measured `x —` on 24 September. Reading it
 * as the figure as well would make two spellings of one thing and would still stop at a hyphen, since the row's form is
 * `\w+`; the refusal names the spelling that works.
 *
 * THE INLINE PATH READS NO FIGURE. It runs inside the write, before the write commits, and a figure over the list being
 * written would be read over a row that is half there. The pass leaves the braces as typed there, so they are refused.
 */
export function figureFault(id: string, body: Record<string, unknown>, path: 'inline' | 'run', installed?: Known): Refusal | null {
  const figures = installed === undefined ? null : [...installed.keys()].filter((k) => k.startsWith('metric.')).map((k) => k.slice('metric.'.length)).sort();
  const register = typeof body.register === 'string' ? body.register : 'its list';
  const at = body.steps !== undefined ? 'steps' : 'then';
  let found: Refusal | null = null;
  const walk = (v: unknown, where: string): void => {
    if (found !== null) return;
    if (typeof v === 'string') {
      for (const m of v.matchAll(LOOSE)) {
        const [spelled, mark, name] = [m[0], m[1]!, m[2]!];
        if (mark === ':')
          found = bad('DECLARATION_INVALID', `${id} reads ${spelled} at ${where}, and a figure is read as {{metric.${name}}}, with a dot. With a colon it names a field of the row, which is written as a dash.`, where);
        else if (!METRIC_ID.test(name))
          found = bad('DECLARATION_INVALID', `${id} reads ${spelled} at ${where}, and a figure is named by its id: lower-case letters, digits, _ and -.`, where);
        else if (!EXACT.test(spelled))
          found = bad('DECLARATION_INVALID', `${id} reads ${spelled} at ${where}, and a figure is read as {{metric.${name}}}, with no space around the dot.`, where);
        else if (path === 'inline')
          found = bad(
            'NOT_IN_THIS_BUILD',
            `${id} reads ${spelled} at ${where}, and a rule that runs inside the write reads no figure. Move then: into steps: and register: into on: { written: { register: ${register} } }, where it runs as a run after the write.`,
            where,
          );
        else if (figures !== null && !figures.includes(name))
          found = { ...bad('DECLARATION_UNKNOWN', `${id} reads ${spelled} at ${where}, and there is no metric called ${name}.`, where), allowed: figures };
        if (found !== null) return;
      }
      return;
    }
    if (Array.isArray(v)) v.forEach((one, i) => walk(one, `${where}[${i}]`));
    else if (isObject(v)) for (const [k, one] of Object.entries(v)) walk(one, `${where}.${k}`);
  };
  walk(body[at], at);
  return found;
}

const bad = (code: string, fix: string, at: string): Refusal => ({ code, fix, at });
