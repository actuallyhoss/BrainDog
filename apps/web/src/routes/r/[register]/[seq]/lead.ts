/**
 * The words a row's page says a declared value in: its state, by the label the state field carries, and an enum's
 * choices in the inline editor, by the labels that field carries.
 *
 * THE LEAD SAID THE STORED VALUE. A Personal project's page led with Earning over a Status field reading Ongoing, the
 * one place on the page that drew the state without its label. Out of
 * the component so `node --test` can run it, since a Svelte page does not mount there (`ui/enum-label-sites.test.ts`).
 *
 * AND IT WAS NOT THE ONLY ONE. Beside the fixed lead, the state field's chip still read "earning" and the inline
 * editor still offered a person's Role as `registrar` where the People list reads Agency.
 * The chip draws through `stateSaid` with the lead, and the editor's
 * options through `choicesOf`, so the three say a value by the function the tests run.
 */

import { valueSaid } from '../../../../lib/voice.ts';

type Labelled = { labels?: Readonly<Record<string, string>> };
type Declared = { state?: string | undefined; fields: readonly ({ id: string } & Labelled)[] };

export const stateSaid = (decl: Declared | undefined, value: string): string =>
  valueSaid(decl?.fields.find((f) => f.id === decl.state) ?? {}, value);

/** Each value an enum field offers, in its declared order, beside the words a person reads for it. */
export const choicesOf = (f: { values?: readonly string[] } & Labelled): (readonly [value: string, said: string])[] =>
  (f.values ?? []).map((v) => [v, valueSaid(f, v)] as const);

/** Where a row stands on its list's way through its states, as `Segments` draws it. */
export type Steps = {
  /** One cell per step. */
  total: number;
  /** The cells filled: the steps behind the row, or every one once it has finished. */
  done: number;
  /** The row is on the step after the filled ones, which is outlined as the one in hand. */
  current: boolean;
  /** The one line under the chart: "Step 2 of 3: part paid." */
  said: string;
};

/** A list as `stepsOf` reads it: its state field, the values that field declares, and which of them finish a row. */
type Stepped = {
  state?: string | undefined;
  done?: readonly string[] | undefined;
  fields: readonly ({ id: string; values?: readonly string[] | undefined } & Labelled)[];
};

/**
 * THE STATES IN THE ORDER THE LIST DECLARES THEM, AND THE FINISHED ONES AS ONE LAST STEP.
 *
 * A bill is Open, then Part paid, then Paid or Written off: two ways of finishing, and neither is a step after the other,
 * so every value in `done` counts as the same last cell and a paid bill and a written-off one both read 3 of 3. A list
 * that declares no finished state (a project's Building, Earning, Parked, Retired) has every value as a step of its own.
 * A list with fewer than two states, or a row whose value the list does not declare, has no way to draw, so no chart.
 *
 * THE STATE IS SAID THROUGH `stateSaid`, here and not on the page, so the page keeps its two sites of it
 * (`ui/enum-label-sites.test.ts`) and the chart's line reads the label the lead reads.
 */
export function stepsOf(decl: Stepped | undefined, value: string): Steps | null {
  if (!decl?.state || !value) return null;
  const field = decl.fields.find((f) => f.id === decl.state);
  const values = field?.values ?? [];
  if (values.length < 2 || !values.includes(value)) return null;
  const finished = new Set(decl.done ?? []);
  const path = values.filter((v) => !finished.has(v));
  const total = path.length + (finished.size > 0 ? 1 : 0);
  const word = stateSaid(decl, value);
  const lower = word.charAt(0).toLowerCase() + word.slice(1);
  if (finished.has(value)) return { total, done: total, current: false, said: stepWords.step(total, total, lower) };
  const at = path.indexOf(value);
  return { total, done: at, current: true, said: stepWords.step(at + 1, total, lower) };
}

/** The chart's words, kept beside the function that says them. */
export const stepWords = {
  step: (n: number, of: number, state: string): string => `Step ${n} of ${of}: ${state}.`,
} as const;
