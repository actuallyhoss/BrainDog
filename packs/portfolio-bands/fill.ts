/**
 * The two things a person supplies, put into `portfolio-bands.pack.json`. The document is the file; this is only the fill.
 *
 * WHAT IS FILLED IS ONE LINE OF THE SCRIPT, because a scheduled script has nowhere else to read it from: a run started
 * by `runs.every` is handed `input: null` (`packages/kernel/src/script.ts`, the outbox row it queues). The fill writes
 * `const MEASURES = <JSON>;`, and JSON is a JavaScript literal whatever a name holds, so a measure with a quote in it
 * is a string with a quote in it and not the end of one. The line is found by its exact start, and a source with none
 * or two is refused rather than filled in the wrong place. `bands.test.ts` holds `bands.js` equal to the shipped
 * source byte for byte, so the line this looks for is the line the file has.
 *
 * THE FILL CHECKS WHAT THE PLAN CANNOT SHOW. Planning a script says what it reads and writes, never which names it
 * matches, and each check below is a way the bands run every day, say `ok`, and draw the wrong bar. The last two were
 * run in QuickJS with the checks taken off (`bands.test.ts`): over a project taking $1,250 and forecast at $4,000,
 * both wrote $4,000 now and nothing next, because the forecast reading was counted as what the project takes today:
 *   - a side with no name matches nothing, so every band is zero;
 *   - one name on both sides is counted as `now` and never as `base`, because `bandsOf` asks `now` first;
 *   - a name that is another's name, a comma and more (`Takings` and `Takings, forecast`) is the same trap one step
 *     removed: a forecast reading named `Takings, forecast, Kiln` begins `Takings, `, which is how a reading of
 *     `Takings` names its project.
 */

export type BandsSpec = {
  /** The name, or names, of the reading that says what a project takes a month today. */
  now: string | readonly string[];
  /** The name, or names, of the reading that says what a project is forecast to take a month a year out. */
  base: string | readonly string[];
};

/** How the script starts the one line the fill writes. */
export const MEASURES_LINE = 'const MEASURES = ';

type Script = Record<string, unknown> & { script: string; source: string };

/* THE NAMES ARE COMPARED AS THE RECORD COMPARES THEM, and its `starts` folds ASCII case (`fold` in
   `packages/where/src/index.ts`). Compared as exact text, `Takings` and `takings` passed this fill, and on a record the
   list the script asks for the forecast answered every reading of today as well: fifty of them written after a
   forecast typed once took `later` from 800,000 to 0 on a run that said nothing (`bands.test.ts`). */
const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

const namesOf = (side: 'now' | 'base', given: BandsSpec['now']): string[] => {
  const list = (typeof given === 'string' ? [given] : [...given]).map((n) => n.trim());
  if (list.length === 0 || list.some((n) => n === ''))
    throw new Error(`The bands need at least one ${side} measure, and every name has to say something, or every band is zero.`);
  return [...new Set(list)];
};

/** The pack file filled with two sets of measure names: `template` is `portfolio-bands.pack.json` as read, and is not changed. */
export function fillBands(template: Record<string, unknown>, spec: BandsSpec): Record<string, unknown> {
  const now = namesOf('now', spec.now);
  const base = namesOf('base', spec.base);
  for (const a of now)
    for (const b of base) {
      if (a === b) throw new Error(`${a} is named as both now and base, so it would be counted as now and never as the forecast.`);
      if (fold(a) === fold(b))
        throw new Error(`${a} and ${b} are one name to the record, which matches a name whatever its case, so the forecast is read beside every reading of today and fifty of those push it out of what the run reads.`);
      const [short, long] = a.length < b.length ? [a, b] : [b, a];
      if (fold(long).startsWith(`${fold(short)}, `))
        throw new Error(`${long} begins with ${short} and a comma, which is how a reading of ${short} names its project, so the two cannot be told apart.`);
    }

  const { fill: _marks, ...doc } = structuredClone(template);
  const script = (doc.declarations as Script[]).find((d) => typeof d.script === 'string');
  if (script === undefined) throw new Error('This file declares no script, so there is nothing to fill.');
  const lines = script.source.split('\n');
  const at = lines.flatMap((line, i) => (line.startsWith(MEASURES_LINE) ? [i] : []));
  if (at.length !== 1) throw new Error(`The script has ${at.length} lines starting ${MEASURES_LINE.trim()}, and the fill writes exactly one.`);
  lines[at[0]!] = `${MEASURES_LINE}${JSON.stringify({ now, base })};`;
  script.source = lines.join('\n');
  return doc;
}
