/**
 * A figure read by a step: `{{metric.<id>}}` in a run's fill is the figure's value, read as a page reads it.
 *
 * A HEAD IN THE FILL AND NOT A NEW VERB. A `read_metric: { id, as }` step would put every figure into a variable before
 * it could be used, so a `notify` that says the total would cost a step, and the run's sixty-four names would fill with
 * copies of numbers the record already answers. Every text a run fills already goes through one pattern (`flow.ts`'s
 * `fill`, `rules.ts`'s `filling`), so a third head beside `vars` and `trigger` reaches the note, the question, the
 * create's fields, a `set_var` and an `if` at once. Measured before it: a `read_metric` step was refused "names no
 * step", and `{{metric.total}}` in a `set_var` installed, ran `done` and wrote the braces into the row, and nobody was
 * told.
 *
 * AN `if` CAN ASK WHETHER A VALUE IS PAST A FIGURE, AS WELL AS WHETHER IT EQUALS ONE. The figure is filled in as text
 * before the condition is read, and the condition is a list's filter sentence, which has said `more than`, `at least`,
 * `less than`, `at most` and `between` since `3187be5a`. Before that it had `is` and `is not` for a number and no
 * ordering, and `n is more than {{metric.total}}` failed the run with "more than 5 is not a value n can hold". Measured
 * again after it, over a figure summing `n` and two rows written with `n` 2 and 10 (the figure then 2 and 12):
 * `more than`, `is more than`, `less than`, `at most`, `is at least` and `between 1 and` each ran `done` and took the
 * arm the numbers call for. The operator's own spellings are still not words: `n lt {{metric.total}}` fails the run
 * with "lt is not something a filter can say", and `n after {{metric.total}}` with "after is about dates". A step asks
 * about the figure as it stands when the step runs; the trigger's `metric: { id, crosses }` is the other question,
 * which fires once when the figure crosses a line.
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
 * A HYPHEN IS PART OF THE ID, which `RUN_PATH`'s path is not: money-core's figures are `cash-now` and `owed-to-you`,
 * and a pattern that stopped at the hyphen would leave the braces as typed for the figures a money page reads first.
 */
export const FIGURE = /\{\{\s*(metric)\.([A-Za-z0-9_-]+)\s*\}\}/g;

/** Every spelling that looks like a figure, the colon and a bad id included, so that the lint can say which it is. */
const LOOSE = /\{\{\s*metric\s*([.:])\s*([^{}]*?)\s*\}\}/g;

/**
 * One figure spelled exactly as `FIGURE` fills it. `LOOSE` lets space round the mark so that it can name the spelling,
 * and `{{ metric . total }}` then passed the id check and installed, and the run wrote it into the row as typed.
 */
const EXACT = new RegExp(`^${FIGURE.source}$`);

/**
 * What a run writes in a row where a figure over another list would have gone (`hiddenFigure` in `flow.ts`).
 *
 * NOT THE EM DASH IT WAS. That is the character this tree's prose rule keeps out of anything a stranger reads, written
 * into a row a stranger reads, and it read as a hole in the sentence rather than as a number held back on purpose.
 */
export const WITHHELD = '--withheld--';

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
 * read it as a field called `total` and wrote the dash: measured, `x —`. Reading it as the figure as well would make
 * two spellings of one thing and would still stop at a hyphen, since the row's form is `\w+`; the refusal names the
 * spelling that works.
 *
 * THE INLINE PATH READS NO FIGURE. It runs inside the write, before the write commits, and a figure over the list being
 * written would be read over a row that is half there. The pass leaves the braces as typed there, so they are refused.
 *
 * AND A FIGURE OVER ANOTHER LIST IN A RUN THAT WRITES INTO A ROW IS REFUSED, since the run would write it as `WITHHELD`
 * (the owner's decision). He asked to be told when the rule goes in, so that he learns it from the lint and not from a
 * placeholder in a row a week later. A REFUSAL AND NOT A WARNING, because install has no channel for one: it answers
 * `Result<Installed[]>`, whose value is each declaration's `{ id, version, changed }`, and a warning carried beside it
 * would have to be threaded through `declare.ts`, `index.ts`, the record's install and the app that shows it. Nothing
 * is lost by refusing: which lists the run lands in is written in the rule, so the run would withhold the figure every
 * time, a `notify` and an `if` included (`landsOf` in `flow.ts` withholds every fill in the run), and a rule that
 * always writes `--withheld--` is one step the owner has to take out again.
 *
 * WHAT THE LINT SEES AND THE RUN STILL CATCHES. The lint reads the rule's `written` list and its `create` steps. The
 * run also reads the row an arrival wrote, which is the ingest's list and not written in the rule, and a figure
 * re-pointed at another list after the rule went in, which is a batch with no rule in it for this lint to read. The
 * run's withholding (`hiddenFigure` in `flow.ts`) stays for those two.
 */
export function figureFault(id: string, body: Record<string, unknown>, path: 'inline' | 'run', installed?: Known): Refusal | null {
  const figures = installed === undefined ? null : [...installed.keys()].filter((k) => k.startsWith('metric.')).map((k) => k.slice('metric.'.length)).sort();
  const register = typeof body.register === 'string' ? body.register : 'its list';
  const at = body.steps !== undefined ? 'steps' : 'then';
  const lands = path === 'run' && installed !== undefined ? landsOf(body, body[at]) : [];
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
        else if (lands.length > 0) {
          const over = overOf(installed?.get(`metric.${name}`));
          const into = over === null ? undefined : lands.find((list) => list !== over);
          if (into !== undefined)
            found = bad(
              'DECLARATION_INVALID',
              `${id} reads ${spelled} at ${where} in a run that writes into ${into}, and ${name} adds up ${over}. A figure written into a row stays there for whoever reads ${into} later, so a run writes one only into the list it adds up, and this run would write ${WITHHELD} wherever it reads ${name}. Read a figure over ${into}, or say ${spelled} in a notify on a clock, which writes no row.`,
              where,
            );
        }
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

/**
 * The lists a run of this rule writes into, as far as the rule itself says: the list its `written` trigger is on, and
 * every list a `create` step makes a row in, however deep in an `if`. `flow.ts`'s `landsOf` is the same question asked
 * of the run, with the row in hand.
 */
function landsOf(body: Record<string, unknown>, steps: unknown): string[] {
  const out = new Set<string>();
  const written = isObject(body.on) ? body.on.written : undefined;
  if (isObject(written) && typeof written.register === 'string') out.add(written.register);
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isObject(v)) {
      if (isObject(v.create) && typeof v.create.register === 'string') out.add(v.create.register);
      Object.values(v).forEach(walk);
    }
  };
  walk(steps);
  return [...out];
}

/** The list a figure adds up, or `null` for one over no list (a `series.`), which a run writes wherever it lands. */
function overOf(metric: Record<string, unknown> | undefined): string | null {
  const source = metric?.source;
  return typeof source === 'string' && source.startsWith('register.') ? source.slice('register.'.length) : null;
}
