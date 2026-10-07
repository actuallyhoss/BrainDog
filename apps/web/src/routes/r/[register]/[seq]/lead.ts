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

/** A state's word as it reads inside a sentence: "Paid" as "paid", and an initialism ("QA passed", "VAT filed") left as written. */
const midSentence = (word: string): string => (/^\p{Lu}\p{Lu}/u.test(word) ? word : word.charAt(0).toLowerCase() + word.slice(1));

/** A list as `finishOf` reads it: its state field, that field's values in order, and which of them finish a row. */
type Finishing = {
  state?: string | undefined;
  done?: readonly string[] | undefined;
  fields: readonly ({ id: string; values?: readonly string[] | undefined } & Labelled)[];
};

/**
 * THE ONE THING TO DO TO A ROW THAT IS STILL OPEN: finish it. "Mark paid" on an invoice, "Mark done" on a task, read
 * from the list's own declaration: the first value its state field declares among the ones the list calls finished,
 * said by that value's label. The head of a row's page held Edit and Archive at one weight and nothing that moved the
 * row on, which is what a person opens an unpaid invoice to do.
 *
 * NOTHING FOR A ROW ALREADY FINISHED, and nothing on a list that declares no finished state, where the page's primary
 * stays Edit. A second way of finishing (written off, cancelled) is still one press away on the status itself.
 *
 * AND NOTHING WHERE THE LIST'S ONE FINISHED STATE MAY BE AN ENDING. A subscription is Live until it is Cancelled and a
 * category until it is Retired: one finished state, and it is not what a person opens the page to do, so "Mark
 * cancelled" as the page's primary was the wrong verb at the loudest weight. A list that declares two (paid and written
 * off, done and dropped) has said which comes first, and that one finishes; with one, nothing in the declaration says
 * whether it finishes a row or gives it up, and the primary stays Edit.
 */
export function finishOf(decl: Finishing | undefined, value: string): { value: string; said: string; done: string } | null {
  if (!decl?.state || (decl.done?.length ?? 0) < 2 || decl.done!.includes(value)) return null;
  const to = decl.fields.find((f) => f.id === decl.state)?.values?.find((v) => decl.done!.includes(v));
  if (!to) return null;
  const lower = midSentence(stateSaid(decl, to));
  /* `done` is what the toast says once it lands, so the page says the state through this function and not beside it. */
  return { value: to, said: finishWords.mark(lower), done: finishWords.marked(lower) };
}

/** The finishing verb's words, kept beside the function that says them. */
const finishWords = {
  mark: (state: string): string => `Mark ${state}`,
  marked: (state: string): string => `Marked ${state}`,
} as const;

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
  const lower = midSentence(stateSaid(decl, value));
  if (finished.has(value)) return { total, done: total, current: false, said: stepWords.step(total, total, lower) };
  const at = path.indexOf(value);
  return { total, done: at, current: true, said: stepWords.step(at + 1, total, lower) };
}

/** The chart's words, kept beside the function that says them. */
export const stepWords = {
  step: (n: number, of: number, state: string): string => `Step ${n} of ${of}: ${state}.`,
} as const;
